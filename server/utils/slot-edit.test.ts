import { describe, it, expect } from 'vitest'
import { buildSlotUpdates } from './slot-edit'
import { slotEnd } from '../../shared/schedule-generator'

const now = new Date('2026-10-12T10:00:00Z')
const stored = { performance_time: '2026-10-12T14:00', effectiveMinutes: 10 }

describe('slotEnd', () => {
  it('adds the length to the start', () => {
    expect(slotEnd('2026-10-12T14:00', 25)).toBe('2026-10-12T14:25')
  })

  it('crosses midnight', () => {
    expect(slotEnd('2026-10-12T23:50', 20)).toBe('2026-10-13T00:10')
  })

  it('is null without a readable start or a length', () => {
    expect(slotEnd(null, 10)).toBeNull()
    expect(slotEnd('14:00', 10)).toBeNull()
    expect(slotEnd('2026-10-12T14:00', null)).toBeNull()
    expect(slotEnd('2026-10-12T14:00', 0)).toBeNull()
  })
})

describe('buildSlotUpdates', () => {
  // KAN-15: moving one slot by hand keeps its length and is flagged.
  it('moves the end with the start and stamps the edit', () => {
    expect(buildSlotUpdates(stored, { performance_time: '2026-10-12T15:30' }, now)).toEqual({
      performance_time: '2026-10-12T15:30',
      performance_end_time: '2026-10-12T15:40',
      schedule_edited_at: '2026-10-12T10:00:00.000Z',
    })
  })

  // The dialog used to PATCH every row; an untouched one must not be flagged.
  it('ignores a performance time that did not change', () => {
    expect(buildSlotUpdates(stored, { performance_time: '2026-10-12T14:00' }, now)).toEqual({})
  })

  it('treats empty string and null as the same "no time"', () => {
    expect(buildSlotUpdates({ ...stored, performance_time: null }, { performance_time: '' }, now)).toEqual({})
  })

  it('clears the end when the time is cleared', () => {
    expect(buildSlotUpdates(stored, { performance_time: null }, now)).toEqual({
      performance_time: null,
      performance_end_time: null,
      schedule_edited_at: '2026-10-12T10:00:00.000Z',
    })
  })

  it('leaves the end empty when the length is unknown', () => {
    const updates = buildSlotUpdates({ ...stored, effectiveMinutes: null }, { performance_time: '2026-10-12T16:00' }, now)
    expect(updates.performance_end_time).toBeNull()
    expect(updates.schedule_edited_at).toBeDefined()
  })

  it('passes rehearsal fields through without flagging the slot', () => {
    expect(buildSlotUpdates(stored, { rehearsal_room: 'Sala 2', rehearsal_time: '2026-10-12T11:00' }, now)).toEqual({
      rehearsal_room: 'Sala 2',
      rehearsal_time: '2026-10-12T11:00',
    })
  })
})
