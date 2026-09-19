// Lives under server/ because vitest.config.ts only collects server/**/*.test.ts,
// even though the module under test is in shared/.
import { describe, it, expect } from 'vitest'
import { planSchedule, slotLengthMinutes, staleSlots, type ScheduleInput } from '../../shared/schedule-generator'
import { RoundScheduleGenerateSchema } from './schemas'

const base: Omit<ScheduleInput, 'entries'> = {
  defaultMinutes: null,
  sessionDate: '2026-10-12',
  sessionStart: '14:00',
  sessionEnd: '18:00',
  callOffsetMinutes: 120,
}

const entry = (id: string, draw: number | null, minutes: number | null = 10) =>
  ({ id, draw_number: draw, performance_minutes: minutes })

describe('planSchedule', () => {
  it('chains slots back to back from the start of the window, in draw order', () => {
    const plan = planSchedule({
      ...base,
      // Given out of order, with gaps in the numbering.
      entries: [entry('c', 7, 15), entry('a', 2, 10), entry('b', 5, 8)],
    })

    expect(plan.ok).toBe(true)
    expect(plan.slots.map(s => [s.id, s.performance_time, s.performance_end_time])).toEqual([
      ['a', '2026-10-12T14:00', '2026-10-12T14:10'],
      ['b', '2026-10-12T14:10', '2026-10-12T14:18'],
      ['c', '2026-10-12T14:18', '2026-10-12T14:33'],
    ])
  })

  it('calls each participant the offset before they play', () => {
    const plan = planSchedule({ ...base, entries: [entry('a', 1), entry('b', 2)] })
    expect(plan.slots.map(s => s.call_time)).toEqual(['2026-10-12T12:00', '2026-10-12T12:10'])
  })

  it('leaves call times empty when the contest does not use them', () => {
    const plan = planSchedule({ ...base, callOffsetMinutes: null, entries: [entry('a', 1)] })
    expect(plan.slots[0]!.call_time).toBeNull()
  })

  it('crosses midnight backwards for an early call', () => {
    const plan = planSchedule({
      ...base, sessionStart: '09:00', sessionEnd: '12:00', callOffsetMinutes: 600,
      entries: [entry('a', 1)],
    })
    expect(plan.slots[0]!.call_time).toBe('2026-10-11T23:00')
  })

  it('uses the contest default when a participant has no minutes', () => {
    const plan = planSchedule({ ...base, defaultMinutes: 12, entries: [entry('a', 1, null), entry('b', 2, 5)] })
    expect(plan.slots.map(s => s.minutes)).toEqual([12, 5])
    expect(plan.neededMinutes).toBe(17)
  })

  // The example in KAN-14: 14:00–18:00 with 8-minute performances is exactly 30 slots.
  it('fills the window exactly with no margin', () => {
    const entries = Array.from({ length: 30 }, (_, i) => entry(`p${i + 1}`, i + 1, 8))
    const plan = planSchedule({ ...base, entries })

    expect(plan.ok).toBe(true)
    expect(plan.neededMinutes).toBe(240)
    expect(plan.availableMinutes).toBe(240)
    expect(plan.slots.at(-1)!.performance_end_time).toBe('2026-10-12T18:00')
  })

  it('refuses a round that overflows by a minute, naming who is left out', () => {
    const entries = Array.from({ length: 30 }, (_, i) => entry(`p${i + 1}`, i + 1, 8))
    entries[3] = entry('p4', 4, 9)
    const plan = planSchedule({ ...base, entries })

    expect(plan.ok).toBe(false)
    expect(plan.error).toBe('does_not_fit')
    expect(plan.overflow).toEqual(['p30'])
    expect(plan.neededMinutes! - plan.availableMinutes!).toBe(1)
    // Nothing is placed outside the window.
    expect(plan.slots.every(s => s.performance_end_time <= '2026-10-12T18:00')).toBe(true)
  })

  it.each([
    ['empty_round', { entries: [] }],
    ['draw_not_ready', { entries: [entry('a', 1), entry('b', null)] }],
    ['draw_not_ready', { entries: [entry('a', 1), entry('b', 1)] }],
    ['missing_window', { sessionDate: null, entries: [entry('a', 1)] }],
    ['missing_window', { sessionEnd: null, entries: [entry('a', 1)] }],
    ['missing_minutes', { entries: [entry('a', 1, null)] }],
  ] as const)('refuses with %s', (error, override) => {
    const plan = planSchedule({ ...base, ...override })
    expect(plan.ok).toBe(false)
    expect(plan.error).toBe(error)
    expect(plan.slots).toEqual([])
  })

  it('still reports the figures when the plan is refused, for the preview', () => {
    const plan = planSchedule({ ...base, entries: [entry('a', null, 30)] })
    expect(plan.neededMinutes).toBe(30)
    expect(plan.availableMinutes).toBe(240)
  })

  it('reads the HH:MM:SS Postgres returns for TIME', () => {
    const plan = planSchedule({ ...base, sessionStart: '14:00:00', sessionEnd: '18:00:00', entries: [entry('a', 1)] })
    expect(plan.slots[0]!.performance_time).toBe('2026-10-12T14:00')
  })
})

describe('RoundScheduleGenerateSchema', () => {
  it('defaults to a dry run that does not overwrite', () => {
    expect(RoundScheduleGenerateSchema.parse({})).toEqual({ dryRun: true, overwrite: false })
  })
})

describe('stale slots (KAN-18)', () => {
  const slot = (id: string, start: string | null, end: string | null, minutes: number | null) =>
    ({ id, performance_time: start, performance_end_time: end, performance_minutes: minutes })

  it('measures a slot, across midnight too', () => {
    expect(slotLengthMinutes('2026-10-12T14:00', '2026-10-12T14:19')).toBe(19)
    expect(slotLengthMinutes('2026-10-12T23:50', '2026-10-13T00:10')).toBe(20)
    expect(slotLengthMinutes(null, '2026-10-12T14:19')).toBeNull()
  })

  it('flags a slot whose length no longer matches the minutes', () => {
    const rows = [
      slot('ok', '2026-10-12T14:00', '2026-10-12T14:19', 19),
      // The repertoire grew to 25 minutes after the round was scheduled.
      slot('grew', '2026-10-12T14:19', '2026-10-12T14:38', 25),
    ]
    expect(staleSlots(rows, null)).toEqual(['grew'])
  })

  it('judges against the contest default when there are no minutes', () => {
    expect(staleSlots([slot('a', '2026-10-12T14:00', '2026-10-12T14:08', null)], 8)).toEqual([])
    expect(staleSlots([slot('a', '2026-10-12T14:00', '2026-10-12T14:08', null)], 10)).toEqual(['a'])
  })

  it('does not judge unscheduled rows or rows with no known length', () => {
    expect(staleSlots([
      slot('unscheduled', null, null, 19),
      slot('no-length', '2026-10-12T14:00', '2026-10-12T14:08', null),
    ], null)).toEqual([])
  })
})
