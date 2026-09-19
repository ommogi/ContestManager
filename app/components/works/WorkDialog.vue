<script setup lang="ts">
// Create or edit a work of the catalogue (KAN-16). The composer is picked from
// the organisation's list or created inline; a new name that looks like an
// existing one is stopped until the user confirms it is a different person.
import { computed, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import { AlertTriangle, Activity } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { useWorksCatalogStore, type CatalogComposer, type CatalogWork } from '~/stores/works-catalog'
import { catalogKey, formatDuration, parseDuration, similarComposers } from '~~/shared/works-catalog'

const props = defineProps<{ work: CatalogWork | null }>()
const open = defineModel<boolean>('open', { required: true })

const store = useWorksCatalogStore()

const composerQuery = ref('')
const composerId = ref<string | null>(null)
const title = ref('')
const catalogRef = ref('')
const duration = ref('')
const isSaving = ref(false)
/** Look-alikes found for a new composer name; the user must pick or confirm. */
const lookAlikes = ref<CatalogComposer[]>([])

watch(open, (isOpen) => {
  if (!isOpen) return
  composerId.value = props.work?.composer_id ?? null
  composerQuery.value = props.work?.composer?.name ?? ''
  title.value = props.work?.title ?? ''
  catalogRef.value = props.work?.catalog_ref ?? ''
  duration.value = formatDuration(props.work?.duration_seconds)
  lookAlikes.value = []
})

const selectedComposer = computed(() => store.composers.find(c => c.id === composerId.value) ?? null)

const composerMatches = computed(() => {
  const key = catalogKey(composerQuery.value)
  if (!key || selectedComposer.value?.name === composerQuery.value) return []
  return store.composers.filter(c => catalogKey(c.name).includes(key)).slice(0, 6)
})

const exactComposer = computed(() =>
  store.composers.find(c => catalogKey(c.name) === catalogKey(composerQuery.value)) ?? null,
)

function pickComposer(c: CatalogComposer) {
  composerId.value = c.id
  composerQuery.value = c.name
  lookAlikes.value = []
}

watch(composerQuery, (value) => {
  if (selectedComposer.value && selectedComposer.value.name !== value) composerId.value = null
  lookAlikes.value = []
})

const durationSeconds = computed(() => parseDuration(duration.value))
const durationInvalid = computed(() => duration.value.trim() !== '' && durationSeconds.value === null)

const canSave = computed(() =>
  !isSaving.value && composerQuery.value.trim() !== '' && title.value.trim() !== '' && !durationInvalid.value,
)

async function resolveComposer(force: boolean): Promise<string | null> {
  if (composerId.value) return composerId.value
  if (exactComposer.value) return exactComposer.value.id

  if (!force) {
    const similar = similarComposers(composerQuery.value, store.composers)
    if (similar.length) {
      lookAlikes.value = similar
      return null
    }
  }
  try {
    return (await store.createComposer(composerQuery.value.trim(), force)).id
  } catch (e: unknown) {
    const err = e as { data?: { statusMessage?: string; data?: { similar?: CatalogComposer[] } } }
    if (err?.data?.statusMessage === 'composer_similar') {
      lookAlikes.value = err.data.data?.similar ?? []
      return null
    }
    throw e
  }
}

async function save(forceNewComposer = false) {
  isSaving.value = true
  try {
    const id = await resolveComposer(forceNewComposer)
    if (!id) return
    await store.saveWork({
      composer_id: id,
      title: title.value.trim(),
      catalog_ref: catalogRef.value.trim() || null,
      duration_seconds: durationSeconds.value,
    }, props.work?.id)
    toast.success(props.work ? 'Obra actualizada' : 'Obra añadida al catálogo')
    open.value = false
  } catch (e: unknown) {
    const err = e as { data?: { message?: string } }
    toast.error(err?.data?.message || 'No se ha podido guardar la obra')
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-[480px]">
      <DialogHeader>
        <DialogTitle>{{ work ? 'Editar obra' : 'Nueva obra' }}</DialogTitle>
        <DialogDescription>
          El nombre del compositor se escribe una sola vez en el catálogo y se reutiliza en todas sus obras.
        </DialogDescription>
      </DialogHeader>

      <div class="grid gap-5 py-2">
        <div class="space-y-1.5 relative">
          <Label for="work-composer">Compositor</Label>
          <Input id="work-composer" v-model="composerQuery" autocomplete="off" placeholder="Busca o escribe un compositor" />
          <ul
            v-if="composerMatches.length"
            class="absolute z-10 mt-1 w-full rounded-md border bg-popover shadow-md max-h-48 overflow-y-auto"
            role="listbox"
            aria-label="Compositores del catálogo"
          >
            <li v-for="c in composerMatches" :key="c.id">
              <button
                type="button"
                class="w-full text-left px-3 py-2 text-sm hover:bg-muted"
                role="option"
                :aria-selected="c.id === composerId"
                @click="pickComposer(c)"
              >
                {{ c.name }}<span v-if="c.archived_at" class="text-muted-foreground"> · archivado</span>
              </button>
            </li>
          </ul>
          <p v-if="!composerId && composerQuery.trim() && !exactComposer" class="text-[11px] text-muted-foreground">
            Se añadirá «{{ composerQuery.trim() }}» como compositor nuevo.
          </p>
        </div>

        <div
          v-if="lookAlikes.length"
          class="rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 p-3 text-xs text-amber-800 dark:text-amber-300 space-y-2"
          role="alert"
        >
          <p class="flex items-center gap-1.5 font-semibold">
            <AlertTriangle class="w-3.5 h-3.5" /> ¿Es alguno de estos?
          </p>
          <div class="flex flex-wrap gap-2">
            <Button v-for="c in lookAlikes" :key="c.id" size="sm" variant="outline" class="h-7 text-xs" @click="pickComposer(c)">
              {{ c.name }}
            </Button>
          </div>
          <Button size="sm" variant="ghost" class="h-7 text-xs px-0 underline" :disabled="isSaving" @click="save(true)">
            No, «{{ composerQuery.trim() }}» es otro compositor
          </Button>
        </div>

        <div class="space-y-1.5">
          <Label for="work-title">Título</Label>
          <Input id="work-title" v-model="title" placeholder="Preludio en do sostenido menor" />
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div class="space-y-1.5">
            <Label for="work-ref">Catálogo</Label>
            <Input id="work-ref" v-model="catalogRef" placeholder="Op. 3 nº 2" />
          </div>
          <div class="space-y-1.5">
            <Label for="work-duration">Duración orientativa</Label>
            <Input
              id="work-duration"
              v-model="duration"
              inputmode="numeric"
              placeholder="7:30"
              :aria-invalid="durationInvalid || undefined"
              aria-describedby="work-duration-hint"
            />
            <p id="work-duration-hint" class="text-[11px]" :class="durationInvalid ? 'text-red-600' : 'text-muted-foreground'">
              {{ durationInvalid ? 'Usa minutos:segundos, hasta 2 horas.' : 'Minutos:segundos, o solo minutos.' }}
            </p>
          </div>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" @click="open = false">Cancelar</Button>
        <Button :disabled="!canSave" @click="save(false)">
          <Activity v-if="isSaving" class="w-3.5 h-3.5 mr-1.5 animate-spin" />
          {{ work ? 'Guardar cambios' : 'Añadir obra' }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
