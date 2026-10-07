<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { VOTING_SYSTEMS, type VotingSystem } from '~~/shared/voting'
import type { JudgePoolMember } from '~~/types'
import { storeToRefs } from 'pinia'
import { useMediaQuery } from '@vueuse/core'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  ArrowLeft, ArrowRight, Calendar as CalendarIcon, Loader2, Plus, Trash2, Users,
  Check, Search, ChevronRight, ChevronLeft, Hash, ThumbsUp, Info, Music, X,
} from 'lucide-vue-next'
import AvatarBubble from '@/components/ui/avatar/AvatarBubble.vue'
import NumberStepper from '@/components/common/NumberStepper.vue'
import RichEditor from '@/components/ui/rich-editor/RichEditor.vue'
import { apiClient } from '@/api/apiClient'
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

const df = new DateFormatter('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })
const isDesktop = useMediaQuery('(min-width: 768px)')

// ── Steps ────────────────────────────────────────────────────────────────────
// Nothing is saved until «Crear concurso» on the last step, so every step can
// be revisited freely.
const steps = [
  { label: 'Datos básicos', sub: 'Nombre, fechas y votación' },
  { label: 'Presentación', sub: 'Descripción y reglamento' },
  { label: 'Categorías y jurado', sub: 'Disciplinas y evaluadores' },
]
const step = ref(1)
const maxReached = ref(1)
const currentStep = computed(() => steps[step.value - 1]!)

// ── Form data ────────────────────────────────────────────────────────────────
// KAN-23: the jury's interface follows the voting system, so it is chosen up front.
const formData = ref({ name: '', short_description: '', rules: '', voting_system: 'numeric' as VotingSystem })
const dateRange = ref({ start: undefined, end: undefined }) as Ref<DateRange>
const dateOpen = ref(false)

const dateLabel = computed(() => {
  const { start, end } = dateRange.value
  if (!start) return ''
  const from = df.format(start.toDate(getLocalTimeZone()))
  return end ? `${from} — ${df.format(end.toDate(getLocalTimeZone()))}` : `${from} — …`
})

function onRangeUpdate(range: DateRange) {
  dateRange.value = range
  if (range.start && range.end) dateOpen.value = false
}

const isStep1Valid = computed(() =>
  formData.value.name.trim() !== '' &&
  !!dateRange.value.start &&
  !!dateRange.value.end
)

function isStepValid(n: number) {
  return n === 1 ? isStep1Valid.value : true
}

function canGoTo(n: number) {
  if (n <= maxReached.value) return n === 1 || isStep1Valid.value
  return n === step.value + 1 && isStepValid(step.value)
}

function goTo(n: number) {
  if (!canGoTo(n)) return
  step.value = n
  maxReached.value = Math.max(maxReached.value, n)
}

function next() {
  if (step.value < steps.length) goTo(step.value + 1)
}

function back() {
  if (step.value > 1) step.value--
  else router.back()
}

// ── Step 2 – Presentation ────────────────────────────────────────────────────
const contentTab = ref<'description' | 'rules'>('description')
function hasText(html: string) {
  return html.replace(/<[^>]*>/g, '').trim() !== ''
}

// ── Step 3 – Categories (kept locally until creation) ────────────────────────
interface CategoryDraft { key: string; name: string; min_age: number | null; max_age: number | null; max_participants: number | null }

const categories = ref<CategoryDraft[]>([])
const categoryName = ref('')
const categoryMinAge = ref<number>()
const categoryMaxAge = ref<number>()
const categoryMaxParticipants = ref<number>()

function num(v: number | undefined): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

const categoryAgeError = computed(() => {
  const min = num(categoryMinAge.value), max = num(categoryMaxAge.value)
  return min != null && max != null && min > max
})

function addCategory() {
  const name = categoryName.value.trim()
  if (!name || categoryAgeError.value) return
  if (categories.value.some(c => c.name.toLowerCase() === name.toLowerCase())) {
    toast.error('Ya hay una categoría con ese nombre')
    return
  }
  categories.value.push({
    key: crypto.randomUUID(),
    name,
    min_age: num(categoryMinAge.value),
    max_age: num(categoryMaxAge.value),
    max_participants: num(categoryMaxParticipants.value),
  })
  categoryName.value = ''
  categoryMinAge.value = undefined
  categoryMaxAge.value = undefined
  categoryMaxParticipants.value = undefined
}

function removeCategory(key: string) {
  categories.value = categories.value.filter(c => c.key !== key)
}

function ageLabel(c: CategoryDraft) {
  if (c.min_age == null && c.max_age == null) return 'Todas las edades'
  if (c.min_age != null && c.max_age != null) return `${c.min_age}–${c.max_age} años`
  return c.min_age != null ? `Desde ${c.min_age} años` : `Hasta ${c.max_age} años`
}

// ── Step 3 – Contest jury (picked from the pool, kept locally) ───────────────
// The jury belongs to the whole contest, not to a category.
const { items: judgePool, isFetching: isLoadingPool } = storeToRefs(judgePoolStore)
const selectedJudges = ref<JudgePoolMember[]>([])

watch(step, (s) => { if (s === 3) judgePoolStore.fetchPool() }, { immediate: true })

const judgePickerOpen = ref(false)
const pickerSelection = ref<Set<string>>(new Set())
const judgeSearch = ref('')
const judgePickerPage = ref(1)
const JUDGE_PAGE_SIZE = 6

watch(judgePickerOpen, (open) => {
  if (open) {
    pickerSelection.value = new Set(selectedJudges.value.map(j => j.id))
  } else {
    judgeSearch.value = ''
    judgePickerPage.value = 1
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
const judgePickerPageCount = computed(() => Math.max(1, Math.ceil(filteredPool.value.length / JUDGE_PAGE_SIZE)))
const paginatedPool = computed(() => {
  const start = (judgePickerPage.value - 1) * JUDGE_PAGE_SIZE
  return filteredPool.value.slice(start, start + JUDGE_PAGE_SIZE)
})
watch(judgePickerPageCount, (count) => {
  if (judgePickerPage.value > count) judgePickerPage.value = count
})

function toggleJudge(id: string) {
  const s = new Set(pickerSelection.value)
  if (s.has(id)) s.delete(id)
  else s.add(id)
  pickerSelection.value = s
}

function confirmJudges() {
  selectedJudges.value = judgePool.value.filter(j => pickerSelection.value.has(j.id))
  judgePickerOpen.value = false
}

function removeJudge(id: string) {
  selectedJudges.value = selectedJudges.value.filter(j => j.id !== id)
}

// ── Create ───────────────────────────────────────────────────────────────────
const isCreating = ref(false)
const created = ref(false)

async function createContest() {
  if (!isStep1Valid.value || isCreating.value) return
  isCreating.value = true
  let slug: string | null = null
  try {
    const contest = await contestStore.createContest({
      name: formData.value.name.trim(),
      short_description: formData.value.short_description || '',
      prizes: '',
      rules: formData.value.rules || '',
      is_rounds_dynamic: true,
      mode: 'standard',
      starts_at: dateRange.value.start?.toString(),
      ends_at: dateRange.value.end?.toString(),
      voting_system: formData.value.voting_system,
    })
    slug = contest.slug
    created.value = true

    const failures: string[] = []

    // Sequential, so the categories keep the order they were added in.
    for (const c of categories.value) {
      const body: Record<string, any> = { name: c.name }
      if (c.min_age != null) body.min_age = c.min_age
      if (c.max_age != null) body.max_age = c.max_age
      if (c.max_participants != null) body.max_participants = c.max_participants
      try {
        await (apiClient as any)(`/api/contests/${contest.id}/categories`, { method: 'POST', body })
      } catch {
        failures.push(`categoría «${c.name}»`)
      }
    }

    const judgeResults = await Promise.allSettled(selectedJudges.value.map(j =>
      (apiClient as any)(`/api/contests/${contest.id}/members`, {
        method: 'POST',
        body: { email: j.email, full_name: j.full_name, role: 'judge' },
      })
    ))
    judgeResults.forEach((r, i) => {
      if (r.status === 'rejected') failures.push(`jurado ${selectedJudges.value[i]!.full_name || selectedJudges.value[i]!.email}`)
    })

    if (failures.length) {
      toast.warning('Concurso creado con incidencias', {
        description: `No se pudo añadir: ${failures.join(', ')}. Complétalo desde el panel del concurso.`,
      })
    } else {
      toast.success('¡Concurso creado!')
    }
    await navigateTo(`/contests/${slug}`)
  } catch (e: any) {
    if (slug) {
      await navigateTo(`/contests/${slug}`)
    } else {
      toast.error(e?.data?.statusMessage || 'Error al crear el concurso')
    }
  } finally {
    isCreating.value = false
  }
}

// ── Leave guard ──────────────────────────────────────────────────────────────
const isDirty = computed(() =>
  formData.value.name.trim() !== '' ||
  !!dateRange.value.start ||
  hasText(formData.value.short_description) ||
  hasText(formData.value.rules) ||
  categories.value.length > 0 ||
  selectedJudges.value.length > 0
)

onBeforeRouteLeave(() => {
  if (created.value || !isDirty.value) return true
  return window.confirm('¿Salir sin crear el concurso? Se perderán los datos introducidos.')
})
</script>

<template>
  <!-- Same spacing as /contests: the layout's padding only. pb-24 leaves room for the pinned footer on phones. -->
  <div class="max-w-7xl pb-24 md:pb-0">

    <!-- Header -->
    <div class="space-y-1 mb-8">
      <h1 class="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">Nuevo concurso</h1>
      <p class="text-muted-foreground">Nada se guarda hasta que pulses «Crear concurso».</p>
    </div>

    <!-- Mobile progress -->
    <div class="lg:hidden mb-4">
      <div class="flex items-baseline justify-between text-sm">
        <p class="font-semibold text-zinc-900 dark:text-zinc-100">{{ currentStep.label }}</p>
        <p class="text-xs text-zinc-500 tabular-nums">Paso {{ step }} de {{ steps.length }}</p>
      </div>
      <div class="mt-2 h-1 rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
        <div
          class="h-full bg-zinc-900 dark:bg-zinc-100 transition-all duration-300"
          :style="{ width: `${(step / steps.length) * 100}%` }"
        />
      </div>
    </div>

    <div class="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)] items-start">

      <!-- Desktop stepper -->
      <nav aria-label="Pasos" class="hidden lg:block sticky top-6">
        <ol>
          <li v-for="(s, i) in steps" :key="i" class="relative pb-6 last:pb-0">
            <div
              v-if="i < steps.length - 1"
              class="absolute left-4 top-9 -bottom-1 w-px -translate-x-1/2"
              :class="step > i + 1 ? 'bg-zinc-900 dark:bg-zinc-100' : 'bg-zinc-200 dark:bg-zinc-800'"
            />
            <button
              type="button"
              class="relative flex items-start gap-3 text-left w-full rounded-lg disabled:cursor-not-allowed group"
              :disabled="!canGoTo(i + 1) && step !== i + 1"
              :aria-current="step === i + 1 ? 'step' : undefined"
              @click="goTo(i + 1)"
            >
              <span
                class="w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-sm font-semibold border transition-colors"
                :class="step === i + 1
                  ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 border-zinc-900 dark:border-zinc-100'
                  : step > i + 1 || maxReached > i + 1
                    ? 'bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 border-zinc-900 dark:border-zinc-100'
                    : 'bg-white dark:bg-zinc-950 text-zinc-400 border-zinc-200 dark:border-zinc-800'"
              >
                <Check v-if="step > i + 1" class="w-4 h-4" />
                <span v-else>{{ i + 1 }}</span>
              </span>
              <span class="pt-1 min-w-0">
                <span
                  class="block text-sm font-semibold leading-tight"
                  :class="step >= i + 1 || maxReached > i ? 'text-zinc-900 dark:text-zinc-100 group-hover:underline group-disabled:no-underline' : 'text-zinc-400'"
                >{{ s.label }}</span>
                <span class="block text-xs text-zinc-500 mt-0.5">{{ s.sub }}</span>
              </span>
            </button>
          </li>
        </ol>
      </nav>

      <!-- Step card -->
      <div class="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 shadow-sm">

        <!-- ── STEP 1: Basic data ─────────────────────────────────────────── -->
        <form v-if="step === 1" class="p-4 sm:p-6 flex flex-col gap-6" @submit.prevent="next">
          <div class="hidden lg:block">
            <h2 class="text-base font-semibold text-zinc-900 dark:text-zinc-100">Datos básicos</h2>
            <p class="text-sm text-zinc-500 mt-0.5">Cómo se llama, cuándo se celebra y cómo puntúa el jurado.</p>
          </div>

          <div class="grid gap-6 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <div class="space-y-1.5">
              <Label for="name" class="text-sm font-medium">
                Nombre del concurso <span class="text-red-500">*</span>
              </Label>
              <Input
                id="name"
                v-model="formData.name"
                placeholder="Ej. Concurso Internacional de Piano 2026"
                class="h-11"
                autofocus
              />
            </div>

            <div class="space-y-1.5">
              <Label class="text-sm font-medium">
                Fechas del concurso <span class="text-red-500">*</span>
              </Label>
              <Popover v-model:open="dateOpen">
                <PopoverTrigger as-child>
                  <Button
                    type="button"
                    variant="outline"
                    class="w-full h-11 justify-start font-normal"
                    :class="!dateRange.start && 'text-muted-foreground'"
                  >
                    <CalendarIcon class="w-4 h-4 mr-2 shrink-0" />
                    <span class="truncate">{{ dateLabel || 'Selecciona el inicio y el fin' }}</span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent class="w-auto max-w-[calc(100vw-2rem)] p-0" align="end">
                  <RangeCalendar
                    :model-value="dateRange"
                    :number-of-months="isDesktop ? 2 : 1"
                    locale="es-ES"
                    :week-starts-on="1"
                    @update:model-value="onRangeUpdate"
                    @update:start-value="(startDate) => dateRange.start = startDate"
                  />
                </PopoverContent>
              </Popover>
              <p class="text-xs text-zinc-500">La edad de los participantes se calcula a la fecha de inicio.</p>
            </div>
          </div>

          <fieldset class="space-y-2">
            <legend class="text-sm font-medium text-zinc-900 dark:text-zinc-100 mb-2">Sistema de votación</legend>
            <div class="grid sm:grid-cols-2 gap-3" role="radiogroup" aria-label="Sistema de votación">
              <button
                v-for="system in VOTING_SYSTEMS"
                :key="system.id"
                type="button"
                role="radio"
                :aria-checked="formData.voting_system === system.id"
                class="relative flex items-start gap-3 text-left p-4 rounded-xl border transition-colors"
                :class="formData.voting_system === system.id
                  ? 'border-zinc-900 dark:border-zinc-100 ring-1 ring-zinc-900 dark:ring-zinc-100 bg-zinc-50 dark:bg-zinc-900'
                  : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-600'"
                @click="formData.voting_system = system.id"
              >
                <span class="w-9 h-9 shrink-0 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
                  <Hash v-if="system.id === 'numeric'" class="w-4 h-4 text-zinc-700 dark:text-zinc-300" />
                  <ThumbsUp v-else class="w-4 h-4 text-zinc-700 dark:text-zinc-300" />
                </span>
                <span class="min-w-0 pr-5">
                  <span class="block text-sm font-semibold text-zinc-900 dark:text-zinc-100">{{ system.label }}</span>
                  <span class="block text-xs text-zinc-500 mt-0.5">{{ system.description }}</span>
                </span>
                <Check
                  v-if="formData.voting_system === system.id"
                  class="absolute top-3 right-3 w-4 h-4 text-zinc-900 dark:text-zinc-100"
                />
              </button>
            </div>
            <p class="flex items-center gap-1.5 text-xs text-zinc-500">
              <Info class="w-3.5 h-3.5 shrink-0" />
              No se puede cambiar una vez el jurado haya puntuado.
            </p>
          </fieldset>
          <button type="submit" class="hidden" />
        </form>

        <!-- ── STEP 2: Presentation ───────────────────────────────────────── -->
        <div v-else-if="step === 2" class="p-4 sm:p-6 flex flex-col gap-4">
          <div class="hidden lg:block">
            <h2 class="text-base font-semibold text-zinc-900 dark:text-zinc-100">Presentación</h2>
            <p class="text-sm text-zinc-500 mt-0.5">Lo que leerán los participantes al inscribirse. Opcional: puedes completarlo más tarde.</p>
          </div>
          <p class="lg:hidden text-sm text-zinc-500">Lo que leerán los participantes al inscribirse. Opcional.</p>

          <Tabs v-model="contentTab">
            <TabsList class="w-full sm:w-auto grid grid-cols-2 sm:inline-grid">
              <TabsTrigger value="description" class="gap-1.5">
                Descripción
                <span v-if="hasText(formData.short_description)" class="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />
              </TabsTrigger>
              <TabsTrigger value="rules">
                Reglamento
                <span v-if="hasText(formData.rules)" class="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />
              </TabsTrigger>
            </TabsList>
            <TabsContent value="description" class="mt-4">
              <RichEditor
                v-model="formData.short_description"
                placeholder="Presenta el concurso: de qué trata, a quién va dirigido, premios, lugar..."
                min-height="240px"
              />
            </TabsContent>
            <TabsContent value="rules" class="mt-4">
              <RichEditor
                v-model="formData.rules"
                placeholder="Normas de participación, requisitos de obras, criterios de evaluación..."
                min-height="240px"
              />
              <p class="text-xs text-zinc-500 mt-2">Los participantes deberán aceptar el reglamento al inscribirse.</p>
            </TabsContent>
          </Tabs>
        </div>

        <!-- ── STEP 3: Categories and jury ────────────────────────────────── -->
        <div v-else class="p-4 sm:p-6 space-y-8">
          <!-- Categories -->
          <section class="space-y-4">
            <div>
              <h2 class="text-base font-semibold text-zinc-900 dark:text-zinc-100">Categorías</h2>
              <p class="text-sm text-zinc-500 mt-0.5">Por ejemplo «Piano junior» o «Cor mixt». Puedes añadir más desde el panel del concurso.</p>
            </div>

            <form class="grid grid-cols-2 sm:grid-cols-[minmax(0,1fr)_132px_132px_152px_auto] gap-3 items-end" @submit.prevent="addCategory">
              <div class="col-span-2 sm:col-span-1 space-y-1.5">
                <Label for="cat-name" class="text-xs font-medium">Nombre <span class="text-red-500">*</span></Label>
                <Input id="cat-name" v-model="categoryName" placeholder="Nombre de la categoría" class="h-10" />
              </div>
              <div class="space-y-1.5">
                <Label for="cat-min" class="text-xs font-medium">Edad mín.</Label>
                <NumberStepper id="cat-min" v-model="categoryMinAge" :min="0" :max="120" placeholder="—" label="edad mínima" :invalid="categoryAgeError" />
              </div>
              <div class="space-y-1.5">
                <Label for="cat-max" class="text-xs font-medium">Edad máx.</Label>
                <NumberStepper id="cat-max" v-model="categoryMaxAge" :min="categoryMinAge ?? 0" :max="120" placeholder="—" label="edad máxima" :invalid="categoryAgeError" />
              </div>
              <div class="space-y-1.5">
                <Label for="cat-cap" class="text-xs font-medium">Plazas</Label>
                <NumberStepper id="cat-cap" v-model="categoryMaxParticipants" :min="1" placeholder="Sin límite" label="plazas" />
              </div>
              <Button
                type="submit"
                variant="outline"
                class="h-10 gap-1.5"
                :disabled="!categoryName.trim() || categoryAgeError"
              >
                <Plus class="w-4 h-4" />
                Añadir
              </Button>
            </form>
            <p v-if="categoryAgeError" class="text-xs text-red-500 -mt-2">La edad mínima no puede ser mayor que la máxima.</p>

            <ul v-if="categories.length" class="divide-y divide-zinc-100 dark:divide-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-800">
              <li v-for="c in categories" :key="c.key" class="flex items-center gap-3 px-4 py-3">
                <Music class="w-4 h-4 text-zinc-400 shrink-0" />
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">{{ c.name }}</p>
                  <p class="text-xs text-zinc-500">
                    {{ ageLabel(c) }} · {{ c.max_participants != null ? `${c.max_participants} plazas` : 'Plazas sin límite' }}
                  </p>
                </div>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  class="h-8 w-8 text-zinc-400 hover:text-red-500"
                  :aria-label="`Quitar ${c.name}`"
                  @click="removeCategory(c.key)"
                >
                  <Trash2 class="w-4 h-4" />
                </Button>
              </li>
            </ul>
            <div v-else class="rounded-xl border border-dashed border-zinc-200 dark:border-zinc-700 px-4 py-6 text-center">
              <p class="text-sm text-zinc-500">Aún no hay categorías. Añade la primera con el formulario de arriba.</p>
            </div>
          </section>

          <!-- Jury -->
          <section class="space-y-4">
            <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
              <div>
                <h2 class="text-base font-semibold text-zinc-900 dark:text-zinc-100">Jurado</h2>
                <p class="text-sm text-zinc-500 mt-0.5">El jurado evalúa todas las categorías. Recibirán una invitación por email.</p>
              </div>
              <Button type="button" variant="outline" class="h-10 gap-1.5 shrink-0" @click="judgePickerOpen = true">
                <Users class="w-4 h-4" />
                Elegir del pool
              </Button>
            </div>

            <div v-if="selectedJudges.length" class="flex flex-wrap gap-2">
              <span
                v-for="j in selectedJudges"
                :key="j.id"
                class="inline-flex items-center gap-2 rounded-full border border-zinc-200 dark:border-zinc-800 pl-1 pr-2 py-1 text-sm"
              >
                <AvatarBubble :name="j.full_name || j.email" :avatar-url="(j as any).avatar_url ?? null" size="w-6 h-6" text-size="text-[10px]" />
                <span class="max-w-[160px] truncate text-zinc-900 dark:text-zinc-100">{{ j.full_name || j.email }}</span>
                <button type="button" class="text-zinc-400 hover:text-red-500" :aria-label="`Quitar ${j.full_name || j.email}`" @click="removeJudge(j.id)">
                  <X class="w-3.5 h-3.5" />
                </button>
              </span>
            </div>
            <p v-else class="text-sm text-zinc-500">Sin jurado por ahora. También puedes invitarlo más tarde.</p>
          </section>

          <!-- Summary -->
          <section class="rounded-xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-100 dark:border-zinc-800 p-4">
            <h3 class="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-3">Resumen</h3>
            <dl class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-x-6 gap-y-2 text-sm">
              <div class="flex justify-between gap-3 sm:block">
                <dt class="text-zinc-500">Concurso</dt>
                <dd class="font-medium text-zinc-900 dark:text-zinc-100 truncate">{{ formData.name }}</dd>
              </div>
              <div class="flex justify-between gap-3 sm:block">
                <dt class="text-zinc-500">Fechas</dt>
                <dd class="font-medium text-zinc-900 dark:text-zinc-100">{{ dateLabel }}</dd>
              </div>
              <div class="flex justify-between gap-3 sm:block">
                <dt class="text-zinc-500">Votación</dt>
                <dd class="font-medium text-zinc-900 dark:text-zinc-100">{{ VOTING_SYSTEMS.find(v => v.id === formData.voting_system)?.label }}</dd>
              </div>
              <div class="flex justify-between gap-3 sm:block">
                <dt class="text-zinc-500">Categorías · Jurado</dt>
                <dd class="font-medium text-zinc-900 dark:text-zinc-100">{{ categories.length }} · {{ selectedJudges.length }}</dd>
              </div>
            </dl>
          </section>
        </div>

        <!-- Footer actions (pinned to the bottom of the screen on phones) -->
        <div class="max-md:fixed max-md:inset-x-0 max-md:bottom-0 z-20 flex items-center gap-3 px-4 sm:px-6 py-3 md:py-4 border-t border-zinc-200 md:border-zinc-100 dark:border-zinc-800 md:dark:border-zinc-900 bg-white/95 dark:bg-zinc-950/95 backdrop-blur md:rounded-b-2xl">
          <Button
            type="button"
            variant="ghost"
            class="h-10 gap-1.5 flex-1 sm:flex-none"
            :disabled="isCreating"
            @click="back"
          >
            <ArrowLeft v-if="step > 1" class="w-4 h-4" />
            {{ step > 1 ? 'Atrás' : 'Cancelar' }}
          </Button>
          <div class="hidden sm:block flex-1" />
          <Button
            v-if="step < steps.length"
            type="button"
            class="h-10 gap-1.5 flex-1 sm:flex-none sm:px-5"
            :disabled="!isStepValid(step)"
            @click="next"
          >
            Siguiente
            <ArrowRight class="w-4 h-4" />
          </Button>
          <Button
            v-else
            type="button"
            class="h-10 gap-1.5 flex-1 sm:flex-none sm:px-5"
            :disabled="isCreating || !isStep1Valid"
            @click="createContest"
          >
            <Loader2 v-if="isCreating" class="w-4 h-4 animate-spin" />
            <Check v-else class="w-4 h-4" />
            {{ isCreating ? 'Creando…' : 'Crear concurso' }}
          </Button>
        </div>
      </div>
    </div>
  </div>

  <!-- ── Jury picker ──────────────────────────────────────────────────────── -->
  <Dialog v-model:open="judgePickerOpen">
    <DialogContent class="max-w-lg w-[calc(100vw-2rem)] rounded-2xl p-0 gap-0">
      <DialogHeader class="p-5 border-b border-zinc-100 dark:border-zinc-800">
        <DialogTitle class="text-base font-semibold">Jurado del concurso</DialogTitle>
        <DialogDescription class="text-sm">Elige a quién invitar de tu pool de jurados.</DialogDescription>
      </DialogHeader>

      <div class="p-5 space-y-3">
        <div class="relative">
          <Search class="absolute left-3 top-2.5 w-4 h-4 text-zinc-400" />
          <Input v-model="judgeSearch" placeholder="Buscar por nombre, email o especialidad" class="pl-9 h-9 text-sm" />
        </div>

        <div v-if="isLoadingPool" class="flex items-center justify-center py-10">
          <Loader2 class="w-6 h-6 animate-spin text-zinc-400" />
        </div>
        <div v-else-if="!judgePool.length" class="text-center py-10 space-y-2">
          <p class="text-sm text-zinc-500">Tu pool de jurados está vacío.</p>
          <NuxtLink to="/judge-pool" class="text-sm font-medium underline underline-offset-4">Invitar jurados al pool</NuxtLink>
        </div>
        <div v-else-if="!filteredPool.length" class="text-center py-10 text-sm text-zinc-500">
          Ningún jurado coincide con la búsqueda.
        </div>
        <ul v-else class="rounded-lg border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-100 dark:divide-zinc-800">
          <li v-for="j in paginatedPool" :key="j.id">
            <label class="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
              <Checkbox :model-value="pickerSelection.has(j.id)" @update:model-value="toggleJudge(j.id)" />
              <AvatarBubble :name="j.full_name || '??'" :avatar-url="(j as any).avatar_url ?? null" size="w-8 h-8" text-size="text-[10px]" />
              <span class="flex-1 min-w-0">
                <span class="block text-sm font-medium truncate">{{ j.full_name }}</span>
                <span class="block text-xs text-zinc-500 truncate">{{ j.specialty ? `${j.specialty} · ` : '' }}{{ j.email }}</span>
              </span>
            </label>
          </li>
        </ul>

        <div v-if="filteredPool.length > JUDGE_PAGE_SIZE" class="flex items-center justify-between">
          <p class="text-xs text-zinc-500 tabular-nums">Página {{ judgePickerPage }} de {{ judgePickerPageCount }}</p>
          <div class="flex items-center gap-1">
            <Button variant="outline" size="icon" class="h-7 w-7" :disabled="judgePickerPage <= 1" aria-label="Página anterior" @click="judgePickerPage--">
              <ChevronLeft class="w-3.5 h-3.5" />
            </Button>
            <Button variant="outline" size="icon" class="h-7 w-7" :disabled="judgePickerPage >= judgePickerPageCount" aria-label="Página siguiente" @click="judgePickerPage++">
              <ChevronRight class="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </div>

      <DialogFooter class="p-4 border-t border-zinc-100 dark:border-zinc-800 flex-row gap-2 justify-end">
        <Button variant="ghost" class="h-9" @click="judgePickerOpen = false">Cancelar</Button>
        <Button class="h-9" @click="confirmJudges">
          Seleccionar ({{ pickerSelection.size }})
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
