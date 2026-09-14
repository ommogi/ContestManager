import { describe, it, expect, vi, beforeEach } from 'vitest'
import { sendWelcomeEmail, sendEnrollmentEmail, sendScheduleEmail } from './email'

// Mock Resend
const sendMock = vi.fn()
vi.mock('resend', () => ({
  Resend: vi.fn(() => ({ emails: { send: sendMock } })),
}))

// Mock supabase admin
const insertMock = vi.fn(() => ({ select: vi.fn(() => ({ single: vi.fn(() => Promise.resolve({ data: { id: 'log-1' } })) })) }))
const eqMock = vi.fn(() => Promise.resolve({ error: null }))
const updateMock = vi.fn(() => ({ eq: eqMock }))
const fromMock = vi.fn(() => ({
  insert: insertMock,
  update: updateMock,
}))

vi.mock('./supabase', () => ({
  serverSupabaseAdmin: vi.fn(() => ({ from: fromMock })),
}))

beforeEach(() => {
  vi.clearAllMocks()
  process.env.RESEND_API_KEY = 'test-key'
  process.env.RESEND_FROM = 'Test <test@example.com>'
})

describe('sendWelcomeEmail', () => {
  it('logs email and sends via Resend', async () => {
    sendMock.mockResolvedValueOnce({ data: { id: 'resend-123' } })
    const res = await sendWelcomeEmail({ to: 'user@example.com', first_name: 'Ana', email: 'user@example.com' })
    expect(res.sent).toBe(true)
    expect(res.id).toBe('resend-123')
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({
      to_address: 'user@example.com',
      template: 'welcome',
      status: 'pending',
    }))
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({
      status: 'sent',
      provider_message_id: 'resend-123',
    }))
  })

  it('logs failure when Resend throws', async () => {
    sendMock.mockRejectedValueOnce(new Error('resend down'))
    const res = await sendWelcomeEmail({ to: 'user@example.com', first_name: null, email: 'user@example.com' })
    expect(res.sent).toBe(false)
    expect(res.error).toBe('resend down')
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({
      status: 'failed',
      error: 'resend down',
    }))
  })

  // The real failure mode: the SDK resolves with { data, error } and only
  // rejects on transport errors, so an unverified sender domain never reaches
  // the catch above. This used to be logged as 'sent' with a null id.
  it('treats a resolved Resend error as a failure, not a send', async () => {
    sendMock.mockResolvedValueOnce({
      data: null,
      error: {
        name: 'validation_error',
        message: 'The contestmanager.app domain is not verified',
        statusCode: 403,
      },
    })

    const res = await sendWelcomeEmail({ to: 'user@example.com', first_name: null, email: 'user@example.com' })

    expect(res.sent).toBe(false)
    expect(res.id).toBeNull()
    expect(res.error).toContain('not verified')
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({
      status: 'failed',
      error: 'validation_error: The contestmanager.app domain is not verified',
    }))
    expect(updateMock).not.toHaveBeenCalledWith(expect.objectContaining({ status: 'sent' }))
  })


})

describe('sendEnrollmentEmail', () => {
  it('sends enrollment email with correct subject for paid', async () => {
    sendMock.mockResolvedValueOnce({ data: { id: 'resend-456' } })
    const res = await sendEnrollmentEmail({
      to: 'user@example.com',
      first_name: 'Ana',
      contest_name: 'Concurso X',
      category_name: 'Cat A',
      amount_paid_cents: 1500,
      is_paid: true,
    })
    expect(res.sent).toBe(true)
    expect(sendMock).toHaveBeenCalledWith(expect.objectContaining({
      to: 'user@example.com',
      subject: expect.stringContaining('Inscripción confirmada'),
    }))
  })

  it('sends enrollment email with correct subject for free', async () => {
    sendMock.mockResolvedValueOnce({ data: { id: 'resend-789' } })
    const res = await sendEnrollmentEmail({
      to: 'user@example.com',
      first_name: null,
      contest_name: 'Concurso Y',
      category_name: 'Cat B',
      is_paid: false,
    })
    expect(res.sent).toBe(true)
    expect(sendMock).toHaveBeenCalledWith(expect.objectContaining({
      to: 'user@example.com',
      subject: expect.stringContaining('Inscripción recibida'),
    }))
  })
})

describe('sendScheduleEmail', () => {
  it('sends schedule email for performance', async () => {
    sendMock.mockResolvedValueOnce({ data: { id: 'resend-sched' } })
    const res = await sendScheduleEmail({
      to: 'user@example.com',
      first_name: 'Ana',
      contest_name: 'Concurso Z',
      round_name: 'Final',
      is_performance: true,
      time: '10:00',
      room: 'Sala A',
    })
    expect(res.sent).toBe(true)
    expect(sendMock).toHaveBeenCalledWith(expect.objectContaining({
      subject: expect.stringContaining('Actuación programado/a'),
    }))
  })
})
