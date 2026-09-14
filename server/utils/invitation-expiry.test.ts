import { describe, it, expect } from 'vitest'
import { assertInvitationNotExpired, isInvitationExpired } from './invitation-expiry'

const NOW = Date.parse('2026-09-14T12:00:00Z')
const iso = (offsetMs: number) => new Date(NOW + offsetMs).toISOString()

const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE

describe('isInvitationExpired', () => {
  it('accepts a window still open', () => {
    expect(isInvitationExpired(iso(DAY), NOW)).toBe(false)
    expect(isInvitationExpired(iso(14 * DAY), NOW)).toBe(false)
  })

  it('rejects a window that closed', () => {
    expect(isInvitationExpired(iso(-DAY), NOW)).toBe(true)
  })

  // NULL is "no expiry", carried only by rows issued before KAN-40. Reading it
  // as expired would lock people out of invitations that were always valid.
  it('treats a missing expiry as no expiry', () => {
    expect(isInvitationExpired(null, NOW)).toBe(false)
    expect(isInvitationExpired(undefined, NOW)).toBe(false)
    expect(isInvitationExpired('', NOW)).toBe(false)
  })

  // Same reasoning: a malformed column is a data problem, and locking someone
  // out over it is a worse failure than the one this check exists to prevent.
  it('treats an unparseable timestamp as no expiry', () => {
    expect(isInvitationExpired('not-a-date', NOW)).toBe(false)
  })

  it('tolerates a minute of clock skew', () => {
    // Just past the deadline but inside the tolerance.
    expect(isInvitationExpired(iso(-30_000), NOW)).toBe(false)
    // Past the tolerance too.
    expect(isInvitationExpired(iso(-2 * MINUTE), NOW)).toBe(true)
  })
})

describe('assertInvitationNotExpired', () => {
  it('says nothing while the window is open', () => {
    expect(() => assertInvitationNotExpired(iso(DAY), NOW)).not.toThrow()
    expect(() => assertInvitationNotExpired(null, NOW)).not.toThrow()
  })

  // 410 on purpose: the handlers already answer 404 for a token that does not
  // exist and 409 for one already answered, and the UI needs to tell "ask for a
  // new invitation" apart from "check the link".
  it('throws 410, distinct from the 404 and 409 already in use', () => {
    expect(() => assertInvitationNotExpired(iso(-DAY), NOW))
      .toThrowError(expect.objectContaining({ statusCode: 410, statusMessage: 'invitation_expired' }))
  })

  it('explains itself in Spanish, without leaking anything', () => {
    try {
      assertInvitationNotExpired(iso(-DAY), NOW)
      expect.unreachable('should have thrown')
    } catch (err) {
      const message = (err as { message?: string }).message ?? ''
      expect(message).toContain('caducado')
      expect(message).toContain('reenvíe')
      // No timestamps, ids or column names in what the recipient sees.
      expect(message).not.toContain('2026')
      expect(message).not.toContain('invitation_expires_at')
    }
  })
})
