import { describe, it, expect } from 'vitest'
import { applyRoundSchedule, loadRoundSchedule, RoundScheduleError } from './round-schedule'
import type { SupabaseAdmin } from './inscription-upload-purge'
import type { SchedulePlan } from '../../shared/schedule-generator'

// Enough of supabase-js for the three reads and the RPC. Resolves with
// `{ data, error }` and never rejects, like the real client.
function createClient(options: {
  round?: Record<string, unknown> | null
  contest?: Record<string, unknown> | null
  participants?: Array<Record<string, unknown>>
  rpcError?: string
}) {
  const rpcCalls: Array<{ fn: string, args: unknown }> = []
  const single = (data: unknown) => ({ maybeSingle: async () => ({ data, error: null }) })

  const client = {
    from: (table: string) => ({
      select: () => ({
        eq: () => {
          if (table === 'rounds') return single(options.round ?? null)
          if (table === 'categories') return single({ contests: options.contest ?? null })
          return Promise.resolve({ data: options.participants ?? [], error: null })
        },
      }),
    }),
    rpc: async (fn: string, args: unknown) => {
      rpcCalls.push({ fn, args })
      return options.rpcError ? { data: null, error: { message: options.rpcError } } : { data: 2, error: null }
    },
  } as unknown as SupabaseAdmin

  return { client, rpcCalls }
}

const round = {
  status: 'active', category_id: 'cat-1',
  session_date: '2026-10-12', session_start: '14:00:00', session_end: '18:00:00',
}

describe('loadRoundSchedule', () => {
  it('plans from the database, counting slots that would be overwritten', async () => {
    const { client } = createClient({
      round,
      contest: { performance_default_minutes: 10, call_offset_minutes: 60 },
      participants: [
        { id: 'rp-2', draw_number: 2, performance_minutes: null, performance_time: '2026-10-12T15:00', schedule_edited_at: '2026-10-12T09:00:00Z', participant: { name: 'Luis' } },
        { id: 'rp-1', draw_number: 1, performance_minutes: 20, performance_time: null, participant: { first_name: 'Ana', last_name: 'Ruiz' } },
      ],
    })

    const ctx = await loadRoundSchedule(client, 'round-1')

    expect(ctx.plan.ok).toBe(true)
    expect(ctx.plan.slots.map(s => [s.id, s.performance_time, s.call_time])).toEqual([
      ['rp-1', '2026-10-12T14:00', '2026-10-12T13:00'],
      ['rp-2', '2026-10-12T14:20', '2026-10-12T13:20'],
    ])
    expect(ctx.alreadyScheduled).toBe(1)
    // KAN-15: the hand-adjusted slot is reported so regenerating can name it.
    expect(ctx.manuallyEdited).toEqual(['rp-2'])
    expect(ctx.names).toEqual({ 'rp-2': 'Luis', 'rp-1': 'Ana Ruiz' })
  })

  it('refuses an unknown round', async () => {
    const { client } = createClient({ round: null })
    await expect(loadRoundSchedule(client, 'nope')).rejects.toMatchObject({ code: 'round_not_found', statusCode: 404 })
  })
})

describe('applyRoundSchedule', () => {
  const plan = {
    ok: true, error: null, overflow: [], missingMinutes: [], neededMinutes: 10, availableMinutes: 240,
    slots: [{
      id: 'rp-1', draw_number: 1, minutes: 10,
      performance_time: '2026-10-12T14:00', performance_end_time: '2026-10-12T14:10', call_time: '2026-10-12T13:00',
    }],
  } satisfies SchedulePlan

  // The call time is derived on read, never stored.
  it('writes only the performance columns, in one RPC call', async () => {
    const { client, rpcCalls } = createClient({})
    await applyRoundSchedule(client, 'round-1', plan)

    expect(rpcCalls).toEqual([{
      fn: 'apply_round_schedule',
      args: {
        p_round_id: 'round-1',
        p_rows: [{ id: 'rp-1', performance_time: '2026-10-12T14:00', performance_end_time: '2026-10-12T14:10' }],
      },
    }])
  })

  it('turns round_closed into a 409', async () => {
    const { client } = createClient({ rpcError: 'round_closed' })
    const run = applyRoundSchedule(client, 'round-1', plan)
    await expect(run).rejects.toBeInstanceOf(RoundScheduleError)
    await expect(run).rejects.toMatchObject({ statusCode: 409 })
  })

  it('keeps an unexpected database error internal', async () => {
    const { client } = createClient({ rpcError: 'relation does not exist' })
    await expect(applyRoundSchedule(client, 'round-1', plan)).rejects.not.toBeInstanceOf(RoundScheduleError)
  })
})
