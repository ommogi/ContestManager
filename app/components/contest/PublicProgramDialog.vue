<script setup lang="ts">
// Public programme of a jornada as a PDF (KAN-21). The days come from the
// server so the organisation picks one that exists instead of typing a date.
import { computed, ref, watch } from 'vue'
import { FileText, Check, Loader2 } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { apiClient } from '@/api/apiClient'
import { useServerPdf, pdfSlug } from '@/composables/useServerPdf'
import { toast } from 'vue-sonner'

const props = defineProps<{ contestId: string; contestName?: string | null }>()

interface ProgramDay { date: string; performances: number }

const isOpen = ref(false)
const isLoading = ref(false)
const days = ref<ProgramDay[]>([])
const unscheduled = ref(0)
/** null = every jornada in one file. */
const selectedDate = ref<string | null>(null)
const includeWorks = ref(true)

const { isDownloading, download } = useServerPdf()

const dayFormatter = new Intl.DateTimeFormat('es-ES', {
  weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Madrid',
})
function dayLabel(date: string): string {
  return dayFormatter.format(new Date(`${date}T12:00:00Z`))
}

async function loadDays() {
  isLoading.value = true
  try {
    const data = await apiClient<{ days: ProgramDay[]; unscheduled: number }>(
      `/api/contests/${props.contestId}/program/days`,
    )
    days.value = data?.days ?? []
    unscheduled.value = data?.unscheduled ?? 0
    selectedDate.value = days.value.length === 1 ? days.value[0]!.date : null
  } catch {
    toast.error('No se han podido cargar las jornadas')
    days.value = []
  } finally {
    isLoading.value = false
  }
}

watch(isOpen, (open) => { if (open) loadDays() })

const hasDays = computed(() => days.value.length > 0)

async function downloadProgram() {
  const params = new URLSearchParams()
  if (selectedDate.value) params.set('date', selectedDate.value)
  if (!includeWorks.value) params.set('works', '0')
  const query = params.toString()
  await download(
    `/api/contests/${props.contestId}/pdf/public-program${query ? `?${query}` : ''}`,
    `programa-${pdfSlug(props.contestName)}${selectedDate.value ? `-${selectedDate.value}` : ''}.pdf`,
  )
}
</script>

<template>
  <Dialog v-model:open="isOpen">
    <DialogTrigger as-child>
      <Button
        variant="outline"
        size="sm"
        class="gap-2 bg-white/90 backdrop-blur-sm text-zinc-900 border-white hover:bg-white dark:bg-white/10 dark:text-zinc-100 dark:border-white/20 dark:hover:bg-white/20 font-bold border-2 rounded-md transition-all uppercase tracking-tighter text-[10px]"
      >
        <FileText class="w-4 h-4" /> Programa
      </Button>
    </DialogTrigger>

    <DialogContent class="sm:max-w-[440px]">
      <DialogHeader>
        <DialogTitle>Programa público</DialogTitle>
        <DialogDescription>
          Quién toca, en qué orden y qué interpreta. Para repartir al público.
        </DialogDescription>
      </DialogHeader>

      <div class="space-y-4 py-2">
        <div v-if="isLoading" class="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 class="w-4 h-4 animate-spin" /> Buscando jornadas…
        </div>

        <p v-else-if="!hasDays" class="rounded-lg border-2 border-dashed border-border p-4 text-sm text-muted-foreground">
          Todavía no hay actuaciones con horario. Genera los horarios de alguna ronda y vuelve.
        </p>

        <div v-else role="radiogroup" aria-label="Jornada" class="space-y-1.5">
          <button
            v-for="option in [{ date: null as string | null, performances: 0 }, ...days]"
            :key="option.date ?? 'all'"
            type="button"
            role="radio"
            :aria-checked="selectedDate === option.date"
            class="flex w-full items-center gap-3 rounded-lg border-2 px-3 py-2 text-left transition-all"
            :class="selectedDate === option.date ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/40'"
            @click="selectedDate = option.date"
          >
            <Check
              class="w-4 h-4 shrink-0"
              :class="selectedDate === option.date ? 'text-primary' : 'text-transparent'"
            />
            <span class="flex-1 text-sm font-bold first-letter:uppercase">
              {{ option.date ? dayLabel(option.date) : 'Todas las jornadas' }}
            </span>
            <span v-if="option.date" class="text-xs text-muted-foreground tabular-nums">
              {{ option.performances }} actuaciones
            </span>
          </button>
        </div>

        <div v-if="hasDays" class="flex items-start gap-2">
          <Checkbox id="program-works" v-model:checked="includeWorks" class="mt-0.5" />
          <label for="program-works" class="cursor-pointer text-sm">
            Incluir las obras
            <span class="block text-xs text-muted-foreground">
              Desmárcalo si el repertorio todavía no es definitivo.
            </span>
          </label>
        </div>

        <p v-if="hasDays && unscheduled > 0" class="text-xs text-amber-600 dark:text-amber-400">
          {{ unscheduled }} participante(s) siguen sin horario y no saldrán en el programa.
        </p>
      </div>

      <DialogFooter class="gap-2">
        <Button variant="outline" @click="isOpen = false">Cancelar</Button>
        <Button :disabled="!hasDays || isDownloading" class="gap-2" @click="downloadProgram">
          <Loader2 v-if="isDownloading" class="w-4 h-4 animate-spin" />
          <FileText v-else class="w-4 h-4" />
          {{ isDownloading ? 'Generando…' : 'Descargar PDF' }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
