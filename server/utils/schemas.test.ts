import { describe, it, expect } from 'vitest'
import {
  EnrollBodySchema,
  ScoreBodySchema,
  CheckoutPlanSchema,
  CheckoutTicketsSchema,
  CheckoutActivationsSchema,
  RoundPatchSchema,
  RoundCreateSchema,
  CategoryCreateSchema,
  RoundParticipantPatchSchema,
  ScoreOverrideSchema,
  FormSchemaBodySchema,
} from './schemas'

const UUID_A = '550e8400-e29b-41d4-a716-446655440000'
const UUID_B = '123e4567-e89b-12d3-a456-426614174000'
const UUID_C = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'

const validEnroll = {
  category_id: UUID_A,
  first_name: 'Ana',
  last_name: 'García',
  birthdate: '2000-03-15',
  // Required since KAN-65: `core.email` is irreducible, so no form can stop
  // asking for it and no body may arrive without it.
  email: 'ana@example.com',
}

describe('EnrollBodySchema', () => {
  it('accepts valid minimal body', () => {
    expect(EnrollBodySchema.safeParse(validEnroll).success).toBe(true)
  })
  it('accepts optional fields as null', () => {
    expect(EnrollBodySchema.safeParse({ ...validEnroll, dni: null, phone: null }).success).toBe(true)
  })
  // `email` used to be in that list. Sending null is what the page did when the
  // organization hid the field, and the handler answered by storing the
  // session's address instead — the whole of KAN-65.
  it('rejects a null email', () => {
    expect(EnrollBodySchema.safeParse({ ...validEnroll, email: null }).success).toBe(false)
  })
  it('rejects non-uuid category_id', () => {
    expect(EnrollBodySchema.safeParse({ ...validEnroll, category_id: 'not-a-uuid' }).success).toBe(false)
  })
  it('rejects malformed birthdate', () => {
    expect(EnrollBodySchema.safeParse({ ...validEnroll, birthdate: '15/03/2000' }).success).toBe(false)
  })
  it('rejects invalid email', () => {
    expect(EnrollBodySchema.safeParse({ ...validEnroll, email: 'not-an-email' }).success).toBe(false)
  })
  it('rejects phone without + prefix', () => {
    expect(EnrollBodySchema.safeParse({ ...validEnroll, phone: '600112233' }).success).toBe(false)
  })
  it('accepts valid E.164 phone', () => {
    expect(EnrollBodySchema.safeParse({ ...validEnroll, phone: '+34600112233' }).success).toBe(true)
  })
})

describe('ScoreBodySchema', () => {
  const valid = {
    round_id: UUID_A,
    participant_id: UUID_B,
    judge_id: UUID_C,
    value: 8.5,
  }
  it('accepts valid score', () => {
    expect(ScoreBodySchema.safeParse(valid).success).toBe(true)
  })
  it('defaults promote to false', () => {
    const r = ScoreBodySchema.safeParse(valid)
    expect(r.success && r.data.promote).toBe(false)
  })
  it('rejects missing value', () => {
    const { value: _, ...rest } = valid
    expect(ScoreBodySchema.safeParse(rest).success).toBe(false)
  })
  it('rejects non-uuid round_id', () => {
    expect(ScoreBodySchema.safeParse({ ...valid, round_id: 'bad' }).success).toBe(false)
  })
})

describe('CheckoutPlanSchema', () => {
  it('accepts valid plans', () => {
    expect(CheckoutPlanSchema.safeParse({ plan: 'starter' }).success).toBe(true)
    expect(CheckoutPlanSchema.safeParse({ plan: 'pro' }).success).toBe(true)
    expect(CheckoutPlanSchema.safeParse({ plan: 'enterprise' }).success).toBe(true)
  })
  it('rejects unknown plan', () => {
    expect(CheckoutPlanSchema.safeParse({ plan: 'basic' }).success).toBe(false)
    expect(CheckoutPlanSchema.safeParse({ plan: '' }).success).toBe(false)
  })
})

describe('CheckoutTicketsSchema', () => {
  it('accepts 1 to 500', () => {
    expect(CheckoutTicketsSchema.safeParse({ quantity: 1 }).success).toBe(true)
    expect(CheckoutTicketsSchema.safeParse({ quantity: 500 }).success).toBe(true)
  })
  it('rejects 0 and negatives', () => {
    expect(CheckoutTicketsSchema.safeParse({ quantity: 0 }).success).toBe(false)
    expect(CheckoutTicketsSchema.safeParse({ quantity: -1 }).success).toBe(false)
  })
  it('rejects over 500', () => {
    expect(CheckoutTicketsSchema.safeParse({ quantity: 501 }).success).toBe(false)
  })
  it('accepts valid return_path', () => {
    expect(CheckoutTicketsSchema.safeParse({ quantity: 5, return_path: '/billing?foo=1' }).success).toBe(true)
  })
  it('rejects open-redirect paths', () => {
    expect(CheckoutTicketsSchema.safeParse({ quantity: 5, return_path: '//evil.com' }).success).toBe(false)
    expect(CheckoutTicketsSchema.safeParse({ quantity: 5, return_path: 'http://evil.com' }).success).toBe(false)
  })
})

describe('CheckoutActivationsSchema', () => {
  it('accepts 1 to 50', () => {
    expect(CheckoutActivationsSchema.safeParse({ quantity: 1 }).success).toBe(true)
    expect(CheckoutActivationsSchema.safeParse({ quantity: 50 }).success).toBe(true)
  })
  it('rejects over 50', () => {
    expect(CheckoutActivationsSchema.safeParse({ quantity: 51 }).success).toBe(false)
  })
})

// Payloads copied verbatim from the frontend call sites.
describe('new schemas accept real frontend payloads', () => {
  it('round PATCH bodies', () => {
    for (const b of [
      { is_final: true },
      { is_final: false, status: 'active', closed_at: null },
      { is_published: true },
      { status: 'closed', is_final: true, closed_at: new Date().toISOString() },
      { status: 'active', started_at: new Date().toISOString() },
    ]) expect(RoundPatchSchema.safeParse(b).success, JSON.stringify(b)).toBe(true)
  })

  it('round PATCH rejects a bogus status', () => {
    expect(RoundPatchSchema.safeParse({ status: 'bogus' }).success).toBe(false)
  })

  it('round create bodies', () => {
    for (const b of [
      { name: 'Ranking', order: 3, status: 'closed', scoring_type: 'numeric', is_ranking: true },
      { name: 'Semifinal', order: 2, status: 'active', scoring_type: 'numeric' },
    ]) expect(RoundCreateSchema.safeParse(b).success, JSON.stringify(b)).toBe(true)
  })

  it('category create body from the wizard', () => {
    expect(CategoryCreateSchema.safeParse({
      name: 'Piano Juvenil', min_age: 12, max_age: 18,
      max_participants: 20, entry_fee_cents: 2500,
    }).success).toBe(true)
  })

  it('round-participant PATCH: ensayos + actuaciones drafts', () => {
    expect(RoundParticipantPatchSchema.safeParse({
      rehearsal_room: '', rehearsal_time: '', rehearsal_accompanist: '',
    }).success).toBe(true)
    expect(RoundParticipantPatchSchema.safeParse({
      rehearsal_room: 'Sala 2', rehearsal_time: '2026-04-20T10:00', rehearsal_accompanist: 'Ana',
    }).success).toBe(true)
    expect(RoundParticipantPatchSchema.safeParse({ performance_time: '2026-04-20T18:30' }).success).toBe(true)
  })

  it('score override: set, clear, and reject garbage', () => {
    expect(ScoreOverrideSchema.safeParse({
      final_score_override: 9.5, final_score_override_notes: 'ajuste',
      admin_user_id: 'u1', admin_user_name: 'Org',
    }).success).toBe(true)
    expect(ScoreOverrideSchema.safeParse({
      final_score_override: null, final_score_override_notes: null,
    }).success).toBe(true)
    // the NaN bug this schema exists to stop
    expect(ScoreOverrideSchema.safeParse({ final_score_override: 'abc' }).success).toBe(false)
    expect(ScoreOverrideSchema.safeParse({ final_score_override: Number('abc') }).success).toBe(false)
  })

  it('form schema body', () => {
    // The legacy shape (`key`, no order/hidden/validation, arbitrary extra
    // keys kept by .loose()) is now rejected on purpose: it disagreed with
    // what the builder emits, so nothing valid was ever accepted. See the
    // dedicated contract suite below.
    expect(FormSchemaBodySchema.safeParse({
      fields: [{ key: 'instrument', label: 'Instrumento', type: 'text', required: true, extra: 'kept' }],
    }).success).toBe(false)
    expect(FormSchemaBodySchema.safeParse({ fields: 'nope' }).success).toBe(false)
  })
})

describe('FormSchemaBodySchema — inscription form contract', () => {
  const field = (over: Record<string, unknown> = {}) => ({
    id: 'obra',
    type: 'text',
    label: 'Obra',
    required: true,
    order: 0,
    hidden: false,
    validation: { minLength: 3 },
    ...over,
  })

  it('accepts what the builder actually emits', () => {
    const res = FormSchemaBodySchema.safeParse({ fields: [field()] })
    expect(res.success).toBe(true)
  })

  it('accepts select options as {value,label} objects', () => {
    const res = FormSchemaBodySchema.safeParse({
      fields: [field({
        id: 'voz',
        type: 'select',
        options: [{ value: 'soprano', label: 'Soprano' }],
      })],
    })
    expect(res.success).toBe(true)
  })

  // The old contract demanded `key` and options as bare strings. Persisting a
  // mix of both shapes is what has to stay impossible.
  it('rejects the legacy shape: key instead of id', () => {
    const res = FormSchemaBodySchema.safeParse({
      fields: [{ key: 'obra', label: 'Obra', type: 'text' }],
    })
    expect(res.success).toBe(false)
  })

  it('rejects options as bare strings', () => {
    const res = FormSchemaBodySchema.safeParse({
      fields: [field({ id: 'voz', type: 'select', options: ['soprano', 'tenor'] })],
    })
    expect(res.success).toBe(false)
  })

  it('rejects validation rules placed at the field root', () => {
    const res = FormSchemaBodySchema.safeParse({
      fields: [{ ...field(), minLength: 3 }],
    })
    expect(res.success).toBe(false)
  })

  it('rejects an unknown field type', () => {
    const res = FormSchemaBodySchema.safeParse({ fields: [field({ type: 'signature' })] })
    expect(res.success).toBe(false)
  })

  it('accepts the four types that previously had no interface', () => {
    for (const type of ['email', 'phone', 'date', 'url']) {
      const res = FormSchemaBodySchema.safeParse({ fields: [field({ type })] })
      expect(res.success, `type ${type} should be valid`).toBe(true)
    }
  })

  it('rejects duplicate field ids', () => {
    const res = FormSchemaBodySchema.safeParse({
      fields: [field(), field({ order: 1 })],
    })
    expect(res.success).toBe(false)
    if (!res.success) {
      expect(JSON.stringify(res.error.issues)).toContain('repetido')
    }
  })

  it('rejects a select without options', () => {
    const res = FormSchemaBodySchema.safeParse({
      fields: [field({ id: 'voz', type: 'select' })],
    })
    expect(res.success).toBe(false)
  })

  it('rejects options repeating the same value', () => {
    const res = FormSchemaBodySchema.safeParse({
      fields: [field({
        id: 'voz',
        type: 'select',
        options: [{ value: 'x', label: 'A' }, { value: 'x', label: 'B' }],
      })],
    })
    expect(res.success).toBe(false)
  })
})
