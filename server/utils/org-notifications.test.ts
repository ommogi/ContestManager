// Lives under server/ because vitest.config.ts only collects server/**/*.test.ts.
import { describe, it, expect } from 'vitest'
import {
  ORG_NOTIFICATION_EVENT_IDS,
  dedupeKey,
  isEventEnabled,
  mapToPrefs,
  notificationRecipient,
  prefsToMap,
} from '../../shared/org-notifications'
import { OrgNotificationPrefsSchema } from './schemas'

describe('preferences (KAN-30)', () => {
  // "Por defecto, todos los avisos activos": the map only stores what is off,
  // so an event added later is on for everybody without a backfill.
  it('treats anything not switched off as on', () => {
    expect(isEventEnabled({}, 'enrollment_created')).toBe(true)
    expect(isEventEnabled(null, 'refund_issued')).toBe(true)
    expect(isEventEnabled({ refund_issued: false }, 'refund_issued')).toBe(false)
    expect(isEventEnabled({ refund_issued: true }, 'refund_issued')).toBe(true)
  })

  it('expands to every event for the settings page', () => {
    const map = prefsToMap({ payment_confirmed: false })
    expect(Object.keys(map).sort()).toEqual([...ORG_NOTIFICATION_EVENT_IDS].sort())
    expect(map.payment_confirmed).toBe(false)
    expect(map.enrollment_created).toBe(true)
  })

  it('stores only what is off', () => {
    expect(mapToPrefs(prefsToMap({}))).toEqual({})
    expect(mapToPrefs({ enrollment_created: true, refund_issued: false })).toEqual({ refund_issued: false })
  })
})

describe('recipient', () => {
  it('prefers the organisation address over the owner', () => {
    expect(notificationRecipient({ notification_email: 'avisos@org.com' }, 'owner@org.com')).toBe('avisos@org.com')
  })

  it('falls back to the owner, and to nothing when neither exists', () => {
    expect(notificationRecipient({ notification_email: '  ' }, 'owner@org.com')).toBe('owner@org.com')
    expect(notificationRecipient(null, null)).toBeNull()
  })
})

describe('dedupeKey', () => {
  it('identifies the event, not the message', () => {
    expect(dedupeKey('enrollment_created', 'p-1')).toBe('enrollment_created:p-1')
    expect(dedupeKey('payment_confirmed', 'p-1')).not.toBe(dedupeKey('enrollment_created', 'p-1'))
  })
})

describe('OrgNotificationPrefsSchema', () => {
  it('accepts an address and a partial map', () => {
    expect(OrgNotificationPrefsSchema.safeParse({ notification_email: 'a@b.com', events: { refund_issued: false } }).success).toBe(true)
    expect(OrgNotificationPrefsSchema.safeParse({ notification_email: null }).success).toBe(true)
  })

  it('rejects a malformed address and an unknown event', () => {
    expect(OrgNotificationPrefsSchema.safeParse({ notification_email: 'nope' }).success).toBe(false)
    expect(OrgNotificationPrefsSchema.safeParse({ events: { something_else: true } }).success).toBe(false)
  })
})
