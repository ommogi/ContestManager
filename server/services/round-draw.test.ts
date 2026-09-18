import { describe, it, expect } from 'vitest'
import { applyRoundDraw, classifyDrawError, RoundDrawError } from './round-draw'
import type { SupabaseAdmin } from './inscription-upload-purge'

// supabase-js resolves with `{ data, error }` and never rejects.
function clientReturning(result: { data?: unknown, error?: { message: string } | null }) {
  const calls: Array<{ fn: string, args: unknown }> = []
  const client = {
    rpc: async (fn: string, args: unknown) => {
      calls.push({ fn, args })
      return { data: result.data ?? null, error: result.error ?? null }
    },
  } as unknown as SupabaseAdmin
  return { client, calls }
}

describe('applyRoundDraw', () => {
  it('sends the whole draw to set_round_draw in one call', async () => {
    const { client, calls } = clientReturning({ data: 2 })
    const rows = [
      { id: 'rp-1', draw_number: 2, performance_minutes: 10 },
      { id: 'rp-2', draw_number: 1, performance_minutes: null },
    ]

    await expect(applyRoundDraw(client, 'round-1', rows)).resolves.toBe(2)
    expect(calls).toEqual([{ fn: 'set_round_draw', args: { p_round_id: 'round-1', p_rows: rows } }])
  })

  it.each([
    ['round_closed', 409],
    ['duplicate_draw_number', 409],
    ['foreign_round_participant', 400],
    ['round_not_found', 404],
    ['invalid_draw_values', 400],
  ] as const)('turns the RPC signal %s into a %i', async (code, status) => {
    const { client } = clientReturning({ error: { message: code } })
    const run = applyRoundDraw(client, 'round-1', [])
    await expect(run).rejects.toBeInstanceOf(RoundDrawError)
    await expect(run).rejects.toMatchObject({ code, statusCode: status })
  })

  // A raw Postgres message names tables and constraints; it must stay internal.
  it('does not dress up an unexpected error as a user-facing one', async () => {
    const { client } = clientReturning({ error: { message: 'relation "round_participants" does not exist' } })
    const run = applyRoundDraw(client, 'round-1', [])
    await expect(run).rejects.not.toBeInstanceOf(RoundDrawError)
    await expect(run).rejects.toThrow(/set_round_draw/)
  })
})

describe('classifyDrawError', () => {
  it('ignores messages the RPC did not raise', () => {
    expect(classifyDrawError('permission denied for table rounds')).toBeNull()
    expect(classifyDrawError(undefined)).toBeNull()
  })
})
