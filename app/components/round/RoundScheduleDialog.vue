<script setup lang="ts">
// Generate a round's performance slots from its draw and session window
// (KAN-13). Opens on a server-side preview; writing needs a second click, and a
// third to confirm when it would overwrite slots already set.
import { computed, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import { Wand2, Activity, AlertCircle, ListOrdered, CalendarClock } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { apiClient } from '@/api/apiClient'
import { SCHEDULE_ERROR_MESSAGES, type SchedulePlan } from '~~/shared/schedule-generator'

interface Preview {
  plan: SchedulePlan
  names: Record<string, string>
  alreadyScheduled: number
  /** Slots adjusted by hand since the last generation (KAN-15). */
  manuallyEdited: string[]
  roundClosed: boolean
}

const props = defineProps<{
  roundId: string
  /** KAN-18: slots whose length no longer matches the participant's minutes. */
  staleCount?: number
}>()
const emit = defineEmits<{ generated: []; openDraw: []; openSession: [] }>()
const open = defineModel<boolean>('open', { required: true })

// apiClient's route-typed signature does not cover this endpoint; call it
// through a plain typed shape, as RoundDrawDialog does.
const api = apiClient as unknown as <T>(url: string, opts: { method: string; body: unknown }) => Promise<T>

const preview = ref<Preview | null>(null)
const isLoading = ref(false)
const isGenerating = ref(false)
const confirmingOverwrite = ref(false)

async function load() {
  isLoading.value = true
  confirmingOverwrite.value = false
  try {
    preview.value = await api<Preview>(`/api/rounds/${props.roundId}/schedule/generate`, {
      method: 'POST',
      body: { dryRun: true },
    })
  } catch {
    preview.value = null
    toast.error('No se ha podido calcular el horario')
  } finally {
    isLoading.value = false
  }
}

watch(open, (isOpen) => { if (isOpen) load() })

const plan = computed(() => preview.value?.plan ?? null)
const errorMessage = computed(() => plan.value?.error ? SCHEDULE_ERROR_MESSAGES[plan.value.error] : null)

const editedNames = computed(() =>
  (preview.value?.manuallyEdited ?? []).map(id => preview.value?.names[id] ?? '—'),
)

const overflowMinutes = computed(() => {
  const p = plan.value
  if (!p || p.neededMinutes === null || p.availableMinutes === null) return null
  return Math.max(0, p.neededMinutes - p.availableMinutes)
})

/** "2026-10-12T14:05" → "14:05" */
function hhmm(value: string | null): string {
  return value ? value.slice(11, 16) : '—'
}

async function generate() {
  if (!plan.value?.ok) return
  if ((preview.value?.alreadyScheduled ?? 0) > 0 && !confirmingOverwrite.value) {
    confirmingOverwrite.value = true
    return
  }

  isGenerating.value = true
  try {
    await api(`/api/rounds/${props.roundId}/schedule/generate`, {
      method: 'POST',
      body: { dryRun: false, overwrite: confirmingOverwrite.value },
    })
    toast.success(`Turnos generados para ${plan.value.slots.length} participante${plan.value.slots.length === 1 ? '' : 's'}`)
    emit('generated')
    open.value = false
  } catch (e: unknown) {
    const err = e as { data?: { message?: string } }
    toast.error(err?.data?.message || 'No se han podido generar los turnos')
    await load()
  } finally {
    isGenerating.value = false
  }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="max-w-2xl rounded-2xl overflow-hidden p-0 border border-zinc-200 dark:border-zinc-800 shadow-xl bg-white dark:bg-zinc-950">
      <div class="p-6 pr-16 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 flex items-center gap-4">
        <div class="w-11 h-11 rounded-xl bg-violet-600 flex items-center justify-center shadow-sm shrink-0">
          <Wand2 class="w-5 h-5 text-white" />
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-0.5">Orden de sorteo + jornada</p>
          <h2 class="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 uppercase">Generar turnos</h2>
        </div>
      </div>

      <div class="p-6 max-h-[65vh] overflow-y-auto space-y-4">
        <div v-if="isLoading" class="flex items-center gap-2 text-sm text-zinc-500 py-8 justify-center">
          <Activity class="w-4 h-4 animate-spin" /> Calculando…
        </div>

        <template v-else-if="plan">
          <!-- Available vs needed (KAN-14) -->
          <div class="grid grid-cols-2 gap-3 text-center">
            <div class="rounded-lg border border-zinc-200 dark:border-zinc-800 p-3">
              <p class="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Necesarios</p>
              <p class="text-lg font-bold text-zinc-900 dark:text-zinc-100">{{ plan.neededMinutes ?? '—' }} min</p>
            </div>
            <div class="rounded-lg border border-zinc-200 dark:border-zinc-800 p-3">
              <p class="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Disponibles</p>
              <p class="text-lg font-bold text-zinc-900 dark:text-zinc-100">{{ plan.availableMinutes ?? '—' }} min</p>
            </div>
          </div>

          <div
            v-if="errorMessage"
            class="flex items-start gap-2 rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 p-3 text-xs text-amber-800 dark:text-amber-300"
            role="alert"
          >
            <AlertCircle class="w-4 h-4 shrink-0" />
            <div class="space-y-2">
              <p>
                {{ errorMessage }}
                <template v-if="plan.error === 'does_not_fit' && overflowMinutes !== null">
                  Se quedan fuera {{ plan.overflow.length }} participante{{ plan.overflow.length === 1 ? '' : 's' }}
                  ({{ overflowMinutes }} min de más). Amplía la franja o reduce duraciones.
                </template>
              </p>
              <div class="flex gap-2">
                <Button
                  v-if="plan.error === 'draw_not_ready' || plan.error === 'missing_minutes'"
                  size="sm" variant="outline" class="h-7 gap-1.5 text-[10px] font-bold uppercase tracking-widest"
                  @click="emit('openDraw')"
                >
                  <ListOrdered class="w-3.5 h-3.5" /> Abrir sorteo
                </Button>
                <Button
                  v-if="plan.error === 'missing_window' || plan.error === 'does_not_fit'"
                  size="sm" variant="outline" class="h-7 gap-1.5 text-[10px] font-bold uppercase tracking-widest"
                  @click="emit('openSession')"
                >
                  <CalendarClock class="w-3.5 h-3.5" /> Abrir jornada
                </Button>
              </div>
            </div>
          </div>

          <p
            v-if="(staleCount ?? 0) > 0"
            class="rounded-lg border border-orange-200 dark:border-orange-900 bg-orange-50 dark:bg-orange-950/30 p-3 text-xs text-orange-800 dark:text-orange-300"
            role="status"
          >
            {{ staleCount }} turno{{ staleCount === 1 ? '' : 's' }} ya no cuadra{{ staleCount === 1 ? '' : 'n' }} con la duración actual del repertorio.
            Al generar se recolocan todos con las duraciones de ahora.
          </p>

          <!-- Hand-made adjustments are called out by name, before anything is confirmed (KAN-15). -->
          <div
            v-if="editedNames.length"
            class="flex items-start gap-2 rounded-lg border border-orange-200 dark:border-orange-900 bg-orange-50 dark:bg-orange-950/30 p-3 text-xs text-orange-800 dark:text-orange-300"
            role="status"
          >
            <AlertCircle class="w-4 h-4 shrink-0" />
            <p>
              {{ editedNames.length === 1 ? 'Este turno se ajustó a mano' : `Estos ${editedNames.length} turnos se ajustaron a mano` }}
              y se perderá{{ editedNames.length === 1 ? '' : 'n' }} al generar:
              <strong>{{ editedNames.join(', ') }}</strong>.
            </p>
          </div>

          <div v-if="plan.slots.length" class="rounded-xl border border-zinc-100 dark:border-zinc-800 overflow-hidden">
            <Table>
              <TableHeader class="bg-zinc-50 dark:bg-zinc-900/50">
                <TableRow class="border-zinc-100 dark:border-zinc-800 hover:bg-transparent">
                  <TableHead class="pl-5 w-12 text-[10px] font-bold uppercase tracking-widest text-zinc-400">Nº</TableHead>
                  <TableHead class="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Participante</TableHead>
                  <TableHead class="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Convocatoria</TableHead>
                  <TableHead class="pr-5 text-[10px] font-bold uppercase tracking-widest text-zinc-400">Actuación</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow v-for="slot in plan.slots" :key="slot.id" class="border-zinc-50 dark:border-zinc-900 last:border-0">
                  <TableCell class="pl-5 py-2 font-mono text-sm">{{ slot.draw_number }}</TableCell>
                  <TableCell class="py-2 text-sm font-semibold uppercase text-zinc-800 dark:text-zinc-200">{{ preview?.names[slot.id] ?? '—' }}</TableCell>
                  <TableCell class="py-2 font-mono text-sm text-zinc-500">{{ hhmm(slot.call_time) }}</TableCell>
                  <TableCell class="pr-5 py-2 font-mono text-sm">{{ hhmm(slot.performance_time) }}–{{ hhmm(slot.performance_end_time) }}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>

          <p
            v-if="confirmingOverwrite"
            class="rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 p-3 text-xs text-red-700 dark:text-red-300"
            role="alert"
          >
            Se sobrescribirán {{ preview?.alreadyScheduled }} hora{{ preview?.alreadyScheduled === 1 ? '' : 's' }} de actuación ya asignada{{ preview?.alreadyScheduled === 1 ? '' : 's' }}<template v-if="editedNames.length">, incluido{{ editedNames.length === 1 ? '' : 's' }} {{ editedNames.length }} ajuste{{ editedNames.length === 1 ? '' : 's' }} manual{{ editedNames.length === 1 ? '' : 'es' }}</template>. Pulsa de nuevo para confirmar.
          </p>
        </template>
      </div>

      <DialogFooter class="p-5 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/30 flex justify-end gap-3">
        <Button variant="ghost" class="font-bold h-9 px-5 uppercase text-[10px] tracking-widest" @click="open = false">Cancelar</Button>
        <Button
          class="text-white font-bold h-9 px-6 uppercase text-[10px] tracking-widest rounded-lg shadow-sm"
          :class="confirmingOverwrite ? 'bg-red-600 hover:bg-red-700' : 'bg-violet-600 hover:bg-violet-700'"
          :disabled="isLoading || isGenerating || !plan?.ok || preview?.roundClosed"
          @click="generate"
        >
          <Activity v-if="isGenerating" class="w-3.5 h-3.5 mr-1.5 animate-spin" />
          {{ isGenerating ? 'Generando...' : confirmingOverwrite ? 'Sobrescribir turnos' : 'Generar turnos' }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
