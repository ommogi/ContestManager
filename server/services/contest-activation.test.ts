import { describe, it, expect, vi, beforeEach } from 'vitest'
import { rejectPendingJudgeInvitations } from './contest-activation'

// Mock email util
vi.mock('~~/server/utils/email', () => ({
  sendJudgeInvitationExpiredEmail: vi.fn().mockResolvedValue({ sent: true, id: 'email-123' }),
}))

import { sendJudgeInvitationExpiredEmail } from '~~/server/utils/email'

function createMockAdmin(opts: {
  pendingJudges?: Array<{ id: string; email: string | null; full_name: string | null }>
} = {}) {
  const pending = opts.pendingJudges ?? []
  return {
    from: vi.fn((table: string) => {
      if (table !== 'contest_members') throw new Error(`unexpected table ${table}`)
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() =>
                Promise.resolve({ data: pending, error: null }),
              ),
            })),
          })),
        })),
        update: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => Promise.resolve({ error: null })),
            })),
          })),
        })),
      }
    }),
  } as any
}

describe('rejectPendingJudgeInvitations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does nothing when no pending judges', async () => {
    const admin = createMockAdmin({ pendingJudges: [] })
    const res = await rejectPendingJudgeInvitations(admin, 'c1', 'Concurso X')
    expect(res.rejectedCount).toBe(0)
    expect(res.emailsSent).toBe(0)
    expect(sendJudgeInvitationExpiredEmail).not.toHaveBeenCalled()
  })

  it('rejects pending judges and sends emails', async () => {
    const admin = createMockAdmin({
      pendingJudges: [
        { id: 'j1', email: 'j1@example.com', full_name: 'Juan' },
        { id: 'j2', email: 'j2@example.com', full_name: 'Ana' },
      ],
    })
    const res = await rejectPendingJudgeInvitations(admin, 'c1', 'Concurso X')
    expect(res.rejectedCount).toBe(2)
    expect(res.emailsSent).toBe(2)
    expect(sendJudgeInvitationExpiredEmail).toHaveBeenCalledTimes(2)
    expect(sendJudgeInvitationExpiredEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'j1@example.com', contest_name: 'Concurso X' }),
    )
    expect(sendJudgeInvitationExpiredEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'j2@example.com', contest_name: 'Concurso X' }),
    )
  })

  it('skips judges without email', async () => {
    const admin = createMockAdmin({
      pendingJudges: [
        { id: 'j1', email: 'j1@example.com', full_name: 'Juan' },
        { id: 'j2', email: null, full_name: 'Ana' },
      ],
    })
    const res = await rejectPendingJudgeInvitations(admin, 'c1', 'Concurso X')
    expect(res.rejectedCount).toBe(2)
    expect(res.emailsSent).toBe(1)
    expect(sendJudgeInvitationExpiredEmail).toHaveBeenCalledTimes(1)
  })
})
