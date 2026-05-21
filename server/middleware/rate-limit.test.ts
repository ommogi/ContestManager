import { describe, it, expect } from 'vitest'
import { getLimit } from './rate-limit'

describe('getLimit', () => {
  it('stripe webhook returns 60', () => {
    expect(getLimit('/api/stripe/webhook')).toBe(60)
  })
  it('auth endpoints return 20', () => {
    expect(getLimit('/api/auth/welcome')).toBe(20)
  })
  it('public endpoints return 30', () => {
    expect(getLimit('/api/public/inscriptions/abc/enroll')).toBe(30)
  })
  it('billing endpoints return 10', () => {
    expect(getLimit('/api/billing/checkout')).toBe(10)
    expect(getLimit('/api/billing/checkout-tickets')).toBe(10)
  })
  it('refund/cancel endpoints return 10', () => {
    expect(getLimit('/api/participants/uuid-123/refund')).toBe(10)
    expect(getLimit('/api/participants/uuid-123/cancel')).toBe(10)
  })
  it('general API returns 120', () => {
    expect(getLimit('/api/contests')).toBe(120)
  })
})
