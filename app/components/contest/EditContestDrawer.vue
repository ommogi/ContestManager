<script setup lang="ts">
import { 
  Drawer, 
  DrawerContent, 
  DrawerDescription, 
  DrawerFooter, 
  DrawerHeader, 
  DrawerTitle 
} from '@/components/ui/drawer'
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RangeCalendar } from '@/components/ui/range-calendar'
import {
  NumberField,
  NumberFieldContent,
  NumberFieldDecrement,
  NumberFieldIncrement,
  NumberFieldInput,
} from '@/components/ui/number-field'
import { Save, Target, Plus, Layers, CalendarRange, Upload, X, Link2, Copy, Check, Euro, Lock, AlarmClock, Vote } from 'lucide-vue-next'
import { MAX_CALL_OFFSET_MINUTES } from '~~/shared/session-window'
import { votingSystemLabel } from '~~/shared/voting'
import { parseDate } from '@internationalized/date'
import { type DateRange } from 'reka-ui'
import { useContestStore } from '@/stores/contest'
import { toast } from 'vue-sonner'
import { objectPathFromPublicUrl } from '~~/shared/storage-path'
import { resizeImageFile, COVER_POLICY } from '@/utils/image-resize'

const props = defineProps<{
  open: boolean
  contest: any
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'updated': []
}>()

const contestStore = useContestStore()
const isUpdating = ref(false)

/**
 * A finished or cancelled contest is locked: the server rejects any PATCH on it,
 * so the form is shown read-only instead of letting the user hit a 409.
 */
const isLocked = computed(() =>
  props.contest?.status === 'finished' || props.contest?.status === 'cancelled'
)
const lockReason = computed(() =>
  props.contest?.status === 'finished'
    ? 'Este concurso está finalizado. Su configuración ya no se puede modificar.'
    : 'Este concurso está cancelado. Su configuración ya no se puede modificar.'
)
const drawerRange = ref<DateRange | null>(null)
const uploadingCover = ref(false)

/** Contest covers and the shared brand assets live here. */
const BUCKET = 'contest-assets'

/**
 * Covers uploaded in this drawer that nothing saved points at yet.
 *
 * Unlike the logo in `<FileUpload>`, a cover is not persisted when it is
 * uploaded: it only reaches `contests.cover_image_url` when the drawer is
 * saved. So an upload is garbage until then — and stays garbage if the drawer
 * is closed instead of saved. Deleting the replaced object at upload time,
 * which is what the logo does, would destroy the cover the contest is still
 * pointing at for anyone who cancels.
 */
const unsavedCoverPaths = ref<string[]>([])

const nuxtApp = useNuxtApp()

/**
 * Best-effort removal. The save already succeeded by the time this runs, so
 * reporting a cleanup failure would describe the wrong outcome; the path is
 * logged instead so it can be removed by hand.
 *
 * Not awaited by its callers: the request is in flight before this returns, so
 * closing the drawer cannot cut it short.
 */
async function discardCoverObjects(paths: string[]) {
  if (paths.length === 0) return
  const supabase = nuxtApp.$supabase as any
  const { error } = await supabase.storage.from(BUCKET).remove(paths)
  if (error) {
    console.warn(`[edit-contest] cover object(s) left behind: ${paths.join(', ')}`, error.message)
  }
}

async function handleCoverChange(e: Event) {
  const inputEl = e.target as HTMLInputElement
  const picked = inputEl.files?.[0]
  if (!picked || !props.contest?.id) return

  // Shrink before anything else, so the preview shows what will actually be
  // uploaded rather than the original. A cover is flattened to JPEG: it is a
  // full-bleed image where transparency means nothing, and that conversion is
  // what turned 4,7 MB into 311 kB for the default cover (KAN-80) — the same
  // picture as PNG still weighed 2,7 MB.
  //
  // Never throws: on any failure it hands back the original, because blocking
  // an upload over an optimisation would punish the user for something they did
  // not ask for.
  uploadingCover.value = true
  const { file, mimeType, extension } = await resizeImageFile(picked, COVER_POLICY)

  // Local preview
  editForm.value.cover_image_url = URL.createObjectURL(file)

  try {
    const nuxtApp = useNuxtApp()
    const supabase = nuxtApp.$supabase as any
    // `covers/<contest_id>/<uuid>.<ext>`, with the contest as its own folder.
    // It used to be `covers/<contest_id>-<timestamp>.<ext>` — the id inside the
    // file name — which no storage policy can read, so the bucket had to allow
    // any authenticated user to write anywhere (0060).
    //
    // The extension and the content type come from the file that actually
    // results, never from the one that was picked: a PNG that leaves here as
    // JPEG and is labelled `image/png` is refused outright by the bucket's
    // `allowed_mime_types` (0060).
    const path = `covers/${props.contest.id}/${crypto.randomUUID()}.${extension}`

    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { upsert: true, contentType: mimeType })
    if (upErr) throw upErr

    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path)
    editForm.value.cover_image_url = urlData.publicUrl
    toast.success('Imagen subida')

    // Nothing points at this object yet — saving or closing decides which.
    unsavedCoverPaths.value.push(path)
  } catch (err: any) {
    toast.error(err?.message ?? 'Error al subir imagen')
    editForm.value.cover_image_url = props.contest.cover_image_url || ''
  } finally {
    uploadingCover.value = false
    inputEl.value = ''
  }
}

function clearCover() {
  editForm.value.cover_image_url = ''
}

const editForm = ref({
  name: '',
  type: 'general',
  status: 'draft',
  is_rounds_dynamic: false,
  mode: 'standard',
  rounds_count: 1,
  cover_image_url: '',
  registration_open: true,
  entry_fee_eur: 0,
  // '' = not using call times; kept as text so an emptied input is not 0.
  call_offset_minutes: '' as string | number,
})

const registrationUrl = computed(() => {
  const token = props.contest?.registration_token
  if (!token) return ''
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  return `${origin}/join/${token}`
})

const copiedLink = ref(false)
async function copyRegistrationUrl() {
  if (!registrationUrl.value) return
  try {
    await navigator.clipboard.writeText(registrationUrl.value)
    copiedLink.value = true
    toast.success('Enlace copiado')
    setTimeout(() => { copiedLink.value = false }, 1500)
  } catch {
    toast.error('No se pudo copiar')
  }
}

// Sincronizar formulario al abrir
watch(() => props.open, (isOpen) => {
  if (isOpen && props.contest) {
    editForm.value = {
      name: props.contest.name || '',
      type: props.contest.type || 'general',
      status: props.contest.status || 'draft',
      is_rounds_dynamic: props.contest.is_rounds_dynamic || false,
      mode: (props.contest.settings as any)?.mode || 'standard',
      rounds_count: (props.contest.settings as any)?.rounds_count || 1,
      cover_image_url: props.contest.cover_image_url || '',
      registration_open: props.contest.registration_open !== false,
      entry_fee_eur: (props.contest.entry_fee_cents || 0) / 100,
      call_offset_minutes: (props.contest as any).call_offset_minutes ?? '',
    }
    
    if (props.contest.starts_at && props.contest.ends_at) {
      try {
        drawerRange.value = {
          start: parseDate(props.contest.starts_at.split('T')[0]) as any,
          end: parseDate(props.contest.ends_at.split('T')[0]) as any
        }
      } catch (e) {
        drawerRange.value = null
      }
    } else {
      drawerRange.value = null
    }
  }

  // Closed without saving: the contest still points at the cover it had, so
  // every object uploaded in this session is orphaned. A successful save clears
  // the list first, so this only ever fires on a genuine cancel.
  if (!isOpen) {
    const garbage = unsavedCoverPaths.value
    unsavedCoverPaths.value = []
    void discardCoverObjects(garbage)
  }
})

const handleUpdate = async () => {
  // Validación básica
  if (!editForm.value.name.trim()) {
    toast.error('El nombre del concurso es obligatorio')
    return
  }

  // Call offset (KAN-12): empty clears it, otherwise a whole number of minutes.
  const rawOffset = String(editForm.value.call_offset_minutes ?? '').trim()
  const callOffset = rawOffset === '' ? null : Number(rawOffset)
  if (callOffset !== null && (!Number.isInteger(callOffset) || callOffset < 0 || callOffset > MAX_CALL_OFFSET_MINUTES)) {
    toast.error(`La convocatoria debe ser un número de minutos entre 0 y ${MAX_CALL_OFFSET_MINUTES}`)
    return
  }

  isUpdating.value = true
  try {
    const payload: any = {
      name: editForm.value.name,
      type: editForm.value.type as any,
      status: editForm.value.status as any,
      is_rounds_dynamic: editForm.value.is_rounds_dynamic,
      cover_image_url: editForm.value.cover_image_url?.trim() || null,
      registration_open: editForm.value.registration_open,
      entry_fee_cents: Math.max(0, Math.round(Number(editForm.value.entry_fee_eur || 0) * 100)),
      call_offset_minutes: callOffset,
      settings: {
        ...(props.contest.settings as any || {}),
        mode: editForm.value.mode,
        rounds_count: editForm.value.rounds_count,
      }
    }
    
    if (drawerRange.value?.start) {
      payload.starts_at = drawerRange.value.start.toString()
    }
    if (drawerRange.value?.end) {
      payload.ends_at = drawerRange.value.end.toString()
    }

    const promise = contestStore.updateContest(payload)
    
    toast.promise(promise, {
      loading: 'Actualizando parámetros del concurso...',
      success: 'Configuración actualizada correctamente',
      error: 'Error al actualizar el concurso'
    })

    await promise

    // The row now points at whatever was saved, so everything else this drawer
    // uploaded is garbage — plus the cover that was just replaced. Computed and
    // cleared before the emits: closing the drawer sweeps the same list, and it
    // must not find the object the save just made real.
    const savedPath = objectPathFromPublicUrl(payload.cover_image_url, BUCKET)
    const replacedPath = objectPathFromPublicUrl(props.contest.cover_image_url, BUCKET)
    const garbage = new Set(unsavedCoverPaths.value.filter(p => p !== savedPath))
    if (replacedPath && replacedPath !== savedPath) garbage.add(replacedPath)
    unsavedCoverPaths.value = []

    emit('updated')
    emit('update:open', false)
    void discardCoverObjects([...garbage])
  } catch (error) {
    console.error('Update failed:', error)
  } finally {
    isUpdating.value = false
  }
}

const handleOpenAutoFocus = (e: Event) => {
  e.preventDefault()
  setTimeout(() => {
    const input = document.getElementById('name')
    if (input) input.focus()
  }, 50)
}
</script>

<template>
  <Drawer :open="open" @update:open="emit('update:open', $event)">
    <DrawerContent @open-auto-focus="handleOpenAutoFocus">
      <div class="mx-auto w-full max-w-4xl" style="max-height: 80vh; display: flex; flex-direction: column; overflow: hidden;">
        <DrawerHeader style="flex-shrink: 0;">
          <DrawerTitle>Configuración Global</DrawerTitle>
          <DrawerDescription>Modifica los parámetros básicos del concurso.</DrawerDescription>
        </DrawerHeader>
        
        <div style="flex: 1 1 0%; overflow-y: auto; min-height: 0;" class="p-4 sm:p-6">
          <div
            v-if="isLocked"
            class="mb-6 flex items-start gap-3 rounded-lg border-2 border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30"
          >
            <Lock class="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <p class="text-sm text-amber-800 dark:text-amber-200">{{ lockReason }}</p>
          </div>

          <!-- `disabled` on a fieldset disables every control nested inside it -->
          <fieldset :disabled="isLocked" :class="isLocked ? 'opacity-60' : ''">
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
            <!-- Columna Izquierda: Identificación y Parámetros -->
            <div class="space-y-6">
              <div class="grid grid-cols-1 gap-4">

                <!-- Nombre y Descripción -->
                <div class="grid gap-4 pt-2">
                  <div class="grid gap-2">
                    <Label for="name" class="text-xs font-bold uppercase tracking-wider text-zinc-400">Nombre del Concurso</Label>
                    <Input id="name" v-model="editForm.name" class="h-10 border-2" placeholder="Ej. Mi Concurso de Baile" />
                  </div>
                  <div class="grid gap-2">
                    <Label for="cover_image_file" class="text-xs font-bold uppercase tracking-wider text-zinc-400">Imagen de Fondo</Label>
                    <Input
                      id="cover_image_file"
                      type="file"
                      accept="image/*"
                      class="h-10 border-2 cursor-pointer file:cursor-pointer file:mr-3 file:px-3 file:py-1 file:rounded-md file:border-0 file:bg-muted file:text-xs file:font-bold file:uppercase file:tracking-widest"
                      :disabled="uploadingCover"
                      @change="handleCoverChange"
                    />
                    <div v-if="editForm.cover_image_url" class="relative mt-2 h-28 rounded-lg overflow-hidden border-2 border-border bg-muted">
                      <img :src="editForm.cover_image_url" class="w-full h-full object-cover" alt="Preview" />
                      <div v-if="uploadingCover" class="absolute inset-0 bg-black/50 flex items-center justify-center">
                        <Upload class="w-5 h-5 text-white animate-pulse" />
                      </div>
                      <button
                        type="button"
                        class="absolute top-2 right-2 p-1 rounded-full bg-black/60 hover:bg-red-600 text-white transition"
                        @click="clearCover"
                      >
                        <X class="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>

                <!-- Estado y Tipo -->
                <div class="grid gap-4">
                  <div class="grid gap-2">
                    <Label for="status" class="text-xs font-bold uppercase tracking-wider text-zinc-400">Estado</Label>
                    <Select v-model="editForm.status" :modal="false">
                      <SelectTrigger id="status" class="h-10 border-2">
                        <SelectValue placeholder="Estado" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="draft">Borrador</SelectItem>
                        <SelectItem value="active">Activo</SelectItem>
                        <SelectItem value="finished">Finalizado</SelectItem>
                        <SelectItem value="cancelled">Cancelado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </div>

            <!-- Columna Derecha:  Fechas -->
            <div class="space-y-8">

              <!-- Calendario -->
              <div class="grid gap-3">
                <Label class="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-zinc-400">
                  <CalendarRange class="w-3.5 h-3.5" /> Duración del Concurso
                </Label>
                <div class="border-2 rounded-2xl p-3 sm:p-4 bg-muted/40 border-border flex justify-center shadow-sm w-full sm:w-fit overflow-x-auto mx-auto">
                  <RangeCalendar :model-value="(drawerRange as any)" @update:model-value="drawerRange = $event" :number-of-months="1" class="shadow-none border-none" />
                </div>
              </div>
            </div>
          </div>

          <!-- Inscripciones públicas (dentro del scroll) -->
          <div class="mt-6">
            <div class="border-2 border-border rounded-xl p-4 bg-muted/30 space-y-4">
              <div class="flex items-center justify-between gap-4">
                <div class="flex items-center gap-2 min-w-0">
                  <Link2 class="w-4 h-4 text-zinc-500 shrink-0" />
                  <div class="min-w-0">
                    <p class="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">Inscripciones públicas</p>
                    <p class="text-[10px] text-muted-foreground">Activa para permitir que los participantes se inscriban con el enlace.</p>
                  </div>
                </div>
                <button
                  type="button"
                  class="w-11 h-6 rounded-full relative transition-colors shrink-0"
                  :class="editForm.registration_open ? 'bg-emerald-500' : 'bg-zinc-300 dark:bg-zinc-700'"
                  @click="editForm.registration_open = !editForm.registration_open"
                >
                  <div
                    class="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all"
                    :class="editForm.registration_open ? 'left-[22px]' : 'left-0.5'"
                  ></div>
                </button>
              </div>
              <div v-if="registrationUrl" class="flex items-center gap-2">
                <Input :model-value="registrationUrl" readonly class="h-9 text-xs font-mono border-2 bg-background" />
                <Button
                  type="button"
                  variant="outline"
                  class="h-9 gap-1.5 border-2 text-[10px] font-bold uppercase tracking-widest shrink-0"
                  @click="copyRegistrationUrl"
                >
                  <Check v-if="copiedLink" class="w-3.5 h-3.5 text-emerald-600" />
                  <Copy v-else class="w-3.5 h-3.5" />
                  {{ copiedLink ? 'Copiado' : 'Copiar' }}
                </Button>
              </div>

              <!-- Cuota de inscripción -->
              <div class="flex items-center gap-3 pt-2 border-t border-border/60">
                <Euro class="w-4 h-4 text-zinc-500 shrink-0" />
                <div class="flex-1 min-w-0">
                  <p class="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">Cuota de inscripción</p>
                  <p class="text-[10px] text-muted-foreground">Dejar en 0 para inscripción gratuita. Cobro vía Stripe.</p>
                </div>
                <div class="flex items-center gap-1">
                  <Input
                    v-model.number="editForm.entry_fee_eur"
                    type="number"
                    min="0"
                    step="0.5"
                    class="h-9 w-24 text-sm font-mono border-2 text-right"
                    placeholder="0"
                  />
                  <span class="text-xs font-bold text-muted-foreground">€</span>
                </div>
              </div>

              <!-- Voting system (KAN-23): shown, never edited from here. It is
                   chosen when the contest is created and the server refuses to
                   change it once the jury has voted. -->
              <div class="flex items-center gap-3 pt-2 border-t border-border/60">
                <Vote class="w-4 h-4 text-zinc-500 shrink-0" />
                <div class="flex-1 min-w-0">
                  <p class="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">Sistema de votación</p>
                  <p class="text-[10px] text-muted-foreground">Se elige al crear el concurso y no cambia una vez el jurado ha puntuado.</p>
                </div>
                <span class="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                  {{ votingSystemLabel((props.contest as any)?.voting_system) }}
                </span>
              </div>

              <!-- Convocatoria (KAN-12) -->
              <div class="flex items-center gap-3 pt-2 border-t border-border/60">
                <AlarmClock class="w-4 h-4 text-zinc-500 shrink-0" />
                <div class="flex-1 min-w-0">
                  <p class="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">Convocatoria</p>
                  <p class="text-[10px] text-muted-foreground">Minutos antes de actuar a los que se cita al participante. Igual para todo el concurso; vacío si no se usa.</p>
                </div>
                <div class="flex items-center gap-1">
                  <Input
                    v-model="editForm.call_offset_minutes"
                    type="number"
                    min="0"
                    :max="MAX_CALL_OFFSET_MINUTES"
                    step="5"
                    aria-label="Minutos de convocatoria antes de actuar"
                    class="h-9 w-24 text-sm font-mono border-2 text-right"
                    placeholder="—"
                  />
                  <span class="text-xs font-bold text-muted-foreground">min</span>
                </div>
              </div>
            </div>
          </div>
          </fieldset>
        </div>

        <DrawerFooter style="flex-shrink: 0;" class="flex flex-row justify-end border-t gap-3 p-6 pt-4">
          <Button variant="outline" @click="emit('update:open', false)" class="text-[10px] font-bold uppercase tracking-widest px-6 bg-zinc-50 dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 border-2 rounded-md">Cerrar</Button>
          <Button v-if="!isLocked" class="bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 gap-2 text-[10px] font-bold uppercase tracking-widest px-6 border-2 border-border rounded-md" :disabled="isUpdating" @click="handleUpdate">
            <Save class="w-4 h-4" />
            {{ isUpdating ? 'Guardando...' : 'Guardar Cambios' }}
          </Button>
        </DrawerFooter>
      </div>
    </DrawerContent>
  </Drawer>
</template>
