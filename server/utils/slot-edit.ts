// server/utils/slot-edit.ts
// What a manual edit of a round participant's schedule writes (KAN-15).
//
// Pure so it can be tested without a database: given the row as stored and
// the fields the organisation sent, return the columns to update.
import { slotEnd } from '../../shared/schedule-generator'

export const EDITABLE_SCHEDULE_FIELDS = [
  'rehearsal_room',
  'rehearsal_time',
  'rehearsal_accompanist',
  'performance_time',
] as const

export type EditableScheduleField = (typeof EDITABLE_SCHEDULE_FIELDS)[number]

export interface StoredSlot {
  performance_time: string | null
  /** round_participants.performance_minutes ?? contests.performance_default_minutes */
  effectiveMinutes: number | null
}

export type SlotUpdates = Partial<Record<EditableScheduleField | 'performance_end_time' | 'schedule_edited_at', string | null>>

/**
 * Only a performance time that actually changes counts as a manual edit: the
 * dialog saves every row, and an untouched one must not be flagged. When it
 * does change, the end follows the new start so the slot keeps its length, and
 * the row is stamped so a regeneration can warn before overwriting it.
 */
export function buildSlotUpdates(
  stored: StoredSlot,
  body: Partial<Record<EditableScheduleField, string | null>>,
  now: Date,
): SlotUpdates {
  const updates: SlotUpdates = {}
  for (const key of EDITABLE_SCHEDULE_FIELDS) {
    if (key in body) updates[key] = body[key] ?? null
  }

  if ('performance_time' in updates) {
    const next = updates.performance_time || null
    if (next === (stored.performance_time || null)) {
      // Same value re-sent: not an edit, leave the slot and its stamp alone.
      delete updates.performance_time
    } else {
      updates.performance_time = next
      updates.performance_end_time = next ? slotEnd(next, stored.effectiveMinutes) : null
      updates.schedule_edited_at = now.toISOString()
    }
  }

  return updates
}
