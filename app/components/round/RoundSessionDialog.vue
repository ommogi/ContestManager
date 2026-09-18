<script setup lang="ts">
// The day and time window a round is held in (KAN-12). The schedule generator
// (KAN-13) fills this window; contests that schedule by hand can ignore it.
import { computed, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import { CalendarClock, Activity } from 'lucide-vue-next'
import { parseDate, type DateValue } from '@internationalized/date'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { DatePicker } from '@/components/ui/date-picker'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { useRoundsStore } from '@/stores/rounds'
import {
  SESSION_WINDOW_MESSAGES,
  toHHMM,
  validateSessionWindow,
  windowMinutes,
} from '~~/shared/session-window'

export interface RoundSession {
  session_date: string | null
  session_start: string | null
  session_end: string | null
}

const props = defineProps<{
  roundId: string
  session: RoundSession
  /** First day of the contest (YYYY-MM-DD…), suggested when the round has no date. */
  contestStartsAt: string | null
}>()

const open = defineModel<boolean>('open', { required: true })
const roundsStore = useRoundsStore()

const date = ref<DateValue | undefined>()
const start = ref('')
const end = ref('')
const isSaving = ref(false)

function toDateValue(iso: string | null | undefined): DateValue | undefined {
  const day = iso?.slice(0, 10)
  if (!day) return undefined
  try { return parseDate(day) } catch { return undefined }
}

watch(open, (isOpen) => {
  if (!isOpen) return
  date.value = toDateValue(props.session.session_date) ?? toDateValue(props.contestStartsAt)
  start.value = toHHMM(props.session.session_start) ?? ''
  end.value = toHHMM(props.session.session_end) ?? ''
})

const windowError = computed(() => validateSessionWindow(start.value || null, end.value || null))
const length = computed(() => windowMinutes(start.value, end.value))

const lengthLabel = computed(() => {
  if (length.value === null) return null
  const h = Math.floor(length.value / 60)
  const m = length.value % 60
  return [h ? `${h} h` : '', m ? `${m} min` : ''].filter(Boolean).join(' ')
})

async function save() {
  if (windowError.value) return
  isSaving.value = true
  try {
    await roundsStore.update(props.roundId, {
      session_date: date.value ? date.value.toString() : null,
      session_start: start.value || null,
      session_end: end.value || null,
    })
    toast.success('Jornada guardada')
    open.value = false
  } catch (e: unknown) {
    const err = e as { data?: { message?: string; statusMessage?: string } }
    toast.error(err?.data?.message || err?.data?.statusMessage || 'No se ha podido guardar la jornada')
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="max-w-md rounded-2xl overflow-hidden p-0 border border-zinc-200 dark:border-zinc-800 shadow-xl bg-white dark:bg-zinc-950">
      <div class="p-6 pr-16 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 flex items-center gap-4">
        <div class="w-11 h-11 rounded-xl bg-sky-600 flex items-center justify-center shadow-sm shrink-0">
          <CalendarClock class="w-5 h-5 text-white" />
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-0.5">Horario de la ronda</p>
          <h2 class="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 uppercase">Jornada</h2>
        </div>
      </div>

      <div class="p-6 space-y-5">
        <div class="space-y-1.5">
          <Label class="text-xs font-bold uppercase tracking-wider text-zinc-400">Fecha</Label>
          <DatePicker v-model="date" placeholder="Elige el día" class="w-full" />
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div class="space-y-1.5">
            <Label for="session-start" class="text-xs font-bold uppercase tracking-wider text-zinc-400">Inicio</Label>
            <Input id="session-start" v-model="start" type="time" step="300" class="h-9" />
          </div>
          <div class="space-y-1.5">
            <Label for="session-end" class="text-xs font-bold uppercase tracking-wider text-zinc-400">Fin</Label>
            <Input
              id="session-end"
              v-model="end"
              type="time"
              step="300"
              class="h-9"
              :aria-invalid="windowError === 'end_not_after_start' || undefined"
              aria-describedby="session-window-hint"
            />
          </div>
        </div>

        <p
          id="session-window-hint"
          class="text-xs"
          :class="windowError ? 'text-red-600 dark:text-red-400' : 'text-zinc-500'"
          :role="windowError ? 'alert' : undefined"
        >
          <template v-if="windowError">{{ SESSION_WINDOW_MESSAGES[windowError] }}</template>
          <template v-else-if="lengthLabel">Franja de {{ lengthLabel }}. El generador de turnos repartirá las actuaciones dentro de ella.</template>
          <template v-else>Deja las horas vacías si esta ronda se programa a mano.</template>
        </p>
      </div>

      <DialogFooter class="p-5 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/30 flex justify-end gap-3">
        <Button variant="ghost" class="font-bold h-9 px-5 uppercase text-[10px] tracking-widest" @click="open = false">Cancelar</Button>
        <Button
          class="bg-sky-600 hover:bg-sky-700 text-white font-bold h-9 px-6 uppercase text-[10px] tracking-widest rounded-lg shadow-sm"
          :disabled="isSaving || !!windowError"
          @click="save"
        >
          <Activity v-if="isSaving" class="w-3.5 h-3.5 mr-1.5 animate-spin" />
          {{ isSaving ? 'Guardando...' : 'Guardar jornada' }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
