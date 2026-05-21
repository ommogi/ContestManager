import { ApiService } from '../apiService'
import type { JudgePoolMember } from '~~/types'

export interface JudgePoolInvitation {
  id: string
  email: string
  full_name: string | null
  specialty: string | null
  invitation_status: 'pending' | 'accepted' | 'rejected'
  invited_at: string | null
  responded_at: string | null
}

/**
 * Módulo de la API dedicado a la gestión de Organizaciones.
 */
export class OrganizationsApi extends ApiService {
  async fetchJudgePool(orgId: string): Promise<JudgePoolMember[]> {
    return this.get<JudgePoolMember[]>(`/api/organizations/${orgId}/judge-pool`)
  }

  async saveToJudgePool(orgId: string, judge: Partial<JudgePoolMember>): Promise<JudgePoolMember> {
    return this.post<JudgePoolMember>(`/api/organizations/${orgId}/judge-pool`, judge)
  }

  async deleteFromJudgePool(orgId: string, judgeId: string): Promise<void> {
    return this.delete<void>(`/api/organizations/${orgId}/judge-pool/${judgeId}`)
  }

  // ── Judge pool invitations ────────────────────────────────────────────────

  async fetchJudgePoolInvitations(orgId: string): Promise<JudgePoolInvitation[]> {
    return this.get<JudgePoolInvitation[]>(`/api/organizations/${orgId}/judge-pool/invitations`)
  }

  async inviteJudgeToPool(orgId: string, payload: { email: string; full_name?: string; specialty?: string }): Promise<JudgePoolInvitation> {
    return this.post<JudgePoolInvitation>(`/api/organizations/${orgId}/judge-pool/invite`, payload)
  }

  async resendJudgePoolInvitation(orgId: string, invitationId: string): Promise<void> {
    return this.post<void>(`/api/organizations/${orgId}/judge-pool/invitations/${invitationId}/resend`, {})
  }

  async cancelJudgePoolInvitation(orgId: string, invitationId: string): Promise<void> {
    return this.delete<void>(`/api/organizations/${orgId}/judge-pool/invitations/${invitationId}`)
  }
}

export const organizationsApi = new OrganizationsApi()
