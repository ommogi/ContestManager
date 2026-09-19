// shared/schedule-generator.ts
// Consecutive performance slots from the draw order (KAN-13).
//
// The algorithm, as confirmed by the client:
//   * participants in ascending draw number;
//   * number 1 starts at the start of the round's session window;
//   * each slot starts when the previous one ends — no breaks, no margins;
//   * each slot lasts the participant's own minutes (or the contest default);
//   * the call time is the performance time minus the contest's call offset.
//
// Nothing is ever placed outside the window: if the round does not fit, the
// plan is refused and says who overflows and by how much (KAN-14).
//
// Output times are datetime-local strings ("2026-10-12T14:00"), the format of
// `round_participants.performance_time` / `performance_end_time`.

import { drawReadiness, type DrawEntry } from './round-draw'
import { callTime, parseTimeOfDay } from './session-window'

export interface ScheduleInput {
  entries: readonly DrawEntry[]
  /** contests.performance_default_minutes */
  defaultMinutes: number | null
  /** rounds.session_date, "YYYY-MM-DD" */
  sessionDate: string | null
  /** rounds.session_start / session_end, "HH:MM" or "HH:MM:SS" */
  sessionStart: string | null
  sessionEnd: string | null
  /** contests.call_offset_minutes; null = the contest does not use call times. */
  callOffsetMinutes: number | null
}

export interface ScheduleSlot {
  id: string
  draw_number: number
  minutes: number
  performance_time: string
  performance_end_time: string
  call_time: string | null
}

export type ScheduleError =
  | 'empty_round'
  | 'draw_not_ready'
  | 'missing_window'
  | 'missing_minutes'
  | 'does_not_fit'

export interface SchedulePlan {
  ok: boolean
  error: ScheduleError | null
  /** Every slot that fits, in draw order. Empty unless the draw and window are usable. */
  slots: ScheduleSlot[]
  /** Sum of every participant's minutes; null while some are unknown. */
  neededMinutes: number | null
  /** Length of the window; null while it is incomplete. */
  availableMinutes: number | null
  /** round_participants ids whose slot would end past the window. */
  overflow: string[]
  /** Participants lacking minutes when there is no contest default either. */
  missingMinutes: string[]
}

export const SCHEDULE_ERROR_MESSAGES: Record<ScheduleError, string> = {
  empty_round: 'La ronda no tiene participantes.',
  draw_not_ready: 'Falta asignar el número de sorteo a todos los participantes, sin repetir.',
  missing_window: 'Configura la fecha y la franja horaria de la ronda (Jornada).',
  missing_minutes: 'Hay participantes sin duración y el concurso no tiene una duración por defecto.',
  does_not_fit: 'Los participantes no caben en la franja horaria.',
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** "YYYY-MM-DD" + minutes since that midnight → datetime-local, in UTC so no zone moves it. */
function at(date: string, minutesFromMidnight: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  const t = new Date(Date.UTC(y, m - 1, d) + minutesFromMidnight * 60_000)
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}T${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}`
}

const DATETIME_LOCAL = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/

/** Length in minutes of a generated slot; null unless both ends are readable. */
export function slotLengthMinutes(start: string | null | undefined, end: string | null | undefined): number | null {
  const a = DATETIME_LOCAL.exec(start ?? '')
  const b = DATETIME_LOCAL.exec(end ?? '')
  if (!a || !b) return null
  const minutes = (m: RegExpExecArray) => {
    const [y, mo, d] = m[1]!.split('-').map(Number) as [number, number, number]
    return Date.UTC(y, mo - 1, d) / 60_000 + Number(m[2]) * 60 + Number(m[3])
  }
  return minutes(b) - minutes(a)
}

export interface SlotRow {
  id: string
  performance_time: string | null
  performance_end_time: string | null
  performance_minutes: number | null
}

/**
 * Slots whose length no longer matches the participant's minutes (KAN-18):
 * the repertoire or a typed length changed after the round was scheduled.
 * Worked out on read, so nothing has to remember to clear a flag. Rows
 * without both ends, or without any known length, are not judged.
 */
export function staleSlots(rows: readonly SlotRow[], defaultMinutes: number | null): string[] {
  return rows
    .filter((row) => {
      const length = slotLengthMinutes(row.performance_time, row.performance_end_time)
      const expected = row.performance_minutes ?? defaultMinutes
      return length !== null && expected != null && length !== expected
    })
    .map(row => row.id)
}

/**
 * End of a slot that starts at `performanceStart` (datetime-local) and lasts
 * `minutes`. Used when a slot is moved by hand (KAN-15), so its end follows.
 * Null when the start is unreadable or the length unknown.
 */
export function slotEnd(performanceStart: string | null | undefined, minutes: number | null | undefined): string | null {
  const m = DATETIME_LOCAL.exec(performanceStart ?? '')
  if (!m || minutes == null || !Number.isInteger(minutes) || minutes <= 0) return null
  return at(m[1]!, Number(m[2]) * 60 + Number(m[3]) + minutes)
}

export function planSchedule(input: ScheduleInput): SchedulePlan {
  const plan: SchedulePlan = {
    ok: false,
    error: null,
    slots: [],
    neededMinutes: null,
    availableMinutes: null,
    overflow: [],
    missingMinutes: [],
  }

  const start = parseTimeOfDay(input.sessionStart)
  const end = parseTimeOfDay(input.sessionEnd)
  const hasDate = !!input.sessionDate && /^\d{4}-\d{2}-\d{2}$/.test(input.sessionDate)
  if (start !== null && end !== null && end > start) plan.availableMinutes = end - start

  const minutesOf = (e: DrawEntry) => e.performance_minutes ?? input.defaultMinutes ?? null
  plan.missingMinutes = input.entries.filter(e => minutesOf(e) === null).map(e => e.id)
  if (plan.missingMinutes.length === 0) {
    plan.neededMinutes = input.entries.reduce((sum, e) => sum + minutesOf(e)!, 0)
  }

  // Checked in the order the organisation has to fix them.
  if (input.entries.length === 0) { plan.error = 'empty_round'; return plan }
  if (!drawReadiness(input.entries).ready) { plan.error = 'draw_not_ready'; return plan }
  if (!hasDate || plan.availableMinutes === null) { plan.error = 'missing_window'; return plan }
  if (plan.missingMinutes.length > 0) { plan.error = 'missing_minutes'; return plan }

  const ordered = [...input.entries].sort((a, b) => a.draw_number! - b.draw_number!)
  let cursor = start!

  for (const entry of ordered) {
    const minutes = minutesOf(entry)!
    const slotEnd = cursor + minutes
    if (slotEnd > end!) {
      plan.overflow.push(entry.id)
    } else {
      const performance = at(input.sessionDate!, cursor)
      plan.slots.push({
        id: entry.id,
        draw_number: entry.draw_number!,
        minutes,
        performance_time: performance,
        performance_end_time: at(input.sessionDate!, slotEnd),
        call_time: input.callOffsetMinutes === null ? null : callTime(performance, input.callOffsetMinutes),
      })
    }
    cursor = slotEnd
  }

  if (plan.overflow.length > 0) { plan.error = 'does_not_fit'; return plan }

  plan.ok = true
  return plan
}
