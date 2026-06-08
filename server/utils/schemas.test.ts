import { describe, it, expect } from 'vitest'
import {
  EnrollBodySchema,
  ScoreBodySchema,
  CheckoutPlanSchema,
  CheckoutTicketsSchema,
  CheckoutActivationsSchema,
} from './schemas'

const UUID_A = '550e8400-e29b-41d4-a716-446655440000'
const UUID_B = '123e4567-e89b-12d3-a456-426614174000'
const UUID_C = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'

const validEnroll = {
  category_id: UUID_A,
  first_name: 'Ana',
  last_name: 'García',
  birthdate: '2000-03-15',
}

describe('EnrollBodySchema', () => {
  it('accepts valid minimal body', () => {
    expect(EnrollBodySchema.safeParse(validEnroll).success).toBe(true)
  })
  it('accepts optional fields as null', () => {
    expect(EnrollBodySchema.safeParse({ ...validEnroll, dni: null, email: null, phone: null }).success).toBe(true)
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
