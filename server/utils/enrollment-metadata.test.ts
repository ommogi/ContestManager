import { describe, it, expect } from 'vitest'
import { buildEnrollmentMetadata } from './enrollment-metadata'
import type { EnrollmentMetadataInput } from './enrollment-metadata'

function input(overrides: Partial<EnrollmentMetadataInput> = {}): EnrollmentMetadataInput {
  return {
    organizationId: 'org-1',
    contestId: 'contest-1',
    token: 'tok-1',
    userId: 'user-1',
    categoryId: 'cat-1',
    firstName: 'Ana',
    lastName: 'García',
    birthdate: '2004-05-17',
    dni: '12345678Z',
    country: 'ES',
    email: 'ana@example.com',
    phone: '+34600112233',
    formDraftId: null,
    ...overrides,
  }
}

describe('buildEnrollmentMetadata', () => {
  it('carries every key the webhook reads', () => {
    const m = buildEnrollmentMetadata(input())

    // Exactly the keys `handleEnrollment` destructures, plus the `type` that
    // `runCheckoutSession` switches on.
    expect(m).toEqual({
      type: 'enrollment',
      organization_id: 'org-1',
      contest_id: 'contest-1',
      token: 'tok-1',
      user_id: 'user-1',
      category_id: 'cat-1',
      first_name: 'Ana',
      last_name: 'García',
      birthdate: '2004-05-17',
      dni: '12345678Z',
      country: 'ES',
      email: 'ana@example.com',
      phone: '+34600112233',
    })
  })

  // Stripe caps metadata at 50 keys; the comment in checkout.post.ts budgets
  // 13 plus the draft pointer. If this grows, that budget was re-spent.
  it('spends 13 keys without a draft and 14 with one', () => {
    expect(Object.keys(buildEnrollmentMetadata(input()))).toHaveLength(13)
    expect(Object.keys(buildEnrollmentMetadata(input({ formDraftId: 'd-1' })))).toHaveLength(14)
  })

  // A hidden core field must reach the webhook as '', because it reads
  // `m.dni || null`. An absent key would read the same, but only by accident:
  // the empty string is the contract KAN-65 and KAN-70 depend on.
  it('sends a hidden core field as an empty string, not as an absent key', () => {
    const m = buildEnrollmentMetadata(input({ dni: null, country: null, phone: null }))

    expect(m.dni).toBe('')
    expect(m.country).toBe('')
    expect(m.phone).toBe('')
    expect('dni' in m).toBe(true)
  })

  it('never blanks the fields a contest cannot hide', () => {
    const m = buildEnrollmentMetadata(input())
    for (const key of ['first_name', 'last_name', 'birthdate', 'email']) {
      expect(m[key]).not.toBe('')
    }
  })

  describe('form_draft_id', () => {
    it('is omitted on create when there is no draft, keeping the old 13 keys', () => {
      expect('form_draft_id' in buildEnrollmentMetadata(input(), 'create')).toBe(false)
    })

    it('is carried on create when there is one', () => {
      expect(buildEnrollmentMetadata(input({ formDraftId: 'd-1' }), 'create').form_draft_id)
        .toBe('d-1')
    })

    // The one that matters on refresh: Stripe merges metadata key by key, so an
    // omitted key is LEFT IN PLACE. Without this, a session opened while a form
    // was published would keep pointing at a draft that no longer applies.
    // Confirmed against the live API: an empty value removes the key.
    it('is emptied on refresh when the draft is gone, so the stale pointer is unset', () => {
      const m = buildEnrollmentMetadata(input({ formDraftId: null }), 'refresh')

      expect('form_draft_id' in m).toBe(true)
      expect(m.form_draft_id).toBe('')
    })

    it('is kept on refresh when the draft still exists', () => {
      expect(buildEnrollmentMetadata(input({ formDraftId: 'd-9' }), 'refresh').form_draft_id)
        .toBe('d-9')
    })
  })

  it('defaults to create, so an unflagged call cannot silently unset a draft', () => {
    expect(buildEnrollmentMetadata(input())).toEqual(buildEnrollmentMetadata(input(), 'create'))
  })
})
