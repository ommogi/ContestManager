<script setup lang="ts">
// A participant's repertoire for one round (KAN-17): works from the
// organisation's catalogue, in playing order, each with its own length. Editable
// while the round is pending; read-only once it has started.
import { computed, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import { Music2, Search, ArrowUp, ArrowDown, X, Copy, Activity, Lock } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { apiClient } from '@/api/apiClient'
import { formatDuration, parseDuration } from '~~/shared/works-catalog'
import { repertoireTotal } from '~~/shared/repertoire'

interface Entry {
  work_id: string
  title: string
  catalog_ref: string | null
  composer: string
  archived: boolean
  duration_seconds: number | null
  catalog_seconds: number | null
}

interface View {
  editable: boolean
  roundStatus: string
  items: Entry[]
  previous: { roundName: string; items: Entry[] } | null
}

interface CatalogWork {
  id: string
  title: string
  catalog_ref: string | null
  duration_seconds: number | null
  composer: { name: string } | null
}

const props = defineProps<{
  roundParticipantId: string | null
  participantName: string
  contestId: string
}>()
const emit = defineEmits<{ saved: [] }>()
const open = defineModel<boolean>('open', { required: true })

// apiClient's route-typed signature does not know these endpoints.
const api = apiClient as unknown as <T>(url: string, opts?: { method?: string; body?: unknown; query?: Record<string, unknown> }) => Promise<T>

const view = ref<View | null>(null)
/** Working copy; `duration` is the m:ss text being typed. */
const items = ref<Array<Entry & { duration: string }>>([])
const isLoading = ref(false)
const isSaving = ref(false)
const query = ref('')
const results = ref<CatalogWork[]>([])

function toDraft(entries: Entry[]) {
  return entries.map(e => ({ ...e, duration: formatDuration(e.duration_seconds) }))
}

watch(open, async (isOpen) => {
  if (!isOpen || !props.roundParticipantId) return
  isLoading.value = true
  query.value = ''
  results.value = []
  try {
    view.value = await api<View>(`/api/round-participants/${props.roundParticipantId}/repertoire`)
    items.value = toDraft(view.value.items)
  } catch {
    toast.error('No se ha podido cargar el repertorio')
    open.value = false
  } finally {
    isLoading.value = false
  }
})

const editable = computed(() => !!view.value?.editable)

let searchTimer: ReturnType<typeof setTimeout> | undefined
watch(query, (q) => {
  clearTimeout(searchTimer)
  if (!q.trim()) { results.value = []; return }
  searchTimer = setTimeout(async () => {
    try {
      const found = await api<CatalogWork[]>(`/api/contests/${props.contestId}/works`, { query: { q } })
      const chosen = new Set(items.value.map(i => i.work_id))
      results.value = found.filter(w => !chosen.has(w.id)).slice(0, 8)
    } catch {
      results.value = []
    }
  }, 200)
})

function add(work: CatalogWork) {
  items.value.push({
    work_id: work.id,
    title: work.title,
    catalog_ref: work.catalog_ref,
    composer: work.composer?.name ?? '—',
    archived: false,
    duration_seconds: null,
    catalog_seconds: work.duration_seconds,
    duration: '',
  })
  query.value = ''
  results.value = []
}

function move(index: number, delta: -1 | 1) {
  const target = index + delta
  if (target < 0 || target >= items.value.length) return
  const list = items.value
  ;[list[index], list[target]] = [list[target]!, list[index]!]
}

function remove(index: number) {
  items.value.splice(index, 1)
}

function copyPrevious() {
  if (!view.value?.previous) return
  items.value = toDraft(view.value.previous.items.filter(i => !i.archived))
  toast.info(`Copiado de ${view.value.previous.roundName}. Revisa y guarda.`)
}

const invalidRows = computed(() => items.value
  .map((item, index) => ({ index, bad: item.duration.trim() !== '' && parseDuration(item.duration) === null }))
  .filter(r => r.bad)
  .map(r => r.index))

const total = computed(() => repertoireTotal(items.value.map(i => ({
  duration_seconds: parseDuration(i.duration),
  catalog_seconds: i.catalog_seconds,
}))))

async function save() {
  if (!props.roundParticipantId || invalidRows.value.length) return
  isSaving.value = true
  try {
    await api(`/api/round-participants/${props.roundParticipantId}/repertoire`, {
      method: 'PUT',
      body: { items: items.value.map(i => ({ work_id: i.work_id, duration_seconds: parseDuration(i.duration) })) },
    })
    toast.success('Repertorio guardado')
    emit('saved')
    open.value = false
  } catch (e: unknown) {
    const err = e as { data?: { message?: string } }
    toast.error(err?.data?.message || 'No se ha podido guardar el repertorio')
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="max-w-2xl rounded-2xl overflow-hidden p-0 border border-zinc-200 dark:border-zinc-800 shadow-xl bg-white dark:bg-zinc-950">
      <div class="p-6 pr-16 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 flex items-center gap-4">
        <div class="w-11 h-11 rounded-xl bg-rose-600 flex items-center justify-center shadow-sm shrink-0">
          <Music2 class="w-5 h-5 text-white" />
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-0.5">Repertorio</p>
          <h2 class="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 uppercase truncate">{{ participantName }}</h2>
        </div>
      </div>

      <div class="p-6 max-h-[65vh] overflow-y-auto space-y-4">
        <div v-if="isLoading" class="flex items-center justify-center gap-2 py-8 text-sm text-zinc-500">
          <Activity class="w-4 h-4 animate-spin" /> Cargando…
        </div>

        <template v-else-if="view">
          <p
            v-if="!editable"
            class="flex items-center gap-2 rounded-lg border border-zinc-200 dark:border-zinc-800 p-3 text-xs text-zinc-600 dark:text-zinc-400"
            role="status"
          >
            <Lock class="w-4 h-4 shrink-0" />
            La ronda ya ha empezado: el repertorio queda fijo para que el jurado no vea cambios a mitad de actuación.
          </p>

          <!-- Add from the catalogue -->
          <div v-if="editable" class="relative">
            <Search class="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input v-model="query" type="search" placeholder="Añadir obra: compositor o título…" aria-label="Buscar obra en el catálogo" class="pl-9 h-9" />
            <ul
              v-if="results.length"
              class="absolute z-10 mt-1 w-full rounded-md border bg-popover shadow-md max-h-60 overflow-y-auto"
              role="listbox"
              aria-label="Obras del catálogo"
            >
              <li v-for="w in results" :key="w.id">
                <button type="button" role="option" aria-selected="false" class="w-full text-left px-3 py-2 text-sm hover:bg-muted flex justify-between gap-3" @click="add(w)">
                  <span><strong>{{ w.composer?.name }}</strong> — {{ w.title }}<span v-if="w.catalog_ref" class="text-muted-foreground"> ({{ w.catalog_ref }})</span></span>
                  <span class="font-mono text-muted-foreground">{{ formatDuration(w.duration_seconds) }}</span>
                </button>
              </li>
            </ul>
          </div>

          <div v-if="editable && view.previous && items.length === 0" class="flex justify-start">
            <Button variant="outline" size="sm" class="gap-2 text-xs" @click="copyPrevious">
              <Copy class="w-3.5 h-3.5" /> Copiar de {{ view.previous.roundName }}
            </Button>
          </div>

          <ol class="space-y-2" aria-label="Obras en orden de interpretación">
            <li
              v-for="(item, index) in items"
              :key="item.work_id"
              class="flex items-center gap-3 rounded-lg border border-zinc-100 dark:border-zinc-800 p-2.5"
            >
              <span class="w-5 text-center font-mono text-xs text-zinc-400">{{ index + 1 }}</span>
              <div class="flex-1 min-w-0">
                <p class="text-sm font-semibold truncate">{{ item.composer }}</p>
                <p class="text-sm text-zinc-600 dark:text-zinc-400 truncate">
                  {{ item.title }}<span v-if="item.catalog_ref"> ({{ item.catalog_ref }})</span>
                  <span v-if="item.archived" class="text-amber-600"> · archivada</span>
                </p>
              </div>
              <Input
                v-model="item.duration"
                :disabled="!editable"
                inputmode="numeric"
                :placeholder="formatDuration(item.catalog_seconds) || 'm:ss'"
                :aria-label="`Duración de ${item.title}`"
                :aria-invalid="invalidRows.includes(index) || undefined"
                class="h-8 w-20 text-sm font-mono aria-[invalid=true]:border-red-500"
              />
              <div v-if="editable" class="flex gap-0.5">
                <Button size="icon" variant="ghost" class="h-8 w-8" :disabled="index === 0" :aria-label="`Subir ${item.title}`" @click="move(index, -1)">
                  <ArrowUp class="w-4 h-4" />
                </Button>
                <Button size="icon" variant="ghost" class="h-8 w-8" :disabled="index === items.length - 1" :aria-label="`Bajar ${item.title}`" @click="move(index, 1)">
                  <ArrowDown class="w-4 h-4" />
                </Button>
                <Button size="icon" variant="ghost" class="h-8 w-8 text-red-600" :aria-label="`Quitar ${item.title}`" @click="remove(index)">
                  <X class="w-4 h-4" />
                </Button>
              </div>
            </li>
            <li v-if="items.length === 0" class="py-6 text-center text-sm text-zinc-400">Sin obras todavía.</li>
          </ol>

          <!-- Running total (KAN-17) -->
          <div class="flex items-center justify-between rounded-lg bg-zinc-50 dark:bg-zinc-900/50 px-4 py-3 text-sm" aria-live="polite">
            <span class="font-semibold">Total</span>
            <span class="font-mono">
              {{ formatDuration(total.seconds) || '0:00' }}
              <span class="text-zinc-500"> · turno de {{ total.slotMinutes }} min</span>
              <span v-if="total.missing" class="text-amber-600"> · {{ total.missing }} sin duración</span>
            </span>
          </div>
        </template>
      </div>

      <DialogFooter class="p-5 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/30 flex justify-end gap-3">
        <Button variant="ghost" class="font-bold h-9 px-5 uppercase text-[10px] tracking-widest" @click="open = false">
          {{ editable ? 'Cancelar' : 'Cerrar' }}
        </Button>
        <Button
          v-if="editable"
          class="bg-rose-600 hover:bg-rose-700 text-white font-bold h-9 px-6 uppercase text-[10px] tracking-widest rounded-lg shadow-sm"
          :disabled="isSaving || invalidRows.length > 0"
          @click="save"
        >
          <Activity v-if="isSaving" class="w-3.5 h-3.5 mr-1.5 animate-spin" />
          {{ isSaving ? 'Guardando...' : 'Guardar repertorio' }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
