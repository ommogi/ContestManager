import { describe, it, expect } from 'vitest'
import { decideSessionReuse } from './checkout-session-reuse'
import type { ReuseInput } from './checkout-session-reuse'

function input(overrides: Partial<ReuseInput> = {}): ReuseInput {
  return {
    amountTotal: 2500,
    url: 'https://checkout.stripe.com/c/pay/cs_test_1',
    formDraftId: 'draft-1',
    hasSubmission: true,
    currentFeeCents: 2500,
    ...overrides,
  }
}

describe('decideSessionReuse', () => {
  it('reuses a session that still matches the fee and carries its draft', () => {
    expect(decideSessionReuse(input())).toEqual({ reuse: true })
  })

  it('reuses when the contest has no published form and so needs no draft', () => {
    expect(decideSessionReuse(input({ hasSubmission: false, formDraftId: null })))
      .toEqual({ reuse: true })
  })

  describe('stale_amount', () => {
    it('discards when the organizer raised the fee', () => {
      expect(decideSessionReuse(input({ currentFeeCents: 3000 })))
        .toEqual({ reuse: false, reason: 'stale_amount' })
    })

    // Both directions matter. Charging less than the contest now costs is just
    // as wrong as charging more, and it is the direction nobody complains about.
    it('discards when the organizer lowered the fee', () => {
      expect(decideSessionReuse(input({ currentFeeCents: 1000 })))
        .toEqual({ reuse: false, reason: 'stale_amount' })
    })

    // A session whose price cannot be read must never be reused on the
    // assumption that it is probably fine.
    it('discards when the amount cannot be read at all', () => {
      for (const bad of [null, undefined, Number.NaN] as const) {
        expect(decideSessionReuse(input({ amountTotal: bad })))
          .toEqual({ reuse: false, reason: 'stale_amount' })
      }
    })

    it('treats a free contest consistently', () => {
      expect(decideSessionReuse(input({ amountTotal: 0, currentFeeCents: 0 })))
        .toEqual({ reuse: true })
    })
  })

  describe('no_draft', () => {
    it('discards a session opened before the form was published', () => {
      expect(decideSessionReuse(input({ formDraftId: null })))
        .toEqual({ reuse: false, reason: 'no_draft' })
      expect(decideSessionReuse(input({ formDraftId: '' })))
        .toEqual({ reuse: false, reason: 'no_draft' })
    })
  })

  describe('no_url', () => {
    it('discards a session with nothing to hand back', () => {
      expect(decideSessionReuse(input({ url: null })))
        .toEqual({ reuse: false, reason: 'no_url' })
    })

    // Checked before anything else: without a URL there is nothing to reuse,
    // whatever the amount says.
    it('reports no_url even when the amount is also wrong', () => {
      expect(decideSessionReuse(input({ url: null, currentFeeCents: 999 })))
        .toEqual({ reuse: false, reason: 'no_url' })
    })
  })

  // Precedence is deliberate, not incidental: the amount is the reason that
  // costs someone money, so it must not be masked by the draft check.
  it('reports stale_amount ahead of no_draft when both apply', () => {
    expect(decideSessionReuse(input({ currentFeeCents: 4000, formDraftId: null })))
      .toEqual({ reuse: false, reason: 'stale_amount' })
  })
})
