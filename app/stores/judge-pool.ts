import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { JudgePoolMember } from '~~/types'
import type { JudgePoolInvitation } from '~/api/modules/OrganizationsApi'
import { organizationsApi } from '~/api/modules/OrganizationsApi'
import { useAuthStore } from '~/stores/auth'

export const useJudgePoolStore = defineStore('judge-pool', () => {
  const items = ref<JudgePoolMember[]>([])
  const invitations = ref<JudgePoolInvitation[]>([])
  const orgId = ref<string | null>(null)
  const isFetching = ref(false)
  const fetched = ref(false)

  const total = computed(() => items.value.length)
  const pendingInvitations = computed(() => invitations.value.filter(i => i.invitation_status === 'pending'))

  // ── Resolve org from auth store (no extra fetch needed) ───────────────────
  function resolveOrg(): string | null {
    if (orgId.value) return orgId.value
    const authStore = useAuthStore()
    const id = (authStore.organization as any)?.id ?? null
    if (id) orgId.value = id
    return orgId.value
  }

  // ── Fetch pool + invitations ─────────────────────────────────────────────
  async function fetchPool(force = false): Promise<JudgePoolMember[]> {
    if (fetched.value && !force) return items.value
    const id = resolveOrg()
    if (!id) return []
    isFetching.value = true
    try {
      const [poolData, invData] = await Promise.all([
        organizationsApi.fetchJudgePool(id),
        organizationsApi.fetchJudgePoolInvitations(id),
      ])
      items.value = poolData || []
      invitations.value = invData || []
      fetched.value = true
      return items.value
    } finally {
      isFetching.value = false
    }
  }

  // ── Invite judge (was addJudge) ──────────────────────────────────────────
  async function inviteJudge(payload: { full_name?: string; email: string; specialty?: string }): Promise<JudgePoolInvitation> {
    const id = resolveOrg()
    if (!id) throw new Error('No org found')
    const data = await organizationsApi.inviteJudgeToPool(id, payload)
    invitations.value.unshift(data)
    return data
  }

  // ── Remove judge ─────────────────────────────────────────────────────────
  async function removeJudge(memberId: string): Promise<void> {
    const id = resolveOrg()
    if (!id) return
    await organizationsApi.deleteFromJudgePool(id, memberId)
    items.value = items.value.filter(j => j.id !== memberId)
  }

  // ── Resend invitation ────────────────────────────────────────────────────
  async function resendInvitation(invitationId: string): Promise<void> {
    const id = resolveOrg()
    if (!id) throw new Error('No org found')
    await organizationsApi.resendJudgePoolInvitation(id, invitationId)
  }

  // ── Cancel invitation ────────────────────────────────────────────────────
  async function cancelInvitation(invitationId: string): Promise<void> {
    const id = resolveOrg()
    if (!id) throw new Error('No org found')
    await organizationsApi.cancelJudgePoolInvitation(id, invitationId)
    invitations.value = invitations.value.filter(i => i.id !== invitationId)
  }

  // ── Invalidate ───────────────────────────────────────────────────────────
  function invalidate() {
    fetched.value = false
    items.value = []
    invitations.value = []
  }

  return {
    items, invitations, orgId, total, isFetching, fetched, pendingInvitations,
    resolveOrg, fetchPool, inviteJudge, removeJudge, resendInvitation, cancelInvitation, invalidate,
  }
})
