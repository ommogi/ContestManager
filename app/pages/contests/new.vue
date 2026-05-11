<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  ArrowLeft, ArrowRight, Music, Calendar as CalendarIcon, Loader2,
  Plus, Trash2, Users, Check, Search, CheckCircle2, ChevronRight, ChevronLeft,
} from 'lucide-vue-next'
import AvatarBubble from '@/components/ui/avatar/AvatarBubble.vue'
import RichEditor from '@/components/ui/rich-editor/RichEditor.vue'
import { apiClient } from '@/api/apiClient'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Checkbox } from '@/components/ui/checkbox'
import { RangeCalendar } from '@/components/ui/range-calendar'
import { DateFormatter, getLocalTimeZone } from '@internationalized/date'
import type { DateRange } from 'reka-ui'
import { toast } from 'vue-sonner'
import { useContestStore } from '@/stores/contest'
import { useJudgePoolStore } from '@/stores/judge-pool'

const contestStore = useContestStore()
const judgePoolStore = useJudgePoolStore()
const router = useRouter()

const df = new DateFormatter('es-ES', { dateStyle: 'medium' })

// ── Step tracking ────────────────────────────────────────────────────────────
// 1 = info, 2 = description, 3 = reglamento, 4 = categories
const step = ref(1)

// ── Form data ────────────────────────────────────────────────────────────────
const isCreating = ref(false)
const formData = ref({ name: '', short_description: '', rules: '' })
const dateRange = ref({ start: undefined, end: undefined }) as Ref<DateRange>

const isStep1Valid = computed(() =>
  formData.value.name.trim() !== '' &&
  !!dateRange.value.start &&
  !!dateRange.value.end
)

const createdContest = ref<{ id: string; slug: string } | null>(null)

// Move from step 1 → 2 (no API call yet)
function nextFromInfo() {
  if (!isStep1Valid.value) return
  step.value = 2
}

// Move from step 3 → 4: create contest with all collected data
async function finishContentAndCreate() {
  if (!isStep1Valid.value || isCreating.value) return
  isCreating.value = true
  try {
    const data = await contestStore.createContest({
      name: formData.value.name.trim(),
      short_description: formData.value.short_description || '',
      prizes: '',
      rules: formData.value.rules || '',
      is_rounds_dynamic: true,
      mode: 'standard',
      starts_at: dateRange.value.start?.toString(),
      ends_at: dateRange.value.end?.toString(),
    })
    createdContest.value = { id: data.id, slug: data.slug }
    toast.success('¡Concurso creado!')
    step.value = 4
    loadJudgePool()
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || 'Error al crear el concurso')
  } finally {
    isCreating.value = false
  }
}

// ── Step 4 – Categories ──────────────────────────────────────────────────────
interface CategoryEntry { id: string; name: string; judges: JudgeEntry[] }
interface JudgeEntry { memberId: string; poolId: string; name: string; email: string }

const categories = ref<CategoryEntry[]>([])
const categoryInput = ref('')
const isAddingCategory = ref(false)

async function addCategory() {
  const name = categoryInput.value.trim()
  if (!name || !createdContest.value || isAddingCategory.value) return
  isAddingCategory.value = true
  try {
    const data = await ($fetch as any)(`/api/contests/${createdContest.value.id}/categories`, {
      method: 'POST', body: { name },
    })
    const cat: CategoryEntry = { id: data.id, name: data.name, judges: [] }
    categories.value.push(cat)
    categoryInput.value = ''
    pendingCategoryId.value = cat.id
    judgePickerOpen.value = true
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || 'Error al crear la categoría')
  } finally {
    isAddingCategory.value = false
  }
}

async function removeCategory(catId: string) {
  try {
    await apiClient(`/api/categories/${catId}`, { method: 'DELETE' })
    categories.value = categories.value.filter(c => c.id !== catId)
    toast.success('Categoría eliminada')
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || 'Error al eliminar la categoría')
  }
}

// ── Judge Pool ───────────────────────────────────────────────────────────────
const { items: judgePool, isFetching: isLoadingPool } = storeToRefs(judgePoolStore)

async function loadJudgePool() {
  await judgePoolStore.fetchPool()
}

// ── Judge Picker Dialog ──────────────────────────────────────────────────────
const judgePickerOpen = ref(false)
const pendingCategoryId = ref<string | null>(null)
const selectedJudgePoolIds = ref<Set<string>>(new Set())
const judgeSearch = ref('')
const isSavingJudges = ref(false)
const judgePickerPage = ref(1)
const JUDGE_PAGE_SIZE = 6

const initialJudgePoolIds = ref<Set<string>>(new Set())

watch(judgePickerOpen, (open) => {
  if (open) {
    const cat = categories.value.find(c => c.id === pendingCategoryId.value)
    const preset = new Set<string>(cat ? cat.judges.map(j => j.poolId) : [])
    selectedJudgePoolIds.value = new Set(preset)
    initialJudgePoolIds.value = preset
  } else {
    selectedJudgePoolIds.value = new Set()
    initialJudgePoolIds.value = new Set()
    judgeSearch.value = ''
    judgePickerPage.value = 1
    pendingCategoryId.value = null
  }
})

watch(judgeSearch, () => { judgePickerPage.value = 1 })

const filteredPool = computed(() => {
  if (!judgeSearch.value) return judgePool.value
  const q = judgeSearch.value.toLowerCase()
  return judgePool.value.filter(j =>
    j.full_name?.toLowerCase().includes(q) ||
    j.email?.toLowerCase().includes(q) ||
    j.specialty?.toLowerCase().includes(q)
  )
})

const judgePickerPageCount = computed(() =>
  Math.max(1, Math.ceil(filteredPool.value.length / JUDGE_PAGE_SIZE))
)

const paginatedPool = computed(() => {
  const start = (judgePickerPage.value - 1) * JUDGE_PAGE_SIZE
  return filteredPool.value.slice(start, start + JUDGE_PAGE_SIZE)
})

const judgesToAddCount = computed(() => {
  let n = 0
  for (const id of selectedJudgePoolIds.value) {
    if (!initialJudgePoolIds.value.has(id)) n++
  }
  return n
})
const judgesToRemoveCount = computed(() => {
  let n = 0
  for (const id of initialJudgePoolIds.value) {
    if (!selectedJudgePoolIds.value.has(id)) n++
  }
  return n
})
const judgesDiffCount = computed(() => judgesToAddCount.value + judgesToRemoveCount.value)

watch(judgePickerPageCount, (count) => {
  if (judgePickerPage.value > count) judgePickerPage.value = count
})

function toggleJudge(judge: PoolJudge) {
  const s = new Set(selectedJudgePoolIds.value)
  if (s.has(judge.id)) s.delete(judge.id)
  else s.add(judge.id)
  selectedJudgePoolIds.value = s
}

const addedPoolIds = computed(() => {
  const ids = new Set<string>()
  for (const cat of categories.value) {
    for (const j of cat.judges) ids.add(j.poolId)
  }
  return ids
})

async function confirmJudges() {
  if (!createdContest.value || isSavingJudges.value) return
  const catId = pendingCategoryId.value
  if (!catId) { judgePickerOpen.value = false; return }
  const cat = categories.value.find(c => c.id === catId)
  if (!cat) { judgePickerOpen.value = false; return }

  const toAdd = judgePool.value.filter(j =>
    selectedJudgePoolIds.value.has(j.id) && !initialJudgePoolIds.value.has(j.id)
  )
  const toRemove = cat.judges.filter(j =>
    initialJudgePoolIds.value.has(j.poolId) && !selectedJudgePoolIds.value.has(j.poolId)
  )

  if (!toAdd.length && !toRemove.length) { judgePickerOpen.value = false; return }

  isSavingJudges.value = true
  try {
    const contestId = createdContest.value!.id

    const [addResults] = await Promise.all([
      toAdd.length
        ? Promise.all(toAdd.map(j =>
            ($fetch as any)(`/api/contests/${contestId}/members`, {
              method: 'POST',
              body: { email: j.email, full_name: j.full_name, role: 'judge' },
            })
          ))
        : Promise.resolve([] as any[]),
      toRemove.length
        ? Promise.all(toRemove.map(j =>
            ($fetch as any)(`/api/contests/${contestId}/members/${j.memberId}`, { method: 'DELETE' })
          ))
        : Promise.resolve([]),
    ])

    if (toRemove.length) {
      const removedPoolIds = new Set(toRemove.map(j => j.poolId))
      cat.judges = cat.judges.filter(j => !removedPoolIds.has(j.poolId))
    }
    for (let i = 0; i < toAdd.length; i++) {
      cat.judges.push({
        memberId: (addResults as any[])[i].id,
        poolId: toAdd[i].id,
        name: toAdd[i].full_name,
        email: toAdd[i].email,
      })
    }

    const parts: string[] = []
    if (toAdd.length) parts.push(`${toAdd.length} añadido(s)`)
    if (toRemove.length) parts.push(`${toRemove.length} quitado(s)`)
    toast.success(`Jurados: ${parts.join(', ')}`)
    judgePickerOpen.value = false
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || 'Error al guardar jurados')
  } finally {
    isSavingJudges.value = false
  }
}

function skipJudges() {
  judgePickerOpen.value = false
}

function finish() {
  if (createdContest.value?.slug) navigateTo(`/contests/${createdContest.value.slug}`)
  else navigateTo('/contests')
}

// ── Stepper config ────────────────────────────────────────────────────────────
const steps = [
  { label: 'Información', sub: 'Nombre y fechas' },
  { label: 'Descripción', sub: 'Texto de presentación' },
  { label: 'Reglamento', sub: 'Normas del concurso' },
  { label: 'Categorías', sub: 'Disciplinas y jurados' },
]
// progress width as % of container (track: left-[12.5%] → right-[12.5%] = 75% wide)
const progressWidth = computed(() => `${(step.value - 1) * 25}%`)
</script>

<template>
  <div class="max-w-5xl mx-auto py-12 px-4 space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">

    <!-- Header -->
    <div class="flex items-start justify-between gap-4">
      <div>
        <h1 class="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">Nuevo concurso</h1>
        <p class="text-sm text-zinc-500 dark:text-zinc-400 mt-1">Configura los datos básicos y añade categorías.</p>
      </div>
      <button
        type="button"
        class="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
        @click="router.back()"
      >
        <ArrowLeft class="w-4 h-4" />
        Volver
      </button>
    </div>

    <!-- 4-step progress stepper -->
    <div class="relative">
      <!-- Track -->
      <div class="absolute top-5 left-[12.5%] right-[12.5%] h-px bg-zinc-200 dark:bg-zinc-800" />
      <!-- Progress fill -->
      <div
        class="absolute top-5 left-[12.5%] h-px bg-zinc-900 dark:bg-zinc-100 transition-all duration-500"
        :style="{ width: progressWidth }"
      />
      <ol class="relative grid grid-cols-4 gap-2">
        <li
          v-for="(s, i) in steps"
          :key="i"
          class="flex flex-col items-center gap-2"
        >
          <div
            class="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all border-2"
            :class="step > i + 1
              ? 'bg-emerald-500 text-white border-emerald-500 shadow-md shadow-emerald-500/20'
              : step === i + 1
                ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 border-zinc-900 dark:border-zinc-100 shadow-md shadow-zinc-900/20 dark:shadow-zinc-100/10'
                : 'bg-white dark:bg-zinc-950 text-zinc-400 border-zinc-200 dark:border-zinc-800'"
          >
            <CheckCircle2 v-if="step > i + 1" class="w-5 h-5" />
            <span v-else>{{ i + 1 }}</span>
          </div>
          <div class="text-center">
            <p
              class="text-xs font-semibold leading-tight"
              :class="step >= i + 1 ? 'text-zinc-900 dark:text-zinc-100' : 'text-zinc-400'"
            >{{ s.label }}</p>
            <p class="text-[10px] text-zinc-400 mt-0.5 hidden sm:block">{{ s.sub }}</p>
          </div>
        </li>
      </ol>
    </div>

    <!-- ── STEP 1: Contest Info ──────────────────────────────────────────────── -->
    <div v-if="step === 1" class="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 overflow-hidden shadow-sm">

      <div class="px-8 pt-7 pb-5 border-b border-zinc-100 dark:border-zinc-900">
        <h2 class="text-base font-bold text-zinc-900 dark:text-zinc-100">Datos del concurso</h2>
        <p class="text-xs text-zinc-500 mt-0.5">Nombre y duración del concurso.</p>
      </div>

      <form class="px-8 py-7" @submit.prevent="nextFromInfo">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-7">
          <!-- Name -->
          <div class="space-y-1.5">
            <Label for="name" class="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Nombre del concurso <span class="text-red-500">*</span>
            </Label>
            <Input
              id="name"
              v-model="formData.name"
              placeholder="Ej. Concurso Internacional de Piano 2026"
              class="h-11 border-zinc-200 dark:border-zinc-800 rounded-lg focus-visible:ring-zinc-900 dark:focus-visible:ring-zinc-100"
              autofocus
            />
          </div>

          <!-- Dates -->
          <div class="space-y-1.5">
            <Label class="text-sm font-medium text-zinc-700 dark:text-zinc-300 flex items-center gap-2">
              <CalendarIcon class="w-4 h-4 text-zinc-400" />
              Fechas del concurso <span class="text-red-500">*</span>
            </Label>
            <div v-if="dateRange.start && dateRange.end" class="flex items-center justify-between text-sm text-zinc-600 dark:text-zinc-400 px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-100 dark:border-zinc-800">
              <span class="font-medium">{{ df.format(dateRange.start.toDate(getLocalTimeZone())) }} — {{ df.format(dateRange.end.toDate(getLocalTimeZone())) }}</span>
              <button type="button" class="text-xs text-zinc-400 hover:text-red-500 transition-colors" @click="dateRange = { start: undefined, end: undefined }">
                Borrar
              </button>
            </div>
            <div class="p-4 bg-zinc-50/50 dark:bg-zinc-900/30 rounded-xl border border-zinc-100 dark:border-zinc-900 flex justify-center overflow-hidden">
              <RangeCalendar
                v-model="dateRange"
                :number-of-months="1"
                @update:start-value="(startDate) => dateRange.start = startDate"
              />
            </div>
          </div>
        </div>
      </form>

      <div class="px-8 py-5 border-t border-zinc-100 dark:border-zinc-900 bg-zinc-50/40 dark:bg-zinc-900/20 flex items-center justify-between gap-3">
        <Button type="button" variant="ghost" class="h-10 px-4 text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100" @click="router.back()">
          Cancelar
        </Button>
        <Button
          type="button"
          :disabled="!isStep1Valid"
          class="h-10 px-5 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-white text-sm font-semibold rounded-lg shadow-sm disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
          @click="nextFromInfo"
        >
          <span>Siguiente</span>
          <ArrowRight class="w-4 h-4" />
        </Button>
      </div>
    </div>

    <!-- ── STEP 2: Description ────────────────────────────────────────────────── -->
    <div v-if="step === 2" class="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 overflow-hidden shadow-sm">

      <div class="px-8 pt-7 pb-5 border-b border-zinc-100 dark:border-zinc-900">
        <h2 class="text-base font-bold text-zinc-900 dark:text-zinc-100">Descripción</h2>
        <p class="text-xs text-zinc-500 mt-0.5">Presentación del concurso visible en la página pública. <span class="text-zinc-400">Opcional.</span></p>
      </div>

      <div class="px-8 py-7">
        <RichEditor
          v-model="formData.short_description"
          placeholder="Presenta el concurso: de qué trata, a quién va dirigido, qué hace especial esta edición..."
          min-height="280px"
        />
      </div>

      <div class="px-8 py-5 border-t border-zinc-100 dark:border-zinc-900 bg-zinc-50/40 dark:bg-zinc-900/20 flex items-center justify-between gap-3">
        <Button type="button" variant="ghost" class="h-10 px-4 text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 flex items-center gap-2" @click="step = 1">
          <ArrowLeft class="w-4 h-4" />
          Atrás
        </Button>
        <Button
          type="button"
          class="h-10 px-5 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-white text-sm font-semibold rounded-lg shadow-sm flex items-center gap-2"
          @click="step = 3"
        >
          <span>Siguiente</span>
          <ArrowRight class="w-4 h-4" />
        </Button>
      </div>
    </div>

    <!-- ── STEP 3: Reglamento ─────────────────────────────────────────────────── -->
    <div v-if="step === 3" class="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 overflow-hidden shadow-sm">

      <div class="px-8 pt-7 pb-5 border-b border-zinc-100 dark:border-zinc-900">
        <h2 class="text-base font-bold text-zinc-900 dark:text-zinc-100">Reglamento</h2>
        <p class="text-xs text-zinc-500 mt-0.5">Normas de participación, requisitos de obras, criterios de evaluación. <span class="text-zinc-400">Opcional.</span></p>
      </div>

      <div class="px-8 py-7">
        <RichEditor
          v-model="formData.rules"
          placeholder="Redacta las normas: requisitos de participación, formato de obras, criterios de puntuación..."
          min-height="280px"
        />
      </div>

      <div class="px-8 py-5 border-t border-zinc-100 dark:border-zinc-900 bg-zinc-50/40 dark:bg-zinc-900/20 flex items-center justify-between gap-3">
        <Button type="button" variant="ghost" class="h-10 px-4 text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 flex items-center gap-2" @click="step = 2">
          <ArrowLeft class="w-4 h-4" />
          Atrás
        </Button>
        <Button
          type="button"
          :disabled="isCreating"
          class="h-10 px-5 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-white text-sm font-semibold rounded-lg shadow-sm disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
          @click="finishContentAndCreate"
        >
          <Loader2 v-if="isCreating" class="w-4 h-4 animate-spin" />
          <span>{{ isCreating ? 'Creando…' : 'Siguiente' }}</span>
          <ArrowRight v-if="!isCreating" class="w-4 h-4" />
        </Button>
      </div>
    </div>

    <!-- ── STEP 4: Categories ────────────────────────────────────────────────── -->
    <div v-if="step === 4" class="space-y-5">

      <!-- Contest created banner -->
      <div class="rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/40 px-4 py-3 flex items-center gap-3">
        <CheckCircle2 class="w-5 h-5 text-emerald-500 shrink-0" />
        <div class="flex-1 min-w-0">
          <p class="text-sm font-semibold text-emerald-800 dark:text-emerald-200 truncate">Concurso «{{ formData.name }}» creado</p>
          <p class="text-xs text-emerald-700/80 dark:text-emerald-400/80">Añade las categorías (piano, canto, violín…)</p>
        </div>
      </div>

      <!-- Add category card -->
      <div class="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 overflow-hidden shadow-sm">
        <div class="px-8 pt-7 pb-5 border-b border-zinc-100 dark:border-zinc-900">
          <h2 class="text-base font-bold text-zinc-900 dark:text-zinc-100">Categorías</h2>
          <p class="text-xs text-zinc-500 mt-0.5">Crea las disciplinas y asigna jurados a cada una.</p>
        </div>

        <div class="px-8 py-7 space-y-5">
          <div class="flex gap-2">
            <Input
              v-model="categoryInput"
              placeholder="Nombre de la categoría (ej. Piano Junior)"
              class="h-11 border-zinc-200 dark:border-zinc-800 rounded-lg flex-1 focus-visible:ring-zinc-900 dark:focus-visible:ring-zinc-100"
              @keydown.enter.prevent="addCategory"
            />
            <Button
              :disabled="!categoryInput.trim() || isAddingCategory"
              class="h-11 px-5 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-white text-sm font-semibold rounded-lg shadow-sm disabled:opacity-40 flex items-center gap-1.5"
              @click="addCategory"
            >
              <Loader2 v-if="isAddingCategory" class="w-4 h-4 animate-spin" />
              <Plus v-else class="w-4 h-4" />
              Añadir
            </Button>
          </div>

          <div v-if="categories.length" class="space-y-2">
            <div
              v-for="cat in categories"
              :key="cat.id"
              class="rounded-xl border border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 px-4 py-3"
            >
              <div class="flex items-start justify-between gap-3">
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-bold text-zinc-900 dark:text-zinc-100">{{ cat.name }}</p>
                  <div v-if="cat.judges.length" class="flex flex-wrap gap-1.5 mt-2">
                    <Badge
                      v-for="j in cat.judges"
                      :key="j.memberId"
                      class="text-[9px] font-bold uppercase tracking-widest bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-700 px-2"
                    >
                      {{ j.name }}
                    </Badge>
                  </div>
                  <p v-else class="text-xs text-zinc-400 mt-1">Sin jurados asignados</p>
                </div>
                <div class="flex items-center gap-1.5 shrink-0">
                  <Button
                    size="sm"
                    variant="ghost"
                    class="h-7 px-2.5 text-[9px] font-bold uppercase tracking-widest text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950/30"
                    @click="pendingCategoryId = cat.id; judgePickerOpen = true"
                  >
                    <Users class="w-3 h-3 mr-1" />
                    Jurados
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    class="h-7 w-7 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20"
                    @click="removeCategory(cat.id)"
                  >
                    <Trash2 class="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <div v-else class="rounded-xl border border-dashed border-zinc-200 dark:border-zinc-700 p-6 text-center">
            <Music class="w-8 h-8 text-zinc-300 dark:text-zinc-600 mx-auto mb-2" />
            <p class="text-sm text-zinc-400">Añade tu primera categoría arriba</p>
          </div>
        </div>

        <div class="px-8 py-5 border-t border-zinc-100 dark:border-zinc-900 bg-zinc-50/40 dark:bg-zinc-900/20 flex items-center justify-between gap-3">
          <p class="text-xs text-zinc-500">Puedes añadir más categorías desde el panel del concurso.</p>
          <Button
            class="h-10 px-5 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-white text-sm font-semibold rounded-lg shadow-sm flex items-center gap-2"
            @click="finish"
          >
            {{ categories.length ? 'Ir al concurso' : 'Omitir y finalizar' }}
            <ArrowRight class="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>

  </div>

  <!-- ── Judge Picker Dialog ──────────────────────────────────────────────── -->
  <Dialog v-model:open="judgePickerOpen">
    <DialogContent class="max-w-lg rounded-2xl p-0 border border-zinc-200 dark:border-zinc-800 shadow-xl bg-white dark:bg-zinc-950">
      <DialogHeader class="p-5 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50">
        <p class="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-0.5">Pool de Jurados</p>
        <DialogTitle class="text-base font-bold text-zinc-900 dark:text-zinc-100">¿Quieres añadir jurados a esta categoría?</DialogTitle>
      </DialogHeader>

      <div class="p-5 space-y-4">
        <div class="relative">
          <Search class="absolute left-3 top-2.5 w-4 h-4 text-zinc-400" />
          <Input v-model="judgeSearch" placeholder="Buscar jurado..." class="pl-9 h-9 border-zinc-200 dark:border-zinc-700 text-sm" />
        </div>

        <div v-if="isLoadingPool" class="flex items-center justify-center py-8">
          <Loader2 class="w-6 h-6 animate-spin text-zinc-400" />
        </div>

        <div v-else class="min-h-[336px] rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden">
          <div v-if="!filteredPool.length" class="text-center py-12 text-sm text-zinc-400">
            No se encontraron jurados en el pool
          </div>
          <Table v-else>
            <TableHeader>
              <TableRow class="hover:bg-transparent border-b-zinc-200 dark:border-b-zinc-800">
                <TableHead class="w-10"></TableHead>
                <TableHead class="text-[10px] font-bold uppercase tracking-widest">Jurado</TableHead>
                <TableHead class="w-20 text-right text-[10px] font-bold uppercase tracking-widest pr-4"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow
                v-for="j in paginatedPool"
                :key="j.id"
                class="cursor-pointer transition-colors"
                :class="selectedJudgePoolIds.has(j.id) ? 'bg-zinc-50 dark:bg-zinc-900/40' : ''"
                @click="toggleJudge(j)"
              >
                <TableCell class="w-10 pl-3">
                  <Checkbox
                    :model-value="selectedJudgePoolIds.has(j.id)"
                    @click.stop="toggleJudge(j)"
                  />
                </TableCell>
                <TableCell>
                  <div class="flex items-center gap-3">
                    <AvatarBubble
                      :name="j.full_name || '??'"
                      :avatar-url="(j as any).avatar_url ?? null"
                      size="w-9 h-9"
                      text-size="text-[10px]"
                    />
                    <div class="flex-1 min-w-0">
                      <p class="text-sm font-semibold truncate">{{ j.full_name }}</p>
                      <p class="text-[11px] truncate text-zinc-500 dark:text-zinc-400">{{ j.email }}</p>
                    </div>
                  </div>
                </TableCell>
                <TableCell class="text-right pr-4">
                  <span
                    v-if="initialJudgePoolIds.has(j.id) && selectedJudgePoolIds.has(j.id)"
                    class="text-[9px] font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-400"
                  >Añadido</span>
                  <span
                    v-else-if="initialJudgePoolIds.has(j.id) && !selectedJudgePoolIds.has(j.id)"
                    class="text-[9px] font-bold uppercase tracking-widest text-red-600 dark:text-red-400"
                  >Quitar</span>
                  <span
                    v-else-if="!initialJudgePoolIds.has(j.id) && selectedJudgePoolIds.has(j.id)"
                    class="text-[9px] font-bold uppercase tracking-widest text-blue-600 dark:text-blue-400"
                  >Nuevo</span>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>

        <div v-if="filteredPool.length > JUDGE_PAGE_SIZE" class="flex items-center justify-between pt-1">
          <p class="text-[11px] text-zinc-500 tabular-nums">
            Página {{ judgePickerPage }} de {{ judgePickerPageCount }} · {{ filteredPool.length }} jurado(s)
          </p>
          <div class="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              class="h-7 w-7 border-zinc-200 dark:border-zinc-700"
              :disabled="judgePickerPage <= 1"
              @click="judgePickerPage--"
            >
              <ChevronLeft class="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              class="h-7 w-7 border-zinc-200 dark:border-zinc-700"
              :disabled="judgePickerPage >= judgePickerPageCount"
              @click="judgePickerPage++"
            >
              <ChevronRight class="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        <p v-if="judgesDiffCount > 0" class="text-xs font-bold text-zinc-500 text-center">
          <span v-if="judgesToAddCount" class="text-blue-600 dark:text-blue-400">+{{ judgesToAddCount }}</span>
          <span v-if="judgesToAddCount && judgesToRemoveCount"> · </span>
          <span v-if="judgesToRemoveCount" class="text-red-600 dark:text-red-400">-{{ judgesToRemoveCount }}</span>
        </p>
      </div>

      <DialogFooter class="p-4 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/30 flex gap-2 justify-end">
        <Button variant="ghost" class="h-9 px-4 font-bold uppercase text-[10px] tracking-widest" @click="skipJudges">
          Omitir
        </Button>
        <Button
          class="h-9 px-5 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-bold uppercase text-[10px] tracking-widest rounded-lg disabled:opacity-40 flex items-center gap-2"
          :disabled="judgesDiffCount === 0 || isSavingJudges"
          @click="confirmJudges"
        >
          <Loader2 v-if="isSavingJudges" class="w-3.5 h-3.5 animate-spin" />
          Confirmar ({{ judgesDiffCount }})
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
