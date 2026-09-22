import { describe, it, expect } from 'vitest'
import {
  terminalRejectionIn,
  describeOrphanedCharge,
  TERMINAL_ENROLLMENT_REJECTIONS,
} from './enrollment-rejection'

describe('terminalRejectionIn', () => {
  // The exact shape supabase-js hands back: the RPC name, then the raised
  // exception. Every one of the eight has to be recognised, or that rejection
  // keeps Stripe retrying for days.
  it('recognises every rejection the RPC can raise', () => {
    for (const reason of TERMINAL_ENROLLMENT_REJECTIONS) {
      expect(terminalRejectionIn(`enroll_participant_paid: ${reason}`)).toBe(reason)
    }
  })

  it('covers the eight the deployed function raises', () => {
    expect(TERMINAL_ENROLLMENT_REJECTIONS).toHaveLength(8)
    expect(TERMINAL_ENROLLMENT_REJECTIONS).toContain('already_enrolled_in_category')
    expect(TERMINAL_ENROLLMENT_REJECTIONS).toContain('category_full')
    expect(TERMINAL_ENROLLMENT_REJECTIONS).toContain('registration_closed')
  })

  // The important negative: anything not on the list must keep throwing, so a
  // transient failure still gets the redelivery that might fix it.
  it('returns null for a failure that a retry could fix', () => {
    expect(terminalRejectionIn('canceling statement due to statement timeout')).toBeNull()
    expect(terminalRejectionIn('could not connect to server')).toBeNull()
    expect(terminalRejectionIn('deadlock detected')).toBeNull()
  })

  it('returns null for nothing at all', () => {
    expect(terminalRejectionIn(null)).toBeNull()
    expect(terminalRejectionIn(undefined)).toBeNull()
    expect(terminalRejectionIn('')).toBeNull()
  })

  // Matched as a whole word so a longer name that merely starts the same is not
  // swallowed. Getting this wrong would acknowledge — and stop retrying — an
  // error that deserved a retry.
  it('does not match a name that merely contains one', () => {
    expect(terminalRejectionIn('already_enrolled_in_category_v2 failed')).toBeNull()
    expect(terminalRejectionIn('xcategory_full')).toBeNull()
  })

  it('still matches when the name is quoted or punctuated', () => {
    expect(terminalRejectionIn('error: "category_full" (SQLSTATE P0001)')).toBe('category_full')
    expect(terminalRejectionIn('category_full')).toBe('category_full')
  })
})

describe('describeOrphanedCharge', () => {
  const base = {
    reason: 'category_full' as const,
    sessionId: 'cs_test_123',
    paymentIntent: 'pi_test_456',
    amountCents: 2500,
    userId: 'u-1',
    categoryId: 'cat-1',
    email: 'ana@example.com',
  }

  // The line is the only durable trace, so it has to carry enough to find the
  // money without this conversation.
  it('carries everything needed to locate the payment', () => {
    const line = describeOrphanedCharge(base)

    expect(line).toContain('PAID BUT NOT ENROLLED')
    expect(line).toContain('category_full')
    expect(line).toContain('cs_test_123')
    expect(line).toContain('pi_test_456')
    expect(line).toContain('2500')
    expect(line).toContain('ana@example.com')
  })

  it('says so plainly when Stripe gave no payment intent', () => {
    expect(describeOrphanedCharge({ ...base, paymentIntent: null })).toContain('payment_intent=none')
  })

  it('never prints "undefined" for a field the metadata lacked', () => {
    const line = describeOrphanedCharge({
      reason: 'contest_not_found',
      sessionId: 'cs_1',
      paymentIntent: null,
      amountCents: 0,
    })

    expect(line).not.toContain('undefined')
    expect(line).toContain('user=unknown')
  })

  // The operator has to know not to wait for a retry that will never come.
  it('says the event will not be retried', () => {
    expect(describeOrphanedCharge(base)).toContain('will not retry')
  })
})
