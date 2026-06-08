import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  handleBundle,
  handleTicketsTopup,
  handleActivationsTopup,
  handleEnrollment,
} from './stripe-webhook'
import type { SupabaseAdmin } from './stripe-webhook'

// Mock email util
vi.mock('~~/server/utils/email', () => ({
  sendEnrollmentEmail: vi.fn().mockResolvedValue({ sent: true, id: 'email-123' }),
}))

function createMockAdmin(overrides: {
  rpc?: (name: string, args: any) => Promise<{ data?: any; error?: any }>
  fromSelectSingle?: any
} = {}): SupabaseAdmin {
  const rpcFn = overrides.rpc ?? (() => Promise.resolve({ data: null, error: null }))
  return {
    rpc: vi.fn(rpcFn),
    from: vi.fn((table: string) => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({ data: overrides.fromSelectSingle ?? null, error: null })),
        })),
      })),
      update: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) })),
      insert: vi.fn(() => Promise.resolve({ error: null })),
    })),
  } as unknown as SupabaseAdmin
}

function sessionBase(payment_status: string, metadata: Record<string, string> = {}): any {
  return {
    id: 'cs_test_123',
    payment_status,
    amount_total: 1000,
    metadata,
    payment_intent: 'pi_123',
    customer_email: 'test@example.com',
    customer_details: { email: 'test@example.com' },
  }
}

function eventBase(type: string, object: any): any {
  return { id: 'evt_123', type, data: { object } }
}

describe('handleBundle', () => {
  it('ignores missing metadata', async () => {
    const admin = createMockAdmin()
    const session = sessionBase('paid', {})
    const res = await handleBundle(admin, eventBase('checkout.session.completed', session), session)
    expect(res).toEqual({ ignored: 'missing_metadata' })
    expect(admin.rpc).not.toHaveBeenCalled()
  })

  it('ignores unpaid sessions', async () => {
    const admin = createMockAdmin()
    const session = sessionBase('unpaid', { organization_id: 'org-1', plan: 'starter' })
    const res = await handleBundle(admin, eventBase('checkout.session.completed', session), session)
    expect(res).toEqual({ ignored: 'payment_status:unpaid' })
    expect(admin.rpc).not.toHaveBeenCalled()
  })

  it('credits bundle on paid session', async () => {
    const admin = createMockAdmin({ rpc: () => Promise.resolve({ data: null, error: null }) })
    const session = sessionBase('paid', { organization_id: 'org-1', plan: 'pro' })
    const res = await handleBundle(admin, eventBase('checkout.session.completed', session), session)
    expect(res).toEqual({ credited: true })
    expect(admin.rpc).toHaveBeenCalledWith('credit_bundle', {
      p_org_id: 'org-1',
      p_plan: 'pro',
      p_stripe_session_id: 'cs_test_123',
      p_stripe_event_id: 'evt_123',
    })
  })

  it('throws on RPC error', async () => {
    const admin = createMockAdmin({ rpc: () => Promise.resolve({ data: null, error: { message: 'db fail' } }) })
    const session = sessionBase('paid', { organization_id: 'org-1', plan: 'starter' })
    await expect(
      handleBundle(admin, eventBase('checkout.session.completed', session), session)
    ).rejects.toThrow('credit_bundle: db fail')
  })
})

describe('handleTicketsTopup', () => {
  it('ignores missing metadata', async () => {
    const admin = createMockAdmin()
    const session = sessionBase('paid', { organization_id: 'org-1' })
    const res = await handleTicketsTopup(admin, eventBase('checkout.session.completed', session), session)
    expect(res).toEqual({ ignored: 'missing_metadata' })
  })

  it('credits tickets on paid session', async () => {
    const admin = createMockAdmin()
    const session = sessionBase('paid', { organization_id: 'org-1', quantity: '10' })
    const res = await handleTicketsTopup(admin, eventBase('checkout.session.completed', session), session)
    expect(res).toEqual({ credited_tickets: 10 })
    expect(admin.rpc).toHaveBeenCalledWith('credit_tickets', expect.objectContaining({
      p_org_id: 'org-1',
      p_quantity: 10,
      p_price_cents: 1000,
    }))
  })
})

describe('handleActivationsTopup', () => {
  it('credits activations on paid session', async () => {
    const admin = createMockAdmin()
    const session = sessionBase('paid', { organization_id: 'org-1', quantity: '5' })
    const res = await handleActivationsTopup(admin, eventBase('checkout.session.completed', session), session)
    expect(res).toEqual({ credited_activations: 5 })
    expect(admin.rpc).toHaveBeenCalledWith('credit_activations', expect.objectContaining({
      p_org_id: 'org-1',
      p_quantity: 5,
      p_price_cents: 1000,
    }))
  })
})

describe('handleEnrollment', () => {
  it('ignores unpaid sessions', async () => {
    const admin = createMockAdmin()
    const session = sessionBase('unpaid', { token: 'tok', user_id: 'u1', category_id: 'c1' })
    const res = await handleEnrollment(admin, eventBase('checkout.session.completed', session), session)
    expect(res).toEqual({ ignored: 'payment_status:unpaid' })
  })

  it('ignores missing enrollment metadata', async () => {
    const admin = createMockAdmin()
    const session = sessionBase('paid', { token: 'tok', user_id: 'u1' })
    const res = await handleEnrollment(admin, eventBase('checkout.session.completed', session), session)
    expect(res).toEqual({ ignored: 'missing_enrollment_metadata' })
  })

  it('enrolls paid participant and sends email', async () => {
    const admin = createMockAdmin({
      rpc: () => Promise.resolve({ data: 'part-123', error: null }),
      fromSelectSingle: {
        first_name: 'Ana',
        contests: { name: 'Concurso X', slug: 'concurso-x' },
        categories: { name: 'Categoría A' },
        amount_paid_cents: 1500,
      },
    })
    const session = sessionBase('paid', {
      token: 'tok',
      user_id: 'u1',
      category_id: 'c1',
      first_name: 'Ana',
      last_name: 'García',
      birthdate: '2000-01-01',
      email: 'ana@example.com',
    })
    const res = await handleEnrollment(admin, eventBase('checkout.session.completed', session), session)
    expect(res).toEqual({ participant_id: 'part-123' })
    expect(admin.rpc).toHaveBeenCalledWith('enroll_participant_paid', expect.objectContaining({
      p_user_id: 'u1',
      p_token: 'tok',
      p_category_id: 'c1',
      p_email: 'ana@example.com',
      p_amount_cents: 1000,
    }))
  })

  it('throws on RPC error', async () => {
    const admin = createMockAdmin({ rpc: () => Promise.resolve({ data: null, error: { message: 'dup' } }) })
    const session = sessionBase('paid', { token: 'tok', user_id: 'u1', category_id: 'c1' })
    await expect(
      handleEnrollment(admin, eventBase('checkout.session.completed', session), session)
    ).rejects.toThrow('enroll_participant_paid: dup')
  })
})
