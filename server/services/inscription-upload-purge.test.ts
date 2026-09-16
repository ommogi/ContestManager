import { describe, it, expect } from 'vitest'
import {
  PATH_PAGE_SIZE,
  REMOVE_BATCH_SIZE,
  chunk,
  collectUploadPathsToPurge,
  removeUploadObjects,
} from './inscription-upload-purge'
import type { SupabaseAdmin } from './inscription-upload-purge'

// ─── A client that records what was asked of it ──────────────────────────────
//
// Same shape as the fake in ./stripe-webhook.test.ts: enough of the builder to
// answer the calls under test, and a log of every filter and range so the tests
// can prove *which* query ran, not merely that one did.

interface Row { path: string, contest_id?: string, user_id?: string }

interface Recorded {
  ranges: Array<{ from: number, to: number }>
  filters: Array<{ op: string, column: string, value: unknown }>
  removes: string[][]
}

function createClient(options: {
  rows?: Row[]
  selectError?: string
  /** Batch index → message, so one batch can fail while the rest succeed. */
  removeErrors?: Record<number, string>
} = {}) {
  const rows = options.rows ?? []
  const recorded: Recorded = { ranges: [], filters: [], removes: [] }
  let removeCall = 0

  function builder() {
    let matcher: (row: Row) => boolean = () => true

    const api: any = {
      select: () => api,
      in: (column: string, values: string[]) => {
        recorded.filters.push({ op: 'in', column, value: values })
        matcher = (row) => values.includes(String((row as any)[column]))
        return api
      },
      eq: (column: string, value: string) => {
        recorded.filters.push({ op: 'eq', column, value })
        matcher = (row) => String((row as any)[column]) === value
        return api
      },
      range: async (from: number, to: number) => {
        recorded.ranges.push({ from, to })
        if (options.selectError) return { data: null, error: { message: options.selectError } }
        return { data: rows.filter(matcher).slice(from, to + 1), error: null }
      },
    }
    return api
  }

  const client = {
    from: () => builder(),
    storage: {
      from: () => ({
        remove: async (paths: string[]) => {
          const index = removeCall++
          recorded.removes.push(paths)
          const message = options.removeErrors?.[index]
          return message ? { data: null, error: { message } } : { data: paths, error: null }
        },
      }),
    },
  } as unknown as SupabaseAdmin

  return { client, recorded }
}

function rowsFor(count: number, overrides: Partial<Row> = {}): Row[] {
  return Array.from({ length: count }, (_, i) => ({
    path: `c-1/u-1/campo/uuid-${i}.pdf`,
    contest_id: 'c-1',
    user_id: 'u-1',
    ...overrides,
  }))
}

// ─── Collecting ──────────────────────────────────────────────────────────────

describe('collectUploadPathsToPurge', () => {
  it('reads a contest\'s paths', async () => {
    const { client, recorded } = createClient({ rows: rowsFor(3) })
    const paths = await collectUploadPathsToPurge(client, { contestIds: ['c-1'] })

    expect(paths).toHaveLength(3)
    expect(recorded.filters).toEqual([{ op: 'in', column: 'contest_id', value: ['c-1'] }])
  })

  // The failure this guards is silent: PostgREST caps an unbounded select at
  // 1000 rows, so a contest with more attachments than that would leak the
  // remainder with no error anywhere.
  it('pages until a short page says there is no more', async () => {
    const total = PATH_PAGE_SIZE + 7
    const { client, recorded } = createClient({ rows: rowsFor(total) })

    const paths = await collectUploadPathsToPurge(client, { contestIds: ['c-1'] })

    expect(paths).toHaveLength(total)
    expect(new Set(paths).size).toBe(total)
    expect(recorded.ranges).toEqual([
      { from: 0, to: PATH_PAGE_SIZE - 1 },
      { from: PATH_PAGE_SIZE, to: PATH_PAGE_SIZE * 2 - 1 },
    ])
  })

  it('stops after one page when the page comes back short', async () => {
    const { client, recorded } = createClient({ rows: rowsFor(2) })
    await collectUploadPathsToPurge(client, { contestIds: ['c-1'] })
    expect(recorded.ranges).toHaveLength(1)
  })

  it('reads a user\'s own uploads, wherever they live', async () => {
    const { client, recorded } = createClient({
      rows: [{ path: 'otra-org/u-1/campo/uuid-x.pdf', contest_id: 'c-9', user_id: 'u-1' }],
    })

    const paths = await collectUploadPathsToPurge(client, { userId: 'u-1' })

    expect(paths).toEqual(['otra-org/u-1/campo/uuid-x.pdf'])
    expect(recorded.filters).toEqual([{ op: 'eq', column: 'user_id', value: 'u-1' }])
  })

  // Account deletion asks for both, and a person's upload to their own contest
  // matches each. Removing it twice is harmless; counting it twice would
  // misreport what happened.
  it('does not repeat a path that matches both scopes', async () => {
    const { client } = createClient({ rows: rowsFor(4) })
    const paths = await collectUploadPathsToPurge(client, { contestIds: ['c-1'], userId: 'u-1' })
    expect(paths).toHaveLength(4)
  })

  it('asks nothing when there is nothing to ask about', async () => {
    const { client, recorded } = createClient({ rows: rowsFor(3) })
    expect(await collectUploadPathsToPurge(client, {})).toEqual([])
    expect(await collectUploadPathsToPurge(client, { contestIds: [], userId: null })).toEqual([])
    expect(recorded.ranges).toHaveLength(0)
  })

  // supabase-js resolves with `{ data, error }` rather than throwing, so a
  // failed read would otherwise read as "nothing to delete" and leak silently.
  it('raises a failed read instead of treating it as empty', async () => {
    const { client } = createClient({ selectError: 'permission denied' })
    await expect(collectUploadPathsToPurge(client, { contestIds: ['c-1'] }))
      .rejects.toThrow(/permission denied/)
  })
})

// ─── Removing ────────────────────────────────────────────────────────────────

describe('removeUploadObjects', () => {
  it('removes everything in one call when it fits', async () => {
    const { client, recorded } = createClient()
    const outcome = await removeUploadObjects(client, ['a.pdf', 'b.pdf'])

    expect(outcome).toEqual({ removed: 2, failures: [] })
    expect(recorded.removes).toEqual([['a.pdf', 'b.pdf']])
  })

  it('splits into batches', async () => {
    const paths = rowsFor(REMOVE_BATCH_SIZE + 5).map(r => r.path)
    const { client, recorded } = createClient()

    const outcome = await removeUploadObjects(client, paths)

    expect(recorded.removes).toHaveLength(2)
    expect(recorded.removes[0]).toHaveLength(REMOVE_BATCH_SIZE)
    expect(recorded.removes[1]).toHaveLength(5)
    expect(outcome.removed).toBe(paths.length)
  })

  // The database delete has already happened by now, so giving up on the first
  // failure would strand every later batch for no reason.
  it('keeps going after a failed batch and reports it', async () => {
    const paths = rowsFor(REMOVE_BATCH_SIZE * 2).map(r => r.path)
    const { client, recorded } = createClient({ removeErrors: { 0: 'storage down' } })

    const outcome = await removeUploadObjects(client, paths)

    expect(recorded.removes).toHaveLength(2)
    expect(outcome.removed).toBe(REMOVE_BATCH_SIZE)
    expect(outcome.failures).toHaveLength(1)
    expect(outcome.failures[0]!.message).toBe('storage down')
    expect(outcome.failures[0]!.paths).toHaveLength(REMOVE_BATCH_SIZE)
  })

  it('never throws, so a delete is never reported as failed over its cleanup', async () => {
    const { client } = createClient({ removeErrors: { 0: 'boom' } })
    await expect(removeUploadObjects(client, ['a.pdf'])).resolves.toEqual({
      removed: 0,
      failures: [{ paths: ['a.pdf'], message: 'boom' }],
    })
  })

  it('does not touch Storage when there is nothing to remove', async () => {
    const { client, recorded } = createClient()
    expect(await removeUploadObjects(client, [])).toEqual({ removed: 0, failures: [] })
    expect(recorded.removes).toHaveLength(0)
  })
})

describe('chunk', () => {
  it('splits evenly and keeps the remainder', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
  })

  it('returns nothing for an empty list', () => {
    expect(chunk([], 10)).toEqual([])
  })
})
