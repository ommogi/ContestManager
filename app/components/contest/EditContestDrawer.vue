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
import { Save, Target, Plus, Layers, CalendarRange, Upload, X, Link2, Copy, Check, Euro } from 'lucide-vue-next'
import { parseDate } from '@internationalized/date'
import { type DateRange } from 'reka-ui'
import { useContestStore } from '@/stores/contest'
import { toast } from 'vue-sonner'

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
const drawerRange = ref<DateRange | null>(null)
const uploadingCover = ref(false)

async function handleCoverChange(e: Event) {
  const inputEl = e.target as HTMLInputElement
  const file = inputEl.files?.[0]
  if (!file || !props.contest?.id) return

  // Local preview
  editForm.value.cover_image_url = URL.createObjectURL(file)
  uploadingCover.value = true

  try {
    const nuxtApp = useNuxtApp()
    const supabase = nuxtApp.$supabase as any
    const ext = file.name.split('.').pop()
    const path = `covers/${props.contest.id}-${Date.now()}.${ext}`

    const { error: upErr } = await supabase.storage
      .from('contest-assets')
      .upload(path, file, { upsert: true, contentType: file.type })
    if (upErr) throw upErr

    const { data: urlData } = supabase.storage.from('contest-assets').getPublicUrl(path)
    editForm.value.cover_image_url = urlData.publicUrl
    toast.success('Imagen subida')
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
})

const handleUpdate = async () => {
  // Validación básica
  if (!editForm.value.name.trim()) {
    toast.error('El nombre del concurso es obligatorio')
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
    emit('updated')
    emit('update:open', false)
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
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
            <!-- Columna Izquierda: Identificación y Parámetros -->
            <div class="space-y-6">
              <div class="grid grid-cols-1 gap-4">
                <!-- Modo y Rondas -->
                <div class="space-y-4">
                  <div class="grid gap-2">
                    <Label class="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-zinc-400">
                      <Target class="w-3.5 h-3.5" /> Modo del Concurso
                    </Label>
                    <Select v-model="editForm.mode" :modal="false">
                      <SelectTrigger class="h-10 border-2">
                        <SelectValue placeholder="Selecciona el modo">
                          {{ editForm.mode === 'standard' ? 'Estándar' : editForm.mode === 'tournament' ? 'Torneo' : '' }}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="standard">
                          <div class="flex flex-col items-start gap-0.5 py-1">
                            <span class="font-bold">Estándar</span>
                            <span class="text-[10px] text-muted-foreground">Formato tradicional de concurso.</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="tournament">
                          <div class="flex flex-col items-start gap-0.5 py-1">
                            <span class="font-bold">Torneo</span>
                            <span class="text-[10px] text-muted-foreground">Eliminatorias directas.</span>
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <!-- Numero de Rondas (Ahora debajo de Modo) -->
                  <transition 
                    enter-active-class="transition duration-300 ease-out" 
                    enter-from-class="transform -translate-y-2 opacity-0" 
                    enter-to-class="transform translate-y-0 opacity-100"
                  >
                    <div v-if="editForm.mode === 'standard' && !editForm.is_rounds_dynamic" class="grid gap-2">
                      <Label for="roundsCount" class="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                        <Plus class="w-3 h-3" /> Número de Rondas
                      </Label>
                      <NumberField 
                        id="roundsCount" 
                        v-model="editForm.rounds_count" 
                        :min="1" 
                        :max="20"
                      >
                        <NumberFieldContent>
                          <NumberFieldDecrement />
                          <NumberFieldInput 
                             class="h-10 px-3 text-sm bg-muted/40 border-2 border-border font-bold text-center" 
                          />
                          <NumberFieldIncrement />
                        </NumberFieldContent>
                      </NumberField>
                    </div>
                  </transition>
                </div>

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
                <div class="grid grid-cols-2 gap-4">
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
                  <div class="grid gap-2">
                    <Label for="type" class="text-xs font-bold uppercase tracking-wider text-zinc-400">Tipo</Label>
                    <Select v-model="editForm.type" :modal="false">
                      <SelectTrigger id="type" class="h-10 border-2">
                        <SelectValue placeholder="Tipo" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="music">Música</SelectItem>
                        <SelectItem value="dance">Baile</SelectItem>
                        <SelectItem value="general">General</SelectItem>
                        <SelectItem value="libre">Libre</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </div>

            <!-- Columna Derecha: Configuración Técnica y Fechas -->
            <div class="space-y-8">
              <!-- Estructura (Movida a la derecha) -->
              <transition 
                 enter-active-class="transition duration-300 ease-out" 
                 enter-from-class="transform translate-x-4 opacity-0" 
                 enter-to-class="transform translate-x-0 opacity-100"
              >
                <div v-if="editForm.mode === 'standard'" class="grid gap-3">
                   <Label class="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                     <Layers class="w-3.5 h-3.5" /> Configuración de Estructura
                   </Label>
                   <div class="grid grid-cols-2 gap-1 p-1.5 bg-muted rounded-xl border-2 border-border shadow-inner">
                     <button 
                       type="button"
                       :class="[
                         'text-[10px] py-2.5 rounded-lg transition-all font-bold uppercase tracking-widest',
                         !editForm.is_rounds_dynamic ? 'bg-card border border-border shadow-lg' : 'text-muted-foreground hover:text-foreground'
                       ]"
                       @click="editForm.is_rounds_dynamic = false"
                     >
                       Fija
                     </button>
                     <button 
                       type="button"
                       :class="[
                         'text-[10px] py-2.5 rounded-lg transition-all font-bold uppercase tracking-widest',
                         editForm.is_rounds_dynamic ? 'bg-card border border-border shadow-lg' : 'text-muted-foreground hover:text-foreground'
                       ]"
                       @click="editForm.is_rounds_dynamic = true"
                     >
                       Dinámica
                     </button>
                   </div>
                   <p class="text-[10px] text-muted-foreground italic px-1">
                     {{ editForm.is_rounds_dynamic ? 'Las rondas se crean sobre la marcha según la participación.' : 'Define un número exacto de rondas antes de comenzar.' }}
                   </p>
                </div>
              </transition>

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
            </div>
          </div>
        </div>

        <DrawerFooter style="flex-shrink: 0;" class="flex flex-row justify-end border-t gap-3 p-6 pt-4">
          <Button variant="outline" @click="emit('update:open', false)" class="text-[10px] font-bold uppercase tracking-widest px-6 bg-zinc-50 dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 border-2 rounded-md">Cerrar</Button>
          <Button class="bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 gap-2 text-[10px] font-bold uppercase tracking-widest px-6 border-2 border-border rounded-md" :disabled="isUpdating" @click="handleUpdate">
            <Save class="w-4 h-4" />
            {{ isUpdating ? 'Guardando...' : 'Guardar Cambios' }}
          </Button>
        </DrawerFooter>
      </div>
    </DrawerContent>
  </Drawer>
</template>
