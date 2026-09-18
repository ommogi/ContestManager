// Lives under server/ because vitest.config.ts only collects server/**/*.test.ts,
// even though the module under test is in shared/.
import { describe, it, expect } from 'vitest'
import {
  callTime,
  parseTimeOfDay,
  toHHMM,
  validateSessionWindow,
  windowMinutes,
} from '../../shared/session-window'
import { ContestPatchSchema, RoundPatchSchema } from './schemas'

describe('parseTimeOfDay', () => {
  it('reads HH:MM and the HH:MM:SS Postgres returns for TIME', () => {
    expect(parseTimeOfDay('14:00')).toBe(840)
    expect(parseTimeOfDay('09:05:00')).toBe(545)
  })

  it.each(['24:00', '9:00', '14:60', 'las dos', '', null, undefined])('rejects %j', (v) => {
    expect(parseTimeOfDay(v)).toBeNull()
  })

  it('normalises for inputs', () => {
    expect(toHHMM('18:30:00')).toBe('18:30')
    expect(toHHMM(null)).toBeNull()
  })
})

describe('validateSessionWindow', () => {
  it('accepts a window that ends after it starts', () => {
    expect(validateSessionWindow('14:00', '18:00')).toBeNull()
  })

  // KAN-12: "la franja se valida: fin posterior a inicio".
  it('rejects an end equal to or before the start', () => {
    expect(validateSessionWindow('14:00', '14:00')).toBe('end_not_after_start')
    expect(validateSessionWindow('18:00', '14:00')).toBe('end_not_after_start')
  })

  // Saving the start before choosing the end is a normal way to fill the form.
  it('accepts a half-filled window', () => {
    expect(validateSessionWindow('14:00', null)).toBeNull()
    expect(validateSessionWindow(null, '18:00')).toBeNull()
    expect(validateSessionWindow(null, null)).toBeNull()
  })

  it('names which end is malformed', () => {
    expect(validateSessionWindow('2pm', '18:00')).toBe('invalid_start')
    expect(validateSessionWindow('14:00', '25:00')).toBe('invalid_end')
  })
})

describe('windowMinutes', () => {
  it('is the length of a complete window', () => {
    expect(windowMinutes('14:00', '18:00')).toBe(240)
  })

  it('is null when the window is incomplete or inverted', () => {
    expect(windowMinutes('14:00', null)).toBeNull()
    expect(windowMinutes('18:00', '14:00')).toBeNull()
  })
})

describe('callTime', () => {
  it('subtracts the offset from the performance time', () => {
    expect(callTime('2026-10-12T16:30', 120)).toBe('2026-10-12T14:30')
  })

  it('crosses midnight into the previous day', () => {
    expect(callTime('2026-10-12T01:00', 120)).toBe('2026-10-11T23:00')
  })

  it('crosses a month boundary', () => {
    expect(callTime('2026-11-01T00:30', 60)).toBe('2026-10-31T23:30')
  })

  // 2026-10-25 is when Spain goes back an hour. A wall-clock value must not move.
  it('ignores daylight-saving changes', () => {
    expect(callTime('2026-10-25T04:00', 120)).toBe('2026-10-25T02:00')
  })

  it('keeps the time with a zero offset', () => {
    expect(callTime('2026-10-12T16:30', 0)).toBe('2026-10-12T16:30')
  })

  it('refuses what it cannot read', () => {
    expect(callTime('16:30', 60)).toBeNull()
    expect(callTime('2026-10-12T16:30', -5)).toBeNull()
    expect(callTime('2026-10-12T16:30', 1.5)).toBeNull()
  })
})

describe('RoundPatchSchema: session window', () => {
  it('accepts a full window with its date', () => {
    expect(RoundPatchSchema.safeParse({
      session_date: '2026-10-12', session_start: '14:00', session_end: '18:00',
    }).success).toBe(true)
  })

  it('accepts clearing it', () => {
    expect(RoundPatchSchema.safeParse({
      session_date: null, session_start: null, session_end: null,
    }).success).toBe(true)
  })

  it('rejects an end before the start in the same request', () => {
    const r = RoundPatchSchema.safeParse({ session_start: '18:00', session_end: '14:00' })
    expect(r.success).toBe(false)
    expect(r.error?.issues[0]?.message).toBe('end_not_after_start')
  })

  it.each([
    { session_start: '2pm' },
    { session_end: '24:00' },
    { session_date: '12/10/2026' },
  ])('rejects a malformed value %j', (body) => {
    expect(RoundPatchSchema.safeParse(body).success).toBe(false)
  })
})

describe('ContestPatchSchema: call offset', () => {
  it.each([0, 120, 720, null])('accepts %j', (v) => {
    expect(ContestPatchSchema.safeParse({ call_offset_minutes: v }).success).toBe(true)
  })

  it.each([-1, 721, 90.5])('rejects %j', (v) => {
    expect(ContestPatchSchema.safeParse({ call_offset_minutes: v }).success).toBe(false)
  })
})
