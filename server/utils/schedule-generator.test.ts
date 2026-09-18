// Lives under server/ because vitest.config.ts only collects server/**/*.test.ts,
// even though the module under test is in shared/.
import { describe, it, expect } from 'vitest'
import { planSchedule, type ScheduleInput } from '../../shared/schedule-generator'
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
