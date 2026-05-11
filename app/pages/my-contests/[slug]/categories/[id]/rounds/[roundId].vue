<script setup lang="ts">
import { ref, computed } from 'vue'
import AvatarBubble from '@/components/ui/avatar/AvatarBubble.vue'
import {
  ArrowLeft, Trophy, MapPin, Clock, Users, Star,
  CheckCircle2, AlertCircle, Hash, User, Edit3, ThumbsUp, FileText
} from 'lucide-vue-next'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { getStatusClasses } from '@/utils/styles'
import { toast } from 'vue-sonner'

const route = useRoute()
const authStore = useAuthStore()
const { setMeta, clearMeta } = useBreadcrumbMeta()
onUnmounted(() => clearMeta())

const { data, error, refresh, pending } = useFetch(`/api/my/rounds/${route.params.roundId}`, {
  server: false,
  lazy: true,
  headers: computed(() => ({
    Authorization: `Bearer ${authStore.session?.access_token ?? ''}`
  })),
  watch: [computed(() => authStore.session?.access_token)]
})

const round = computed(() => (data.value as any)?.round ?? null)
const category = computed(() => (data.value as any)?.category ?? null)
const contest = computed(() => (data.value as any)?.contest ?? null)
watch(contest, (c) => { if (c?.name) setMeta({ contest: c.name }) }, { immediate: true })
watch(round, (r) => { if (r?.name) setMeta({ round: r.name }) }, { immediate: true })
watch(category, (c) => { if (c?.name) setMeta({ category: c.name }) }, { immediate: true })
const myParticipant = computed(() => (data.value as any)?.myParticipant ?? null)
const mySlot = computed(() => (data.value as any)?.mySlot ?? null)
const allSlots = computed(() => (data.value as any)?.allSlots ?? [])
const myScores = ref<any[]>([])
watch(data, (val) => { myScores.value = (val as any)?.myScores ?? [] }, { immediate: true })
const avgScore = computed(() => (data.value as any)?.avgScore ?? null)
const isJudge = computed(() => (data.value as any)?.isJudge ?? false)

// Real-time: refresh whenever any score in this round changes (e.g. admin edits)
const roundId = computed(() => route.params.roundId as string)
useRoundScoresRealtime(roundId, async () => {
  await refresh()
  myScores.value = (data.value as any)?.myScores ?? []
})

const roundIsActive = computed(() => round.value?.status === 'active')
const roundIsClosed = computed(() => round.value?.status === 'closed')
const roundIsPending = computed(() => round.value?.status === 'pending')

// ── Scoring modal ────────────────────────────────────────────────
const isScoringOpen = ref(false)
const selectedSlot = ref<any>(null)
const scoreForm = ref({ value: '' as string | number, notes: '', promote: false })
const isSubmittingScore = ref(false)

function openScoring(slot: any) {
  selectedSlot.value = slot
  // Pre-fill if already scored
  const existing = myScores.value.find((s: any) => s.participant_id === slot.participant_id)
  scoreForm.value = {
    value: existing?.value ?? '',
    notes: existing?.notes ?? '',
    promote: existing?.promote ?? false
  }
  isScoringOpen.value = true
}

const maxScore = computed(() => round.value?.max_score ?? 10)

const scoreIsValid = computed(() => {
  const v = Number(scoreForm.value.value)
  return !isNaN(v) && v >= 0 && v <= maxScore.value
})

async function submitScore() {
  if (!selectedSlot.value || !authStore.session?.user?.id) return
  if (!scoreIsValid.value) {
    toast.error(`La nota debe estar entre 0 y ${maxScore.value}`)
    return
  }
  isSubmittingScore.value = true
  try {
    const participantId = selectedSlot.value.participant_id ?? selectedSlot.value.participants?.id
    console.log('[realtime/scores] SEND POST /api/scores (judge)', { round_id: round.value.id, participant_id: participantId, value: scoreForm.value.value })
    const res = await $fetch('/api/scores', {
      method: 'POST',
      headers: { Authorization: `Bearer ${authStore.session.access_token}` },
      body: {
        round_id: round.value.id,
        participant_id: participantId,
        judge_id: authStore.session.user.id,
        value: Number(scoreForm.value.value),
        notes: scoreForm.value.notes.trim() || null,
        promote: scoreForm.value.promote
      }
    }) as any

    // Update local scores list (upsert)
    const idx = myScores.value.findIndex((s: any) => s.participant_id === res.participant_id)
    if (idx >= 0) myScores.value[idx] = res
    else myScores.value.push(res)

    isScoringOpen.value = false
    toast.success('Puntuación guardada correctamente.')
  } catch (err: any) {
    toast.error('Error al guardar: ' + (err.data?.message ?? err.message))
  } finally {
    isSubmittingScore.value = false
  }
}

function slotParticipantId(slot: any): string {
  return slot.participant_id ?? slot.participants?.id ?? ''
}

function getMyScore(slot: any) {
  const pid = slotParticipantId(slot)
  return myScores.value.find((s: any) => s.participant_id === pid) ?? null
}

function hasScored(slot: any) {
  return !!getMyScore(slot)
}

function formatDateTime(date: string | null) {
  if (!date) return null
  return new Date(date).toLocaleString('es-ES', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  })
}

function statusLabel(status: string) {
  const map: Record<string, string> = {
    draft: 'Borrador', active: 'Activo', finished: 'Finalizado', cancelled: 'Cancelado',
    pending: 'Pendiente', closed: 'Cerrado'
  }
  return map[status] ?? status
}

// Participants scored count
const scoredCount = computed(() => allSlots.value.filter((s: any) => hasScored(s)).length)
const totalCount = computed(() => allSlots.value.length)

// ── Ranking view ──────────────────────────────────────────────────────────────
const isRankingRound = computed(() => (round.value as any)?.is_ranking === true)
const rankingData = ref<any>(null)
const rankingLoading = ref(false)
async function loadRanking() {
  if (!category.value?.id || rankingLoading.value) return
  rankingLoading.value = true
  try {
    rankingData.value = await $fetch<any>(`/api/categories/${category.value.id}/ranking`)
  } catch (e) {
    toast.error('Error al cargar el ranking')
  } finally {
    rankingLoading.value = false
  }
}
watch([isRankingRound, category], ([r, c]) => {
  if (r && c?.id && !rankingData.value) loadRanking()
}, { immediate: true })
</script>

<template>
  <div class="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-4xl mx-auto">

    <!-- Error -->
    <div v-if="error" class="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/20 p-4 text-sm text-red-600 dark:text-red-400">
      No se pudo cargar la ronda. Puede que no estés participando en ella.
    </div>

    <!-- Loading skeleton -->
    <div v-else-if="pending && !round" class="space-y-6 animate-pulse">
      <div class="space-y-3">
        <div class="h-8 w-64 bg-muted rounded-md"></div>
        <div class="h-4 w-48 bg-muted rounded-md"></div>
      </div>
      <div class="h-32 bg-muted rounded-xl"></div>
      <div class="h-48 bg-muted rounded-xl"></div>
    </div>

    <template v-if="round && contest">

      <!-- Header -->
      <div class="space-y-3">
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div class="flex items-start gap-3">
            <NuxtLink
              :to="`/my-contests/${contest.slug}/categories/${category?.id}`"
              class="p-1 rounded-md hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors shrink-0 mt-1"
            >
              <ArrowLeft class="w-4 h-4" />
            </NuxtLink>
            <div>
            <div class="flex flex-wrap items-center gap-2">
              <Trophy v-if="isRankingRound" class="w-6 h-6 text-amber-500" />
              <h1 class="text-2xl font-bold tracking-tight">{{ round.name }}</h1>
              <Badge
                v-if="isRankingRound"
                class="text-[10px] font-bold uppercase tracking-widest border-2 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30"
              >Ranking Final</Badge>
              <Badge v-else class="capitalize px-2 py-0.5 font-bold border-2 rounded-md text-xs" :class="getStatusClasses(round.status)">
                {{ statusLabel(round.status) }}
              </Badge>
            </div>
            <p class="text-sm text-muted-foreground mt-0.5">{{ contest.name }} · {{ category?.name }}</p>
            </div>
          </div>
        </div>
      </div>

      <!-- ── Ranking view ───────────────────────────────────────── -->
      <template v-if="isRankingRound">
        <div class="rounded-2xl border-2 border-amber-200 dark:border-amber-800 bg-gradient-to-br from-amber-50/60 to-white dark:from-amber-950/20 dark:to-zinc-950 p-6 shadow-sm">
          <div class="flex items-center gap-4 mb-5">
            <div class="w-11 h-11 rounded-xl bg-amber-500 flex items-center justify-center shadow-sm shrink-0">
              <Trophy class="w-5 h-5 text-white" />
            </div>
            <div>
              <p class="text-[10px] font-bold uppercase tracking-widest text-amber-600 dark:text-amber-400">Clasificación de la Categoría</p>
              <h2 class="text-lg font-bold tracking-tight uppercase">{{ category?.name }}</h2>
            </div>
          </div>

          <div v-if="rankingLoading && !rankingData" class="py-12 text-center text-sm text-muted-foreground">Cargando ranking...</div>
          <div v-else-if="!rankingData?.ranking?.length" class="py-12 text-center text-sm text-muted-foreground">Sin participantes</div>
          <div v-else class="rounded-xl border border-zinc-100 dark:border-zinc-800 overflow-x-auto bg-white dark:bg-zinc-950">
            <table class="w-full">
              <thead class="bg-zinc-50 dark:bg-zinc-900/50">
                <tr>
                  <th class="pl-5 py-3 text-left w-16 text-[10px] font-bold uppercase tracking-widest text-zinc-400">#</th>
                  <th class="py-3 text-left text-[10px] font-bold uppercase tracking-widest text-zinc-400">Participante</th>
                  <th class="py-3 text-center w-24 text-[10px] font-bold uppercase tracking-widest text-zinc-400">Rondas</th>
                  <th v-for="r in rankingData.rounds" :key="r.id" class="py-3 px-3 text-center text-[10px] font-bold uppercase tracking-widest text-zinc-400">{{ r.name }}</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="row in rankingData.ranking"
                  :key="row.participant_id"
                  class="border-t border-zinc-50 dark:border-zinc-900"
                  :class="row.participant_id === myParticipant?.id ? 'bg-emerald-50/70 dark:bg-emerald-950/20' : ''"
                >
                  <td class="pl-5 py-3">
                    <div
                      class="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
                      :class="{
                        'bg-amber-500 text-white': row.rank === 1,
                        'bg-zinc-400 text-white': row.rank === 2,
                        'bg-amber-700 text-white': row.rank === 3,
                        'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300': row.rank > 3,
                      }"
                    >{{ row.rank }}</div>
                  </td>
                  <td class="py-3">
                    <div class="flex items-center gap-2">
                      <span class="text-sm font-semibold text-zinc-800 dark:text-zinc-200 uppercase">{{ row.name }}</span>
                      <Badge
                        v-if="row.participant_id === myParticipant?.id"
                        class="bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800 text-[9px] font-bold border-2"
                      >Tú</Badge>
                    </div>
                  </td>
                  <td class="py-3 text-center text-sm font-mono font-semibold text-zinc-700 dark:text-zinc-300">{{ row.rounds_played }}</td>
                  <td v-for="(pr, idx) in row.per_round" :key="idx" class="py-3 px-3 text-center">
                    <span v-if="pr.avg != null" class="text-sm font-mono font-semibold">{{ pr.avg.toFixed(2) }}</span>
                    <span v-else class="text-xs text-zinc-400">—</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </template>

      <template v-else>

      <!-- Pre-round banner -->
      <div
        v-if="roundIsPending"
        class="rounded-xl border-2 border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-5 flex items-start gap-4"
      >
        <AlertCircle class="w-6 h-6 text-amber-500 shrink-0 mt-0.5" />
        <div>
          <p class="font-bold text-amber-800 dark:text-amber-300">Esta ronda aún no ha comenzado</p>
          <p class="text-sm text-amber-700 dark:text-amber-400 mt-1">
            Aquí verás los participantes y podrás puntuar una vez que el organizador inicie la ronda.
          </p>
        </div>
      </div>

      <!-- Judge progress bar -->
      <div v-if="isJudge && totalCount > 0" class="rounded-xl border border-border bg-card p-5 space-y-3">
        <div class="flex items-center justify-between gap-2">
          <span class="text-sm font-bold flex items-center gap-2">
            <Star class="w-4 h-4 text-amber-500" />
            Tu progreso de puntuación
          </span>
          <span class="text-sm font-bold tabular-nums">{{ scoredCount }} / {{ totalCount }}</span>
        </div>
        <div class="w-full bg-muted rounded-full h-2 overflow-hidden">
          <div
            class="h-2 rounded-full transition-all duration-500"
            :class="scoredCount === totalCount ? 'bg-emerald-500' : 'bg-amber-400'"
            :style="{ width: `${totalCount > 0 ? (scoredCount / totalCount) * 100 : 0}%` }"
          />
        </div>
        <p v-if="scoredCount === totalCount" class="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
          ✓ Has puntuado a todos los participantes de esta ronda.
        </p>
        <p v-else class="text-xs text-muted-foreground">
          {{ totalCount - scoredCount }} participante{{ totalCount - scoredCount !== 1 ? 's' : '' }} pendiente{{ totalCount - scoredCount !== 1 ? 's' : '' }} de puntuar.
        </p>
      </div>

      <!-- My slot card (for participants) -->
      <Card v-if="myParticipant" class="shadow-sm border-2" :class="mySlot ? 'border-emerald-200 dark:border-emerald-800' : 'border-border'">
        <CardHeader class="pb-3">
          <CardTitle class="text-base flex items-center gap-2">
            <User class="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            Mi participación
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div v-if="mySlot" class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div v-if="mySlot.order !== null" class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-950/40 flex items-center justify-center shrink-0">
                <Hash class="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p class="text-xs text-muted-foreground uppercase font-bold tracking-wider">Turno</p>
                <p class="text-2xl font-bold">{{ mySlot.order }}</p>
              </div>
            </div>
            <div v-if="mySlot.scheduled_at" class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-950/40 flex items-center justify-center shrink-0">
                <Clock class="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p class="text-xs text-muted-foreground uppercase font-bold tracking-wider">Horario</p>
                <p class="text-sm font-semibold leading-tight capitalize">{{ formatDateTime(mySlot.scheduled_at) }}</p>
              </div>
            </div>
            <div v-if="mySlot.location" class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-950/40 flex items-center justify-center shrink-0">
                <MapPin class="w-5 h-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <p class="text-xs text-muted-foreground uppercase font-bold tracking-wider">Lugar</p>
                <p class="text-sm font-semibold">{{ mySlot.location }}</p>
              </div>
            </div>
            <div v-if="mySlot.is_qualified !== null" class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                :class="mySlot.is_qualified ? 'bg-emerald-100 dark:bg-emerald-950/40' : 'bg-red-100 dark:bg-red-950/40'">
                <CheckCircle2 v-if="mySlot.is_qualified" class="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                <AlertCircle v-else class="w-5 h-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <p class="text-xs text-muted-foreground uppercase font-bold tracking-wider">Estado</p>
                <p class="text-sm font-bold" :class="mySlot.is_qualified ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'">
                  {{ mySlot.is_qualified ? 'Clasificado a siguiente ronda' : 'Eliminado' }}
                </p>
              </div>
            </div>
          </div>
          <div v-else class="py-4 text-center text-sm text-muted-foreground">
            <Clock class="w-8 h-8 mx-auto mb-2 text-muted-foreground/40" />
            Aún no tienes un turno asignado en esta ronda.
          </div>
        </CardContent>
      </Card>

      <Separator />

      <!-- Participants list -->
      <div class="space-y-4">
        <h2 class="text-lg font-bold tracking-tight flex items-center gap-2">
          <Users class="w-5 h-5 text-zinc-500" />
          Participantes en esta ronda
          <Badge variant="secondary" class="ml-1">{{ allSlots.length }}</Badge>
        </h2>

        <div v-if="allSlots.length" class="rounded-xl border border-border overflow-hidden divide-y divide-border">
          <div
            v-for="(slot, i) in allSlots"
            :key="slot.id"
            class="flex items-center gap-4 px-5 py-4 transition-colors"
            :class="slot.participant_id === myParticipant?.id ? 'bg-emerald-50 dark:bg-emerald-950/20' : 'hover:bg-muted/40'"
          >
            <!-- Order number -->
            <div class="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
              :class="slot.participant_id === myParticipant?.id
                ? 'bg-emerald-600 text-white dark:bg-emerald-500'
                : 'bg-muted text-muted-foreground'"
            >
              {{ slot.order ?? i + 1 }}
            </div>

            <!-- Avatar + Name -->
            <div class="flex items-center gap-3 flex-1 min-w-0">
              <AvatarBubble
                :name="slot.participants?.name || slot.participants?.first_name || '??'"
                :avatar-url="null"
                size="w-9 h-9"
                text-size="text-[10px]"
              />
              <div class="flex flex-col min-w-0">
                <span class="font-semibold text-sm truncate block">
                  {{ slot.participants?.name || `${slot.participants?.first_name} ${slot.participants?.last_name}`.trim() }}
                </span>
                <span v-if="slot.participants?.country" class="text-xs text-muted-foreground">{{ slot.participants.country }}</span>
              </div>
            </div>

            <!-- Judge: my score for this participant -->
            <div v-if="isJudge" class="flex items-center gap-3 ml-auto">
              <div v-if="getMyScore(slot)" class="flex items-center gap-2">
                <!-- Score badge -->
                <div class="flex items-center gap-1 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg px-2.5 py-1">
                  <Star class="w-3.5 h-3.5 text-amber-500 fill-amber-400 shrink-0" />
                  <span class="text-sm font-black tabular-nums text-amber-700 dark:text-amber-300">
                    {{ getMyScore(slot)?.value }}
                  </span>
                  <span class="text-xs text-amber-600/70 dark:text-amber-400/70">/ {{ maxScore }}</span>
                </div>
                <!-- Promote badge -->
                <Badge
                  v-if="getMyScore(slot)?.promote"
                  class="bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800 text-[10px] font-bold border-2 gap-1"
                >
                  <ThumbsUp class="w-3 h-3" />
                  Promocionar
                </Badge>
                <!-- Edit button -->
                <Button
                  v-if="roundIsActive"
                  variant="ghost"
                  size="icon"
                  class="h-7 w-7 text-muted-foreground hover:text-foreground"
                  @click.prevent="openScoring(slot)"
                >
                  <Edit3 class="w-3.5 h-3.5" />
                </Button>
              </div>
              <!-- Score button if not scored yet -->
              <Button
                v-else-if="roundIsActive"
                size="sm"
                @click.prevent="openScoring(slot)"
                class="gap-1.5 text-[11px] h-8 px-3 font-bold uppercase tracking-wider"
              >
                <Edit3 class="w-3.5 h-3.5" />
                Puntuar
              </Button>
              <span v-else class="text-xs text-muted-foreground/60 italic">Sin puntuar</span>
            </div>

            <!-- Participant: me badge + time -->
            <template v-else>
              <Badge
                v-if="slot.participant_id === myParticipant?.id"
                class="bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800 text-[10px] font-bold border-2"
              >
                Tú
              </Badge>
              <span v-if="slot.scheduled_at" class="text-xs text-muted-foreground hidden sm:flex items-center gap-1">
                <Clock class="w-3 h-3" />
                {{ new Date(slot.scheduled_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) }}
              </span>
            </template>

            <!-- Qualified badge (visible to everyone) -->
            <Badge
              v-if="slot.is_qualified !== null"
              class="text-[10px] font-bold border-2 shrink-0"
              :class="slot.is_qualified
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800'
                : 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-800'"
            >
              {{ slot.is_qualified ? 'Clasificado' : 'Eliminado' }}
            </Badge>
          </div>
        </div>
        
        <div v-else class="rounded-xl border-2 border-dashed border-border bg-muted/30 py-8 text-center">
          <p class="text-sm text-muted-foreground">Aún no hay participantes asignados a esta ronda.</p>
        </div>
      </div>
      <div class="flex items-center">
      </div>

      </template>
    </template>

    <!-- ── Scoring Dialog ─────────────────────────────────────── -->
    <Dialog v-model:open="isScoringOpen">
      <DialogContent class="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle class="flex items-center gap-2">
            <Star class="w-5 h-5 text-amber-500" />
            Puntuar a {{ selectedSlot?.participants?.name || `${selectedSlot?.participants?.first_name} ${selectedSlot?.participants?.last_name}`.trim() }}
          </DialogTitle>
          <DialogDescription>
            Categoría <strong>{{ category?.name }}</strong> · {{ round?.name }}
          </DialogDescription>
        </DialogHeader>

        <div class="space-y-5 py-2">

          <!-- Nota -->
          <div class="space-y-2">
            <Label class="text-sm font-bold flex items-center justify-between">
              <span class="flex items-center gap-1.5">
                <Star class="w-4 h-4 text-amber-500" />
                Nota
              </span>
              <span class="text-xs font-normal text-muted-foreground">De 0 a {{ maxScore }}</span>
            </Label>
            <div class="relative">
              <Input
                v-model.number="scoreForm.value"
                type="number"
                min="0"
                :max="maxScore"
                step="0.1"
                placeholder="Ej. 8.5"
                class="text-2xl font-black h-14 text-center pr-16"
                :class="{ 'border-red-400 focus-visible:ring-red-400': scoreForm.value !== '' && !scoreIsValid }"
              />
              <span class="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground font-bold">/ {{ maxScore }}</span>
            </div>
            <p v-if="scoreForm.value !== '' && !scoreIsValid" class="text-xs text-red-500">
              La nota debe estar entre 0 y {{ maxScore }}.
            </p>
          </div>

          <!-- Observaciones -->
          <div class="space-y-2">
            <Label class="text-sm font-bold flex items-center gap-1.5">
              <FileText class="w-4 h-4 text-muted-foreground" />
              Observaciones
              <span class="text-xs font-normal text-muted-foreground ml-1">(opcional)</span>
            </Label>
            <Textarea
              v-model="scoreForm.notes"
              placeholder="Anota aquí tus comentarios sobre la actuación..."
              class="resize-none min-h-[80px]"
              :maxlength="500"
            />
            <p class="text-xs text-muted-foreground text-right">{{ (scoreForm.notes || '').length }}/500</p>
          </div>

          <!-- Promocionar -->
          <div
            class="flex items-start gap-4 rounded-xl border-2 p-4 cursor-pointer transition-all select-none"
            :class="scoreForm.promote
              ? 'border-blue-400 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-600'
              : 'border-border hover:border-blue-300 hover:bg-muted/40'"
            @click="scoreForm.promote = !scoreForm.promote"
          >
            <div
              class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors"
              :class="scoreForm.promote ? 'bg-blue-500 text-white' : 'bg-muted text-muted-foreground'"
            >
              <ThumbsUp class="w-5 h-5" />
            </div>
            <div class="flex-1">
              <p class="font-bold text-sm" :class="scoreForm.promote ? 'text-blue-700 dark:text-blue-300' : ''">
                Promocionar en caso de empate
              </p>
              <p class="text-xs text-muted-foreground mt-0.5">
                Si hay empate en la puntuación, los participantes con más promociones pasan a la siguiente fase.
              </p>
            </div>
            <!-- Toggle visual -->
            <div
              class="w-10 h-6 rounded-full transition-colors shrink-0 mt-1 relative"
              :class="scoreForm.promote ? 'bg-blue-500' : 'bg-muted-foreground/30'"
            >
              <div
                class="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform"
                :class="scoreForm.promote ? 'translate-x-4' : 'translate-x-0.5'"
              />
            </div>
          </div>
        </div>

        <DialogFooter class="gap-2">
          <Button variant="outline" @click="isScoringOpen = false">Cancelar</Button>
          <Button
            :disabled="isSubmittingScore || scoreForm.value === '' || !scoreIsValid"
            @click="submitScore"
            class="gap-2"
          >
            <CheckCircle2 v-if="!isSubmittingScore" class="w-4 h-4" />
            {{ isSubmittingScore ? 'Guardando...' : 'Guardar puntuación' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
