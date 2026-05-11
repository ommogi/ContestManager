<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { 
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger 
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { 
  Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle, DrawerTrigger 
} from '@/components/ui/drawer'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import { Progress } from '@/components/ui/progress'
import {
  NumberField,
  NumberFieldContent,
  NumberFieldDecrement,
  NumberFieldIncrement,
  NumberFieldInput
} from '@/components/ui/number-field'
import {
  ArrowLeft, Users, UserPlus, Search,
  Trash2, Trophy, Settings, Settings2, Layers, Plus, Play, Eye, UserCheck, Activity, Swords, CalendarRange, Medal, Sparkles, Link, ClipboardCheck,
  ChevronLeft, ChevronRight, Check, Pencil, Save, X,
  CheckCircle2, XCircle, AlertCircle
} from 'lucide-vue-next'
import {
  Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious
} from '@/components/ui/carousel'
import { Separator } from '@/components/ui/separator'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { DatePicker } from '@/components/ui/date-picker'
import MotionButton from '@/components/ui/MotionButton.vue'
import type { DateValue } from '@internationalized/date'
import { useContestStore } from '@/stores/contest'
import { storeToRefs } from 'pinia'
import { toast } from 'vue-sonner'
import { getStatusClasses, getTypeClasses } from '@/utils/styles'
import type { JudgePoolMember } from '~~/types'
import JudgePoolTable from '@/components/judge-pool/JudgePoolTable.vue'
import PromotionTable from '@/components/promotion/PromotionTable.vue'
import ParticipantsTable from '@/components/participants/ParticipantsTable.vue'
import JudgesTable from '@/components/judges/JudgesTable.vue'

const route = useRoute()
const router = useRouter()
const contestStore = useContestStore()
const {
  currentContest, categories, participants, rounds, members, judgePool
} = storeToRefs(contestStore)

onMounted(async () => {
  if (!currentContest.value || currentContest.value.slug !== route.params.slug) {
    await contestStore.fetchContest(route.params.slug as string)
  }
  if (currentContest.value?.organization_id) {
    await contestStore.fetchJudgePool(currentContest.value.organization_id)
  }
})

const categoryId = route.params.id as string
const isCreatingRound = ref(false)
const newRoundName = ref('')

const categoryRounds = computed(() => rounds.value.filter(r => r.category_id === categoryId).sort((a, b) => a.order - b.order))
const categoryJudges = computed(() => members.value.filter(m => m.role === 'judge') as any[])
const categoryParticipants = computed(() => participants.value?.filter(p => p.category_id === categoryId) || [])

// Setup Phase Logic (Judges)
const isInvitingJudge = ref(false)
const isJudgePoolOpen = ref(false)
const newJudgeForm = ref({ email: '', full_name: '', specialty: '' })

// Judge Pool Pagination & Search
const judgePoolSearchQuery = ref('')
const judgePoolPage = ref(1)
const judgePoolPerPage = 5

const filteredJudgePool = computed(() => {
  // First, filter out judges who are already in the contest
  const existingMemberEmails = new Set(
    members.value
      ?.map(m => m.email)
      .filter((e): e is string => !!e) || []
  )
  const availablePool = judgePool.value.filter(j => !existingMemberEmails.has(j.email))
  
  if (!judgePoolSearchQuery.value) return availablePool
  
  const q = judgePoolSearchQuery.value.toLowerCase()
  return availablePool.filter(j => 
    j.full_name?.toLowerCase().includes(q) || 
    j.email?.toLowerCase().includes(q) ||
    j.specialty?.toLowerCase().includes(q)
  )
})

const totalPoolPages = computed(() => Math.ceil(filteredJudgePool.value.length / judgePoolPerPage))
const paginatedJudgePool = computed(() => {
  const start = (judgePoolPage.value - 1) * judgePoolPerPage
  return filteredJudgePool.value.slice(start, start + judgePoolPerPage)
})

watch(judgePoolSearchQuery, () => {
  judgePoolPage.value = 1
})

const selectedPoolIds = ref<string[]>([])
const isAddingBulk = ref(false)

const selectedPoolJudgesCount = computed(() => selectedPoolIds.value.length)

const handleBulkAddFromPool = async () => {
  if (selectedPoolIds.value.length === 0 || !currentContest.value?.id) return
  isAddingBulk.value = true
  try {
    const selectedIds = selectedPoolIds.value
    const selectedJudges = judgePool.value.filter(j => selectedIds.includes(j.id))
    
    // Perform bulk insertion
    await Promise.all(selectedJudges.map(judge => 
      $fetch(`/api/contests/${currentContest.value!.id}/members` as any, {
        method: 'POST', body: { 
          email: judge.email, 
          full_name: judge.full_name,
          role: 'judge' 
        }
      })
    ))

    toast.success(`${selectedIds.length} jueces añadidos correctamente`)
    const mems = await ($fetch as any)(`/api/contests/${currentContest.value.id}/members`)
    members.value = mems || []
    isJudgePoolOpen.value = false
    selectedPoolIds.value = []
  } catch (e) {
    toast.error('Error al añadir jueces en lote')
  } finally {
    isAddingBulk.value = false
  }
}

const handleInviteJudge = async () => {
  if (!newJudgeForm.value.email.trim() || !currentContest.value?.id) return
  isInvitingJudge.value = true
  try {
    // invite to contest
    await $fetch(`/api/contests/${currentContest.value.id}/members` as any, {
      method: 'POST', body: { 
        email: newJudgeForm.value.email, 
        full_name: newJudgeForm.value.full_name,
        role: 'judge' 
      }
    })
    
    // Also save to pool if they have a name
    if (newJudgeForm.value.full_name.trim() && currentContest.value.organization_id) {
       await contestStore.saveToJudgePool(currentContest.value.organization_id, {
          email: newJudgeForm.value.email,
          full_name: newJudgeForm.value.full_name,
          specialty: newJudgeForm.value.specialty
       })
    }

    toast.success('Invitación enviada y guardado en el pool')
    newJudgeForm.value = { email: '', full_name: '', specialty: '' }
    const mems = await ($fetch as any)(`/api/contests/${currentContest.value.id}/members`)
    members.value = mems || []
  } catch (e) { toast.error('Error al invitar') } finally { isInvitingJudge.value = false }
}

const handleSelectFromPool = async (judge: JudgePoolMember) => {
  if (!currentContest.value?.id) return
  try {
    await $fetch(`/api/contests/${currentContest.value.id}/members` as any, {
      method: 'POST', body: { 
        email: judge.email, 
        full_name: judge.full_name,
        role: 'judge' 
      }
    })
    toast.success(`${judge.full_name} añadido al concurso`)
    const mems = await ($fetch as any)(`/api/contests/${currentContest.value.id}/members`)
    members.value = mems || []
    isJudgePoolOpen.value = false
  } catch (e) { toast.error('Error al añadir') }
}

// Registration Link logic
const copyRegistrationLink = () => {
  const url = `${window.location.origin}/register/${categoryId}`
  navigator.clipboard.writeText(url)
  toast.success('Enlace de inscripción copiado al portapapeles', {
    description: 'De momento es un enlace de prueba.',
    icon: Link
  })
}

const handleStartCategory = async () => {
  try {
    const data = await contestStore.createRound(categoryId, 'Ronda 1', 1) as any
    if (!data) return
    await $fetch(`/api/rounds/${data.id}/participants/bulk` as any, {
      method: 'POST', body: { participantIds: categoryParticipants.value.map(p => p.id) }
    })
    toast.success('Categoría iniciada')
    router.push(`/contests/${route.params.slug}/categories/${categoryId}/rounds/${data.id}`)
  } catch (e) { toast.error('Error al iniciar') }
}

// Search & Filter
const searchQuery = ref('')
const filteredParticipants = computed(() => {
  if (!searchQuery.value) return categoryParticipants.value
  const q = searchQuery.value.toLowerCase()
  return categoryParticipants.value.filter(p => p.name.toLowerCase().includes(q) || p.dni?.toLowerCase().includes(q))
})

// Participant Modal
const isAddDialogOpen = ref(false)
const isAdding = ref(false)
const newParticipant = ref({ name: '', first_name: '', last_name: '', dni: '', email: '', country: '' })
const birthdateValue = ref<DateValue>()
const handleAddParticipant = async () => {
  if (!newParticipant.value.name.trim()) return
  isAdding.value = true
  try {
    await contestStore.addParticipant({ ...newParticipant.value, birthdate: birthdateValue.value?.toString(), category_id: categoryId })
    toast.success('Inscrito correctamente')
    isAddDialogOpen.value = false
  } catch (e) { toast.error('Error al inscribir') } finally { isAdding.value = false }
}

// Category Config
const isConfigDrawerOpen = ref(false)
const configForm = ref({ name: '', description: '', min_age: null as number|null, max_age: null as number|null })
const category = computed(() => categories.value?.find(c => c.id === categoryId))
watch(category, (v) => { if (v) configForm.value = { name: v.name, description: v.description || '', min_age: v.min_age, max_age: v.max_age } }, { immediate: true })
const handleUpdateCategory = async () => {
  if (!category.value) return
  if (!category.value.name.trim()) {
    toast.error('El nombre es obligatorio')
    return
  }
  try {
    await contestStore.updateCategory(categoryId, {
      name: category.value.name,
      min_age: category.value.min_age,
      max_age: category.value.max_age,
      max_participants: ((category.value as any).max_participants ?? null) || null,
    } as any)
    toast.success('Configuración actualizada')
    isConfigDrawerOpen.value = false
  } catch (e) { toast.error('Error al actualizar') }
}

// Ranking dialog
const isRankingOpen = ref(false)
const rankingData = ref<any>(null)
async function openRankingDialog() {
  try {
    rankingData.value = await $fetch<any>(`/api/categories/${categoryId}/ranking`)
    isRankingOpen.value = true
  } catch (e) { toast.error('Error al cargar ranking') }
}

// Promotion
const handleStartRound = async (id: string) => {
  if (currentContest.value?.status !== 'active') {
    toast.error('El concurso debe estar activo para iniciar la ronda')
    return
  }
  await contestStore.startRound(id)
  toast.success('Ronda iniciada')
}
const handleDeleteRound = async (id: string) => {
  const round = categoryRounds.value.find(r => r.id === id) as any
  const msg = round?.is_ranking
    ? '¿Despublicar ranking? Se reabrirá la categoría y la ronda final volverá a estar activa.'
    : '¿Eliminar la ronda actual? Se perderán todos sus datos (notas, asignaciones). La ronda anterior volverá a estar activa.'
  if (!confirm(msg)) return
  try {
    await contestStore.deleteRound(id)
    toast.success(round?.is_ranking ? 'Ranking despublicado' : 'Ronda eliminada')
  } catch (e: any) {
    toast.error(e?.statusMessage || e?.data?.statusMessage || 'Error al eliminar ronda')
  }
}
const handleCreateRound = async () => {
  if (!newRoundName.value.trim()) return
  try {
    await contestStore.createRound(categoryId, newRoundName.value, categoryRounds.value.length + 1)
    toast.success('Ronda creada')
    isCreatingRound.value = false
  } catch (e) { toast.error('Error') }
}
const handleDeleteParticipant = async (id: string) => {
  try {
    const r: any = await contestStore.deleteParticipant(id)
    toast.success(r?.refunded ? 'Eliminado · 1 ticket reembolsado' : 'Eliminado')
  } catch (e) { toast.error('Error') }
}

// Bulk selection state
const selectedParticipantIds = ref<string[]>([])
const selectedJudgeIds = ref<string[]>([])

const handleBulkDeleteParticipants = async () => {
  const ids = [...selectedParticipantIds.value]
  if (!confirm(`¿Eliminar ${ids.length} participantes?`)) return
  try {
    const results = await Promise.all(ids.map(id => contestStore.deleteParticipant(id)))
    const refunded = results.filter((r: any) => r?.refunded).length
    toast.success(
      refunded > 0
        ? `${ids.length} participantes eliminados · ${refunded} ticket${refunded === 1 ? '' : 's'} reembolsado${refunded === 1 ? '' : 's'}`
        : `${ids.length} participantes eliminados`
    )
  } catch (e) { toast.error('Error al eliminar participantes') }
}

const handleBulkRemoveJudges = async () => {
  const ids = [...selectedJudgeIds.value]
  if (!confirm(`¿Quitar ${ids.length} jurados de la mesa?`)) return
  try {
    await Promise.all(ids.map(id => contestStore.removeMember(id)))
    toast.success(`${ids.length} jurados retirados`)
  } catch (e) { toast.error('Error al retirar jurados') }
}
const handleRemoveJudge = async (memberId: string) => {
  try {
    await contestStore.removeMember(memberId)
    toast.success('Jurado retirado con éxito')
  } catch (e) {
    toast.error('Error al retirar al jurado')
  }
}

const contestSettings = computed(() => {
  const s = currentContest.value?.settings as any
  return {
    mode: s?.mode || 'standard',
    rounds_count: s?.rounds_count || 1
  }
})

function statusLabel(status: string) {
  const map: Record<string, string> = {
    draft: 'Borrador', active: 'Activo', finished: 'Finalizado', cancelled: 'Cancelado',
    pending: 'Pendiente', closed: 'Cerrado'
  }
  return map[status] ?? status
}

function roundStatusIcon(status: string) {
  if (status === 'active') return CheckCircle2
  if (status === 'closed') return XCircle
  return AlertCircle
}

function roundStatusClass(status: string) {
  if (status === 'active') return 'text-emerald-600 dark:text-emerald-400'
  if (status === 'closed') return 'text-zinc-500 dark:text-zinc-400'
  return 'text-amber-500 dark:text-amber-400'
}
</script>

<template>
  <div class="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 mx-auto transition-all">
    <!-- Header -->
    <div class="flex items-start justify-between">
      <div class="flex gap-4">
        <div>
          <div class="flex flex-wrap items-center gap-3">
            <NuxtLink :to="`/contests/${route.params.slug}`" class="p-1 rounded-md hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors shrink-0">
              <ArrowLeft class="w-4 h-4" />
            </NuxtLink>
            <h1 class="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 uppercase">{{ category?.name || 'Cargando...' }}</h1>
            <div v-if="category" class="flex flex-wrap gap-2">
              <Badge
                variant="secondary"
                class="text-[10px] font-bold px-2 py-0.5 border-2 rounded-md"
                :class="getStatusClasses('active')"
              >
                <Users class="w-3 h-3 mr-1" />
                {{ categoryParticipants.length }} Participantes
              </Badge>
              <Badge
                v-if="category.min_age || category.max_age"
                variant="outline"
                class="text-[10px] font-bold px-2 py-0.5 border-2 rounded-md"
              >
                <Activity class="w-3 h-3 mr-1" />
                {{ category.min_age || 0 }}-{{ category.max_age || '∞' }} Años
              </Badge>
            </div>
          </div>
          <p class="text-sm text-muted-foreground mt-1 max-w-2xl leading-relaxed">
            {{ categoryRounds.length === 0 ? 'Fase de Inscripción y Preparación - Configura participantes y mesa de jurado.' : 'Categoría en Curso - Evaluación por Rondas operativas.' }}
          </p>
        </div>
      </div>

      <div class="flex items-center gap-6">
        <!-- Metadatos de la Categoría -->
        <div v-if="category" class="hidden md:flex flex-wrap items-center gap-6 text-[11px] text-zinc-500 uppercase font-bold tracking-tighter">
          <div class="flex items-center gap-1.5 opacity-70 hover:opacity-100 transition-opacity">
            <Layers class="w-3.5 h-3.5" />
            <span>Fases:</span>
            <span class="text-zinc-900 dark:text-zinc-300">{{ categoryRounds.length }} / {{ contestSettings.rounds_count }}</span>
          </div>
          <div class="flex items-center gap-1.5 opacity-70 hover:opacity-100 transition-opacity">
            <Trophy class="w-3.5 h-3.5" />
            <span>Estado:</span>
            <span class="text-zinc-900 dark:text-zinc-300">{{ categoryRounds.length === 0 ? 'INSCRIPCIÓN' : 'EJECUCIÓN' }}</span>
          </div>
        </div>

        <Button 
          variant="outline" 
          size="sm"
          class="gap-2 bg-zinc-50 text-zinc-700 border-zinc-200 dark:bg-zinc-950/50 dark:text-zinc-400 dark:border-zinc-500/30 hover:bg-zinc-100 dark:hover:bg-zinc-900 font-bold border-2 rounded-md transition-all uppercase tracking-tighter text-[10px]"
          @click="isConfigDrawerOpen = true"
        >
          <Settings2 class="w-4 h-4" /> Configuración
        </Button>

      </div>
    </div>

    <!-- PHASE 1: SETUP -->
    <div v-if="categoryRounds.length === 0" class="space-y-8 animate-in fade-in slide-in-from-top-10 duration-700">
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
        <!-- Participants Table (Left: 7/12) -->
        <div class="lg:col-span-7 flex flex-col">
          <div class="mb-4 flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div class="w-8 h-8 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
                <UserPlus class="w-4 h-4 text-zinc-500" />
              </div>
              <h3 class="font-bold uppercase tracking-tighter text-sm">Listado de Participantes</h3>
            </div>
            <div class="flex items-center gap-2">
              <Transition
                enter-active-class="transition-all duration-200 ease-out"
                enter-from-class="opacity-0 scale-95"
                leave-active-class="transition-all duration-150 ease-in"
                leave-to-class="opacity-0 scale-95"
              >
                <Button
                  v-if="selectedParticipantIds.length > 0"
                  size="sm"
                  variant="destructive"
                  class="h-8 font-bold uppercase text-[9px] tracking-widest px-3 gap-1.5"
                  @click="handleBulkDeleteParticipants"
                >
                  <Trash2 class="w-3.5 h-3.5" /> Eliminar {{ selectedParticipantIds.length }}
                </Button>
              </Transition>
              <Button size="sm" variant="outline" class="h-8 border-2 font-bold uppercase text-[9px] tracking-widest px-3" @click="isAddDialogOpen = true">
                <Plus class="w-3.5 h-3.5 mr-1" /> Nuevo
              </Button>
            </div>
          </div>

          <Card class="overflow-hidden border-2 border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-950/50 shadow-sm flex flex-col rounded-2xl">
            <ParticipantsTable
              :data="categoryParticipants"
              flush
              @update:selection="selectedParticipantIds = $event"
              @delete="handleDeleteParticipant"
            />
          </Card>
        </div>

        <!-- Judges Table (Right: 5/12) -->
        <div class="lg:col-span-5 flex flex-col">
          <div class="mb-4 flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div class="w-8 h-8 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
                <Medal class="w-4 h-4 text-zinc-500" />
              </div>
              <h3 class="font-bold uppercase tracking-tighter text-sm">Mesa de Jurado</h3>
            </div>
            <div class="flex items-center gap-2">
              <Transition
                enter-active-class="transition-all duration-200 ease-out"
                enter-from-class="opacity-0 scale-95"
                leave-active-class="transition-all duration-150 ease-in"
                leave-to-class="opacity-0 scale-95"
              >
                <Button
                  v-if="selectedJudgeIds.length > 0"
                  size="sm"
                  variant="destructive"
                  class="h-8 font-bold uppercase text-[9px] tracking-widest px-3 gap-1.5"
                  @click="handleBulkRemoveJudges"
                >
                  <Trash2 class="w-3.5 h-3.5" /> Quitar {{ selectedJudgeIds.length }}
                </Button>
              </Transition>
              <Dialog v-model:open="isJudgePoolOpen">
                <DialogTrigger as-child>
                  <Button variant="ghost" size="sm" class="h-8 font-extrabold uppercase text-[9px] tracking-widest px-3 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30">
                    <Users class="w-3.5 h-3.5 mr-1" /> Pool
                  </Button>
                </DialogTrigger>
                <DialogContent class="max-w-2xl bg-white dark:bg-zinc-950 border-2 border-zinc-200 dark:border-zinc-800 rounded-3xl p-0 overflow-hidden shadow-2xl">
                  <DialogHeader class="p-8 border-b-2 border-zinc-50 dark:border-zinc-900 bg-zinc-50/50 dark:bg-zinc-900/50 text-left">
                    <div class="flex items-center justify-between gap-6">
                      <div>
                        <DialogTitle class="text-xl font-bold uppercase tracking-tight">Pool de Jueces</DialogTitle>
                        <DialogDescription class="text-[10px] text-zinc-400 font-bold uppercase tracking-widest mt-1">Reutiliza jueces de concursos anteriores de la organización</DialogDescription>
                      </div>
                    </div>
                  </DialogHeader>
                  <div class="overflow-hidden">
                    <JudgePoolTable
                      :data="filteredJudgePool"
                      flush
                      @update:selection="selectedPoolIds = $event"
                    />
                  </div>
                  <DialogFooter class="p-8 border-t-2 border-zinc-50 dark:border-zinc-900 bg-zinc-50/50 dark:bg-zinc-900/50">
                    <Button
                      variant="default"
                      size="sm"
                      class="w-full h-12 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-black uppercase text-xs tracking-[0.2em] shadow-xl rounded-2xl flex items-center justify-center gap-3 disabled:opacity-30 disabled:cursor-not-allowed transition-all active:scale-95"
                      :disabled="isAddingBulk || selectedPoolIds.length === 0"
                      @click="handleBulkAddFromPool"
                    >
                      <Plus v-if="!isAddingBulk" class="w-5 h-5" />
                      <Activity v-else class="w-5 h-5 animate-spin" />
                      {{ selectedPoolIds.length > 0 ? `Añadir ${selectedPoolIds.length} seleccionados` : 'Seleccionar jueces' }}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              <Dialog>
                <DialogTrigger as-child>
                  <Button size="sm" class="h-8 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-bold uppercase text-[9px] tracking-widest px-3">
                    <Plus class="w-3.5 h-3.5 mr-1" /> Invitar
                  </Button>
                </DialogTrigger>
                <DialogContent class="bg-white dark:bg-zinc-950 rounded-2xl border-2 dark:border-zinc-800">
                  <DialogHeader>
                    <DialogTitle>Invitar Juez</DialogTitle>
                    <DialogDescription>Añade un juez directamente a este concurso.</DialogDescription>
                  </DialogHeader>
                  <div class="space-y-4 py-4">
                    <div class="space-y-2">
                      <Label class="text-xs font-bold uppercase tracking-widest">Nombre completo</Label>
                      <Input v-model="newJudgeForm.full_name" placeholder="Ej. Juan Pérez" />
                    </div>
                    <div class="space-y-2">
                      <Label class="text-xs font-bold uppercase tracking-widest">Email</Label>
                      <Input v-model="newJudgeForm.email" placeholder="email@ejemplo.com" />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button
                      class="w-full bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-bold uppercase tracking-widest text-[10px]"
                      :disabled="isInvitingJudge || !newJudgeForm.email"
                      @click="handleInviteJudge"
                    >
                      Enviar Invitación
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          <Card class="overflow-hidden border-2 border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-950/50 shadow-sm flex flex-col rounded-2xl">
            <JudgesTable
              :data="categoryJudges"
              flush
              @update:selection="selectedJudgeIds = $event"
              @delete="handleRemoveJudge"
            />
          </Card>
        </div>
      </div>

      <div class="flex flex-col items-center justify-center pt-16 border-t-2 border-dashed border-zinc-100 dark:border-zinc-800 gap-3">
        <MotionButton
          label="Iniciar"
          :disabled="categoryParticipants.length < 1 || categoryJudges.length < 1 || currentContest.value?.status !== 'active'"
          @click="handleStartCategory"
          class="shadow-2xl hover:scale-105 transition-all"
        />
        <p v-if="currentContest.value?.status !== 'active'" class="text-xs text-amber-600 dark:text-amber-400 font-medium text-center">
          Activa el concurso para poder iniciar la categoría.
        </p>
      </div>
    </div>

    <!-- PHASE 2: EXECUTION -->
    <div v-else class="space-y-10 animate-in fade-in slide-in-from-right-10 duration-700">
      <!-- Rounds List -->
      <div class="py-12 space-y-12">
        <div class="space-y-4">
          <h2 class="text-xl font-bold tracking-tight flex items-center gap-2 mb-6">
            <Layers class="w-5 h-5 text-zinc-500" />
            Rondas de Evaluación
          </h2>

          <div v-if="categoryRounds.length" class="space-y-3">
            <div
              v-for="round in categoryRounds"
              :key="round.id"
              @click="router.push(`/contests/${route.params.slug}/categories/${categoryId}/rounds/${round.id}`)"
              class="block"
            >
              <Card
                class="group transition-all cursor-pointer shadow-sm"
                :class="(round as any).is_ranking ? 'border-2 border-amber-300 dark:border-amber-700 bg-gradient-to-r from-amber-50/60 to-white dark:from-amber-950/20 dark:to-zinc-950 hover:border-amber-400' : 'hover:border-emerald-400'"
              >
                <CardContent class="p-5">
                  <div class="flex items-center gap-4">
                    <!-- Status icon -->
                    <div class="shrink-0">
                      <Trophy v-if="(round as any).is_ranking" class="w-5 h-5 text-amber-500" />
                      <component
                        v-else
                        :is="roundStatusIcon(round.status)"
                        class="w-5 h-5"
                        :class="roundStatusClass(round.status)"
                      />
                    </div>

                    <!-- Round info -->
                    <div class="flex-1 min-w-0">
                      <div class="flex flex-wrap items-center gap-2">
                        <span class="font-bold text-base">{{ round.name }}</span>
                        <Badge
                          v-if="(round as any).is_ranking && (round as any).is_published"
                          variant="outline"
                          class="text-[10px] font-bold uppercase tracking-widest border-2 border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30"
                        >
                          Ranking Publicado
                        </Badge>
                        <Badge
                          v-else-if="(round as any).is_ranking"
                          variant="outline"
                          class="text-[10px] font-bold uppercase tracking-widest border-2 border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-900/30"
                        >
                          Borrador
                        </Badge>
                        <Badge
                          v-else
                          variant="outline"
                          class="text-[10px] font-bold uppercase tracking-widest border-2"
                          :class="getStatusClasses(round.status)"
                        >
                          {{ statusLabel(round.status) }}
                        </Badge>
                      </div>

                      <!-- Round details -->
                      <div class="flex flex-wrap items-center gap-4 mt-3 text-sm text-muted-foreground">
                        <div class="flex items-center gap-1.5">
                          <Trophy class="w-3.5 h-3.5" />
                          <span>Etapa {{ round.order }}</span>
                        </div>
                        
                        <div v-if="categoryJudges.length > 0" class="flex items-center gap-2">
                          <div class="flex -space-x-1.5">
                            <div
                              v-for="j in categoryJudges.slice(0, 3)"
                              :key="j.id"
                              class="w-6 h-6 rounded-full bg-zinc-200 dark:bg-zinc-800 border-2 border-white dark:border-zinc-950 flex items-center justify-center text-[9px] font-bold text-zinc-700 dark:text-zinc-300 shadow-sm relative z-10"
                              :title="(j as any).profile?.full_name || (j as any).email"
                            >
                              {{ ((j as any).profile?.full_name || (j as any).email || 'J').substring(0,2).toUpperCase() }}
                            </div>
                            <div
                              v-if="categoryJudges.length > 3"
                              class="w-6 h-6 rounded-full bg-zinc-100 dark:bg-zinc-900 border-2 border-white dark:border-zinc-950 flex items-center justify-center text-[9px] font-bold text-zinc-500 relative z-0"
                            >
                              +{{ categoryJudges.length - 3 }}
                            </div>
                          </div>
                          <span class="text-[11px] font-bold uppercase tracking-widest">{{ categoryJudges.length }} Jurados</span>
                        </div>
                        <div v-else class="flex items-center gap-1.5 text-amber-600 dark:text-amber-500">
                          <AlertCircle class="w-3.5 h-3.5" />
                          <span class="text-[10px] font-bold uppercase tracking-widest">Sin jurados</span>
                        </div>
                      </div>
                    </div>

                    <!-- Actions -->
                    <div class="flex items-center gap-2 shrink-0" @click.stop>
                      <Button
                        v-if="round.status === 'pending'"
                        size="sm"
                        class="h-8 px-3 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-bold uppercase text-[9px] tracking-widest gap-1.5 hover:bg-zinc-700 dark:hover:bg-zinc-300"
                        :disabled="currentContest.value?.status !== 'active'"
                        :title="currentContest.value?.status !== 'active' ? 'El concurso debe estar activo' : ''"
                        @click="handleStartRound(round.id)"
                      >
                        <Play class="w-3 h-3 fill-current" /> Iniciar
                      </Button>
                      <Button
                        v-if="round.id === categoryRounds[categoryRounds.length - 1]?.id"
                        size="sm"
                        variant="ghost"
                        class="h-8 w-8 p-0 text-zinc-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                        title="Eliminar ronda actual"
                        @click="handleDeleteRound(round.id)"
                      >
                        <Trash2 class="w-3.5 h-3.5" />
                      </Button>
                    </div>
                    <ChevronRight class="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
          
          <!-- No rounds yet -->
          <div v-else class="rounded-xl border-2 border-dashed border-border bg-muted/30 py-8 text-center">
            <p class="text-sm text-muted-foreground">No hay rondas creadas en esta categoría aún.</p>
          </div>
        </div>
      </div>
    </div>

    <!-- DIALOGS -->

    <!-- Ranking dialog -->
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
          <div v-if="!rankingData" class="py-12 text-center text-sm text-zinc-500">Cargando...</div>
          <div v-else-if="!rankingData.ranking?.length" class="py-12 text-center text-sm text-zinc-500">Sin participantes</div>
          <div v-else class="rounded-xl border border-zinc-100 dark:border-zinc-800 overflow-hidden">
            <table class="w-full">
              <thead class="bg-zinc-50 dark:bg-zinc-900/50">
                <tr>
                  <th class="pl-5 py-3 text-left w-16 text-[10px] font-bold uppercase tracking-widest text-zinc-400">#</th>
                  <th class="py-3 text-left text-[10px] font-bold uppercase tracking-widest text-zinc-400">Participante</th>
                  <th class="py-3 text-center w-24 text-[10px] font-bold uppercase tracking-widest text-zinc-400">Rondas</th>
                  <th v-for="r in rankingData.rounds" :key="r.id" class="py-3 text-center text-[10px] font-bold uppercase tracking-widest text-zinc-400">{{ r.name }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in rankingData.ranking" :key="row.participant_id" class="border-t border-zinc-50 dark:border-zinc-900">
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
                  <td class="py-3"><span class="text-sm font-semibold text-zinc-800 dark:text-zinc-200 uppercase">{{ row.name }}</span></td>
                  <td class="py-3 text-center text-sm font-mono font-semibold text-zinc-700 dark:text-zinc-300">{{ row.rounds_played }}</td>
                  <td v-for="(pr, idx) in row.per_round" :key="idx" class="py-3 text-center">
                    <span v-if="pr.avg != null" class="text-sm font-mono font-semibold">{{ pr.avg.toFixed(2) }}</span>
                    <span v-else class="text-xs text-zinc-400">—</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </DialogContent>
    </Dialog>


    <!-- Add Participant Modal: Standard Aesthetic -->
    <Dialog v-model:open="isAddDialogOpen">
      <DialogContent class="max-w-lg rounded-2xl p-0 overflow-hidden shadow-2xl bg-white dark:bg-zinc-950 border-2 border-zinc-200 dark:border-zinc-800 animate-in zoom-in-95 duration-300">
        <DialogHeader class="p-6 border-b-2 border-zinc-50 dark:border-zinc-900 bg-zinc-50/50 dark:bg-zinc-900/50 text-left">
          <div class="flex items-center gap-4">
            <div class="w-10 h-10 bg-zinc-900 dark:bg-zinc-100 rounded-xl flex items-center justify-center shrink-0 shadow-lg">
              <UserPlus class="w-5 h-5 text-white dark:text-zinc-900"/>
            </div>
            <div>
              <DialogTitle class="text-xl font-bold uppercase tracking-tight">Inscribir Participante</DialogTitle>
              <DialogDescription class="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">Registro directo en la categoría actual</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div class="p-6 space-y-6">
          <div class="grid gap-2">
            <Label class="text-[10px] font-bold uppercase text-zinc-400 tracking-widest px-1">Nombre Completo / Alias</Label>
            <Input 
              v-model="newParticipant.name" 
              placeholder="Ej. Alexander von Humboldt" 
              class="rounded-md h-11 bg-zinc-50 dark:bg-zinc-900/50 border-2 border-zinc-100 dark:border-zinc-800 font-bold px-4 transition-all focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-100"
            />
          </div>

          <div class="grid grid-cols-2 gap-6">
            <div class="grid gap-2">
              <Label class="text-[10px] font-bold uppercase text-zinc-400 tracking-widest px-1">Documento ID</Label>
              <Input 
                v-model="newParticipant.dni" 
                placeholder="00000000X" 
                class="rounded-md h-10 bg-zinc-50 dark:bg-zinc-900/50 border-2 border-zinc-100 dark:border-zinc-800 px-4 font-medium"
              />
            </div>

            <div class="grid gap-2">
              <Label class="text-[10px] font-bold uppercase text-zinc-400 tracking-widest px-1">Fecha Nacimiento</Label>
              <DatePicker v-model="birthdateValue" class="w-full" />
            </div>

            <div class="grid gap-2">
              <Label class="text-[10px] font-bold uppercase text-zinc-400 tracking-widest px-1">Email</Label>
              <Input 
                v-model="newParticipant.email" 
                placeholder="email@ejemplo.com" 
                class="rounded-md h-10 bg-zinc-50 dark:bg-zinc-900/50 border-2 border-zinc-100 dark:border-zinc-800 px-4 font-medium"
              />
            </div>

            <div class="grid gap-2">
              <Label class="text-[10px] font-bold uppercase text-zinc-400 tracking-widest px-1">Procedencia</Label>
              <Input 
                v-model="newParticipant.country" 
                placeholder="Ej. Madrid / Club ABC" 
                class="rounded-md h-10 bg-zinc-50 dark:bg-zinc-900/50 border-2 border-zinc-100 dark:border-zinc-800 px-4 font-medium"
              />
            </div>
          </div>
        </div>

        <DialogFooter class="p-4 border-t-2 border-zinc-50 dark:border-zinc-900 bg-zinc-50/30 dark:bg-zinc-900/30 gap-3 flex-row justify-end">
          <Button 
            variant="ghost" 
            size="sm"
            class="rounded-md font-bold h-9 px-4 uppercase text-[9px] tracking-widest" 
            @click="isAddDialogOpen = false"
          >
            Cancelar
          </Button>
          <Button 
            size="sm"
            class="bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-md px-6 h-9 font-bold shadow-md border-2 border-transparent active:scale-95 uppercase text-[9px] tracking-widest transition-all" 
            :disabled="isAdding || !newParticipant.name" 
            @click="handleAddParticipant"
          >
            {{ isAdding ? 'Inscribiendo...' : 'Confirmar Registro' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Drawer v-model:open="isConfigDrawerOpen" :snap-points="[0.7]">
      <DrawerContent v-if="category" class="bg-white dark:bg-zinc-950 border-t-2 border-zinc-100 dark:border-zinc-800">
        <div class="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6 sm:py-8">
          <DrawerHeader>
            <DrawerTitle>Configuración de Categoría</DrawerTitle>
            <DrawerDescription>Ajusta el nombre y restricciones de edad para los participantes.</DrawerDescription>
          </DrawerHeader>

          <div class="overflow-y-auto p-4 sm:p-6 space-y-6">
            <div class="grid gap-3">
              <Label class="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-zinc-400">
                <Medal class="w-3.5 h-3.5" /> Nombre de la Categoría
              </Label>
              <Input 
                v-model="category.name" 
                class="h-12 rounded-xl border-2 border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/40 font-medium px-4 focus-visible:ring-zinc-900 dark:focus-visible:ring-zinc-100 transition-colors"
                placeholder="Ej: Juvenil A"
              />
            </div>
            
            <div class="grid grid-cols-2 gap-6">
              <div class="grid gap-3">
                <Label class="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-zinc-400">
                  <Activity class="w-3.5 h-3.5" /> Edad Mínima
                </Label>
                <NumberField 
                  :model-value="category.min_age ?? 0" 
                  :min="0"
                  :max="100"
                  @update:model-value="category.min_age = $event"
                >
                  <NumberFieldContent>
                    <NumberFieldDecrement />
                    <NumberFieldInput class="h-12 border-2 rounded-xl bg-zinc-50/50 dark:bg-zinc-900/40 font-medium px-4" />
                    <NumberFieldIncrement />
                  </NumberFieldContent>
                </NumberField>
              </div>
              <div class="grid gap-3">
                <Label class="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-zinc-400">
                  <Activity class="w-3.5 h-3.5" /> Edad Máxima
                </Label>
                <NumberField
                  :model-value="category.max_age ?? 0"
                  :min="0"
                  :max="100"
                  @update:model-value="category.max_age = $event"
                >
                  <NumberFieldContent>
                    <NumberFieldDecrement />
                    <NumberFieldInput class="h-12 border-2 rounded-xl bg-zinc-50/50 dark:bg-zinc-900/40 font-medium px-4" />
                    <NumberFieldIncrement />
                  </NumberFieldContent>
                </NumberField>
              </div>
            </div>

            <div class="grid gap-3">
              <Label class="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-zinc-400">
                <Users class="w-3.5 h-3.5" /> Cupo Máximo (0 = ilimitado)
              </Label>
              <NumberField
                :model-value="(category as any).max_participants ?? 0"
                :min="0"
                :max="9999"
                @update:model-value="(category as any).max_participants = $event || null"
              >
                <NumberFieldContent>
                  <NumberFieldDecrement />
                  <NumberFieldInput class="h-12 border-2 rounded-xl bg-zinc-50/50 dark:bg-zinc-900/40 font-medium px-4" />
                  <NumberFieldIncrement />
                </NumberFieldContent>
              </NumberField>
            </div>
          </div>
          
          <DrawerFooter class="pt-6 border-t-2 border-zinc-100 dark:border-zinc-800 flex-row justify-end gap-4 px-6 pb-8">
            <Button variant="ghost" class="rounded-xl h-12 px-8 font-bold uppercase text-[11px] tracking-widest" @click="isConfigDrawerOpen = false">Descartar</Button>
            <Button 
              class="bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-xl h-12 px-12 font-bold shadow-lg border-2 border-transparent active:scale-95 uppercase text-[11px] tracking-widest hover:scale-[1.02] transition-all" 
              @click="handleUpdateCategory"
            >
              Guardar Cambios
            </Button>
          </DrawerFooter>
        </div>
      </DrawerContent>
    </Drawer>
  </div>
</template>
