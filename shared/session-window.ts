// shared/session-window.ts
// A round's session window and the contest's call offset (KAN-12).
//
// Pure helpers for the round page, the API and the schedule generator
// (KAN-13). Times are wall-clock strings with no time zone, the same as the
// TEXT datetime-local `performance_time` they end up next to: "14:00", and
// "2026-10-12T14:00" once a date is attached.

/** Upper bound for the call offset, mirrored by the DB CHECK in 0065. */
export const MAX_CALL_OFFSET_MINUTES = 720

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/

/**
 * Minutes since midnight for "HH:MM" (Postgres returns TIME as "HH:MM:SS",
 * which is accepted too). Null for anything else.
 */
export function parseTimeOfDay(value: string | null | undefined): number | null {
  const m = HHMM.exec((value ?? '').trim())
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}

/** "14:00:00" → "14:00", for inputs and display. */
export function toHHMM(value: string | null | undefined): string | null {
  const minutes = parseTimeOfDay(value)
  if (minutes === null) return null
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}

export type SessionWindowError = 'invalid_start' | 'invalid_end' | 'end_not_after_start'

/**
 * Either end may be missing (the form can be saved half-filled), but a value
 * that is present must be a time, and when both are present the end must come
 * after the start. Windows past midnight are not supported.
 */
export function validateSessionWindow(
  start: string | null | undefined,
  end: string | null | undefined,
): SessionWindowError | null {
  const s = start ? parseTimeOfDay(start) : null
  const e = end ? parseTimeOfDay(end) : null
  if (start && s === null) return 'invalid_start'
  if (end && e === null) return 'invalid_end'
  if (s !== null && e !== null && e <= s) return 'end_not_after_start'
  return null
}

export const SESSION_WINDOW_MESSAGES: Record<SessionWindowError, string> = {
  invalid_start: 'La hora de inicio no es válida.',
  invalid_end: 'La hora de fin no es válida.',
  end_not_after_start: 'La hora de fin debe ser posterior a la de inicio.',
}

/** Length of a valid window in minutes; null if either end is missing or invalid. */
export function windowMinutes(start: string | null | undefined, end: string | null | undefined): number | null {
  const s = parseTimeOfDay(start)
  const e = parseTimeOfDay(end)
  if (s === null || e === null || e <= s) return null
  return e - s
}

const DATETIME_LOCAL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/**
 * When a participant must arrive: `offsetMinutes` before their performance.
 * Both in and out are datetime-local strings ("2026-10-12T14:00"). The
 * arithmetic is done in UTC on purpose — these are wall-clock values with no
 * zone, so a daylight-saving change in the browser's zone must not shift them.
 */
export function callTime(performanceStart: string, offsetMinutes: number): string | null {
  const m = DATETIME_LOCAL.exec(performanceStart)
  if (!m || !Number.isInteger(offsetMinutes) || offsetMinutes < 0) return null
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]))
  if (Number.isNaN(t)) return null
  const d = new Date(t - offsetMinutes * 60_000)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
}
