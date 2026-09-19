import { describe, it, expect } from 'vitest'
import { loadRepertoire, RepertoireError, saveRepertoire } from './repertoire'
import { effectiveSeconds, repertoireSummary, repertoireTotal } from '../../shared/repertoire'
import { RepertoireBodySchema } from '../utils/schemas'
import type { SupabaseAdmin } from './inscription-upload-purge'

const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`

describe('repertoire totals', () => {
  it('uses the override, else the catalogue length', () => {
    expect(effectiveSeconds({ duration_seconds: 300, catalog_seconds: 450 })).toBe(300)
    expect(effectiveSeconds({ duration_seconds: null, catalog_seconds: 450 })).toBe(450)
    expect(effectiveSeconds({ duration_seconds: null, catalog_seconds: null })).toBeNull()
  })

  // KAN-17: "se muestra la suma total de minutos al editar".
  it('adds up and rounds the slot up to whole minutes', () => {
    const total = repertoireTotal([
      { duration_seconds: null, catalog_seconds: 450 },
      { duration_seconds: 200, catalog_seconds: 600 },
    ])
    expect(total).toEqual({ seconds: 650, slotMinutes: 11, missing: 0 })
  })

  it('counts items with no length at all', () => {
    expect(repertoireTotal([{ duration_seconds: null, catalog_seconds: null }]).missing).toBe(1)
  })

  it('summarises for the participant list', () => {
    expect(repertoireSummary([])).toBe('Sin repertorio')
    expect(repertoireSummary([
      { duration_seconds: 450, catalog_seconds: null },
      { duration_seconds: 660, catalog_seconds: null },
    ])).toBe('2 obras · 18:30')
  })
})

describe('RepertoireBodySchema', () => {
  it('accepts an ordered list, empty included', () => {
    expect(RepertoireBodySchema.safeParse({ items: [] }).success).toBe(true)
    expect(RepertoireBodySchema.safeParse({
      items: [{ work_id: id(1), duration_seconds: null }, { work_id: id(2), duration_seconds: 300 }],
    }).success).toBe(true)
  })

  it('rejects the same work twice', () => {
    const r = RepertoireBodySchema.safeParse({
      items: [{ work_id: id(1), duration_seconds: null }, { work_id: id(1), duration_seconds: 60 }],
    })
    expect(r.error?.issues[0]?.message).toBe('duplicate_work')
  })

  it.each([0, 7201, 2.5])('rejects a duration of %j', (duration_seconds) => {
    expect(RepertoireBodySchema.safeParse({ items: [{ work_id: id(1), duration_seconds }] }).success).toBe(false)
  })
})

// ─── Service ─────────────────────────────────────────────────────────────────

type Result = { data: unknown; error: { message: string } | null }

/** Answers by table plus the value of the filter that identifies the row. */
function createClient(options: {
  rp?: unknown
  items?: Record<string, unknown[]>
  prevRound?: unknown
  prevRp?: unknown
  rpcError?: string
}) {
  const rpcCalls: Array<{ fn: string; args: unknown }> = []
  const client = {
    from(table: string) {
      const filters: Record<string, unknown> = {}
      const api: any = {
        select: () => api,
        order: () => api,
        eq: (col: string, val: unknown) => { filters[col] = val; return api },
        maybeSingle: async (): Promise<Result> => {
          if (table === 'round_participants' && 'id' in filters) return { data: options.rp ?? null, error: null }
          if (table === 'rounds') return { data: options.prevRound ?? null, error: null }
          if (table === 'round_participants') return { data: options.prevRp ?? null, error: null }
          return { data: null, error: null }
        },
        then: (resolve: (r: Result) => void) =>
          resolve({ data: options.items?.[String(filters.round_participant_id)] ?? [], error: null }),
      }
      return api
    },
    rpc: async (fn: string, args: unknown) => {
      rpcCalls.push({ fn, args })
      return { data: 1, error: options.rpcError ? { message: options.rpcError } : null }
    },
  } as unknown as SupabaseAdmin
  return { client, rpcCalls }
}

const row = (workId: string, title: string, catalog: number | null, override: number | null = null) => ({
  duration_seconds: override,
  work: { id: workId, title, catalog_ref: null, duration_seconds: catalog, archived_at: null, composer: { name: 'Albéniz' } },
})

const rp = (status: string) => ({
  id: 'rp-2', participant_id: 'p-1',
  round: { id: 'r-2', name: 'Final', order: 2, status, category_id: 'cat-1', category: { contest_id: 'c-1' } },
})

describe('loadRepertoire', () => {
  it('returns the list in order with its total, and the previous round to copy from', async () => {
    const { client } = createClient({
      rp: rp('pending'),
      items: { 'rp-2': [row('w1', 'Asturias', 420)], 'rp-1': [row('w9', 'Sevilla', 300)] },
      prevRound: { id: 'r-1', name: 'Semifinal' },
      prevRp: { id: 'rp-1' },
    })

    const view = await loadRepertoire(client, 'rp-2')

    expect(view.editable).toBe(true)
    expect(view.contestId).toBe('c-1')
    expect(view.items.map(i => i.title)).toEqual(['Asturias'])
    expect(view.total.seconds).toBe(420)
    expect(view.previous).toEqual({ roundName: 'Semifinal', items: [expect.objectContaining({ title: 'Sevilla' })] })
  })

  // The agreed lock: fixed once the round has started.
  it.each(['active', 'closed'])('is read-only when the round is %s', async (status) => {
    const { client } = createClient({ rp: rp(status), items: {} })
    expect((await loadRepertoire(client, 'rp-2')).editable).toBe(false)
  })

  it('has nothing to copy in the first round', async () => {
    const { client } = createClient({ rp: rp('pending'), items: {} })
    expect((await loadRepertoire(client, 'rp-2')).previous).toBeNull()
  })

  it('refuses an unknown round participant', async () => {
    const { client } = createClient({ rp: null })
    await expect(loadRepertoire(client, 'nope')).rejects.toMatchObject({ code: 'round_participant_not_found', statusCode: 404 })
  })
})

describe('saveRepertoire', () => {
  it('sends the whole ordered list to the RPC', async () => {
    const { client, rpcCalls } = createClient({ rp: rp('pending'), items: {} })
    await saveRepertoire(client, 'rp-2', [{ work_id: 'w2', duration_seconds: null }, { work_id: 'w1', duration_seconds: 300 }])
    expect(rpcCalls).toEqual([{
      fn: 'set_round_repertoire',
      args: { p_rp_id: 'rp-2', p_items: [{ work_id: 'w2', duration_seconds: null }, { work_id: 'w1', duration_seconds: 300 }] },
    }])
  })

  it.each([
    ['round_locked', 409],
    ['work_other_organization', 400],
    ['work_archived', 409],
    ['duplicate_work', 400],
  ] as const)('turns %s into a %i', async (code, status) => {
    const { client } = createClient({ rpcError: code })
    const run = saveRepertoire(client, 'rp-2', [])
    await expect(run).rejects.toBeInstanceOf(RepertoireError)
    await expect(run).rejects.toMatchObject({ statusCode: status })
  })

  it('keeps an unexpected database error internal', async () => {
    const { client } = createClient({ rpcError: 'relation does not exist' })
    await expect(saveRepertoire(client, 'rp-2', [])).rejects.not.toBeInstanceOf(RepertoireError)
  })
})
