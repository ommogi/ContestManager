<script setup lang="ts">
import { ref, computed, watch, onMounted, h } from 'vue'
import DataTable from '@/components/ui/data-table/DataTable.vue'
import type { ColumnDef } from '@tanstack/vue-table'
import { ArrowUp, ArrowDown } from 'lucide-vue-next'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DateTimePicker } from '@/components/ui/date-picker'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { Progress } from '@/components/ui/progress'
import {
  NumberField,
  NumberFieldContent,
  NumberFieldDecrement,
  NumberFieldIncrement,
  NumberFieldInput
} from '@/components/ui/number-field'
import {
  ArrowLeft, Users, Search, Trophy, Layers, Play, Activity, Swords, Sparkles, ClipboardCheck,
  Pencil, Save, X, AlertCircle, Music, Clock, FileText, ArrowUpDown, Star, History
} from 'lucide-vue-next'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import AvatarBubble from '@/components/ui/avatar/AvatarBubble.vue'
import { useContestStore } from '@/stores/contest'
import { storeToRefs } from 'pinia'
import { toast } from 'vue-sonner'
import { getStatusClasses } from '@/utils/styles'
import { useRoundsStore } from '@/stores/rounds'

const route = useRoute()
const router = useRouter()
const contestStore = useContestStore()
const {
  currentContest, participants, rounds, members,
  roundParticipantsMap, roundSummariesMap
} = storeToRefs(contestStore)

const categoryId = route.params.id as string
const roundId = route.params.roundId as string

onMounted(async () => {
  if (!currentContest.value || currentContest.value.slug !== route.params.slug) {
    await contestStore.fetchContest(route.params.slug as string)
  }
  await contestStore.fetchRoundParticipants(roundId)
  await contestStore.fetchRoundSummary(roundId)
})

// Real-time sync
const roundIdRef = computed(() => roundId)
useRoundScoresRealtime(roundIdRef, (id) => {
  contestStore.fetchRoundSummary(id, true)
})

const categoryJudges = computed(() => members.value.filter((m: any) => m.role === 'judge') as any[])
const currentRound = computed(() => rounds.value.find(r => r.id === roundId))
const currentRoundParticipants = computed(() => roundParticipantsMap.value[roundId] || [])
const currentRoundSummary = computed(() => roundSummariesMap.value[roundId])
const isFinalRound = computed(() => (currentRound.value as any)?.is_final === true)
const isRankingView = computed(() => (currentRound.value as any)?.is_ranking === true)

// ── Filters ───────────────────────────────────────────────────────────────────
const participantFilter = ref('')
const judgeFilter = ref('')
const matrixFilter = ref('')

const filteredRoundParticipants = computed(() => {
  const q = participantFilter.value.toLowerCase().trim()
  if (!q) return currentRoundParticipants.value
  return currentRoundParticipants.value.filter((rp: any) =>
    rp.participant?.name?.toLowerCase().includes(q)
  )
})

const filteredCategoryJudges = computed(() => {
  const q = judgeFilter.value.toLowerCase().trim()
  if (!q) return categoryJudges.value
  return categoryJudges.value.filter((j: any) =>
    (j.profile?.full_name || j.full_name || j.email || '').toLowerCase().includes(q)
  )
})

function judgeAverage(userId: string): string {
  const summaries = currentRoundSummary.value?.participant_summaries || []
  const vals: number[] = []
  for (const s of summaries) {
    const det = (s.judge_details || []).find((d: any) => d.judge_id === userId)
    if (det && det.value != null) {
      const n = Number(det.value)
      if (!Number.isNaN(n)) vals.push(n)
    }
  }
  if (!vals.length) return '—'
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length
  return avg.toFixed(2)
}
function judgeScoredCount(userId: string): number {
  const summaries = currentRoundSummary.value?.participant_summaries || []
  return summaries.filter((s: any) => (s.judge_details || []).some((d: any) => d.judge_id === userId)).length
}

const filteredMatrixSummaries = computed(() => {
  const q = matrixFilter.value.toLowerCase().trim()
  const summaries = currentRoundSummary.value?.participant_summaries ?? []
  if (!q) return summaries
  return summaries.filter((s: any) => {
    const name = participants.value.find((p: any) => p.id === s.participant_id)?.name ?? ''
    return name.toLowerCase().includes(q)
  })
})

const getParticipantScoreProgress = (pId: string) => {
  const summary = currentRoundSummary.value?.participant_summaries?.find((s: any) => s.participant_id === pId)
  const hasOverride = summary?.has_override ?? false
  const judgeTotal = categoryJudges.value.length
  return {
    count: summary?.score_count || 0,
    total: judgeTotal || 1,
    isCompleted: summary?.is_fully_scored || false,
    hasOverride,
  }
}

const roundStats = computed(() => {
  if (!currentRoundSummary.value) return { completion: 0 }
  const summaries = currentRoundSummary.value?.participant_summaries || []
  const total = currentRoundParticipants.value.length
  if (total === 0) return { completion: 0 }
  const completed = summaries.filter((s: any) => s.is_fully_scored).length
  return { completion: Math.round((completed / total) * 100) }
})

// ── Participant detail modal ──────────────────────────────────────────────────
const isParticipantDetailOpen = ref(false)
const selectedParticipantId = ref<string|null>(null)
const openParticipantDetails = (id: string) => { selectedParticipantId.value = id; isParticipantDetailOpen.value = true }
const currentParticipantDetails = computed(() => {
  if (!selectedParticipantId.value || !currentRoundSummary.value) return null
  return {
    ...currentRoundSummary.value.participant_summaries.find((s: any) => s.participant_id === selectedParticipantId.value),
    participant: participants.value.find(p => p.id === selectedParticipantId.value)
  }
})

const participantDetailFilter = ref('')
const filteredParticipantJudgeDetails = computed(() => {
  const details = currentParticipantDetails.value?.judge_details ?? []
  if (!participantDetailFilter.value.trim()) return details
  const q = participantDetailFilter.value.toLowerCase()
  return details.filter((s: any) => {
    const judge = currentRoundSummary.value?.judges?.find((j: any) => j.user_id === s.judge_id) as any
    return (judge?.name || '').toLowerCase().includes(q)
  })
})
const editingJudgeId = ref<string|null>(null)
const editDraft = ref<{ value: number; notes: string; promote: boolean }>({ value: 0, notes: '', promote: false })
const isSavingScore = ref(false)

const startEditing = (score: any) => {
  editingJudgeId.value = score.judge_id
  editDraft.value = { value: Number(score.value), notes: score.notes || '', promote: score.promote ?? false }
}
const cancelEditing = () => { editingJudgeId.value = null }

const saveEditedScore = async (judgeId: string) => {
  if (!selectedParticipantId.value) return
  isSavingScore.value = true
  try {
    console.log('[realtime/scores] SEND POST /api/scores')
    await $fetch('/api/scores' as any, {
      method: 'POST',
      body: {
        round_id: roundId,
        participant_id: selectedParticipantId.value,
        judge_id: judgeId,
        value: editDraft.value.value,
        notes: editDraft.value.notes,
        promote: editDraft.value.promote,
        admin_user_id: adminUserId.value,
        admin_user_name: adminUserName.value,
      }
    })
    toast.success('Puntuación actualizada')
    editingJudgeId.value = null
    await contestStore.fetchRoundSummary(roundId, true)
  } catch (e: any) {
    toast.error('Error al guardar: ' + (e?.data?.statusMessage || e?.message || 'Error desconocido'))
  } finally {
    isSavingScore.value = false
  }
}

// ── Judge detail modal ────────────────────────────────────────────────────────
const isJudgeDetailOpen = ref(false)
const selectedJudgeUserId = ref<string|null>(null)
const editingParticipantId = ref<string|null>(null)
const judgeEditDraft = ref<{ value: number; notes: string; promote: boolean }>({ value: 0, notes: '', promote: false })
const isSavingJudgeScore = ref(false)
const judgeDetailFilter = ref('')

const filteredJudgeScoredParticipants = computed(() => {
  const items = currentJudgeDetails.value?.scored ?? []
  if (!judgeDetailFilter.value.trim()) return items
  const q = judgeDetailFilter.value.toLowerCase()
  return items.filter((item: any) => item.participant?.name?.toLowerCase().includes(q))
})
const filteredJudgePendingParticipants = computed(() => {
  const items = currentJudgeDetails.value?.pending ?? []
  if (!judgeDetailFilter.value.trim()) return items
  const q = judgeDetailFilter.value.toLowerCase()
  return items.filter((item: any) => item.participant?.name?.toLowerCase().includes(q))
})

const openJudgeDetails = (judgeUserId: string) => {
  selectedJudgeUserId.value = judgeUserId
  editingParticipantId.value = null
  isJudgeDetailOpen.value = true
}

const currentJudgeDetails = computed(() => {
  if (!selectedJudgeUserId.value || !currentRoundSummary.value) return null
  const judgeId = selectedJudgeUserId.value
  const judge = categoryJudges.value.find((j: any) => j.user_id === judgeId)
  const scored: any[] = []
  const pending: any[] = []
  for (const rp of currentRoundParticipants.value) {
    const pSummary = currentRoundSummary.value.participant_summaries?.find((s: any) => s.participant_id === rp.participant_id)
    const score = pSummary?.judge_details?.find((d: any) => d.judge_id === judgeId)
    const participant = participants.value.find(p => p.id === rp.participant_id)
    if (score) {
      scored.push({ participant, score })
    } else {
      pending.push({ participant })
    }
  }
  return { judge, scored, pending }
})

const startEditingParticipant = (item: any) => {
  editingParticipantId.value = item.participant.id
  judgeEditDraft.value = { value: Number(item.score.value), notes: item.score.notes || '', promote: item.score.promote ?? false }
}
const cancelEditingParticipant = () => { editingParticipantId.value = null }

const saveJudgeScore = async (participantId: string) => {
  if (!selectedJudgeUserId.value) return
  isSavingJudgeScore.value = true
  try {
    console.log('[realtime/scores] SEND POST /api/scores')
    await $fetch('/api/scores' as any, {
      method: 'POST',
      body: {
        round_id: roundId,
        participant_id: participantId,
        judge_id: selectedJudgeUserId.value,
        value: judgeEditDraft.value.value,
        notes: judgeEditDraft.value.notes,
        promote: judgeEditDraft.value.promote,
        admin_user_id: adminUserId.value,
        admin_user_name: adminUserName.value,
      }
    })
    toast.success('Puntuación actualizada')
    editingParticipantId.value = null
    await contestStore.fetchRoundSummary(roundId, true)
  } catch (e: any) {
    toast.error('Error al guardar: ' + (e?.data?.statusMessage || e?.message || 'Error desconocido'))
  } finally {
    isSavingJudgeScore.value = false
  }
}

// ── Admin score management ────────────────────────────────────────────────────
const authStore = useAuthStore()
const { user, profile } = storeToRefs(authStore)

const adminUserId = computed(() => user.value?.id ?? null)
const adminUserName = computed(() => (profile.value as any)?.full_name ?? user.value?.email ?? 'Admin')

// Admin sets a score on behalf of a judge (from pending list in judge detail modal)
const isAdminSettingScore = ref(false)
const adminScoreDraft = ref<{ judgeId: string; participantId: string; value: number; notes: string; promote: boolean } | null>(null)

function openAdminScoreEntry(judgeId: string, participantId: string) {
  adminScoreDraft.value = { judgeId, participantId, value: 0, notes: '', promote: false }
  isAdminSettingScore.value = true
}

const isSavingAdminScore = ref(false)
const saveAdminScore = async () => {
  if (!adminScoreDraft.value || !adminUserId.value) return
  isSavingAdminScore.value = true
  try {
    console.log('[realtime/scores] SEND POST /api/scores')
    await $fetch('/api/scores' as any, {
      method: 'POST',
      body: {
        round_id: roundId,
        participant_id: adminScoreDraft.value.participantId,
        judge_id: adminScoreDraft.value.judgeId,
        value: adminScoreDraft.value.value,
        notes: adminScoreDraft.value.notes,
        promote: adminScoreDraft.value.promote,
        admin_user_id: adminUserId.value,
        admin_user_name: adminUserName.value,
      }
    })
    toast.success('Puntuación establecida por administrador')
    isAdminSettingScore.value = false
    adminScoreDraft.value = null
    await contestStore.fetchRoundSummary(roundId, true)
  } catch (e: any) {
    toast.error('Error: ' + (e?.data?.statusMessage || e?.message || 'Error desconocido'))
  } finally {
    isSavingAdminScore.value = false
  }
}

// Override final score per participant
const isOverrideOpen = ref(false)
const overrideDraft = ref<{ rpId: string; participantId: string; participantName: string; currentAvg: number; value: string; notes: string }>({ rpId: '', participantId: '', participantName: '', currentAvg: 0, value: '', notes: '' })
const isSavingOverride = ref(false)

function openOverride(rp: any) {
  const summary = currentRoundSummary.value?.participant_summaries?.find((s: any) => s.participant_id === rp.participant_id)
  overrideDraft.value = {
    rpId: rp.id,
    participantId: rp.participant_id,
    participantName: rp.participant?.name ?? '',
    currentAvg: summary?.average ?? 0,
    value: summary?.final_score_override != null ? String(summary.final_score_override) : '',
    notes: summary?.final_score_override_notes ?? '',
  }
  isOverrideOpen.value = true
}

function openOverrideFromMatrix(s: any) {
  const rp = currentRoundParticipants.value.find((r: any) => r.participant_id === s.participant_id)
  if (!rp) return
  const summary = currentRoundSummary.value?.participant_summaries?.find((ps: any) => ps.participant_id === s.participant_id)
  overrideDraft.value = {
    rpId: rp.id,
    participantId: s.participant_id,
    participantName: participants.value.find((p: any) => p.id === s.participant_id)?.name ?? '',
    currentAvg: summary?.average ?? 0,
    value: summary?.final_score_override != null ? String(summary.final_score_override) : '',
    notes: summary?.final_score_override_notes ?? '',
  }
  isOverrideOpen.value = true
}

const saveOverride = async () => {
  if (!adminUserId.value || !overrideDraft.value.rpId) return
  isSavingOverride.value = true
  try {
    const rawVal = overrideDraft.value.value
    const valueNum = (rawVal === '' || rawVal === null || rawVal === undefined) ? null : Number(rawVal)
    await $fetch(`/api/round-participants/${overrideDraft.value.rpId}/override` as any, {
      method: 'PATCH',
      body: {
        final_score_override: valueNum,
        final_score_override_notes: overrideDraft.value.notes || null,
        admin_user_id: adminUserId.value,
        admin_user_name: adminUserName.value,
      }
    })
    toast.success(valueNum === null ? 'Override eliminado' : 'Nota final establecida')
    isOverrideOpen.value = false
    await contestStore.fetchRoundParticipants(roundId)
    await contestStore.fetchRoundSummary(roundId, true)
  } catch (e: any) {
    toast.error('Error: ' + (e?.data?.statusMessage || e?.message || 'Error desconocido'))
  } finally {
    isSavingOverride.value = false
  }
}

// Audit log
const isAuditOpen = ref(false)
const auditLogs = ref<any[]>([])
const isLoadingAudit = ref(false)

const openAuditLog = async () => {
  isAuditOpen.value = true
  isLoadingAudit.value = true
  try {
    const data = await $fetch(`/api/rounds/${roundId}/audit-logs` as any)
    auditLogs.value = (data as any[]) || []
  } catch (e) {
    toast.error('Error cargando registro')
  } finally {
    isLoadingAudit.value = false
  }
}

function formatAuditDate(d: string) {
  return new Date(d).toLocaleString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function auditActionLabel(action: string) {
  const map: Record<string, string> = {
    score_set: 'Nota añadida',
    score_updated: 'Nota modificada',
    override_set: 'Nota final establecida',
    override_removed: 'Nota final eliminada',
  }
  return map[action] ?? action
}

function auditActionColor(action: string) {
  if (action === 'override_set') return 'text-purple-600 dark:text-purple-400'
  if (action === 'override_removed') return 'text-red-500'
  if (action === 'score_updated') return 'text-amber-500'
  return 'text-emerald-600 dark:text-emerald-400'
}

// ── Score logs (per judge+participant) ───────────────────────────────────────
const isScoreLogsOpen = ref(false)
const scoreLogsParticipantName = ref('')
const scoreLogsJudgeName = ref('')
const scoreLogs = ref<any[]>([])
const isLoadingScoreLogs = ref(false)

async function openScoreLogs(participantId: string, judgeUserId: string, participantName: string, judgeName: string) {
  scoreLogsParticipantName.value = participantName
  scoreLogsJudgeName.value = judgeName
  isScoreLogsOpen.value = true
  isLoadingScoreLogs.value = true
  try {
    const data = await $fetch(`/api/rounds/${roundId}/audit-logs` as any) as any[]
    scoreLogs.value = (data || []).filter((l: any) =>
      l.participant_id === participantId && l.judge_id === judgeUserId
    )
  } catch {
    toast.error('Error cargando historial')
  } finally {
    isLoadingScoreLogs.value = false
  }
}

// ── Judge matrix ──────────────────────────────────────────────────────────────
const isJudgeMatrixOpen = ref(false)

// ── Promotion ─────────────────────────────────────────────────────────────────
const isPromotionModalOpen = ref(false)
const promotionLimit = ref(5)
const isPromoting = ref(false)
const promotionSearchQuery = ref('')
watch(promotionSearchQuery, () => { promotionPage.value = 1 })
const selectedPromotionIds = ref<string[]>([])

const PROMOTION_PAGE_SIZE = 8
const promotionPage = ref(1)

const allPromotionParticipants = computed(() => {
  const summaries = currentRoundSummary.value?.participant_summaries || []
  return [...summaries]
    .map((s: any) => {
      const p = participants.value.find((part: any) => part.id === s.participant_id)
      return { ...s, name: (p as any)?.name ?? '—' }
    })
    .sort((a: any, b: any) => (b.final_score ?? b.average) - (a.final_score ?? a.average))
})

const filteredPromotionParticipants = computed(() => {
  const query = promotionSearchQuery.value.toLowerCase().trim()
  if (!query) return allPromotionParticipants.value
  return allPromotionParticipants.value.filter((s: any) => s.name.toLowerCase().includes(query))
})

const promotionPageCount = computed(() => Math.max(1, Math.ceil(filteredPromotionParticipants.value.length / PROMOTION_PAGE_SIZE)))
const pagedPromotionParticipants = computed(() => {
  const start = (promotionPage.value - 1) * PROMOTION_PAGE_SIZE
  return filteredPromotionParticipants.value.slice(start, start + PROMOTION_PAGE_SIZE)
})

const selectedPromotionCount = computed(() => selectedPromotionIds.value.length)

function autoSelectTopByLimit() {
  const n = promotionLimit.value
  const list = allPromotionParticipants.value
  const sorted = [...list].sort((a: any, b: any) => {
    const sa = a.final_score ?? a.average ?? 0
    const sb = b.final_score ?? b.average ?? 0
    if (sb !== sa) return sb - sa
    return (b.promotes ?? 0) - (a.promotes ?? 0)
  })

  const selected: string[] = []
  let i = 0
  while (i < sorted.length && selected.length < n) {
    const cur: any = sorted[i]
    const score = cur.final_score ?? cur.average ?? 0
    const prom = cur.promotes ?? 0
    const tied: string[] = []
    let j = i
    while (j < sorted.length) {
      const s: any = sorted[j]
      if ((s.final_score ?? s.average ?? 0) === score && (s.promotes ?? 0) === prom) {
        tied.push(s.participant_id)
        j++
      } else break
    }
    if (selected.length + tied.length <= n) {
      selected.push(...tied)
      i = j
    } else {
      toast.warning(`Empate entre ${tied.length} participantes con nota ${score.toFixed(2)} y ${prom} promociones. No se seleccionan automáticamente — decide manualmente.`)
      break
    }
  }
  selectedPromotionIds.value = selected
}

watch(promotionLimit, () => {
  if (isPromotionModalOpen.value) autoSelectTopByLimit()
})

watch(isPromotionModalOpen, (v) => {
  if (v) autoSelectTopByLimit()
})

// ── Final ranking ─────────────────────────────────────────────────────────────
const isRankingOpen = ref(false)
const isFinalConfirmOpen = ref(false)
const isFinalizingFinal = ref(false)

// Local draft only — persists to DB on confirm
const isFinalDraft = ref(false)
watch(() => currentRound.value?.id, () => {
  isFinalDraft.value = (currentRound.value as any)?.is_final === true
}, { immediate: true })
watch(() => (currentRound.value as any)?.is_final, (v) => { isFinalDraft.value = v === true })

const isTogglingFinal = ref(false)
async function handleToggleFinal(val: boolean) {
  if (isTogglingFinal.value) return
  if (val === ((currentRound.value as any)?.is_final === true)) {
    isFinalDraft.value = val
    return
  }
  isTogglingFinal.value = true
  const prev = isFinalDraft.value
  isFinalDraft.value = val
  try {
    if (val) {
      // Mark round as final + auto-create ranking pseudo-round (unpublished)
      await $fetch(`/api/rounds/${roundId}`, {
        method: 'PATCH',
        body: { is_final: true }
      })
      const currentRnd = rounds.value.find(r => r.id === roundId)
      const nextOrder = (currentRnd?.order || 0) + 1
      const existingRanking = rounds.value.find(
        (r: any) => r.category_id === categoryId && r.is_ranking === true
      )
      if (!existingRanking) {
        await $fetch(`/api/categories/${categoryId}/rounds`, {
          method: 'POST',
          body: {
            category_id: categoryId,
            name: 'Ranking',
            order: nextOrder,
            status: 'closed',
            scoring_type: 'numeric',
            is_ranking: true,
            is_published: false,
            closed_at: new Date().toISOString(),
          },
        })
      }
      toast.success('Marcada como ronda final · Ranking creado')
    } else {
      // Un-final: delete ranking pseudo-round + clear is_final + reopen category
      const ranking = rounds.value.find(
        (r: any) => r.category_id === categoryId && r.is_ranking === true
      )
      if (ranking) {
        try { await contestStore.deleteRound(ranking.id) } catch {}
      }
      await $fetch(`/api/rounds/${roundId}`, {
        method: 'PATCH',
        body: { is_final: false, status: 'active', closed_at: null }
      })
      try { await contestStore.updateCategory(categoryId, { status: 'active' } as any) } catch {}
      toast.success('Marca de ronda final eliminada')
    }
    const contestId = currentContest.value?.id
    if (contestId) {
      const roundsStore = useRoundsStore()
      roundsStore.invalidate(contestId)
      await roundsStore.fetch(contestId)
    }
  } catch (e: any) {
    isFinalDraft.value = prev
    toast.error(e?.statusMessage || e?.data?.statusMessage || 'Error al cambiar ronda final')
  } finally {
    isTogglingFinal.value = false
  }
}
const rankingData = ref<{ rounds: Array<{ id: string; name: string; order: number }>; ranking: Array<{ rank: number; participant_id: string; name: string; rounds_played: number; per_round: Array<{ round_id: string; round_order: number; round_name: string; avg: number | null }> }> } | null>(null)

async function fetchRanking() {
  try {
    const data = await $fetch<any>(`/api/categories/${categoryId}/ranking`)
    rankingData.value = data
  } catch (e) {
    toast.error('Error al cargar el ranking')
  }
}

watch(isRankingView, (v) => { if (v && !rankingData.value) fetchRanking() }, { immediate: true })

// ── Ranking filter / sort / history ───────────────────────────────────────────
const rankingFilter = ref('')
const rankingSortKey = ref<string>('rank')
const rankingSortDir = ref<'asc' | 'desc'>('asc')

function toggleRankingSort(key: string) {
  if (rankingSortKey.value === key) {
    rankingSortDir.value = rankingSortDir.value === 'asc' ? 'desc' : 'asc'
  } else {
    rankingSortKey.value = key
    rankingSortDir.value = key === 'rank' ? 'asc' : 'desc'
  }
}

const filteredRanking = computed(() => {
  if (!rankingData.value) return []
  const q = rankingFilter.value.trim().toLowerCase()
  let list = rankingData.value.ranking.slice()
  if (q) list = list.filter(r => r.name.toLowerCase().includes(q))
  const key = rankingSortKey.value
  const dir = rankingSortDir.value === 'asc' ? 1 : -1
  list.sort((a: any, b: any) => {
    let av: any, bv: any
    if (key === 'rank') { av = a.rank; bv = b.rank }
    else if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase() }
    else if (key === 'rounds_played') { av = a.rounds_played; bv = b.rounds_played }
    else if (key.startsWith('round_')) {
      const idx = Number(key.slice(6))
      av = a.per_round[idx]?.avg ?? -Infinity
      bv = b.per_round[idx]?.avg ?? -Infinity
    } else return 0
    if (av < bv) return -1 * dir
    if (av > bv) return 1 * dir
    return 0
  })
  return list
})

// ── DataTable columns for ranking ─────────────────────────────────────────────
const rankingRows = computed(() => rankingData.value?.ranking ?? [])

function sortHeader(label: string, key: string) {
  return ({ column }: any) => h(
    'button',
    {
      class: 'flex items-center gap-1 hover:text-zinc-900 dark:hover:text-zinc-100 font-bold text-xs uppercase tracking-wider',
      onClick: () => column.toggleSorting(column.getIsSorted() === 'asc'),
    },
    [
      label,
      column.getIsSorted() === 'asc'
        ? h(ArrowUp, { class: 'w-3 h-3' })
        : column.getIsSorted() === 'desc'
        ? h(ArrowDown, { class: 'w-3 h-3' })
        : h('span', { class: 'w-3 h-3' })
    ]
  )
}

const rankingColumns = computed<ColumnDef<any>[]>(() => {
  const perRoundCols: ColumnDef<any>[] = (rankingData.value?.rounds ?? []).map((r: any, idx: number) => ({
    id: `round_${idx}`,
    accessorFn: (row: any) => row.per_round[idx]?.avg ?? null,
    header: sortHeader(r.name, `round_${idx}`),
    cell: ({ row }: any) => {
      const avg = row.original.per_round[idx]?.avg
      return avg != null
        ? h('span', { class: 'text-sm font-mono font-semibold' }, avg.toFixed(2))
        : h('span', { class: 'text-xs text-zinc-400' }, '—')
    },
  }))

  return [
    {
      accessorKey: 'rank',
      header: sortHeader('#', 'rank'),
      cell: ({ row }: any) => {
        const rank = row.original.rank
        const cls = rank === 1
          ? 'bg-amber-500 text-white'
          : rank === 2
          ? 'bg-zinc-400 text-white'
          : rank === 3
          ? 'bg-amber-700 text-white'
          : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300'
        return h('div', { class: `w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${cls}` }, rank)
      },
    },
    {
      accessorKey: 'name',
      header: sortHeader('Participante', 'name'),
      cell: ({ row }: any) => h('span', { class: 'text-sm font-semibold text-zinc-800 dark:text-zinc-200 uppercase' }, row.original.name),
    },
    {
      accessorKey: 'rounds_played',
      header: sortHeader('Rondas', 'rounds_played'),
      cell: ({ row }: any) => h('span', { class: 'text-sm font-mono font-semibold text-zinc-700 dark:text-zinc-300' }, row.original.rounds_played),
    },
    ...perRoundCols,
  ]
})

// ── Publish ranking ───────────────────────────────────────────────────────────
const isPublished = computed(() => (currentRound.value as any)?.is_published === true)
const isPublishing = ref(false)
async function togglePublish() {
  if (!currentRound.value) return
  isPublishing.value = true
  try {
    const next = !isPublished.value
    await $fetch(`/api/rounds/${roundId}`, {
      method: 'PATCH',
      body: { is_published: next }
    })
    // refresh rounds
    const contestId = currentContest.value?.id
    if (contestId) {
      const roundsStore = useRoundsStore()
      roundsStore.invalidate(contestId)
      await roundsStore.fetch(contestId)
    }
    toast.success(next ? 'Ranking publicado' : 'Ranking ocultado')
  } catch (e) {
    toast.error('Error al cambiar estado de publicación')
  } finally {
    isPublishing.value = false
  }
}

const expandedHistoryRounds = ref<Set<string>>(new Set())
function toggleHistoryRound(id: string) {
  const s = expandedHistoryRounds.value
  if (s.has(id)) s.delete(id); else s.add(id)
  expandedHistoryRounds.value = new Set(s)
}
const isHistoryOpen = ref(false)
const historyData = ref<any>(null)
const historyLoading = ref(false)
async function openHistory(participantId: string) {
  isHistoryOpen.value = true
  historyLoading.value = true
  historyData.value = null
  expandedHistoryRounds.value = new Set()
  try {
    historyData.value = await $fetch<any>(`/api/categories/${categoryId}/participants/${participantId}/history`)
    // Auto-expand final round (o la última) por defecto
    const rs = historyData.value?.rounds || []
    const finalR = rs.find((r: any) => r.is_final) || rs[rs.length - 1]
    if (finalR) expandedHistoryRounds.value = new Set([finalR.round_id])
  } catch (e) { toast.error('Error al cargar historial') }
  finally { historyLoading.value = false }
}

async function handleFinalizeFinal() {
  isFinalizingFinal.value = true
  try {
    await $fetch(`/api/rounds/${roundId}`, {
      method: 'PATCH',
      body: { status: 'closed', is_final: true, closed_at: new Date().toISOString() }
    })
    const currentRnd = rounds.value.find(r => r.id === roundId)
    const nextOrder = (currentRnd?.order || 0) + 1
    // Idempotent: skip if ranking pseudo-round already exists for this category
    const existingRanking = rounds.value.find(
      (r: any) => r.category_id === categoryId && r.is_ranking === true
    )
    if (!existingRanking) {
      await $fetch(`/api/categories/${categoryId}/rounds`, {
        method: 'POST',
        body: {
          category_id: categoryId,
          name: 'Ranking',
          order: nextOrder,
          status: 'closed',
          scoring_type: 'numeric',
          is_ranking: true,
          closed_at: new Date().toISOString(),
        },
      })
    }
    // Publish ranking → close category
    try {
      await contestStore.updateCategory(categoryId, { status: 'closed' } as any)
    } catch {}
    // Refresh rounds
    const contestId = currentContest.value?.id
    if (contestId) {
      const roundsStore = useRoundsStore()
      roundsStore.invalidate(contestId)
      await roundsStore.fetch(contestId)
    }
    isFinalConfirmOpen.value = false
    toast.success('Concurso finalizado · Ranking publicado')
    router.push(`/contests/${route.params.slug}/categories/${categoryId}`)
  } catch (e) {
    toast.error('Error al finalizar el concurso')
  } finally {
    isFinalizingFinal.value = false
  }
}

// ── Revertir finalización (rollback final round) ──────────────────────────────
const isRevertFinalOpen = ref(false)
const isReverting = ref(false)
async function handleRevertFinal() {
  isReverting.value = true
  try {
    // Determine the actual final round id — if we're currently on the ranking
    // pseudo-round, find the real final round in this category.
    const currentIsRanking = (currentRound.value as any)?.is_ranking === true
    const finalRound = currentIsRanking
      ? rounds.value.find((r: any) => r.category_id === categoryId && r.is_final === true)
      : currentRound.value
    const finalRoundId = (finalRound as any)?.id || roundId

    // 1. Find ranking pseudo-round in this category, delete it (reopens category + makes prev active)
    const ranking = rounds.value.find((r: any) => r.category_id === categoryId && r.is_ranking === true)
    if (ranking) {
      await contestStore.deleteRound(ranking.id)
    } else {
      // No ranking → just reopen category + reactivate this round
      try { await contestStore.updateCategory(categoryId, { status: 'active' } as any) } catch {}
    }
    // Always reopen category (deleteRound may not do it if round had no is_ranking detection)
    try { await contestStore.updateCategory(categoryId, { status: 'active' } as any) } catch {}

    // 2. Clear is_final + reopen the real final round
    await $fetch(`/api/rounds/${finalRoundId}`, {
      method: 'PATCH',
      body: { is_final: false, status: 'active', closed_at: null }
    })
    // 3. Refresh
    const contestId = currentContest.value?.id
    if (contestId) {
      const roundsStore = useRoundsStore()
      roundsStore.invalidate(contestId)
      await roundsStore.fetch(contestId)
    }
    isRevertFinalOpen.value = false
    toast.success('Finalización revertida · Ronda reactivada')
    // If we were on the ranking (now deleted), navigate to the reopened final round
    if (currentIsRanking && finalRoundId && finalRoundId !== roundId) {
      router.push(`/contests/${route.params.slug}/categories/${categoryId}/rounds/${finalRoundId}`)
    }
  } catch (e: any) {
    toast.error(e?.statusMessage || e?.data?.statusMessage || 'Error al revertir')
  } finally {
    isReverting.value = false
  }
}

const handlePromote = async () => {
  isPromoting.value = true
  try {
    const selectedIds = selectedPromotionIds.value
    if (selectedIds.length === 0) return
    const currentRnd = rounds.value.find(r => r.id === roundId)
    const order = (currentRnd?.order || 0) + 1
    const nextName = `Ronda ${order}`
    await contestStore.promoteParticipants(roundId, selectedIds, nextName, false)
    toast.success('Promovidos con éxito')
    isPromotionModalOpen.value = false
    selectedPromotionIds.value = []
    router.push(`/contests/${route.params.slug}/categories/${categoryId}`)
  } catch (e) { toast.error('Error al promover') } finally { isPromoting.value = false }
}

// ── Rehearsals (Ensayos) ──────────────────────────────────────────────────────
const isEnsayosOpen = ref(false)
const ensayosDraft = ref<Record<string, { rehearsal_room: string; rehearsal_time: string; rehearsal_accompanist: string }>>({})
const isSavingEnsayos = ref(false)

const openEnsayos = () => {
  const draft: Record<string, { rehearsal_room: string; rehearsal_time: string; rehearsal_accompanist: string }> = {}
  for (const rp of currentRoundParticipants.value) {
    draft[rp.id] = {
      rehearsal_room: (rp as any).rehearsal_room || '',
      rehearsal_time: (rp as any).rehearsal_time || '',
      rehearsal_accompanist: (rp as any).rehearsal_accompanist || ''
    }
  }
  ensayosDraft.value = draft
  isEnsayosOpen.value = true
}

const saveEnsayos = async () => {
  isSavingEnsayos.value = true
  try {
    await Promise.all(
      Object.entries(ensayosDraft.value).map(([rpId, fields]) =>
        $fetch(`/api/round-participants/${rpId}` as any, { method: 'PATCH', body: fields })
      )
    )
    await contestStore.fetchRoundParticipants(roundId)
    toast.success('Ensayos guardados')
    isEnsayosOpen.value = false
  } catch (e: any) {
    toast.error('Error al guardar ensayos')
  } finally {
    isSavingEnsayos.value = false
  }
}

// ── Performances (Actuaciones) ────────────────────────────────────────────────
const isActuacionesOpen = ref(false)
const actuacionesDraft = ref<Record<string, { performance_time: string }>>({})
const isSavingActuaciones = ref(false)

const openActuaciones = () => {
  const draft: Record<string, { performance_time: string }> = {}
  for (const rp of currentRoundParticipants.value) {
    draft[rp.id] = { performance_time: (rp as any).performance_time || '' }
  }
  actuacionesDraft.value = draft
  isActuacionesOpen.value = true
}

const saveActuaciones = async () => {
  isSavingActuaciones.value = true
  try {
    await Promise.all(
      Object.entries(actuacionesDraft.value).map(([rpId, fields]) =>
        $fetch(`/api/round-participants/${rpId}` as any, {
          method: 'PATCH',
          body: fields
        })
      )
    )
    await contestStore.fetchRoundParticipants(roundId)
    toast.success('Actuaciones guardadas')
    isActuacionesOpen.value = false
  } catch (e: any) {
    toast.error('Error al guardar actuaciones')
  } finally {
    isSavingActuaciones.value = false
  }
}

// ── PDF Generation ────────────────────────────────────────────────────────────
const isPdfOpen = ref(false)
const pdfType = ref<'ensayos' | 'actuaciones'>('ensayos')
const pdfSortBy = ref<'nombre' | 'apellido' | 'hora'>('apellido')

function getLastName(name: string) {
  const parts = name.trim().split(' ')
  return parts[parts.length - 1] || name
}

const sortedParticipantsForPdf = computed(() => {
  const list = [...currentRoundParticipants.value]
  return list.sort((a, b) => {
    const pA = (a as any).participant
    const pB = (b as any).participant
    if (pdfSortBy.value === 'hora') {
      const tA = pdfType.value === 'ensayos' ? ((a as any).rehearsal_time || '') : ((a as any).performance_time || '')
      const tB = pdfType.value === 'ensayos' ? ((b as any).rehearsal_time || '') : ((b as any).performance_time || '')
      return tA.localeCompare(tB)
    }
    if (pdfSortBy.value === 'apellido') {
      return getLastName(pA?.name || '').localeCompare(getLastName(pB?.name || ''))
    }
    return (pA?.name || '').localeCompare(pB?.name || '')
  })
})

const generatePdf = async () => {
  const { jsPDF } = await import('jspdf')
  const round = currentRound.value
  const contestName = currentContest.value?.name || 'Concurso'
  const isEnsayos = pdfType.value === 'ensayos'
  const typeLabel = isEnsayos ? 'ENSAYOS' : 'ACTUACIONES'
  const sortLabel = pdfSortBy.value === 'apellido' ? 'Apellido' : pdfSortBy.value === 'hora' ? 'Hora' : 'Nombre'
  const dateStr = new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  const margin = 16
  const contentW = W - margin * 2

  // ── Accent color per type ─────────────────────────────────────────────────
  const accent = isEnsayos ? [37, 99, 235] : [5, 150, 105] // blue / emerald

  // ── Header bar ────────────────────────────────────────────────────────────
  doc.setFillColor(24, 24, 27)
  doc.rect(0, 0, W, 30, 'F')
  doc.setFillColor(accent[0], accent[1], accent[2])
  doc.rect(0, 0, 4, 30, 'F')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.setTextColor(255, 255, 255)
  doc.text(contestName.toUpperCase(), margin + 2, 12)

  doc.setFontSize(8)
  doc.setTextColor(accent[0], accent[1], accent[2])
  doc.text(typeLabel, margin + 2, 20)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(140, 140, 140)
  doc.text(`${round?.name?.toUpperCase() || 'RONDA'}  ·  ORDEN: ${sortLabel.toUpperCase()}  ·  ${dateStr.toUpperCase()}`, margin + 2 + doc.getTextWidth(typeLabel) + 6, 20)

  // ── Column definitions ────────────────────────────────────────────────────
  const cols = isEnsayos
    ? [
        { label: '#',             width: 10 },
        { label: 'PARTICIPANTE',  width: contentW * 0.35 },
        { label: 'AULA',          width: contentW * 0.2 },
        { label: 'ACOMPAÑANTE',   width: contentW * 0.27 },
        { label: 'HORA',          width: contentW * 0.13 },
      ]
    : [
        { label: '#',             width: 10 },
        { label: 'PARTICIPANTE',  width: contentW * 0.6 },
        { label: 'HORA',          width: contentW * 0.35 },
      ]

  // ── Table header ──────────────────────────────────────────────────────────
  let y = 38
  const rowH = 9
  const headerH = 8

  doc.setFillColor(245, 245, 245)
  doc.rect(margin, y, contentW, headerH, 'F')
  doc.setFillColor(accent[0], accent[1], accent[2])
  doc.rect(margin, y, 2, headerH, 'F')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.setTextColor(100, 100, 100)

  let x = margin + 2
  for (const col of cols) {
    doc.text(col.label, x + 2, y + 5.5)
    x += col.width
  }
  y += headerH

  // ── Table rows ────────────────────────────────────────────────────────────
  const list = sortedParticipantsForPdf.value
  for (let i = 0; i < list.length; i++) {
    const rp = list[i] as any
    const p = rp.participant

    if (i % 2 === 0) {
      doc.setFillColor(250, 250, 250)
      doc.rect(margin, y, contentW, rowH, 'F')
    }
    doc.setDrawColor(235, 235, 235)
    doc.line(margin, y + rowH, margin + contentW, y + rowH)

    x = margin + 2

    // #
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7)
    doc.setTextColor(180, 180, 180)
    doc.text(String(i + 1), x + 2, y + 6)
    x += cols[0].width

    // Name
    doc.setTextColor(20, 20, 20)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.text(doc.splitTextToSize(p?.name || '—', cols[1].width - 4)[0], x + 2, y + 6)
    x += cols[1].width

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(60, 60, 60)

    if (isEnsayos) {
      // Aula
      doc.text(rp.rehearsal_room || '—', x + 2, y + 6)
      x += cols[2].width
      // Acompañante
      doc.text(rp.rehearsal_accompanist || '—', x + 2, y + 6)
      x += cols[3].width
      // Hora ensayo
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(accent[0], accent[1], accent[2])
      doc.text(rp.rehearsal_time || '—', x + 2, y + 6)
    } else {
      // Hora actuación
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(10)
      doc.setTextColor(accent[0], accent[1], accent[2])
      doc.text(rp.performance_time || '—', x + 2, y + 6)
    }

    y += rowH

    if (y > H - 20 && i < list.length - 1) {
      doc.addPage()
      y = 16
    }
  }

  // ── Footer ────────────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(180, 180, 180)
  doc.text(`${contestName} · ${round?.name} · ${typeLabel}`, margin, H - 8)
  doc.text(`Generado el ${dateStr}`, W - margin, H - 8, { align: 'right' })

  const filename = `${contestName}-${round?.name || 'ronda'}-${pdfType.value}.pdf`
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-]/g, '')

  doc.save(`${filename}.pdf`)
}

// ── Start round ───────────────────────────────────────────────────────────────
const handleStartRound = async () => {
  if (currentContest.value?.status !== 'active') {
    toast.error('El concurso debe estar activo para iniciar la ronda')
    return
  }
  await contestStore.startRound(roundId)
  toast.success('Ronda iniciada')
}

function statusLabel(status: string) {
  const map: Record<string, string> = {
    draft: 'Borrador', active: 'Activo', finished: 'Finalizado', cancelled: 'Cancelado',
    pending: 'Pendiente', closed: 'Cerrado'
  }
  return map[status] ?? status
}
</script>

<template>
  <div class="space-y-10 max-w-[100%] px-4 lg:px-8 animate-in fade-in slide-in-from-bottom-10 duration-700">
    <!-- Header -->
    <div class="flex items-center justify-between border-b-2 border-zinc-100 dark:border-zinc-800 pb-6">
      <div class="flex items-center gap-3">
        <button
          class="p-1 rounded-md hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors shrink-0"
          @click="router.push(`/contests/${route.params.slug}/categories/${categoryId}`)"
        >
          <ArrowLeft class="w-4 h-4" />
        </button>
        <div>
          <div class="flex items-center gap-2">
            <h2 class="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 leading-none uppercase">{{ currentRound?.name }}</h2>
            <Badge
              variant="outline"
              class="text-[10px] font-bold px-2 py-0.5 rounded-md border-2 uppercase"
              :class="getStatusClasses(currentRound?.status || 'draft')"
            >
              Fase {{ currentRound?.order }} • {{ statusLabel(currentRound?.status || 'draft') }}
            </Badge>
          </div>
          <p class="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mt-1 flex items-center gap-1.5">
            <Sparkles class="w-3 h-3 text-blue-500"/> Gabinete de Calificaciones Técnica
          </p>
        </div>
      </div>

      <div class="flex items-center gap-2 flex-wrap">
        <!-- Schedule buttons (only in active round) -->
        <template v-if="currentRound?.status === 'active'">
          <Button
            variant="outline"
            class="rounded-md gap-2 font-bold text-[10px] uppercase tracking-widest h-9 px-4 border-2 dark:border-zinc-800 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800 hover:bg-blue-50 dark:hover:bg-blue-950/30"
            @click="openEnsayos"
          >
            <Music class="w-3.5 h-3.5" /> Ensayos
          </Button>
          <Button
            variant="outline"
            class="rounded-md gap-2 font-bold text-[10px] uppercase tracking-widest h-9 px-4 border-2 dark:border-zinc-800 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
            @click="openActuaciones"
          >
            <Clock class="w-3.5 h-3.5" /> Actuaciones
          </Button>
          <Button
            variant="outline"
            class="rounded-md gap-2 font-bold text-[10px] uppercase tracking-widest h-9 px-4 border-2 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900"
            @click="isPdfOpen = true"
          >
            <FileText class="w-3.5 h-3.5" /> PDF
          </Button>

          <div class="w-px h-6 bg-zinc-200 dark:bg-zinc-700 mx-1" />
        </template>

        <!-- Iniciar button (only if pending) -->
        <Button
          v-if="currentRound?.status === 'pending'"
          class="h-9 px-5 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-bold uppercase text-[9px] tracking-widest gap-2 hover:bg-zinc-700 dark:hover:bg-zinc-300"
          :disabled="currentContest.value?.status !== 'active'"
          :title="currentContest.value?.status !== 'active' ? 'El concurso debe estar activo' : ''"
          @click="handleStartRound"
        >
          <Play class="w-3.5 h-3.5 fill-current" /> Iniciar Ronda
        </Button>

        <Button
          v-if="!isRankingView"
          variant="outline"
          class="rounded-md gap-2 font-bold text-[10px] uppercase tracking-widest h-9 px-4 border-2 dark:border-zinc-800 dark:hover:bg-zinc-900"
          @click="isJudgeMatrixOpen = true"
        >
          <Swords class="w-4 h-4" /> Matriz
        </Button>
        <Button
          v-if="!isRankingView"
          variant="outline"
          class="rounded-md gap-2 font-bold text-[10px] uppercase tracking-widest h-9 px-4 border-2 border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-950/30"
          @click="openAuditLog"
        >
          <ClipboardCheck class="w-4 h-4" /> Registro
        </Button>
      </div>
    </div>

    <!-- Ranking view (is_ranking pseudo-round) -->
    <div v-if="isRankingView" class="max-w-5xl mx-auto w-full">
      <Card class="border-2 border-amber-200 dark:border-amber-800 shadow-sm rounded-2xl overflow-hidden bg-white dark:bg-zinc-950/50">
        <CardHeader class="border-b-2 border-amber-100 dark:border-amber-900 bg-gradient-to-r from-amber-50 to-white dark:from-amber-950/30 dark:to-zinc-950 px-8 py-6">
          <div class="flex items-center gap-4">
            <div class="w-10 h-10 bg-amber-500 rounded-xl flex items-center justify-center shadow-lg shrink-0">
              <Trophy class="w-5 h-5 text-white"/>
            </div>
            <div class="flex-1 min-w-0">
              <CardTitle class="text-lg font-bold tracking-tight text-zinc-900 dark:text-zinc-100 leading-none uppercase">Clasificación Final</CardTitle>
              <p class="text-[10px] font-bold uppercase tracking-widest mt-1" :class="isPublished ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-500 dark:text-zinc-400'">
                {{ isPublished ? 'Publicado · Visible a participantes' : 'Borrador · Oculto a participantes' }}
              </p>
            </div>
            <div class="flex items-center gap-2 shrink-0">
              <Button
                variant="outline"
                size="sm"
                class="rounded-xl font-bold border-2 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30"
                @click="isRevertFinalOpen = true"
              >
                <ArrowLeft class="w-3.5 h-3.5 mr-1.5" /> Revertir
              </Button>
              <Button
                :variant="isPublished ? 'outline' : 'default'"
                size="sm"
                :disabled="isPublishing"
                class="rounded-xl font-bold"
                @click="togglePublish"
              >
                {{ isPublished ? 'Despublicar' : 'Publicar' }}
              </Button>
            </div>
          </div>
        </CardHeader>
        <div class="p-6">
          <div v-if="!rankingData" class="py-12 text-center text-sm text-zinc-500">Cargando ranking...</div>
          <div v-else-if="!rankingData.ranking?.length" class="py-12 text-center text-sm text-zinc-500">Sin participantes</div>
          <DataTable
            v-else
            :columns="rankingColumns"
            :data="rankingRows"
            search-column="name"
            search-placeholder="Filtrar participantes..."
            :default-page-size="10"
            disable-row-select
            @row-click="(row) => openHistory(row.participant_id)"
          />
        </div>
      </Card>
    </div>

    <!-- Main grid -->
    <div v-else class="grid grid-cols-12 gap-12">
      <!-- Ranking table -->
      <div class="col-span-12 lg:col-span-8 space-y-8">
        <Card class="border-2 border-zinc-100 dark:border-zinc-800 shadow-sm rounded-2xl overflow-hidden bg-white dark:bg-zinc-950/50">
          <CardHeader class="border-b-2 border-zinc-50 dark:border-zinc-900 bg-zinc-50/30 dark:bg-zinc-900/30 px-8 py-6">
            <div class="flex items-center gap-4">
              <div class="w-10 h-10 bg-zinc-900 dark:bg-zinc-100 rounded-xl flex items-center justify-center shadow-lg border-2 border-transparent shrink-0">
                <Users class="w-5 h-5 text-white dark:text-zinc-900"/>
              </div>
              <div class="flex-1 min-w-0">
                <CardTitle class="text-lg font-bold tracking-tight text-zinc-900 dark:text-zinc-100 leading-none uppercase">Ranking Oficial</CardTitle>
                <CardDescription class="text-[11px] font-bold uppercase tracking-widest text-zinc-400 mt-1.5">Auditoría en tiempo real del desempeño del jurado</CardDescription>
              </div>
              <div class="relative shrink-0 w-52">
                <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" />
                <Input v-model="participantFilter" placeholder="Filtrar aspirantes..." class="pl-9 h-8 text-xs rounded-lg border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900" />
              </div>
            </div>
          </CardHeader>
          <div class="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow class="bg-zinc-50/10 dark:bg-zinc-950/20 border-zinc-50 dark:border-zinc-900">
                  <TableHead class="pl-8 text-[10px] font-bold uppercase tracking-widest py-4 text-zinc-400">Aspirante</TableHead>
                  <TableHead class="text-center text-[10px] font-bold uppercase tracking-widest text-zinc-400">Estado Mesa</TableHead>
                  <TableHead class="text-right pr-8 text-[10px] font-bold uppercase tracking-widest text-zinc-400">Media Técnica</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow
                  v-for="rp in filteredRoundParticipants"
                  :key="rp.id"
                  class="group hover:bg-zinc-50/50 dark:hover:bg-zinc-900/30 cursor-pointer transition-all border-zinc-50 dark:border-zinc-900 last:border-0"
                  @click="openParticipantDetails(rp.participant_id)"
                >
                  <TableCell class="pl-8 py-4">
                    <div class="flex items-center gap-4">
                      <AvatarBubble
                        :name="rp.participant?.name || '??'"
                        :avatar-url="null"
                        size="w-10 h-10"
                        text-size="text-[10px]"
                      />
                      <div class="flex flex-col">
                        <span class="text-sm font-bold text-zinc-900 dark:text-zinc-100 leading-tight">{{ rp.participant?.name }}</span>
                        <span class="text-[10px] text-zinc-400 font-bold uppercase tracking-widest mt-1">{{ rp.participant?.dni || '----' }}</span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell class="text-center">
                    <div class="flex flex-col items-center gap-1.5">
                      <span class="text-[11px] font-black tracking-widest text-zinc-900 dark:text-zinc-100">
                        {{ getParticipantScoreProgress(rp.participant_id).count }} / {{ getParticipantScoreProgress(rp.participant_id).total }}
                      </span>
                      <div class="w-24 h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden shadow-inner">
                        <div
                          :class="['h-full transition-all duration-1000', getParticipantScoreProgress(rp.participant_id).hasOverride ? 'bg-purple-500' : getParticipantScoreProgress(rp.participant_id).isCompleted ? 'bg-emerald-500' : 'bg-blue-500']"
                          :style="{ width: `${(getParticipantScoreProgress(rp.participant_id).count / (getParticipantScoreProgress(rp.participant_id).total || 1)) * 100}%` }"
                        />
                      </div>
                    </div>
                  </TableCell>
                  <TableCell class="text-right pr-8">
                    <div class="flex flex-col items-end gap-1">
                      <div class="flex items-center gap-1.5">
                        <span :class="['text-xl font-bold tracking-tight', currentRoundSummary?.participant_summaries.find((s:any) => s.participant_id === rp.participant_id)?.has_override ? 'text-purple-600 dark:text-purple-400' : 'text-zinc-900 dark:text-zinc-100']">
                          {{ (currentRoundSummary?.participant_summaries.find((s:any) => s.participant_id === rp.participant_id)?.final_score ?? 0).toFixed(2) }}
                        </span>
                        <button
                          class="p-1 rounded hover:bg-purple-100 dark:hover:bg-purple-950/40 transition-colors"
                          title="Establecer nota final"
                          @click.stop="openOverride(rp)"
                        >
                          <Star class="w-3.5 h-3.5 text-purple-500" />
                        </button>
                      </div>
                      <div class="flex items-center gap-1 flex-wrap justify-end">
                        <Badge v-if="getParticipantScoreProgress(rp.participant_id).isCompleted && !getParticipantScoreProgress(rp.participant_id).hasOverride" variant="outline" class="h-4 text-[8px] bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-500/30 text-emerald-600 dark:text-emerald-400 rounded-md font-bold uppercase tracking-widest shadow-sm">Auditado</Badge>
                        <Badge
                          v-if="(currentRoundSummary?.participant_summaries.find((s:any) => s.participant_id === rp.participant_id)?.promotes ?? 0) > 0"
                          class="h-4 text-[8px] bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-700 text-blue-600 dark:text-blue-400 rounded-md font-bold uppercase tracking-widest shadow-sm border"
                        >
                          +{{ currentRoundSummary?.participant_summaries.find((s:any) => s.participant_id === rp.participant_id)?.promotes }} prom.
                        </Badge>
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </Card>
      </div>

      <!-- Sidebar -->
      <div class="col-span-12 lg:col-span-4 space-y-6">
        <!-- Progress card -->
        <Card class="p-8 border-2 border-zinc-100 dark:border-zinc-800 rounded-2xl space-y-6 shadow-sm bg-white dark:bg-zinc-950/50">
          <div class="space-y-4">
            <div class="flex items-center justify-between">
              <span class="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Progreso Operativo Fase</span>
              <span class="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">{{ roundStats.completion }}%</span>
            </div>
            <Progress :model-value="roundStats.completion" class="h-2 rounded-full overflow-hidden bg-zinc-100 dark:bg-zinc-900" />
          </div>
          <div v-if="currentRound?.status !== 'closed'" class="pt-2 space-y-3">
            <button
              type="button"
              class="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg border-2 transition-colors"
              :class="isFinalDraft
                ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700'
                : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30 hover:border-amber-300 dark:hover:border-amber-700'"
              @click="handleToggleFinal(!isFinalDraft)"
            >
              <div class="flex items-center gap-2 min-w-0">
                <Trophy class="w-3.5 h-3.5 shrink-0" :class="isFinalDraft ? 'text-amber-500' : 'text-zinc-400'" />
                <span class="text-[10px] font-bold uppercase tracking-widest truncate" :class="isFinalDraft ? 'text-amber-700 dark:text-amber-400' : 'text-zinc-700 dark:text-zinc-300'">Ronda Final</span>
              </div>
              <div
                class="w-9 h-5 rounded-full relative transition-colors"
                :class="isFinalDraft ? 'bg-amber-500' : 'bg-zinc-300 dark:bg-zinc-700'"
              >
                <div
                  class="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all"
                  :class="isFinalDraft ? 'left-[18px]' : 'left-0.5'"
                ></div>
              </div>
            </button>
            <Button
              v-if="isFinalDraft"
              class="w-full h-11 bg-amber-500 hover:bg-amber-600 text-white rounded-md font-bold uppercase tracking-widest text-[10px] shadow-lg border-2 border-amber-600 active:scale-95 transition-all hover:scale-[1.02]"
              :disabled="!currentRoundSummary?.all_scored"
              @click="isFinalConfirmOpen = true"
            >
              Finalizar Concurso
            </Button>
            <Button
              v-else
              class="w-full h-11 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-md font-bold uppercase tracking-widest text-[10px] shadow-lg border-2 border-zinc-800 dark:border-zinc-200 active:scale-95 transition-all hover:scale-[1.02]"
              :disabled="!currentRoundSummary?.all_scored"
              @click="isPromotionModalOpen = true"
            >
              Finalizar &amp; Promover
            </Button>
            <Button
              v-if="isFinalRound"
              variant="outline"
              class="w-full h-10 bg-white dark:bg-zinc-900 hover:bg-amber-50 dark:hover:bg-amber-950/30 text-amber-700 dark:text-amber-400 rounded-md font-bold uppercase tracking-widest text-[10px] border-2 border-amber-300 dark:border-amber-700"
              @click="isRevertFinalOpen = true"
            >
              <ArrowLeft class="w-3.5 h-3.5 mr-2" /> Revertir Finalización
            </Button>
          </div>
          <div v-else class="pt-2 space-y-2">
            <div class="w-full h-11 bg-zinc-50 dark:bg-zinc-900 border-2 border-zinc-100 dark:border-zinc-800 rounded-md flex items-center justify-center gap-2 opacity-60">
              <Badge variant="outline" class="border-2 border-zinc-200 dark:border-zinc-800 text-zinc-400 font-bold uppercase text-[9px] tracking-widest">Etapa Archivada</Badge>
            </div>
            <Button
              v-if="isFinalRound"
              class="w-full h-11 bg-white dark:bg-zinc-900 hover:bg-amber-50 dark:hover:bg-amber-950/30 text-amber-700 dark:text-amber-400 rounded-md font-bold uppercase tracking-widest text-[10px] border-2 border-amber-300 dark:border-amber-700 active:scale-95 transition-all hover:scale-[1.02]"
              @click="isRevertFinalOpen = true"
            >
              <ArrowLeft class="w-3.5 h-3.5 mr-2" /> Revertir Finalización
            </Button>
          </div>
        </Card>

        <!-- Judges status card -->
        <Card class="border-2 border-zinc-100 dark:border-zinc-800 rounded-2xl overflow-hidden bg-white dark:bg-zinc-950/50 shadow-sm">
          <CardHeader class="px-8 py-5 border-b-2 border-zinc-50 dark:border-zinc-900 bg-zinc-50/50 dark:bg-zinc-900/30">
            <div class="flex items-center justify-between gap-3">
              <CardTitle class="text-[10px] font-bold uppercase tracking-widest text-zinc-900 dark:text-zinc-100">Estado de Mesa Jurado</CardTitle>
            </div>
            <div class="relative mt-3">
              <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" />
              <Input v-model="judgeFilter" placeholder="Filtrar jurado..." class="pl-9 h-8 text-xs rounded-lg border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900" />
            </div>
          </CardHeader>
          <div class="p-4 space-y-3">
            <div
              v-for="j in filteredCategoryJudges"
              :key="j.id"
              class="p-4 rounded-xl border-2 border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex items-center justify-between group hover:border-zinc-900 dark:hover:border-zinc-500 transition-all duration-300 cursor-pointer"
              @click="openJudgeDetails(j.user_id)"
            >
              <div class="flex items-center gap-3">
                <AvatarBubble
                  :name="(j as any).profile?.full_name || (j as any).full_name || (j as any).email || 'J'"
                  :avatar-url="(j as any).profile?.avatar_url ?? (j as any).avatar_url ?? null"
                  size="w-10 h-10"
                  text-size="text-[10px]"
                />
                <div class="flex flex-col">
                  <span class="text-[13px] font-bold text-zinc-900 dark:text-zinc-100 truncate max-w-[150px] leading-tight">{{ (j as any).profile?.full_name || (j as any).email }}</span>
                  <span class="text-[9px] font-bold text-zinc-400 uppercase tracking-widest mt-0.5">Jurado Certificado</span>
                </div>
              </div>
              <div class="flex flex-col items-end gap-0.5">
                <span class="text-xs font-black text-zinc-900 dark:text-zinc-100">
                  {{ judgeScoredCount(j.user_id) }} / {{ currentRoundParticipants.length }}
                </span>
                <span class="text-[9px] font-bold uppercase tracking-widest text-zinc-400">
                  Media: <span class="text-zinc-700 dark:text-zinc-300 tabular-nums">{{ judgeAverage(j.user_id) }}</span>
                </span>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>

    <!-- ── Participant detail dialog ─────────────────────────────────────────── -->
    <Dialog v-model:open="isParticipantDetailOpen" @update:open="(v) => { if (!v) { cancelEditing(); participantDetailFilter = '' } }">
      <DialogContent class="max-w-3xl rounded-2xl overflow-hidden p-0 border border-zinc-200 dark:border-zinc-800 shadow-xl bg-white dark:bg-zinc-950">
        <div class="p-6 pr-16 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 flex items-center gap-4">
          <div class="w-11 h-11 rounded-xl bg-zinc-900 dark:bg-zinc-100 flex items-center justify-center shadow-sm shrink-0">
            <Users class="w-5 h-5 text-white dark:text-zinc-900" />
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-0.5">Puntuaciones del participante</p>
            <h2 class="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 truncate uppercase">
              {{ currentParticipantDetails?.participant?.name }}
            </h2>
          </div>
          <div class="text-right shrink-0">
            <p class="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-0.5">Media</p>
            <span class="text-3xl font-black tracking-tighter text-zinc-900 dark:text-zinc-100">
              {{ currentParticipantDetails?.average?.toFixed(2) ?? '—' }}
            </span>
          </div>
        </div>

        <div class="px-6 pt-4 pb-0">
          <div class="relative">
            <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
            <Input v-model="participantDetailFilter" placeholder="Filtrar por jurado…" class="pl-8 h-8 text-sm border-zinc-200 dark:border-zinc-700 rounded-lg" />
          </div>
        </div>

        <div class="p-6 pt-3 max-h-[60vh] overflow-y-auto">
          <div class="rounded-xl border border-zinc-100 dark:border-zinc-800 overflow-hidden">
            <Table>
              <TableHeader class="bg-zinc-50 dark:bg-zinc-900/50">
                <TableRow class="border-zinc-100 dark:border-zinc-800 hover:bg-transparent">
                  <TableHead class="pl-5 text-[10px] font-bold uppercase tracking-widest text-zinc-400">Jurado</TableHead>
                  <TableHead class="text-center text-[10px] font-bold uppercase tracking-widest text-zinc-400 w-20">Nota</TableHead>
                  <TableHead class="text-center text-[10px] font-bold uppercase tracking-widest text-zinc-400 w-24">Promociona</TableHead>
                  <TableHead class="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Observaciones</TableHead>
                  <TableHead class="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                <template v-for="s in filteredParticipantJudgeDetails" :key="s.judge_id">
                  <!-- View row -->
                  <TableRow v-if="editingJudgeId !== s.judge_id" class="border-zinc-50 dark:border-zinc-900 hover:bg-zinc-50/50 dark:hover:bg-zinc-900/20 transition-colors last:border-0" :class="s.set_by_admin ? 'bg-purple-50/30 dark:bg-purple-950/10' : ''">
                    <TableCell class="pl-5 py-3">
                      <div class="flex items-center gap-2">
                        <AvatarBubble
                          :name="(currentRoundSummary?.judges?.find((j:any) => j.user_id === s.judge_id) as any)?.name || 'Jurado'"
                          :avatar-url="(currentRoundSummary?.judges?.find((j:any) => j.user_id === s.judge_id) as any)?.avatar_url ?? null"
                          size="w-7 h-7"
                          text-size="text-[9px]"
                        />
                        <div class="flex flex-col min-w-0">
                          <span class="text-sm font-semibold text-zinc-800 dark:text-zinc-200 truncate max-w-[140px]">
                            {{ (currentRoundSummary?.judges?.find((j:any) => j.user_id === s.judge_id) as any)?.name || 'Jurado' }}
                          </span>
                          <span v-if="s.set_by_admin" class="text-[8px] font-black uppercase tracking-widest text-purple-600 dark:text-purple-400">★ Modificado por admin</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell class="text-center py-3">
                      <Badge variant="secondary" class="font-black rounded-md px-2.5 py-0.5 text-sm border-2" :class="s.set_by_admin ? 'bg-purple-100 text-purple-700 border-purple-300 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-700' : getStatusClasses('active')">
                        {{ Number(s.value).toFixed(1) }}
                      </Badge>
                    </TableCell>
                    <TableCell class="text-center py-3">
                      <Badge v-if="s.promote" class="bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-700 font-bold border text-[10px] uppercase tracking-wide">Sí</Badge>
                      <span v-else class="text-zinc-300 dark:text-zinc-600 text-xs">—</span>
                    </TableCell>
                    <TableCell class="py-3 max-w-[200px]">
                      <span class="text-[12px] text-zinc-400 italic truncate block">{{ s.notes || '—' }}</span>
                    </TableCell>
                    <TableCell class="py-3 pr-3 text-right">
                      <Button size="icon" variant="ghost" class="h-7 w-7 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300" @click="startEditing(s)">
                        <Pencil class="w-3.5 h-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                  <!-- Edit row -->
                  <TableRow v-else class="border-zinc-50 dark:border-zinc-900 bg-zinc-50/80 dark:bg-zinc-900/40">
                    <TableCell class="pl-5 py-3">
                      <div class="flex items-center gap-2">
                        <AvatarBubble
                          :name="(currentRoundSummary?.judges?.find((j:any) => j.user_id === s.judge_id) as any)?.name || 'Jurado'"
                          :avatar-url="(currentRoundSummary?.judges?.find((j:any) => j.user_id === s.judge_id) as any)?.avatar_url ?? null"
                          size="w-7 h-7"
                          text-size="text-[9px]"
                        />
                        <span class="text-sm font-bold text-zinc-900 dark:text-zinc-100 truncate max-w-[140px]">
                          {{ (currentRoundSummary?.judges?.find((j:any) => j.user_id === s.judge_id) as any)?.name || 'Jurado' }}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell class="text-center py-2">
                      <NumberField v-model="editDraft.value" :min="0" :max="currentRound?.max_score ?? 10" :step="0.1" class="w-28 mx-auto">
                        <NumberFieldContent class="border-2 border-zinc-300 dark:border-zinc-600 rounded-lg h-8 text-sm font-black">
                          <NumberFieldDecrement class="px-1.5" />
                          <NumberFieldInput class="text-center font-black text-sm h-full" />
                          <NumberFieldIncrement class="px-1.5" />
                        </NumberFieldContent>
                      </NumberField>
                    </TableCell>
                    <TableCell class="text-center py-2">
                      <button
                        type="button"
                        class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 transition-colors duration-200 focus:outline-none"
                        :class="editDraft.promote ? 'bg-blue-500 border-blue-500' : 'bg-zinc-200 dark:bg-zinc-700 border-zinc-200 dark:border-zinc-700'"
                        @click="editDraft.promote = !editDraft.promote"
                      >
                        <span
                          class="pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transform transition-transform duration-200 my-auto"
                          :class="editDraft.promote ? 'translate-x-5' : 'translate-x-0.5'"
                        />
                      </button>
                    </TableCell>
                    <TableCell class="py-2">
                      <Input v-model="editDraft.notes" placeholder="Observaciones…" class="h-8 text-sm border-2 border-zinc-300 dark:border-zinc-600 rounded-lg" />
                    </TableCell>
                    <TableCell class="py-2 pr-3">
                      <div class="flex items-center gap-1 justify-end">
                        <Button size="icon" variant="ghost" class="h-7 w-7 text-zinc-400 hover:text-zinc-700" @click="cancelEditing">
                          <X class="w-3.5 h-3.5" />
                        </Button>
                        <Button size="icon" class="h-7 w-7 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-300" :disabled="isSavingScore" @click="saveEditedScore(s.judge_id)">
                          <Save class="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                </template>
                <TableRow v-if="!filteredParticipantJudgeDetails.length">
                  <TableCell colspan="5" class="text-center py-10 text-zinc-400">
                    <ClipboardCheck class="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p class="text-sm font-medium">{{ participantDetailFilter ? 'Sin resultados para ese filtro' : 'Ningún jurado ha puntuado aún' }}</p>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    <!-- ── Judge detail dialog ──────────────────────────────────────────────── -->
    <Dialog v-model:open="isJudgeDetailOpen" @update:open="(v) => { if (!v) { cancelEditingParticipant(); judgeDetailFilter = '' } }">
      <DialogContent class="max-w-3xl rounded-2xl overflow-hidden p-0 border border-zinc-200 dark:border-zinc-800 shadow-xl bg-white dark:bg-zinc-950">
        <div class="p-6 pr-16 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 flex items-center gap-4">
          <AvatarBubble
            :name="(currentJudgeDetails?.judge as any)?.profile?.full_name || (currentJudgeDetails?.judge as any)?.full_name || (currentJudgeDetails?.judge as any)?.email || 'J'"
            :avatar-url="(currentJudgeDetails?.judge as any)?.profile?.avatar_url ?? (currentJudgeDetails?.judge as any)?.avatar_url ?? null"
            size="w-11 h-11"
            text-size="text-[11px]"
          />
          <div class="flex-1 min-w-0">
            <p class="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-0.5">Ficha de Jurado</p>
            <h2 class="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 truncate uppercase">
              {{ (currentJudgeDetails?.judge as any)?.profile?.full_name || (currentJudgeDetails?.judge as any)?.full_name || (currentJudgeDetails?.judge as any)?.email }}
            </h2>
          </div>
          <div class="flex gap-6 shrink-0 text-right">
            <div>
              <p class="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-0.5">Calificados</p>
              <span class="text-2xl font-black text-emerald-600 dark:text-emerald-400">{{ currentJudgeDetails?.scored.length ?? 0 }}</span>
            </div>
            <div>
              <p class="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-0.5">Pendientes</p>
              <span class="text-2xl font-black" :class="(currentJudgeDetails?.pending.length ?? 0) > 0 ? 'text-amber-500' : 'text-zinc-300 dark:text-zinc-700'">
                {{ currentJudgeDetails?.pending.length ?? 0 }}
              </span>
            </div>
          </div>
        </div>

        <div class="px-6 pt-4 pb-0">
          <div class="relative">
            <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
            <Input v-model="judgeDetailFilter" placeholder="Filtrar por participante…" class="pl-8 h-8 text-sm border-zinc-200 dark:border-zinc-700 rounded-lg" />
          </div>
        </div>

        <div class="p-6 pt-3 max-h-[65vh] overflow-y-auto space-y-4">
          <div v-if="filteredJudgeScoredParticipants.length">
            <p class="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-2">Calificados</p>
            <div class="rounded-xl border border-zinc-100 dark:border-zinc-800 overflow-hidden">
              <Table>
                <TableHeader class="bg-zinc-50 dark:bg-zinc-900/50">
                  <TableRow class="border-zinc-100 dark:border-zinc-800 hover:bg-transparent">
                    <TableHead class="pl-5 text-[10px] font-bold uppercase tracking-widest text-zinc-400">Participante</TableHead>
                    <TableHead class="text-center text-[10px] font-bold uppercase tracking-widest text-zinc-400 w-20">Nota</TableHead>
                    <TableHead class="text-center text-[10px] font-bold uppercase tracking-widest text-zinc-400 w-24">Promociona</TableHead>
                    <TableHead class="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Observaciones</TableHead>
                    <TableHead class="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <template v-for="item in filteredJudgeScoredParticipants" :key="item.participant.id">
                    <TableRow v-if="editingParticipantId !== item.participant.id" class="border-zinc-50 dark:border-zinc-900 hover:bg-zinc-50/50 dark:hover:bg-zinc-900/20 transition-colors last:border-0" :class="item.score.set_by_admin ? 'bg-purple-50/30 dark:bg-purple-950/10' : ''">
                      <TableCell class="pl-5 py-3">
                        <div class="flex items-center gap-2">
                          <AvatarBubble
                            :name="item.participant?.name || 'P'"
                            :avatar-url="item.participant?.avatar_url ?? null"
                            size="w-7 h-7"
                            text-size="text-[9px]"
                          />
                          <div class="flex flex-col min-w-0">
                            <span class="text-sm font-semibold text-zinc-800 dark:text-zinc-200 truncate max-w-[140px] uppercase">{{ item.participant?.name }}</span>
                            <span v-if="item.score.set_by_admin" class="text-[8px] font-black uppercase tracking-widest text-purple-600 dark:text-purple-400">★ Modificado por admin</span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell class="text-center py-3">
                        <Badge variant="secondary" class="font-black rounded-md px-2.5 py-0.5 text-sm border-2" :class="item.score.set_by_admin ? 'bg-purple-100 text-purple-700 border-purple-300 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-700' : getStatusClasses('active')">
                          {{ Number(item.score.value).toFixed(1) }}
                        </Badge>
                      </TableCell>
                      <TableCell class="text-center py-3">
                        <Badge v-if="item.score.promote" class="bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-700 font-bold border text-[10px] uppercase tracking-wide">Sí</Badge>
                        <span v-else class="text-zinc-300 dark:text-zinc-600 text-xs">—</span>
                      </TableCell>
                      <TableCell class="py-3 max-w-[200px]">
                        <span class="text-[12px] text-zinc-400 italic truncate block">{{ item.score.notes || '—' }}</span>
                      </TableCell>
                      <TableCell class="py-3 pr-3 text-right">
                        <div class="flex items-center gap-1 justify-end">
                          <Button
                            v-if="item.score.set_by_admin"
                            size="icon" variant="ghost"
                            class="h-7 w-7 text-purple-400 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-950/30"
                            title="Ver historial de cambios"
                            @click="openScoreLogs(item.participant.id, item.score.judge_id, item.participant.name, currentJudgeDetails?.judge?.profile?.full_name || currentJudgeDetails?.judge?.full_name || currentJudgeDetails?.judge?.email || '')"
                          >
                            <History class="w-3.5 h-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" class="h-7 w-7 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300" @click="startEditingParticipant(item)">
                            <Pencil class="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                    <TableRow v-else class="border-zinc-50 dark:border-zinc-900 bg-zinc-50/80 dark:bg-zinc-900/40">
                      <TableCell class="pl-5 py-3">
                        <div class="flex items-center gap-2">
                          <AvatarBubble
                            :name="item.participant?.name || 'P'"
                            :avatar-url="item.participant?.avatar_url ?? null"
                            size="w-7 h-7"
                            text-size="text-[9px]"
                          />
                          <span class="text-sm font-bold text-zinc-900 dark:text-zinc-100 truncate max-w-[140px] uppercase">{{ item.participant?.name }}</span>
                        </div>
                      </TableCell>
                      <TableCell class="text-center py-2">
                        <NumberField v-model="judgeEditDraft.value" :min="0" :max="currentRound?.max_score ?? 10" :step="0.1" class="w-28 mx-auto">
                          <NumberFieldContent class="border-2 border-zinc-300 dark:border-zinc-600 rounded-lg h-8 text-sm font-black">
                            <NumberFieldDecrement class="px-1.5" />
                            <NumberFieldInput class="text-center font-black text-sm h-full" />
                            <NumberFieldIncrement class="px-1.5" />
                          </NumberFieldContent>
                        </NumberField>
                      </TableCell>
                      <TableCell class="text-center py-2">
                        <button
                          type="button"
                          class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 transition-colors duration-200 focus:outline-none"
                          :class="judgeEditDraft.promote ? 'bg-blue-500 border-blue-500' : 'bg-zinc-200 dark:bg-zinc-700 border-zinc-200 dark:border-zinc-700'"
                          @click="judgeEditDraft.promote = !judgeEditDraft.promote"
                        >
                          <span
                            class="pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transform transition-transform duration-200 my-auto"
                            :class="judgeEditDraft.promote ? 'translate-x-5' : 'translate-x-0.5'"
                          />
                        </button>
                      </TableCell>
                      <TableCell class="py-2">
                        <Input v-model="judgeEditDraft.notes" placeholder="Observaciones…" class="h-8 text-sm border-2 border-zinc-300 dark:border-zinc-600 rounded-lg" />
                      </TableCell>
                      <TableCell class="py-2 pr-3">
                        <div class="flex items-center gap-1 justify-end">
                          <Button size="icon" variant="ghost" class="h-7 w-7 text-zinc-400 hover:text-zinc-700" @click="cancelEditingParticipant">
                            <X class="w-3.5 h-3.5" />
                          </Button>
                          <Button size="icon" class="h-7 w-7 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-300" :disabled="isSavingJudgeScore" @click="saveJudgeScore(item.participant.id)">
                            <Save class="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  </template>
                </TableBody>
              </Table>
            </div>
          </div>

          <div v-if="filteredJudgePendingParticipants.length">
            <p class="text-[10px] font-bold uppercase tracking-widest text-amber-500 mb-2">Pendientes de calificar</p>
            <div class="rounded-xl border border-amber-100 dark:border-amber-900/30 overflow-hidden">
              <Table>
                <TableBody>
                  <TableRow v-for="item in filteredJudgePendingParticipants" :key="item.participant.id" class="border-amber-50 dark:border-amber-900/10 hover:bg-amber-50/50 dark:hover:bg-amber-950/10 transition-colors last:border-0">
                    <TableCell class="pl-5 py-3">
                      <div class="flex items-center gap-2">
                        <AvatarBubble
                          :name="item.participant?.name || 'P'"
                          :avatar-url="item.participant?.avatar_url ?? null"
                          size="w-7 h-7"
                          text-size="text-[9px]"
                        />
                        <span class="text-sm font-semibold text-zinc-700 dark:text-zinc-300 uppercase">{{ item.participant?.name }}</span>
                        <button
                          class="ml-auto text-[9px] font-bold uppercase tracking-widest px-2 py-1 rounded bg-purple-100 dark:bg-purple-950/40 text-purple-700 dark:text-purple-400 hover:bg-purple-200 transition-colors"
                          @click="openAdminScoreEntry(selectedJudgeUserId!, item.participant.id)"
                        >
                          + Añadir nota
                        </button>
                      </div>
                    </TableCell>
                    <TableCell class="text-right pr-5 py-3">
                      <span class="text-[10px] font-bold text-amber-500 uppercase tracking-widest">Sin calificar</span>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </div>

          <div v-if="!filteredJudgeScoredParticipants.length && !filteredJudgePendingParticipants.length" class="text-center py-12 text-zinc-400">
            <ClipboardCheck class="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p class="text-sm font-medium">{{ judgeDetailFilter ? 'Sin resultados para ese filtro' : 'No hay participantes en esta ronda' }}</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    <!-- ── Score logs dialog ─────────────────────────────────────────────────── -->
    <Dialog v-model:open="isScoreLogsOpen">
      <DialogContent class="max-w-lg rounded-2xl overflow-hidden p-0 border border-zinc-200 dark:border-zinc-800 shadow-xl bg-white dark:bg-zinc-950">
        <div class="p-6 pr-16 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 flex items-center gap-4">
          <div class="w-10 h-10 rounded-xl bg-purple-600 flex items-center justify-center shrink-0">
            <History class="w-5 h-5 text-white" />
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-0.5">Historial de cambios</p>
            <h2 class="text-base font-bold tracking-tight text-zinc-900 dark:text-zinc-100 truncate uppercase leading-tight">{{ scoreLogsParticipantName }}</h2>
            <p class="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">Jurado: {{ scoreLogsJudgeName }}</p>
          </div>
        </div>
        <div class="p-6 max-h-[60vh] overflow-y-auto">
          <div v-if="isLoadingScoreLogs" class="text-center py-10 text-zinc-400">
            <div class="w-6 h-6 border-2 border-purple-400 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            <p class="text-xs font-medium">Cargando historial…</p>
          </div>
          <div v-else-if="!scoreLogs.length" class="text-center py-10 text-zinc-400">
            <History class="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p class="text-sm font-medium">Sin cambios registrados</p>
          </div>
          <div v-else class="space-y-3">
            <div
              v-for="log in scoreLogs"
              :key="log.id"
              class="flex items-start gap-3 p-3 rounded-xl border border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30"
            >
              <div class="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5" :class="log.action === 'score_updated' ? 'bg-amber-100 dark:bg-amber-950/40' : 'bg-emerald-100 dark:bg-emerald-950/40'">
                <Pencil v-if="log.action === 'score_updated'" class="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                <Star v-else class="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center justify-between gap-2">
                  <span class="text-[11px] font-black uppercase tracking-widest" :class="auditActionColor(log.action)">{{ auditActionLabel(log.action) }}</span>
                  <span class="text-[10px] text-zinc-400 shrink-0">{{ formatAuditDate(log.created_at) }}</span>
                </div>
                <div class="flex items-center gap-2 mt-1">
                  <span v-if="log.old_value != null" class="text-xs text-zinc-400 line-through">{{ Number(log.old_value).toFixed(1) }}</span>
                  <span v-if="log.old_value != null" class="text-[10px] text-zinc-300 dark:text-zinc-600">→</span>
                  <span class="text-sm font-black text-zinc-900 dark:text-zinc-100">{{ Number(log.new_value).toFixed(1) }}</span>
                </div>
                <p class="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 font-medium">
                  Por: <span class="font-bold text-zinc-700 dark:text-zinc-300">{{ log.changed_by_name || 'Admin' }}</span>
                </p>
                <p v-if="log.notes" class="text-[11px] text-zinc-400 italic mt-0.5">{{ log.notes }}</p>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    <!-- ── Judge matrix dialog ──────────────────────────────────────────────── -->
    <Dialog v-model:open="isJudgeMatrixOpen" @update:open="(v) => { if (!v) matrixFilter = '' }">
      <DialogContent class="max-w-5xl rounded-2xl overflow-hidden p-0 shadow-2xl border-2 border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-950">
        <div class="bg-zinc-50 dark:bg-zinc-900/50 p-8 border-b-2 border-zinc-100 dark:border-zinc-800 flex items-center gap-6">
          <div class="w-12 h-12 bg-zinc-900 dark:bg-zinc-100 rounded-xl flex items-center justify-center shadow-lg border-2 border-transparent shrink-0">
            <Layers class="w-6 h-6 text-white dark:text-zinc-900"/>
          </div>
          <div class="flex-1 min-w-0">
            <h2 class="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 uppercase">Matriz Operativa de Resultados</h2>
            <p class="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mt-1.5 px-0.5">Control integral de dispersión por mesa de jurado</p>
          </div>
          <div class="relative shrink-0 w-56">
            <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" />
            <Input v-model="matrixFilter" placeholder="Filtrar aspirantes..." class="pl-9 h-8 text-xs rounded-lg border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900" />
          </div>
        </div>
        <div class="p-8 max-h-[60vh] overflow-auto">
          <div class="rounded-xl border-2 border-zinc-100 dark:border-zinc-800 overflow-hidden shadow-sm bg-white dark:bg-transparent">
            <Table>
              <TableHeader class="bg-zinc-50/50 dark:bg-zinc-900/50">
                <TableRow class="border-zinc-100 dark:border-zinc-800 hover:bg-transparent">
                  <TableHead class="pl-8 py-6 text-[10px] font-bold uppercase tracking-widest text-zinc-400">Aspirante</TableHead>
                  <TableHead v-for="j in currentRoundSummary?.judges" :key="j.user_id" class="text-center text-[10px] font-bold uppercase tracking-widest text-zinc-400 border-x border-zinc-100 dark:border-zinc-800">
                    {{ (j.name || '').split(' ')[0] }}
                  </TableHead>
                  <TableHead class="text-center text-[10px] font-bold uppercase tracking-widest text-blue-500 dark:text-blue-400 border-x border-zinc-100 dark:border-zinc-800">
                    Promo.
                  </TableHead>
                  <TableHead class="text-right pr-8 text-[10px] font-bold uppercase tracking-widest text-zinc-900 dark:text-zinc-100 bg-zinc-100/50 dark:bg-zinc-800/50">
                    Media
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow
                  v-for="s in filteredMatrixSummaries"
                  :key="s.participant_id"
                  class="border-zinc-50 dark:border-zinc-900 hover:bg-zinc-50/30 dark:hover:bg-zinc-900/30 transition-all last:border-0"
                >
                  <TableCell class="pl-8 py-4 font-bold text-sm text-zinc-900 dark:text-zinc-100">
                    <div class="flex items-center gap-3">
                      <AvatarBubble
                        :name="participants.find(p => p.id === s.participant_id)?.name || '??'"
                        :avatar-url="null"
                        size="w-8 h-8"
                        text-size="text-[9px]"
                      />
                      {{ participants.find(p => p.id === s.participant_id)?.name }}
                    </div>
                  </TableCell>
                  <TableCell v-for="j in currentRoundSummary?.judges" :key="j.user_id" class="text-center text-sm font-medium text-zinc-400 border-x border-zinc-50 dark:border-zinc-900">
                    <div class="flex flex-col items-center gap-0.5">
                      <span>{{ s.judge_details?.find((d:any) => d.judge_id === j.user_id)?.value?.toFixed(1) || '-' }}</span>
                      <span v-if="s.judge_details?.find((d:any) => d.judge_id === j.user_id)?.promote" class="text-[9px] text-blue-500 font-bold">▲</span>
                    </div>
                  </TableCell>
                  <TableCell class="text-center border-x border-zinc-50 dark:border-zinc-900">
                    <span v-if="s.promotes > 0" class="text-xs font-black text-blue-600 dark:text-blue-400">{{ s.promotes }}</span>
                    <span v-else class="text-zinc-300 dark:text-zinc-700 text-xs">—</span>
                  </TableCell>
                  <TableCell class="text-right pr-8 bg-zinc-50/30 dark:bg-zinc-800/30">
                    <div class="flex flex-col items-end gap-0.5">
                      <span :class="['font-black text-lg', s.has_override ? 'text-purple-600 dark:text-purple-400' : 'text-zinc-900 dark:text-zinc-100']">
                        {{ (s.final_score ?? s.average).toFixed(2) }}
                      </span>
                      <span v-if="s.has_override" class="text-[8px] font-bold text-zinc-400 line-through">{{ s.average.toFixed(2) }}</span>
                    </div>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </div>
        <div class="p-6 bg-zinc-50 dark:bg-zinc-900 border-t-2 border-zinc-100 dark:border-zinc-800 flex justify-end">
          <Button
            variant="outline"
            class="rounded-md h-10 px-8 font-bold text-[10px] uppercase tracking-widest shadow-sm border-2 dark:border-zinc-700"
            @click="isJudgeMatrixOpen = false"
          >
            Cerrar Matriz
          </Button>
        </div>
      </DialogContent>
    </Dialog>

    <!-- ── Promotion modal ──────────────────────────────────────────────────── -->
    <Dialog v-model:open="isPromotionModalOpen" @update:open="(v) => { if (!v) { promotionSearchQuery = ''; promotionPage = 1 } }">
      <DialogContent class="max-w-2xl rounded-2xl overflow-hidden p-0 border border-zinc-200 dark:border-zinc-800 shadow-xl bg-white dark:bg-zinc-950">
        <!-- Header -->
        <div class="p-6 pr-16 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 flex items-center gap-4">
          <div class="w-11 h-11 rounded-xl bg-zinc-900 dark:bg-zinc-100 flex items-center justify-center shadow-sm shrink-0">
            <Trophy class="w-5 h-5 text-white dark:text-zinc-900" />
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-0.5">Selección estratégica de cupos finalistas</p>
            <h2 class="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 uppercase">Promoción de Rondas</h2>
          </div>
        </div>

        <!-- Config row -->
        <div class="px-6 pt-5 grid grid-cols-2 gap-4">
          <div class="flex items-center justify-between p-4 bg-zinc-50 dark:bg-zinc-900 rounded-xl border-2 border-zinc-100 dark:border-zinc-800">
            <div class="flex flex-col">
              <span class="text-sm font-bold tracking-tight text-zinc-900 dark:text-zinc-100">Participantes a pasar</span>
              <span class="text-[9px] text-zinc-400 font-bold uppercase tracking-widest mt-0.5">Selección automática top N</span>
            </div>
            <NumberField
              v-model="promotionLimit"
              :min="1"
              :max="allPromotionParticipants.length || 1"
            >
              <NumberFieldContent class="border-2 border-zinc-200 dark:border-zinc-700 rounded-lg h-9 w-32">
                <NumberFieldDecrement class="px-2 shrink-0" />
                <NumberFieldInput class="text-center font-black text-base h-full min-w-0 flex-1" />
                <NumberFieldIncrement class="px-2 shrink-0" />
              </NumberFieldContent>
            </NumberField>
          </div>
        </div>

        <!-- Search -->
        <div class="px-6 pt-4">
          <div class="relative">
            <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" />
            <Input v-model="promotionSearchQuery" placeholder="Filtrar aspirantes..." class="pl-9 h-8 text-xs rounded-lg border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900" />
          </div>
        </div>

        <!-- Table -->
        <div class="px-6 pt-3 pb-2">
          <div class="rounded-xl border border-zinc-100 dark:border-zinc-800 overflow-hidden">
            <Table>
              <TableHeader class="bg-zinc-50 dark:bg-zinc-900/50">
                <TableRow class="border-zinc-100 dark:border-zinc-800 hover:bg-transparent">
                  <TableHead class="w-10 pl-4">
                    <Checkbox
                      :model-value="pagedPromotionParticipants.length > 0 && pagedPromotionParticipants.every(s => selectedPromotionIds.includes(s.participant_id))"
                      @update:model-value="(v) => {
                        if (v) selectedPromotionIds = [...new Set([...selectedPromotionIds, ...pagedPromotionParticipants.map(s => s.participant_id)])]
                        else selectedPromotionIds = selectedPromotionIds.filter(id => !pagedPromotionParticipants.map(s => s.participant_id).includes(id))
                      }"
                      class="border-zinc-300 dark:border-zinc-600"
                    />
                  </TableHead>
                  <TableHead class="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Aspirante</TableHead>
                  <TableHead class="text-right pr-6 text-[10px] font-bold uppercase tracking-widest text-zinc-400">Nota Final</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow
                  v-for="s in pagedPromotionParticipants"
                  :key="s.participant_id"
                  class="border-zinc-50 dark:border-zinc-900 hover:bg-zinc-50/50 dark:hover:bg-zinc-900/30 cursor-pointer transition-colors last:border-0"
                  :class="selectedPromotionIds.includes(s.participant_id) ? 'bg-zinc-50 dark:bg-zinc-900/40' : ''"
                  @click="selectedPromotionIds.includes(s.participant_id) ? selectedPromotionIds = selectedPromotionIds.filter(id => id !== s.participant_id) : selectedPromotionIds = [...selectedPromotionIds, s.participant_id]"
                >
                  <TableCell class="pl-4 py-3">
                    <Checkbox
                      :model-value="selectedPromotionIds.includes(s.participant_id)"
                      class="border-zinc-300 dark:border-zinc-600"
                      @click.stop
                      @update:model-value="(v) => { if (v) selectedPromotionIds = [...selectedPromotionIds, s.participant_id]; else selectedPromotionIds = selectedPromotionIds.filter(id => id !== s.participant_id) }"
                    />
                  </TableCell>
                  <TableCell class="py-3">
                    <div class="flex items-center gap-2">
                      <AvatarBubble :name="s.name" size="w-7 h-7" text-size="text-[9px]" />
                      <span class="text-sm font-semibold text-zinc-800 dark:text-zinc-200 uppercase">{{ s.name }}</span>
                    </div>
                  </TableCell>
                  <TableCell class="text-right pr-6 py-3">
                    <span class="font-black text-base" :class="s.has_override ? 'text-purple-600 dark:text-purple-400' : 'text-zinc-900 dark:text-zinc-100'">
                      {{ (s.final_score ?? s.average ?? 0).toFixed(2) }}
                    </span>
                  </TableCell>
                </TableRow>
                <TableRow v-if="!pagedPromotionParticipants.length">
                  <TableCell colspan="3" class="text-center py-8 text-zinc-400 text-sm">Sin resultados</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </div>

        <!-- Pagination -->
        <div v-if="promotionPageCount > 1" class="px-6 py-3 flex items-center justify-between">
          <span class="text-[11px] text-zinc-400 font-bold">Pág. {{ promotionPage }} / {{ promotionPageCount }}</span>
          <div class="flex items-center gap-1">
            <Button variant="outline" size="icon" class="h-7 w-7 border-zinc-200 dark:border-zinc-700" :disabled="promotionPage <= 1" @click="promotionPage--">
              <ArrowLeft class="w-3.5 h-3.5" />
            </Button>
            <Button variant="outline" size="icon" class="h-7 w-7 border-zinc-200 dark:border-zinc-700" :disabled="promotionPage >= promotionPageCount" @click="promotionPage++">
              <ArrowLeft class="w-3.5 h-3.5 rotate-180" />
            </Button>
          </div>
        </div>

        <!-- Footer -->
        <div class="p-5 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/30 flex items-center justify-between gap-4">
          <span class="text-[11px] font-bold text-zinc-400 uppercase tracking-widest">{{ selectedPromotionCount }} seleccionado{{ selectedPromotionCount !== 1 ? 's' : '' }}</span>
          <div class="flex items-center gap-3">
            <Button variant="ghost" class="font-bold h-9 px-5 uppercase text-[10px] tracking-widest" @click="isPromotionModalOpen = false">Cancelar</Button>
            <Button
              class="bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-bold h-9 px-6 uppercase text-[10px] tracking-widest rounded-lg shadow-sm disabled:opacity-30 disabled:cursor-not-allowed"
              :disabled="isPromoting || selectedPromotionCount === 0"
              @click="handlePromote"
            >
              <Activity v-if="isPromoting" class="w-3.5 h-3.5 mr-2 animate-spin" />
              {{ isPromoting ? 'Promoviendo...' : `Cerrar & Promover ${selectedPromotionCount}` }}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    <!-- ── Confirmar finalizar concurso ──────────────────────────────────────── -->
    <Dialog v-model:open="isFinalConfirmOpen">
      <DialogContent class="max-w-md rounded-2xl overflow-hidden p-0 border border-zinc-200 dark:border-zinc-800 shadow-xl bg-white dark:bg-zinc-950">
        <div class="p-6 pr-16 border-b border-zinc-100 dark:border-zinc-800 bg-gradient-to-r from-amber-50 to-white dark:from-amber-950/30 dark:to-zinc-900/50 flex items-center gap-4">
          <div class="w-11 h-11 rounded-xl bg-amber-500 flex items-center justify-center shadow-sm shrink-0">
            <Trophy class="w-5 h-5 text-white" />
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-[10px] font-bold uppercase tracking-widest text-amber-600 dark:text-amber-400 mb-0.5">Acción Final</p>
            <h2 class="text-lg font-bold tracking-tight text-zinc-900 dark:text-zinc-100 uppercase">Finalizar Concurso</h2>
          </div>
        </div>

        <div class="p-6 space-y-3">
          <p class="text-sm text-zinc-700 dark:text-zinc-300">
            Esta acción <strong>finaliza el concurso</strong> de esta categoría. Se cerrará la ronda actual y se <strong>publicará el ranking final</strong>.
          </p>
          <p class="text-xs text-zinc-500 dark:text-zinc-400">
            No se podrán añadir más notas ni modificar resultados después de publicar.
          </p>
        </div>

        <DialogFooter class="p-5 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/30 flex justify-end gap-3">
          <Button
            variant="ghost"
            class="font-bold h-9 px-5 uppercase text-[10px] tracking-widest"
            :disabled="isFinalizingFinal"
            @click="isFinalConfirmOpen = false"
          >
            Cancelar
          </Button>
          <Button
            class="bg-amber-500 hover:bg-amber-600 text-white font-bold h-9 px-6 uppercase text-[10px] tracking-widest rounded-lg shadow-sm disabled:opacity-50"
            :disabled="isFinalizingFinal"
            @click="handleFinalizeFinal"
          >
            <Activity v-if="isFinalizingFinal" class="w-3.5 h-3.5 mr-2 animate-spin" />
            {{ isFinalizingFinal ? 'Publicando...' : 'Finalizar & Publicar Ranking' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- ── Confirmar revertir finalización ───────────────────────────────────── -->
    <Dialog v-model:open="isRevertFinalOpen">
      <DialogContent class="max-w-md rounded-2xl overflow-hidden p-0 border border-zinc-200 dark:border-zinc-800 shadow-xl bg-white dark:bg-zinc-950">
        <div class="p-6 pr-16 border-b border-zinc-100 dark:border-zinc-800 bg-gradient-to-r from-amber-50 to-white dark:from-amber-950/30 dark:to-zinc-900/50 flex items-center gap-4">
          <div class="w-11 h-11 rounded-xl bg-amber-500 flex items-center justify-center shadow-sm shrink-0">
            <ArrowLeft class="w-5 h-5 text-white" />
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-[10px] font-bold uppercase tracking-widest text-amber-600 dark:text-amber-400 mb-0.5">Rollback</p>
            <h2 class="text-lg font-bold tracking-tight text-zinc-900 dark:text-zinc-100 uppercase">Revertir Finalización</h2>
          </div>
        </div>
        <div class="p-6 space-y-3">
          <p class="text-sm text-zinc-700 dark:text-zinc-300">
            Esta acción <strong>elimina el ranking publicado</strong>, reabre la categoría y reactiva esta ronda para permitir nuevas modificaciones.
          </p>
          <p class="text-xs text-zinc-500 dark:text-zinc-400">
            Las notas existentes se conservan. Podrás volver a finalizar cuando lo decidas.
          </p>
        </div>
        <DialogFooter class="p-5 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/30 flex justify-end gap-3">
          <Button
            variant="ghost"
            class="font-bold h-9 px-5 uppercase text-[10px] tracking-widest"
            :disabled="isReverting"
            @click="isRevertFinalOpen = false"
          >
            Cancelar
          </Button>
          <Button
            class="bg-amber-500 hover:bg-amber-600 text-white font-bold h-9 px-6 uppercase text-[10px] tracking-widest rounded-lg shadow-sm disabled:opacity-50"
            :disabled="isReverting"
            @click="handleRevertFinal"
          >
            <Activity v-if="isReverting" class="w-3.5 h-3.5 mr-2 animate-spin" />
            {{ isReverting ? 'Revirtiendo...' : 'Revertir Finalización' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- ── Ranking final dialog ──────────────────────────────────────────────── -->
    <Dialog v-model:open="isRankingOpen">
      <DialogContent class="max-w-4xl rounded-2xl overflow-hidden p-0 border border-zinc-200 dark:border-zinc-800 shadow-xl bg-white dark:bg-zinc-950">
        <div class="p-6 pr-16 border-b border-zinc-100 dark:border-zinc-800 bg-gradient-to-r from-amber-50 to-white dark:from-amber-950/30 dark:to-zinc-900/50 flex items-center gap-4">
          <div class="w-11 h-11 rounded-xl bg-amber-500 flex items-center justify-center shadow-sm shrink-0">
            <Trophy class="w-5 h-5 text-white" />
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-[10px] font-bold uppercase tracking-widest text-amber-600 dark:text-amber-400 mb-0.5">Ranking Final</p>
            <h2 class="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 uppercase">Clasificación de la Categoría</h2>
          </div>
        </div>

        <div class="p-6 max-h-[70vh] overflow-y-auto">
          <div v-if="!rankingData" class="py-12 text-center">
            <Activity class="w-6 h-6 mx-auto text-zinc-400 animate-spin" />
            <p class="mt-3 text-sm text-zinc-500">Cargando ranking...</p>
          </div>

          <div v-else-if="rankingData.ranking.length === 0" class="py-12 text-center">
            <p class="text-sm text-zinc-500">Sin participantes</p>
          </div>

          <div v-else class="rounded-xl border border-zinc-100 dark:border-zinc-800 overflow-hidden">
            <Table>
              <TableHeader class="bg-zinc-50 dark:bg-zinc-900/50">
                <TableRow class="border-zinc-100 dark:border-zinc-800 hover:bg-transparent">
                  <TableHead class="pl-5 w-16 text-[10px] font-bold uppercase tracking-widest text-zinc-400">#</TableHead>
                  <TableHead class="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Participante</TableHead>
                  <TableHead class="text-[10px] font-bold uppercase tracking-widest text-zinc-400 text-center w-24">Rondas</TableHead>
                  <TableHead
                    v-for="r in rankingData.rounds"
                    :key="r.id"
                    class="text-[10px] font-bold uppercase tracking-widest text-zinc-400 text-center"
                  >
                    {{ r.name }}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow
                  v-for="row in rankingData.ranking"
                  :key="row.participant_id"
                  class="border-zinc-50 dark:border-zinc-900 last:border-0"
                >
                  <TableCell class="pl-5 py-3">
                    <div
                      class="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
                      :class="{
                        'bg-amber-500 text-white': row.rank === 1,
                        'bg-zinc-400 text-white': row.rank === 2,
                        'bg-amber-700 text-white': row.rank === 3,
                        'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300': row.rank > 3,
                      }"
                    >
                      {{ row.rank }}
                    </div>
                  </TableCell>
                  <TableCell class="py-3">
                    <span class="text-sm font-semibold text-zinc-800 dark:text-zinc-200 uppercase">{{ row.name }}</span>
                  </TableCell>
                  <TableCell class="py-3 text-center">
                    <span class="text-sm font-mono font-semibold text-zinc-700 dark:text-zinc-300">{{ row.rounds_played }}</span>
                  </TableCell>
                  <TableCell
                    v-for="(pr, idx) in row.per_round"
                    :key="idx"
                    class="py-3 text-center"
                  >
                    <span
                      v-if="pr.avg != null"
                      class="text-sm font-mono font-semibold text-zinc-900 dark:text-zinc-100"
                    >{{ pr.avg.toFixed(2) }}</span>
                    <span v-else class="text-xs text-zinc-400">—</span>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </div>

        <DialogFooter class="p-5 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/30 flex justify-end gap-3">
          <Button variant="ghost" class="font-bold h-9 px-5 uppercase text-[10px] tracking-widest" @click="isRankingOpen = false">Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- ── Ensayos dialog ─────────────────────────────────────────────────────── -->
    <Dialog v-model:open="isEnsayosOpen">
      <DialogContent class="max-w-3xl rounded-2xl overflow-hidden p-0 border border-zinc-200 dark:border-zinc-800 shadow-xl bg-white dark:bg-zinc-950">
        <div class="p-6 pr-16 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 flex items-center gap-4">
          <div class="w-11 h-11 rounded-xl bg-blue-600 flex items-center justify-center shadow-sm shrink-0">
            <Music class="w-5 h-5 text-white" />
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-0.5">Configuración de ensayos</p>
            <h2 class="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 uppercase">Asignación de Aulas y Pianistas</h2>
          </div>
        </div>

        <div class="p-6 max-h-[65vh] overflow-y-auto">
          <div class="rounded-xl border border-zinc-100 dark:border-zinc-800 overflow-hidden">
            <Table>
              <TableHeader class="bg-zinc-50 dark:bg-zinc-900/50">
                <TableRow class="border-zinc-100 dark:border-zinc-800 hover:bg-transparent">
                  <TableHead class="pl-5 text-[10px] font-bold uppercase tracking-widest text-zinc-400">Participante</TableHead>
                  <TableHead class="text-[10px] font-bold uppercase tracking-widest text-zinc-400 w-36">Aula</TableHead>
                  <TableHead class="text-[10px] font-bold uppercase tracking-widest text-zinc-400 w-44">Acompañante</TableHead>
                  <TableHead class="text-[10px] font-bold uppercase tracking-widest text-zinc-400 w-28 pr-5">Hora ensayo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow
                  v-for="rp in currentRoundParticipants"
                  :key="rp.id"
                  class="border-zinc-50 dark:border-zinc-900 last:border-0"
                >
                  <TableCell class="pl-5 py-3">
                    <div class="flex items-center gap-2">
                      <AvatarBubble :name="rp.participant?.name || 'P'" :avatar-url="rp.participant?.avatar_url ?? null" size="w-7 h-7" text-size="text-[9px]" />
                      <span class="text-sm font-semibold text-zinc-800 dark:text-zinc-200 uppercase">{{ rp.participant?.name }}</span>
                    </div>
                  </TableCell>
                  <TableCell class="py-2">
                    <Input
                      v-if="ensayosDraft[rp.id]"
                      v-model="ensayosDraft[rp.id].rehearsal_room"
                      placeholder="Ej. Aula 3"
                      class="h-8 text-sm border-2 border-zinc-200 dark:border-zinc-700 rounded-lg"
                    />
                  </TableCell>
                  <TableCell class="py-2">
                    <Input
                      v-if="ensayosDraft[rp.id]"
                      v-model="ensayosDraft[rp.id].rehearsal_accompanist"
                      placeholder="Ej. María López"
                      class="h-8 text-sm border-2 border-zinc-200 dark:border-zinc-700 rounded-lg"
                    />
                  </TableCell>
                  <TableCell class="py-2 pr-5">
                    <DateTimePicker
                      v-if="ensayosDraft[rp.id]"
                      v-model="ensayosDraft[rp.id].rehearsal_time"
                      placeholder="Fecha y hora"
                    />
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </div>

        <DialogFooter class="p-5 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/30 flex justify-end gap-3">
          <Button variant="ghost" class="font-bold h-9 px-5 uppercase text-[10px] tracking-widest" @click="isEnsayosOpen = false">Cancelar</Button>
          <Button
            class="bg-blue-600 hover:bg-blue-700 text-white font-bold h-9 px-6 uppercase text-[10px] tracking-widest rounded-lg shadow-sm"
            :disabled="isSavingEnsayos"
            @click="saveEnsayos"
          >
            <Activity v-if="isSavingEnsayos" class="w-3.5 h-3.5 mr-1.5 animate-spin" />
            {{ isSavingEnsayos ? 'Guardando...' : 'Guardar Ensayos' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- ── Actuaciones dialog ─────────────────────────────────────────────────── -->
    <Dialog v-model:open="isActuacionesOpen">
      <DialogContent class="max-w-2xl rounded-2xl overflow-hidden p-0 border border-zinc-200 dark:border-zinc-800 shadow-xl bg-white dark:bg-zinc-950">
        <div class="p-6 pr-16 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 flex items-center gap-4">
          <div class="w-11 h-11 rounded-xl bg-emerald-600 flex items-center justify-center shadow-sm shrink-0">
            <Clock class="w-5 h-5 text-white" />
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-0.5">Configuración de actuaciones</p>
            <h2 class="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 uppercase">Asignación de Horarios</h2>
          </div>
        </div>

        <div class="p-6 max-h-[65vh] overflow-y-auto">
          <div class="rounded-xl border border-zinc-100 dark:border-zinc-800 overflow-hidden">
            <Table>
              <TableHeader class="bg-zinc-50 dark:bg-zinc-900/50">
                <TableRow class="border-zinc-100 dark:border-zinc-800 hover:bg-transparent">
                  <TableHead class="pl-5 text-[10px] font-bold uppercase tracking-widest text-zinc-400">Participante</TableHead>
                  <TableHead class="text-[10px] font-bold uppercase tracking-widest text-zinc-400 w-44 pr-5">Hora de actuación</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow
                  v-for="rp in currentRoundParticipants"
                  :key="rp.id"
                  class="border-zinc-50 dark:border-zinc-900 last:border-0"
                >
                  <TableCell class="pl-5 py-3">
                    <div class="flex items-center gap-2">
                      <AvatarBubble :name="rp.participant?.name || 'P'" :avatar-url="rp.participant?.avatar_url ?? null" size="w-7 h-7" text-size="text-[9px]" />
                      <span class="text-sm font-semibold text-zinc-800 dark:text-zinc-200 uppercase">{{ rp.participant?.name }}</span>
                    </div>
                  </TableCell>
                  <TableCell class="py-2 pr-5">
                    <DateTimePicker
                      v-if="actuacionesDraft[rp.id]"
                      v-model="actuacionesDraft[rp.id].performance_time"
                      placeholder="Fecha y hora"
                    />
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </div>

        <DialogFooter class="p-5 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/30 flex justify-end gap-3">
          <Button variant="ghost" class="font-bold h-9 px-5 uppercase text-[10px] tracking-widest" @click="isActuacionesOpen = false">Cancelar</Button>
          <Button
            class="bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-9 px-6 uppercase text-[10px] tracking-widest rounded-lg shadow-sm"
            :disabled="isSavingActuaciones"
            @click="saveActuaciones"
          >
            <Activity v-if="isSavingActuaciones" class="w-3.5 h-3.5 mr-1.5 animate-spin" />
            {{ isSavingActuaciones ? 'Guardando...' : 'Guardar Actuaciones' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- ── PDF dialog ─────────────────────────────────────────────────────────── -->
    <Dialog v-model:open="isPdfOpen">
      <DialogContent class="max-w-sm rounded-2xl overflow-hidden p-0 border border-zinc-200 dark:border-zinc-800 shadow-xl bg-white dark:bg-zinc-950">
        <div class="p-6 pr-16 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 flex items-center gap-4">
          <div class="w-11 h-11 rounded-xl bg-zinc-900 dark:bg-zinc-100 flex items-center justify-center shadow-sm shrink-0">
            <FileText class="w-5 h-5 text-white dark:text-zinc-900" />
          </div>
          <div>
            <p class="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-0.5">Generación de PDF</p>
            <h2 class="text-lg font-bold tracking-tight text-zinc-900 dark:text-zinc-100 uppercase">Exportar listado</h2>
          </div>
        </div>

        <div class="p-6 space-y-5">
          <!-- Type -->
          <div class="space-y-2">
            <p class="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Tipo de PDF</p>
            <div class="grid grid-cols-2 gap-2">
              <label
                v-for="opt in [{ value: 'ensayos', label: 'Ensayos', color: 'blue' }, { value: 'actuaciones', label: 'Actuaciones', color: 'emerald' }]"
                :key="opt.value"
                class="flex items-center gap-2.5 p-3 rounded-xl border-2 cursor-pointer transition-colors"
                :class="pdfType === opt.value
                  ? opt.color === 'blue'
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/20'
                    : 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20'
                  : 'border-zinc-100 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-600'"
                @click="pdfType = opt.value as any"
              >
                <div
                  class="w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0"
                  :class="pdfType === opt.value
                    ? opt.color === 'blue' ? 'border-blue-500' : 'border-emerald-500'
                    : 'border-zinc-300 dark:border-zinc-600'"
                >
                  <div
                    v-if="pdfType === opt.value"
                    class="w-2 h-2 rounded-full"
                    :class="opt.color === 'blue' ? 'bg-blue-500' : 'bg-emerald-500'"
                  />
                </div>
                <span class="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{{ opt.label }}</span>
              </label>
            </div>
          </div>

          <!-- Sort -->
          <div class="space-y-2">
            <p class="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Ordenar por</p>
            <div class="space-y-1.5">
              <label
                v-for="opt in [{ value: 'apellido', label: 'Apellido' }, { value: 'nombre', label: 'Nombre' }, { value: 'hora', label: 'Hora' }]"
                :key="opt.value"
                class="flex items-center gap-3 p-2.5 rounded-lg border-2 cursor-pointer transition-colors"
                :class="pdfSortBy === opt.value
                  ? 'border-zinc-900 dark:border-zinc-100 bg-zinc-50 dark:bg-zinc-900'
                  : 'border-zinc-100 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-600'"
                @click="pdfSortBy = opt.value as any"
              >
                <div
                  class="w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0"
                  :class="pdfSortBy === opt.value ? 'border-zinc-900 dark:border-zinc-100' : 'border-zinc-300 dark:border-zinc-600'"
                >
                  <div v-if="pdfSortBy === opt.value" class="w-2 h-2 rounded-full bg-zinc-900 dark:bg-zinc-100" />
                </div>
                <span class="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{{ opt.label }}</span>
              </label>
            </div>
          </div>
        </div>

        <DialogFooter class="p-5 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/30 flex justify-end gap-3">
          <Button variant="ghost" class="font-bold h-9 px-5 uppercase text-[10px] tracking-widest" @click="isPdfOpen = false">Cancelar</Button>
          <Button
            class="bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-bold h-9 px-6 uppercase text-[10px] tracking-widest rounded-lg shadow-sm"
            @click="generatePdf"
          >
            <FileText class="w-3.5 h-3.5 mr-1.5" /> Generar PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <!-- ── Admin score entry dialog ──────────────────────────────────────────── -->
    <Dialog v-model:open="isAdminSettingScore">
      <DialogContent class="max-w-sm rounded-2xl p-0 border border-zinc-200 dark:border-zinc-800 shadow-xl bg-white dark:bg-zinc-950">
        <div class="p-5 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50">
          <p class="text-[10px] font-bold uppercase tracking-widest text-purple-500 mb-0.5">Acción de administrador</p>
          <h2 class="text-lg font-bold tracking-tight text-zinc-900 dark:text-zinc-100 uppercase">Establecer Nota</h2>
        </div>
        <div class="p-5 space-y-4" v-if="adminScoreDraft">
          <div>
            <label class="text-[10px] font-bold uppercase tracking-widest text-zinc-400 block mb-1">Nota (0-10)</label>
            <NumberField v-model="adminScoreDraft.value" :min="0" :max="10" :step="0.1">
              <NumberFieldContent>
                <NumberFieldDecrement />
                <NumberFieldInput class="h-9 text-sm" />
                <NumberFieldIncrement />
              </NumberFieldContent>
            </NumberField>
          </div>
          <div>
            <label class="text-[10px] font-bold uppercase tracking-widest text-zinc-400 block mb-1">Observaciones</label>
            <Input v-model="adminScoreDraft.notes" placeholder="Opcional..." class="h-9 text-sm" />
          </div>
          <div class="flex items-center gap-2">
            <Checkbox v-model:checked="adminScoreDraft.promote" id="admin-promote" />
            <label for="admin-promote" class="text-sm font-medium cursor-pointer">Promover participante</label>
          </div>
        </div>
        <DialogFooter class="p-4 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/30 flex justify-end gap-2">
          <Button variant="ghost" class="h-9 px-4 font-bold uppercase text-[10px] tracking-widest" @click="isAdminSettingScore = false">Cancelar</Button>
          <Button
            class="h-9 px-5 bg-purple-600 hover:bg-purple-700 text-white font-bold uppercase text-[10px] tracking-widest rounded-lg"
            :disabled="isSavingAdminScore"
            @click="saveAdminScore"
          >
            <Activity v-if="isSavingAdminScore" class="w-3.5 h-3.5 mr-1.5 animate-spin" />
            {{ isSavingAdminScore ? 'Guardando...' : 'Guardar Nota' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- ── Override final score dialog ───────────────────────────────────────── -->
    <Dialog v-model:open="isOverrideOpen">
      <DialogContent class="max-w-sm rounded-2xl p-0 border border-zinc-200 dark:border-zinc-800 shadow-xl bg-white dark:bg-zinc-950">
        <div class="p-5 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50">
          <p class="text-[10px] font-bold uppercase tracking-widest text-purple-500 mb-0.5">Override de nota final</p>
          <h2 class="text-lg font-bold tracking-tight text-zinc-900 dark:text-zinc-100 uppercase truncate">{{ overrideDraft.participantName }}</h2>
        </div>
        <div class="p-5 space-y-4">
          <div class="rounded-lg bg-zinc-50 dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 px-4 py-2.5 text-sm">
            <span class="text-zinc-400 text-xs font-bold uppercase tracking-widest">Media jurado: </span>
            <span class="font-bold text-zinc-900 dark:text-zinc-100">{{ overrideDraft.currentAvg.toFixed(2) }}</span>
          </div>
          <div>
            <label class="text-[10px] font-bold uppercase tracking-widest text-zinc-400 block mb-1">Nota final (dejar vacío para eliminar override)</label>
            <Input v-model="overrideDraft.value" type="number" step="0.01" min="0" max="10" placeholder="Ej. 8.75" class="h-9 text-sm" />
          </div>
          <div>
            <label class="text-[10px] font-bold uppercase tracking-widest text-zinc-400 block mb-1">Motivo / Notas</label>
            <Input v-model="overrideDraft.notes" placeholder="Motivo del override..." class="h-9 text-sm" />
          </div>
        </div>
        <DialogFooter class="p-4 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/30 flex justify-end gap-2">
          <Button variant="ghost" class="h-9 px-4 font-bold uppercase text-[10px] tracking-widest" @click="isOverrideOpen = false">Cancelar</Button>
          <Button
            class="h-9 px-5 bg-purple-600 hover:bg-purple-700 text-white font-bold uppercase text-[10px] tracking-widest rounded-lg"
            :disabled="isSavingOverride"
            @click="saveOverride"
          >
            <Activity v-if="isSavingOverride" class="w-3.5 h-3.5 mr-1.5 animate-spin" />
            {{ isSavingOverride ? 'Guardando...' : 'Confirmar' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- ── Audit log dialog ───────────────────────────────────────────────────── -->
    <Dialog v-model:open="isAuditOpen">
      <DialogContent class="max-w-2xl rounded-2xl overflow-hidden p-0 border border-zinc-200 dark:border-zinc-800 shadow-xl bg-white dark:bg-zinc-950">
        <div class="p-6 pr-16 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 flex items-center gap-4">
          <div class="w-11 h-11 rounded-xl bg-purple-600 flex items-center justify-center shadow-sm shrink-0">
            <ClipboardCheck class="w-5 h-5 text-white" />
          </div>
          <div>
            <p class="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-0.5">Trazabilidad</p>
            <h2 class="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 uppercase">Registro de Cambios</h2>
          </div>
        </div>
        <div class="p-6 max-h-[65vh] overflow-y-auto">
          <div v-if="isLoadingAudit" class="flex items-center justify-center py-12">
            <Activity class="w-6 h-6 animate-spin text-zinc-400" />
          </div>
          <div v-else-if="!auditLogs.length" class="text-center py-12 text-sm text-muted-foreground">
            Sin cambios registrados aún.
          </div>
          <div v-else class="space-y-2">
            <div
              v-for="log in auditLogs"
              :key="log.id"
              class="flex items-start gap-3 rounded-xl border border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30 px-4 py-3"
            >
              <div class="shrink-0 mt-0.5">
                <div class="w-2 h-2 rounded-full mt-1" :class="log.is_admin_action ? 'bg-purple-500' : 'bg-emerald-500'" />
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex flex-wrap items-center gap-2">
                  <span class="text-xs font-bold" :class="auditActionColor(log.action)">{{ auditActionLabel(log.action) }}</span>
                  <Badge v-if="log.is_admin_action" class="text-[8px] font-black uppercase tracking-widest px-1.5 py-0 bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">Admin</Badge>
                </div>
                <p class="text-xs text-zinc-700 dark:text-zinc-300 mt-0.5">
                  <span class="font-semibold">{{ log.participant_name ?? log.participant_id }}</span>
                  <template v-if="log.judge_name"> · juez: <span class="font-semibold">{{ log.judge_name }}</span></template>
                </p>
                <p class="text-xs text-zinc-400 mt-0.5">
                  Por: {{ log.changed_by_name ?? log.changed_by }}
                  <template v-if="log.old_value !== null"> · {{ log.old_value }} → {{ log.new_value }}</template>
                  <template v-else> · Nota: {{ log.new_value }}</template>
                </p>
                <p v-if="log.notes" class="text-xs text-zinc-400 italic mt-0.5">"{{ log.notes }}"</p>
              </div>
              <span class="text-[10px] text-zinc-400 shrink-0 tabular-nums">{{ formatAuditDate(log.created_at) }}</span>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    <!-- History dialog -->
    <Dialog v-model:open="isHistoryOpen">
      <DialogContent class="max-w-3xl rounded-2xl overflow-hidden p-0 border border-zinc-200 dark:border-zinc-800 shadow-xl bg-white dark:bg-zinc-950">
        <div class="p-6 pr-16 border-b border-zinc-100 dark:border-zinc-800 bg-gradient-to-r from-amber-50 to-white dark:from-amber-950/30 dark:to-zinc-900/50 flex items-center gap-4">
          <div class="w-11 h-11 rounded-xl bg-amber-500 flex items-center justify-center shadow-sm shrink-0">
            <Trophy class="w-5 h-5 text-white" />
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-[10px] font-bold uppercase tracking-widest text-amber-600 dark:text-amber-400 mb-0.5">Historial</p>
            <h2 class="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 uppercase">{{ historyData?.participant?.name || '—' }}</h2>
          </div>
        </div>
        <div class="p-6 max-h-[70vh] overflow-y-auto space-y-4">
          <div v-if="historyLoading" class="py-12 text-center text-sm text-zinc-500">Cargando...</div>
          <template v-else-if="historyData">
            <div v-for="r in historyData.rounds" :key="r.round_id" class="rounded-xl border border-zinc-100 dark:border-zinc-800 overflow-hidden">
              <button
                type="button"
                class="w-full flex items-center justify-between px-5 py-3 bg-zinc-50 dark:bg-zinc-900/50 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors text-left"
                :class="expandedHistoryRounds.has(r.round_id) ? 'border-b border-zinc-100 dark:border-zinc-800' : ''"
                @click="toggleHistoryRound(r.round_id)"
              >
                <div class="flex items-center gap-3">
                  <svg
                    class="w-4 h-4 text-zinc-400 transition-transform"
                    :class="expandedHistoryRounds.has(r.round_id) ? 'rotate-90' : ''"
                    viewBox="0 0 20 20" fill="currentColor"
                  ><path fill-rule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L10.44 10 7.23 6.29a.75.75 0 111.1-1.02l3.75 4a.75.75 0 010 1.02l-3.75 4a.75.75 0 01-1.12.02z" clip-rule="evenodd"/></svg>
                  <span class="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Etapa {{ r.round_order }}</span>
                  <span class="text-sm font-bold text-zinc-900 dark:text-zinc-100 uppercase">{{ r.round_name }}</span>
                  <Badge v-if="r.is_final" class="text-[9px] bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400 border-0 font-bold uppercase tracking-widest">Final</Badge>
                  <Badge v-if="r.is_qualified" class="text-[9px] bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400 border-0 font-bold uppercase tracking-widest">Promovido</Badge>
                </div>
                <div class="flex items-center gap-4">
                  <span v-if="r.override != null" class="text-[10px] font-bold uppercase tracking-widest text-purple-600 dark:text-purple-400">Override</span>
                  <span class="text-base font-mono font-bold text-zinc-900 dark:text-zinc-100">
                    {{ (r.override ?? r.avg) != null ? (r.override ?? r.avg).toFixed(2) : '—' }}
                  </span>
                </div>
              </button>
              <div v-if="expandedHistoryRounds.has(r.round_id)" class="p-4">
                <div v-if="!r.scores?.length" class="text-xs text-zinc-400 text-center py-2">Sin notas</div>
                <table v-else class="w-full text-sm">
                  <thead>
                    <tr class="text-[10px] font-bold uppercase tracking-widest text-zinc-400">
                      <th class="py-2 text-left">Jurado</th>
                      <th class="py-2 text-right pr-4">Nota</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(s, i) in r.scores" :key="i" class="border-t border-zinc-50 dark:border-zinc-900">
                      <td class="py-2 text-zinc-700 dark:text-zinc-300">{{ s.judge_name }}</td>
                      <td class="py-2 pr-4 text-right font-mono font-semibold text-zinc-900 dark:text-zinc-100">{{ s.value.toFixed(2) }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </template>
        </div>
      </DialogContent>
    </Dialog>
  </div>
</template>
