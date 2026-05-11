import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useContestsStore } from './contests'
import { useCategoriesStore } from './categories'
import { useRoundsStore } from './rounds'
import { useParticipantsStore } from './participants'
import { useRoundParticipantsStore } from './round-participants'
import { useContestMembersStore } from './contest-members'
import { useScoresStore } from './scores'
import { usePrizesStore } from './prizes'
import { organizationsApi } from '../api/modules/OrganizationsApi'
import type { Contest, Category, Round, Participant, ContestFormPayload, Prize, Rehearsal, JudgePoolMember } from '~~/types'

export const useContestStore = defineStore('contest', () => {
  const contestsStore = useContestsStore()
  const categoriesStore = useCategoriesStore()
  const roundsStore = useRoundsStore()
  const participantsStore = useParticipantsStore()
  const roundParticipantsStore = useRoundParticipantsStore()
  const contestMembersStore = useContestMembersStore()
  const scoresStore = useScoresStore()
  const prizesStore = usePrizesStore()

  const judgePool = ref<JudgePoolMember[]>([])
  const rehearsals = ref<Rehearsal[]>([])

  // ── Computed facade ──────────────────────────────────────────────────────────

  const contests = computed(() => contestsStore.items)
  const currentContest = computed(() => contestsStore.current)
  const categories = computed(() => categoriesStore.byContest(contestsStore.current?.id ?? ''))
  const rounds = computed(() => roundsStore.byContest(contestsStore.current?.id ?? ''))
  const participants = computed(() => participantsStore.byContest(contestsStore.current?.id ?? ''))
  const members = computed(() => contestMembersStore.byContest(contestsStore.current?.id ?? ''))
  const roundParticipantsMap = computed(() => roundParticipantsStore.byRound)
  const roundSummariesMap = computed(() => scoresStore.summaries)
  const prizes = computed(() => prizesStore.items)

  // ── Actions ──────────────────────────────────────────────────────────────────

  async function fetchContests() {
    return contestsStore.fetchAll()
  }

  async function fetchContest(slug: string) {
    const contest = await contestsStore.fetchOne(slug)
    if (contest?.id) {
      await Promise.all([
        categoriesStore.fetch(contest.id),
        roundsStore.fetch(contest.id),
        participantsStore.fetch(contest.id),
        contestMembersStore.fetch(contest.id),
      ])
    }
    return contest
  }

  async function createContest(payload: ContestFormPayload) {
    const data = await contestsStore.create(payload)
    contestsStore.currentId = data.id
    return data
  }

  async function updateContest(payload: Partial<Contest>) {
    const target = contestsStore.current
    if (!target) return
    const idOrSlug = target.slug || target.id
    return contestsStore.update(idOrSlug, payload)
  }

  async function deleteContest(id: string) {
    return contestsStore.remove(id)
  }

  async function createCategory(name: string, extra: Partial<Category> = {}) {
    const contestId = contestsStore.current?.id
    if (!contestId) return
    return categoriesStore.create(contestId, { name, ...extra, contest_id: contestId })
  }

  async function updateCategory(id: string, payload: Partial<Category>) {
    return categoriesStore.update(id, payload)
  }

  async function deleteCategory(id: string) {
    await categoriesStore.remove(id)
    categoriesStore.invalidate(contestsStore.current?.id)
  }

  async function addParticipant(payload: Partial<Participant>) {
    const contestId = contestsStore.current?.id
    if (!contestId) return
    return participantsStore.create(contestId, { ...payload, contest_id: contestId, status: 'active' })
  }

  async function updateParticipant(id: string, payload: Partial<Participant>) {
    return participantsStore.update(id, payload)
  }

  async function deleteParticipant(id: string) {
    return await participantsStore.remove(id)
  }

  async function fetchRoundParticipants(roundId: string) {
    return roundParticipantsStore.fetch(roundId)
  }

  async function updateRoundParticipant(roundId: string, participantId: string, payload: { scheduled_at?: string; location?: string; order?: number }) {
    // Find the round-participant record by participant_id within the round
    const rps = roundParticipantsStore.byRound[roundId] || []
    const rp = rps.find((r: any) => r.participant_id === participantId || r.id === participantId)
    if (rp) {
      return roundParticipantsStore.update(rp.id, payload)
    }
    // Fallback: use participantId directly as the record id
    return roundParticipantsStore.update(participantId, payload)
  }

  async function fetchRoundSummary(roundId: string, force = false) {
    if (force) scoresStore.invalidateSummary(roundId)
    return scoresStore.fetchSummary(roundId)
  }

  async function startRound(roundId: string) {
    return roundsStore.startRound(roundId)
  }

  async function createRound(categoryId: string, name: string, order: number) {
    const data = await roundsStore.createForCategory(categoryId, { name, order, status: 'active', scoring_type: 'numeric' })
    const contestId = contestsStore.current?.id
    if (contestId) {
      roundsStore.invalidate(contestId)
      await roundsStore.fetch(contestId)
    }
    return data
  }

  async function deleteRound(roundId: string) {
    const res = await roundsStore.remove(roundId)
    const contestId = contestsStore.current?.id
    if (contestId) {
      roundsStore.invalidate(contestId)
      await roundsStore.fetch(contestId)
    }
    return res
  }

  async function promoteParticipants(roundId: string, participantIds: string[], nextRoundName?: string, isFinal?: boolean) {
    const data = await ($fetch as any)(`/api/rounds/${roundId}/promote`, {
      method: 'POST',
      body: { participantIds, nextRoundName, isFinal }
    })
    const contestId = contestsStore.current?.id
    if (contestId) {
      roundsStore.invalidate(contestId)
      await roundsStore.fetch(contestId)
    }
    return data
  }

  async function removeMember(memberId: string) {
    const contestId = contestsStore.current?.id
    if (!contestId) return
    return contestMembersStore.remove(contestId, memberId)
  }

  async function addPrize(payload: { category_id: string; description: string }) {
    return prizesStore.create(payload)
  }

  async function fetchJudgePool(orgId: string) {
    const data = await organizationsApi.fetchJudgePool(orgId)
    judgePool.value = data || []
    return data
  }

  async function saveToJudgePool(orgId: string, judge: Partial<JudgePoolMember>) {
    const data = await organizationsApi.saveToJudgePool(orgId, judge)
    if (data) {
      await fetchJudgePool(orgId)
      return data
    }
  }

  async function deleteFromJudgePool(orgId: string, judgeId: string) {
    await organizationsApi.deleteFromJudgePool(orgId, judgeId)
    judgePool.value = judgePool.value.filter((j: JudgePoolMember) => j.id !== judgeId)
  }

  return {
    contests,
    currentContest,
    categories,
    rounds,
    participants,
    members,
    judgePool,
    roundParticipantsMap,
    roundSummariesMap,
    prizes,
    rehearsals,
    fetchContests,
    fetchContest,
    createContest,
    updateContest,
    deleteContest,
    createCategory,
    updateCategory,
    deleteCategory,
    addParticipant,
    updateParticipant,
    deleteParticipant,
    fetchRoundParticipants,
    updateRoundParticipant,
    fetchRoundSummary,
    startRound,
    createRound,
    deleteRound,
    promoteParticipants,
    removeMember,
    addPrize,
    fetchJudgePool,
    saveToJudgePool,
    deleteFromJudgePool,
  }
})
