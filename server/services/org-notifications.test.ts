import { describe, it, expect, vi, beforeEach } from 'vitest'

const sendOrgEventEmail = vi.fn()
const insertNotifications = vi.fn()
vi.mock('../utils/email', () => ({ sendOrgEventEmail: (...a: unknown[]) => sendOrgEventEmail(...a) }))
vi.mock('../utils/notifications', () => ({ insertNotifications: (...a: unknown[]) => insertNotifications(...a) }))

const { notifyOrganization } = await import('./org-notifications')
import type { SupabaseAdmin } from './inscription-upload-purge'

function createClient(org: Record<string, unknown> | null, ownerEmail = 'owner@org.com') {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: org ? { organization: org } : null, error: null }) }),
      }),
    }),
    auth: { admin: { getUserById: async () => ({ data: { user: { email: ownerEmail } } }) } },
  } as unknown as SupabaseAdmin
}

const org = {
  id: 'org-1', name: 'Fundació', owner_id: 'u-1', notification_email: null, notification_prefs: {},
}

const input = {
  contestId: 'c-1',
  event: 'enrollment_created' as const,
  entityId: 'p-1',
  subject: 'Nueva inscripción',
  title: 'Nueva inscripción',
  lines: ['Ana se ha inscrito.'],
}

describe('notifyOrganization (KAN-29)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sendOrgEventEmail.mockResolvedValue({ sent: true, id: 'log-1' })
    insertNotifications.mockResolvedValue(undefined)
  })

  it('sends to the owner and files an in-app notification', async () => {
    await expect(notifyOrganization(createClient(org), input)).resolves.toEqual({ sent: true })
    expect(sendOrgEventEmail).toHaveBeenCalledWith(expect.objectContaining({
      to: 'owner@org.com',
      dedupeKey: 'enrollment_created:p-1',
      template: 'org_enrollment_created',
    }))
    expect(insertNotifications).toHaveBeenCalledWith(expect.anything(), [expect.objectContaining({ user_id: 'u-1' })])
  })

  it('uses the organisation address when it has one', async () => {
    await notifyOrganization(createClient({ ...org, notification_email: 'avisos@org.com' }), input)
    expect(sendOrgEventEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'avisos@org.com' }))
  })

  // KAN-30: switched off means nothing goes out at all.
  it('sends nothing when the event is switched off', async () => {
    const client = createClient({ ...org, notification_prefs: { enrollment_created: false } })
    await expect(notifyOrganization(client, input)).resolves.toEqual({ sent: false, reason: 'disabled' })
    expect(sendOrgEventEmail).not.toHaveBeenCalled()
    expect(insertNotifications).not.toHaveBeenCalled()
  })

  // KAN-29: "un solo correo por evento, sin duplicados en reintentos".
  it('reports a duplicate and does not file a second notification', async () => {
    sendOrgEventEmail.mockResolvedValue({ sent: false, id: null, duplicate: true })
    await expect(notifyOrganization(createClient(org), input)).resolves.toEqual({ sent: false, reason: 'duplicate' })
    expect(insertNotifications).not.toHaveBeenCalled()
  })

  it('never throws when the mail fails', async () => {
    sendOrgEventEmail.mockRejectedValue(new Error('resend down'))
    await expect(notifyOrganization(createClient(org), input)).resolves.toEqual({ sent: false, reason: 'failed' })
  })

  it('does nothing without an organisation or a recipient', async () => {
    await expect(notifyOrganization(createClient(null), input)).resolves.toEqual({ sent: false, reason: 'no_organization' })
    await expect(notifyOrganization(createClient(org, ''), input)).resolves.toEqual({ sent: false, reason: 'no_recipient' })
  })
})
