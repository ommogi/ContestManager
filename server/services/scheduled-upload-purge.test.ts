import { describe, it, expect, vi } from 'vitest'
import {
  PURGE_BATCH_SIZE,
  PURGE_JOB_NAME,
  PurgeRunError,
  runScheduledPurge,
} from './scheduled-upload-purge'
import type { SupabaseAdmin } from './inscription-upload-purge'

// ─── A client that records what was asked of it ──────────────────────────────
//
// Enough of supabase-js to answer the calls the purge makes. Like the real
// client it resolves with `{ data, error }` and never rejects, unless a test
// says otherwise.

interface Due { id: string, path: string }

function createClient(options: {
  due?: Due[]
  swept?: number
  sweepError?: string
  lookupError?: string
  removeError?: string
  deleteError?: string
  traceError?: string
  traceThrows?: boolean
} = {}) {
  const recorded = {
    rpc: [] as Array<{ fn: string, args: unknown }>,
    removes: [] as string[][],
    deletedIds: [] as string[][],
    traces: [] as Array<Record<string, unknown>>,
  }

  function uploads() {
    const api: any = {
      select: () => api,
      not: () => api,
      lte: () => api,
      limit: async () => options.lookupError
        ? { data: null, error: { message: options.lookupError } }
        : { data: options.due ?? [], error: null },
      delete: () => ({
        in: async (_column: string, ids: string[]) => {
          recorded.deletedIds.push(ids)
          return { error: options.deleteError ? { message: options.deleteError } : null }
        },
      }),
    }
    return api
  }

  function runs() {
    return {
      insert: async (row: Record<string, unknown>) => {
        if (options.traceThrows) throw new Error('network down')
        recorded.traces.push(row)
        return { error: options.traceError ? { message: options.traceError } : null }
      },
    }
  }

  const client = {
    rpc: async (fn: string, args: unknown) => {
      recorded.rpc.push({ fn, args })
      return options.sweepError
        ? { data: null, error: { message: options.sweepError } }
        : { data: options.swept ?? 0, error: null }
    },
    from: (table: string) => (table === 'maintenance_runs' ? runs() : uploads()),
    storage: {
      from: () => ({
        remove: async (paths: string[]) => {
          recorded.removes.push(paths)
          return options.removeError
            ? { data: null, error: { message: options.removeError } }
            : { data: paths, error: null }
        },
      }),
    },
  } as unknown as SupabaseAdmin

  return { client, recorded }
}

function due(count: number): Due[] {
  return Array.from({ length: count }, (_, i) => ({ id: `id-${i}`, path: `c-1/u-1/campo/uuid-${i}.pdf` }))
}

const options = { ttlHours: 24 }

describe('runScheduledPurge', () => {
  it('sweeps, removes what is due, then drops the ledger rows', async () => {
    const { client, recorded } = createClient({ due: due(3), swept: 2 })

    const result = await runScheduledPurge(client, options)

    expect(result).toEqual({ swept: 2, deleted: 3, hasMore: false })
    expect(recorded.rpc).toEqual([{ fn: 'sweep_orphan_inscription_uploads', args: { p_ttl_hours: 24 } }])
    expect(recorded.removes).toEqual([due(3).map(d => d.path)])
    expect(recorded.deletedIds).toEqual([['id-0', 'id-1', 'id-2']])
  })

  // KAN-69's acceptance criterion: the job leaves a trace of how many objects
  // it deleted.
  it('records what the run did', async () => {
    const { client, recorded } = createClient({ due: due(3), swept: 2 })
    await runScheduledPurge(client, options)

    expect(recorded.traces).toEqual([
      { job: PURGE_JOB_NAME, swept: 2, deleted: 3, has_more: false, error: null },
    ])
  })

  it('records an empty run too, so a quiet purge is distinguishable from a dead one', async () => {
    const { client, recorded } = createClient()

    expect(await runScheduledPurge(client, options)).toEqual({ swept: 0, deleted: 0, hasMore: false })
    expect(recorded.removes).toHaveLength(0)
    expect(recorded.traces).toHaveLength(1)
  })

  // The old endpoint answered `remaining: 200` here — the batch size, not a
  // count. What a full batch actually tells you is only "probably more".
  it('flags a full batch as having more', async () => {
    const { client } = createClient({ due: due(PURGE_BATCH_SIZE) })
    const result = await runScheduledPurge(client, options)
    expect(result.hasMore).toBe(true)
    expect(result.deleted).toBe(PURGE_BATCH_SIZE)
  })

  it('skips the sweep when asked', async () => {
    const { client, recorded } = createClient({ due: due(1) })
    await runScheduledPurge(client, { ...options, skipSweep: true })
    expect(recorded.rpc).toHaveLength(0)
  })

  it('still purges what is already marked when the sweep fails', async () => {
    const { client } = createClient({ due: due(1), sweepError: 'boom' })
    expect(await runScheduledPurge(client, options)).toEqual({ swept: 0, deleted: 1, hasMore: false })
  })

  // Rows are the only pointer to an object. Dropping them before Storage
  // confirmed the removal would orphan the object for good.
  it('keeps the ledger rows when Storage refuses the removal', async () => {
    const { client, recorded } = createClient({ due: due(2), removeError: 'storage down' })

    await expect(runScheduledPurge(client, options)).rejects.toMatchObject({ code: 'purge_remove_failed' })
    expect(recorded.deletedIds).toHaveLength(0)
  })

  it.each([
    ['purge_lookup_failed', { lookupError: 'x' }],
    ['purge_remove_failed', { due: due(1), removeError: 'x' }],
    ['purge_cleanup_failed', { due: due(1), deleteError: 'x' }],
  ] as const)('records a failed run as %s', async (code, failure) => {
    const { client, recorded } = createClient(failure)

    const run = runScheduledPurge(client, options)
    await expect(run).rejects.toBeInstanceOf(PurgeRunError)
    await expect(run).rejects.toMatchObject({ code })
    expect(recorded.traces).toEqual([
      { job: PURGE_JOB_NAME, swept: 0, deleted: 0, has_more: false, error: code },
    ])
  })

  it('does not fail a run that worked because the trace could not be written', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const refused = createClient({ due: due(1), traceError: 'permission denied' })
    const thrown = createClient({ due: due(1), traceThrows: true })

    await expect(runScheduledPurge(refused.client, options)).resolves.toMatchObject({ deleted: 1 })
    await expect(runScheduledPurge(thrown.client, options)).resolves.toMatchObject({ deleted: 1 })
    expect(error).toHaveBeenCalledTimes(2)
    error.mockRestore()
  })
})
