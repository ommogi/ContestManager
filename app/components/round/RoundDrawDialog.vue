<script setup lang="ts">
// Draw number and performance length for each participant of a round (KAN-11).
// Edits a local draft and saves the whole table in one request, so two
// participants can swap numbers. A CSV can fill the draft through the server,
// which matches rows by DNI/e-mail without sending those to the page.
import { computed, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import { Shuffle, Upload, Activity, AlertCircle, ListOrdered } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { apiClient } from '@/api/apiClient'
import {
  MAX_PERFORMANCE_MINUTES,
  drawReadiness,
  parseDrawCsv,
  randomDraw,
  type DrawEntry,
} from '~~/shared/round-draw'

export interface DrawParticipantRow {
  id: string
  name: string
  draw_number: number | null
  performance_minutes: number | null
}

const props = defineProps<{
  roundId: string
  rows: DrawParticipantRow[]
  /** contests.performance_default_minutes, shown as the placeholder. */
  defaultMinutes: number | null
}>()

const emit = defineEmits<{ saved: [] }>()

// apiClient's route-typed signature does not cover these new endpoints and
// recurses too deep to infer them; call it through a plain typed shape.
const api = apiClient as unknown as <T>(url: string, opts: { method: string; body: unknown }) => Promise<T>
const open = defineModel<boolean>('open', { required: true })

// Inputs hold strings so an emptied field reads as "no value", not 0.
interface DraftRow { draw: string; minutes: string }
const draft = ref<Record<string, DraftRow>>({})
const isSaving = ref(false)
const isImporting = ref(false)
const importNotes = ref<string[]>([])
const fileInput = ref<HTMLInputElement | null>(null)

watch(open, (isOpen) => {
  if (!isOpen) return
  draft.value = Object.fromEntries(props.rows.map(r => [r.id, {
    draw: r.draw_number?.toString() ?? '',
    minutes: r.performance_minutes?.toString() ?? '',
  }]))
  importNotes.value = []
})

function toInt(value: string): number | null {
  const v = value.trim()
  return /^\d+$/.test(v) ? Number(v) : null
}

const entries = computed<DrawEntry[]>(() => props.rows.map(r => ({
  id: r.id,
  draw_number: toInt(draft.value[r.id]?.draw ?? ''),
  performance_minutes: toInt(draft.value[r.id]?.minutes ?? ''),
})))

const readiness = computed(() => drawReadiness(entries.value))
const duplicateSet = computed(() => new Set(readiness.value.duplicates))

const invalidMinutes = computed(() => entries.value.some(e =>
  e.performance_minutes !== null && (e.performance_minutes < 1 || e.performance_minutes > MAX_PERFORMANCE_MINUTES),
))
const invalidDraw = computed(() => props.rows.some(r => {
  const raw = draft.value[r.id]?.draw.trim() ?? ''
  return raw !== '' && (toInt(raw) === null || toInt(raw) === 0)
}))

const canSave = computed(() =>
  !isSaving.value && readiness.value.duplicates.length === 0 && !invalidMinutes.value && !invalidDraw.value,
)

function shuffle() {
  const draw = randomDraw(props.rows.map(r => r.id))
  for (const [id, n] of draw) {
    const row = draft.value[id]
    if (row) row.draw = String(n)
  }
  toast.info('Sorteo generado. Revísalo y guarda para aplicarlo.')
}

async function save() {
  isSaving.value = true
  try {
    await api(`/api/rounds/${props.roundId}/draw`, {
      method: 'PUT',
      body: { rows: entries.value },
    })
    toast.success('Sorteo guardado')
    emit('saved')
    open.value = false
  } catch (e: unknown) {
    const err = e as { data?: { message?: string } }
    toast.error(err?.data?.message || 'No se ha podido guardar el sorteo')
  } finally {
    isSaving.value = false
  }
}

async function onFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return

  const parsed = parseDrawCsv(await file.text())
  const notes = [...parsed.errors]
  if (parsed.rows.length === 0) {
    importNotes.value = notes.length ? notes : ['El archivo no tiene filas.']
    return
  }

  isImporting.value = true
  try {
    // Dry run: the server matches rows; the draft is only filled, not saved.
    const res = await api<{ matched: DrawEntry[]; unmatched: number[]; repeated: number[] }>(
      `/api/rounds/${props.roundId}/draw/import`,
      { method: 'POST', body: { rows: parsed.rows, apply: false } },
    )

    for (const m of res.matched) {
      const row = draft.value[m.id]
      if (!row) continue
      row.draw = m.draw_number?.toString() ?? ''
      if (m.performance_minutes !== null) row.minutes = String(m.performance_minutes)
    }
    if (res.unmatched.length) {
      notes.push(`Sin participante en esta ronda: fila${res.unmatched.length > 1 ? 's' : ''} ${res.unmatched.join(', ')}.`)
    }
    if (res.repeated.length) {
      notes.push(`Participante repetido, se ignora: fila${res.repeated.length > 1 ? 's' : ''} ${res.repeated.join(', ')}.`)
    }
    importNotes.value = notes
    toast.success(`${res.matched.length} fila${res.matched.length === 1 ? '' : 's'} importada${res.matched.length === 1 ? '' : 's'}. Revisa y guarda.`)
  } catch {
    toast.error('No se ha podido importar el archivo')
  } finally {
    isImporting.value = false
  }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="max-w-2xl rounded-2xl overflow-hidden p-0 border border-zinc-200 dark:border-zinc-800 shadow-xl bg-white dark:bg-zinc-950">
      <div class="p-6 pr-16 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 flex items-center gap-4">
        <div class="w-11 h-11 rounded-xl bg-amber-600 flex items-center justify-center shadow-sm shrink-0">
          <ListOrdered class="w-5 h-5 text-white" />
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-0.5">Orden de actuación</p>
          <h2 class="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 uppercase">Sorteo y duración</h2>
        </div>
      </div>

      <div class="p-6 max-h-[65vh] overflow-y-auto space-y-4">
        <div class="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" class="gap-2 text-[10px] font-bold uppercase tracking-widest" :disabled="rows.length === 0" @click="shuffle">
            <Shuffle class="w-3.5 h-3.5" /> Sortear al azar
          </Button>
          <Button variant="outline" size="sm" class="gap-2 text-[10px] font-bold uppercase tracking-widest" :disabled="isImporting" @click="fileInput?.click()">
            <Activity v-if="isImporting" class="w-3.5 h-3.5 animate-spin" />
            <Upload v-else class="w-3.5 h-3.5" /> Importar CSV
          </Button>
          <input ref="fileInput" type="file" accept=".csv,text/csv" class="hidden" @change="onFile">
          <p class="text-[11px] text-zinc-500 w-full">
            CSV con columnas <code>dni</code> o <code>email</code>, <code>sorteo</code> y, opcionalmente, <code>minutos</code>.
          </p>
        </div>

        <div
          v-if="importNotes.length"
          class="rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 p-3 text-xs text-amber-800 dark:text-amber-300 space-y-1"
          role="status"
        >
          <p v-for="note in importNotes" :key="note">{{ note }}</p>
        </div>

        <div
          v-if="!readiness.ready && rows.length > 0"
          class="flex items-start gap-2 rounded-lg border border-zinc-200 dark:border-zinc-800 p-3 text-xs text-zinc-600 dark:text-zinc-400"
          role="status"
        >
          <AlertCircle class="w-4 h-4 shrink-0 text-amber-600" />
          <span>
            <template v-if="readiness.missing.length">
              Faltan {{ readiness.missing.length }} participante{{ readiness.missing.length === 1 ? '' : 's' }} sin número de sorteo.
            </template>
            <template v-if="readiness.duplicates.length">
              Números repetidos: {{ readiness.duplicates.join(', ') }}.
            </template>
            No se podrán generar los turnos hasta completarlo.
          </span>
        </div>

        <div class="rounded-xl border border-zinc-100 dark:border-zinc-800 overflow-hidden">
          <Table>
            <TableHeader class="bg-zinc-50 dark:bg-zinc-900/50">
              <TableRow class="border-zinc-100 dark:border-zinc-800 hover:bg-transparent">
                <TableHead class="pl-5 text-[10px] font-bold uppercase tracking-widest text-zinc-400">Participante</TableHead>
                <TableHead class="text-[10px] font-bold uppercase tracking-widest text-zinc-400 w-28">Nº sorteo</TableHead>
                <TableHead class="text-[10px] font-bold uppercase tracking-widest text-zinc-400 w-28 pr-5">Minutos</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="row in rows" :key="row.id" class="border-zinc-50 dark:border-zinc-900 last:border-0">
                <TableCell class="pl-5 py-3 text-sm font-semibold text-zinc-800 dark:text-zinc-200 uppercase">
                  {{ row.name }}
                </TableCell>
                <TableCell class="py-2">
                  <Input
                    v-if="draft[row.id]"
                    v-model="draft[row.id]!.draw"
                    inputmode="numeric"
                    :aria-label="`Número de sorteo de ${row.name}`"
                    :aria-invalid="duplicateSet.has(toInt(draft[row.id]!.draw) ?? -1) || undefined"
                    class="h-8 w-20 text-sm aria-[invalid=true]:border-red-500"
                  />
                </TableCell>
                <TableCell class="py-2 pr-5">
                  <Input
                    v-if="draft[row.id]"
                    v-model="draft[row.id]!.minutes"
                    inputmode="numeric"
                    :placeholder="defaultMinutes ? String(defaultMinutes) : '—'"
                    :aria-label="`Minutos de actuación de ${row.name}`"
                    class="h-8 w-20 text-sm"
                  />
                </TableCell>
              </TableRow>
              <TableRow v-if="rows.length === 0">
                <TableCell colspan="3" class="py-8 text-center text-sm text-zinc-400">
                  Esta ronda aún no tiene participantes.
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </div>

      <DialogFooter class="p-5 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/30 flex justify-end gap-3">
        <Button variant="ghost" class="font-bold h-9 px-5 uppercase text-[10px] tracking-widest" @click="open = false">Cancelar</Button>
        <Button
          class="bg-amber-600 hover:bg-amber-700 text-white font-bold h-9 px-6 uppercase text-[10px] tracking-widest rounded-lg shadow-sm"
          :disabled="!canSave || rows.length === 0"
          @click="save"
        >
          <Activity v-if="isSaving" class="w-3.5 h-3.5 mr-1.5 animate-spin" />
          {{ isSaving ? 'Guardando...' : 'Guardar sorteo' }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
