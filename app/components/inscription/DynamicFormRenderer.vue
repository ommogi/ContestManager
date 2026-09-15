<!-- app/components/inscription/DynamicFormRenderer.vue -->
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type {
  FormField,
  FormFieldOption,
  FormFileReference,
  FormResponses,
  FormResponseValue
} from '~/types/inscription-form'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { DatePicker } from '@/components/ui/date-picker'
import { parseDate, type DateValue, getLocalTimeZone } from '@internationalized/date'
import PhoneInput from '@/components/ui/phone-input/PhoneInput.vue'
import { Button } from '@/components/ui/button'
import { Loader2, Paperclip, X } from 'lucide-vue-next'
import { cn } from '@/utils'

interface Props {
  fields: FormField[]
  modelValue?: FormResponses
  /** Validation messages keyed by `field.id`. Painted under the field. */
  errors?: Record<string, string>
  disabled?: boolean
  showRequiredIndicator?: boolean
  /**
   * Endpoint that accepts one multipart upload and answers with a
   * `FormFileReference` (KAN-41). Without it `file` fields render read-only:
   * the builder preview has no token to upload against, and a field that
   * silently kept `File` objects is exactly the data-loss bug this replaces.
   */
  uploadUrl?: string
  /**
   * Endpoint that releases one already-uploaded file (KAN-67). Without it the
   * X only edits the model, which is what made replacing a file impossible:
   * the server still counted the abandoned row against `maxFiles`. The builder
   * preview has no contest to delete against and keeps the old behaviour.
   */
  deleteUrl?: string
  /** Sent with each upload. The bearer token never travels in the URL. */
  uploadHeaders?: Record<string, string>
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: () => ({}),
  errors: () => ({}),
  disabled: false,
  showRequiredIndicator: true,
  uploadUrl: undefined,
  deleteUrl: undefined,
  uploadHeaders: () => ({})
})

const emit = defineEmits<{
  'update:modelValue': [value: FormResponses]
  'field-blur': [fieldId: string]
  'field-change': [fieldId: string, value: FormResponseValue]
  /**
   * Raised whenever a field starts or stops uploading, so the parent can hold
   * the submit button while bytes are still in flight. Keyed by field because
   * a page may mount several renderers.
   */
  'uploading-change': [fieldId: string, uploading: boolean]
}>()

const internalResponses = ref<FormResponses>({ ...props.modelValue })

// The parent owns the model: when it replaces the object (reset, schema swap,
// server-side prefill) the local copy has to follow or the inputs go stale.
watch(
  () => props.modelValue,
  (next) => {
    if (next !== internalResponses.value) {
      internalResponses.value = { ...next }
    }
  }
)

const visibleFields = computed(() =>
  [...props.fields]
    .filter(f => !f.hidden)
    .sort((a, b) => a.order - b.order)
)

function handleInput(fieldId: string, value: FormResponseValue) {
  internalResponses.value[fieldId] = value
  emit('update:modelValue', { ...internalResponses.value })
  emit('field-change', fieldId, value)
}

function handleBlur(fieldId: string) {
  emit('field-blur', fieldId)
}

// ─── Typed accessors ───────────────────────────────────────────────────────
// `FormField` is a discriminated union; these keep the template free of casts.

function optionsOf(field: FormField): FormFieldOption[] {
  return 'options' in field ? field.options : []
}

/** True when `allowOther` is on and the stored value is outside `options`. */
function showsOtherOption(field: FormField): boolean {
  if (field.type !== 'select' || !field.allowOther) return false
  const current = stringValue(field.id)
  if (!current) return false
  return !field.options.some(option => option.value === current)
}

function rowsOf(field: FormField): number {
  return field.type === 'textarea' ? field.rows ?? 4 : 4
}

function stepOf(field: FormField): number {
  return field.type === 'number' ? field.step ?? 1 : 1
}

function acceptOf(field: FormField): string | undefined {
  return field.type === 'file' ? field.accept : undefined
}

function maxFilesOf(field: FormField): number {
  return field.type === 'file' ? field.maxFiles ?? 1 : 1
}

function maxSizeOf(field: FormField): number | undefined {
  return field.type === 'file' ? field.maxSizeMB : undefined
}

// ─── Typed value readers ───────────────────────────────────────────────────

function rawValue(fieldId: string): FormResponseValue | undefined {
  return internalResponses.value[fieldId]
}

function stringValue(fieldId: string): string {
  const value = rawValue(fieldId)
  if (value === undefined || value === null || Array.isArray(value)) return ''
  return String(value)
}

function arrayValue(fieldId: string): string[] {
  const value = rawValue(fieldId)
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string')
}

// ─── File uploads (KAN-41) ─────────────────────────────────────────────────
// Files used to sit in the model as browser `File` objects, which is not a
// `FormResponseValue` and which `JSON.stringify` flattens to `{}` — the answer
// was lost without an error. Now every selected file is POSTed to
// `uploadUrl` immediately and only the `FormFileReference` the server returns
// reaches the model.
//
// The server is the boundary: it re-reads the field from the PUBLISHED schema
// and sniffs the MIME from the bytes. The `accept` and count checks below are
// UX only — they save a round-trip, they do not authorise anything.

interface PendingUpload {
  /** Local id: two files may share a name. */
  key: string
  name: string
  /** 0-100. Real bytes-sent progress, via XHR's upload events. */
  progress: number
}

const pendingUploads = ref<Record<string, PendingUpload[]>>({})
const uploadErrors = ref<Record<string, string>>({})
let uploadCounter = 0

function isFileReference(value: unknown): value is FormFileReference {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  return typeof candidate.path === 'string' && typeof candidate.name === 'string'
}

/** Files already stored server-side, as references. Never `File` objects. */
function uploadedFiles(fieldId: string): FormFileReference[] {
  const value = rawValue(fieldId)
  if (!Array.isArray(value)) return []
  return (value as unknown[]).filter(isFileReference)
}

function pendingFor(fieldId: string): PendingUpload[] {
  return pendingUploads.value[fieldId] ?? []
}

function isUploading(fieldId: string): boolean {
  return pendingFor(fieldId).length > 0
}

function uploadErrorFor(fieldId: string): string | undefined {
  return uploadErrors.value[fieldId]
}

/** A snake_case token such as `file_too_large` is a code, not a sentence. */
function isErrorCode(value: string): boolean {
  return /^[a-z0-9]+(_[a-z0-9]+)+$/.test(value)
}

/**
 * The participant-facing sentence the server sent, if it sent one.
 *
 * The upload endpoint puts it in `message` — an HTTP status line cannot carry
 * the accents — but the exact envelope Nitro serialises has changed between
 * versions, so `data.message` and a non-code `statusMessage` are accepted too.
 * A code is never shown: it is not Spanish and means nothing to a participant.
 */
function readableServerMessage(body: unknown): string {
  if (typeof body !== 'object' || body === null) return ''
  const envelope = body as Record<string, unknown>
  const nested = envelope.data as Record<string, unknown> | undefined

  const candidates = [
    envelope.message,
    typeof nested === 'object' && nested !== null ? nested.message : undefined,
    envelope.statusMessage,
  ]

  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue
    const text = candidate.trim()
    if (text && !isErrorCode(text)) return text
  }
  return ''
}

/**
 * Turn a failed upload into something a participant can act on.
 *
 * 400/409/413 carry a curated Spanish message from the server and are shown
 * verbatim. Anything else gets a generic line: a 500's `statusMessage` is an
 * internal code (`upload_ledger_failed`) and must not reach the page.
 */
function uploadErrorMessage(status: number, body: unknown): string {
  const serverMessage = readableServerMessage(body)

  if ((status === 400 || status === 409 || status === 413) && serverMessage) {
    return serverMessage
  }
  switch (status) {
    case 400: return 'El archivo no es válido para este campo.'
    case 401:
    case 403: return 'Tu sesión ha caducado. Vuelve a iniciar sesión para adjuntar archivos.'
    case 409: return 'Las inscripciones de este concurso están cerradas.'
    case 413: return 'El archivo es demasiado grande.'
    case 404: return 'Este formulario ya no está disponible.'
    case 0: return 'No se ha podido conectar. Comprueba tu conexión e inténtalo de nuevo.'
    default: return 'No se ha podido subir el archivo. Inténtalo de nuevo.'
  }
}

/**
 * One upload, over XHR rather than `$fetch` because only XHR reports
 * bytes-sent progress. No new dependency involved.
 */
function uploadFile(
  fieldId: string,
  file: File,
  onProgress: (percent: number) => void
): Promise<FormFileReference> {
  const url = props.uploadUrl
  if (!url) return Promise.reject(new Error('upload_url_missing'))

  return new Promise<FormFileReference>((resolve, reject) => {
    const body = new FormData()
    body.append('fieldId', fieldId)
    body.append('file', file, file.name)

    const xhr = new XMLHttpRequest()
    xhr.open('POST', url, true)
    for (const [header, value] of Object.entries(props.uploadHeaders)) {
      xhr.setRequestHeader(header, value)
    }

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress(Math.round((event.loaded / event.total) * 100))
      }
    }

    xhr.onload = () => {
      let parsed: unknown = null
      try { parsed = JSON.parse(xhr.responseText) } catch { parsed = null }

      if (xhr.status >= 200 && xhr.status < 300 && isFileReference(parsed)) {
        resolve(parsed)
        return
      }
      reject(new Error(uploadErrorMessage(xhr.status, parsed)))
    }

    xhr.onerror = () => reject(new Error(uploadErrorMessage(0, null)))
    xhr.onabort = () => reject(new Error(uploadErrorMessage(0, null)))

    xhr.send(body)
  })
}

async function handleFileChange(fieldId: string, event: Event) {
  const input = event.target as HTMLInputElement
  const chosen = Array.from(input.files ?? [])
  // Let the same file be picked again after a removal or a failure.
  input.value = ''
  if (chosen.length === 0) return

  delete uploadErrors.value[fieldId]

  if (!props.uploadUrl) {
    uploadErrors.value[fieldId] = 'La subida de archivos no está disponible aquí.'
    return
  }

  const field = props.fields.find(f => f.id === fieldId)
  const maxFiles = field ? maxFilesOf(field) : 1
  const already = uploadedFiles(fieldId).length + pendingFor(fieldId).length
  const room = Math.max(0, maxFiles - already)

  if (room === 0) {
    uploadErrors.value[fieldId] = maxFiles === 1
      ? 'Solo se admite un archivo. Quita el actual para subir otro.'
      : `Solo se admiten ${maxFiles} archivos.`
    return
  }

  const queued = chosen.slice(0, room)
  if (queued.length < chosen.length) {
    uploadErrors.value[fieldId] = `Solo se admiten ${maxFiles} archivos; se subirán los ${queued.length} primeros.`
  }

  const wasUploading = isUploading(fieldId)
  if (!wasUploading) emit('uploading-change', fieldId, true)

  // Sequential on purpose: the server counts existing files per field to
  // enforce `maxFiles`, and parallel uploads race that count.
  for (const file of queued) {
    const key = `upload_${++uploadCounter}`
    pendingUploads.value[fieldId] = [
      ...pendingFor(fieldId),
      { key, name: file.name, progress: 0 }
    ]

    try {
      const reference = await uploadFile(fieldId, file, (percent) => {
        pendingUploads.value[fieldId] = pendingFor(fieldId).map(
          entry => entry.key === key ? { ...entry, progress: percent } : entry
        )
      })
      handleInput(fieldId, [...uploadedFiles(fieldId), reference])
    } catch (e) {
      uploadErrors.value[fieldId] = e instanceof Error && e.message
        ? e.message
        : 'No se ha podido subir el archivo. Inténtalo de nuevo.'
    } finally {
      const remaining = pendingFor(fieldId).filter(entry => entry.key !== key)
      if (remaining.length === 0) delete pendingUploads.value[fieldId]
      else pendingUploads.value[fieldId] = remaining
    }
  }

  emit('uploading-change', fieldId, false)
}

/** Paths currently being released, so the X cannot be double-clicked. */
const removingPaths = ref<Set<string>>(new Set())

function isRemoving(path: string): boolean {
  return removingPaths.value.has(path)
}

/**
 * Detach an already-uploaded file.
 *
 * The server is told first and the reference is dropped only if it agrees
 * (KAN-67). Dropping it locally and hoping the sweep caught up was the bug:
 * the row kept counting against `maxFiles`, so "quita el actual para subir
 * otro" could not work.
 *
 * Without `deleteUrl` — the builder preview — it stays a local edit, which is
 * all that view can do.
 */
async function removeUploadedFile(fieldId: string, path: string) {
  if (isRemoving(path)) return
  delete uploadErrors.value[fieldId]

  const url = props.deleteUrl
  if (url) {
    removingPaths.value = new Set(removingPaths.value).add(path)
    try {
      await $fetch(url, {
        method: 'DELETE',
        headers: props.uploadHeaders,
        body: { path },
      })
    } catch (e) {
      uploadErrors.value[fieldId] = removeErrorMessage(e)
      return
    } finally {
      const next = new Set(removingPaths.value)
      next.delete(path)
      removingPaths.value = next
    }
  }

  handleInput(fieldId, uploadedFiles(fieldId).filter(file => file.path !== path))
}

/** Same shape as `uploadErrorMessage`: the server's Spanish text when it sent one. */
function removeErrorMessage(error: unknown): string {
  const status = (error as { statusCode?: number; status?: number } | null)?.statusCode
    ?? (error as { status?: number } | null)?.status
  const serverMessage = (error as { data?: { message?: string } } | null)?.data?.message

  if (status === 409 && serverMessage) return serverMessage
  switch (status) {
    case 401:
    case 403: return 'Tu sesión ha caducado. Vuelve a iniciar sesión.'
    case 404: return 'Ese archivo ya no está. Recarga la página.'
    default: return 'No se ha podido quitar el archivo. Inténtalo de nuevo.'
  }
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function toggleCheckboxGroup(fieldId: string, option: string, checked: boolean) {
  const current = arrayValue(fieldId)
  const next = checked
    ? [...current, option]
    : current.filter(value => value !== option)
  handleInput(fieldId, next)
}

// ─── Date picker helpers ───────────────────────────────────────────────────

function parseDateValue(dateStr: string): DateValue | undefined {
  if (!dateStr) return undefined
  try {
    return parseDate(dateStr.slice(0, 10))
  } catch {
    return undefined
  }
}

function formatDateValue(val?: DateValue): string {
  if (!val) return ''
  const d = val.toDate(getLocalTimeZone())
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// ─── Layout ────────────────────────────────────────────────────────────────
// Six-column track so `half` and `third` actually split the row.

function getWidthClass(width?: string) {
  switch (width) {
    case 'half': return 'sm:col-span-3'
    case 'third': return 'sm:col-span-2'
    default: return 'sm:col-span-6'
  }
}

function errorFor(fieldId: string): string | undefined {
  return props.errors[fieldId]
}

function describedBy(field: FormField): string | undefined {
  const ids: string[] = []
  if (field.description) ids.push(`${field.id}-description`)
  if (field.type === 'file') ids.push(`${field.id}-constraints`)
  if (field.type === 'file' && uploadErrorFor(field.id)) ids.push(`${field.id}-upload-error`)
  if (errorFor(field.id)) ids.push(`${field.id}-error`)
  return ids.length ? ids.join(' ') : undefined
}
</script>

<template>
  <div class="grid grid-cols-1 sm:grid-cols-6 gap-x-4 gap-y-6">
    <div
      v-for="field in visibleFields"
      :key="field.id"
      :class="cn('grid content-start gap-2', getWidthClass(field.width))"
    >
      <!-- Label -->
      <Label
        :id="`${field.id}-label`"
        :for="field.id"
        :class="cn(showRequiredIndicator && field.required && 'after:content-[\'_*\'] after:text-destructive')"
      >
        {{ field.label }}
      </Label>

      <!-- Description -->
      <p
        v-if="field.description"
        :id="`${field.id}-description`"
        class="text-xs text-muted-foreground -mt-1"
      >
        {{ field.description }}
      </p>

      <!-- Text Input -->
      <Input
        v-if="field.type === 'text' || field.type === 'email' || field.type === 'url'"
        :id="field.id"
        :type="field.type"
        :placeholder="field.placeholder"
        :disabled="disabled"
        :model-value="stringValue(field.id)"
        :aria-invalid="!!errorFor(field.id)"
        :aria-describedby="describedBy(field)"
        @update:model-value="handleInput(field.id, $event)"
        @blur="handleBlur(field.id)"
      />

      <!-- Textarea -->
      <Textarea
        v-else-if="field.type === 'textarea'"
        :id="field.id"
        :placeholder="field.placeholder"
        :rows="rowsOf(field)"
        :disabled="disabled"
        :model-value="stringValue(field.id)"
        :aria-invalid="!!errorFor(field.id)"
        :aria-describedby="describedBy(field)"
        @update:model-value="handleInput(field.id, $event)"
        @blur="handleBlur(field.id)"
      />

      <!-- Number Input -->
      <Input
        v-else-if="field.type === 'number'"
        :id="field.id"
        type="number"
        :step="stepOf(field)"
        :placeholder="field.placeholder"
        :disabled="disabled"
        :model-value="stringValue(field.id)"
        :aria-invalid="!!errorFor(field.id)"
        :aria-describedby="describedBy(field)"
        @update:model-value="handleInput(field.id, $event)"
        @blur="handleBlur(field.id)"
      />

      <!-- Phone Input -->
      <PhoneInput
        v-else-if="field.type === 'phone'"
        :id="field.id"
        :model-value="stringValue(field.id)"
        :disabled="disabled"
        :aria-invalid="!!errorFor(field.id)"
        :aria-describedby="describedBy(field)"
        @update:model-value="handleInput(field.id, $event)"
        @blur="handleBlur(field.id)"
      />

      <!-- Date Picker -->
      <DatePicker
        v-else-if="field.type === 'date'"
        :id="field.id"
        :model-value="parseDateValue(stringValue(field.id))"
        :placeholder="field.placeholder || 'Selecciona fecha'"
        :disabled="disabled"
        :aria-invalid="!!errorFor(field.id)"
        :aria-describedby="describedBy(field)"
        @update:model-value="handleInput(field.id, formatDateValue($event))"
        @blur="handleBlur(field.id)"
      />

      <!-- Select -->
      <Select
        v-else-if="field.type === 'select'"
        :model-value="stringValue(field.id)"
        :disabled="disabled"
        @update:model-value="handleInput(field.id, String($event))"
      >
        <SelectTrigger
          :id="field.id"
          :aria-invalid="!!errorFor(field.id)"
          :aria-describedby="describedBy(field)"
        >
          <SelectValue :placeholder="field.placeholder || 'Selecciona una opción'" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem
            v-for="option in optionsOf(field)"
            :key="option.value"
            :value="option.value"
          >
            {{ option.label }}
          </SelectItem>
          <!-- Value stored outside `options`, kept selectable via allowOther -->
          <SelectItem
            v-if="showsOtherOption(field)"
            :value="stringValue(field.id)"
          >
            {{ stringValue(field.id) }} (Otro)
          </SelectItem>
        </SelectContent>
      </Select>

      <!-- Radio Group -->
      <div
        v-else-if="field.type === 'radio'"
        role="radiogroup"
        :aria-labelledby="`${field.id}-label`"
        :aria-describedby="describedBy(field)"
        class="space-y-2"
      >
        <div
          v-for="option in optionsOf(field)"
          :key="option.value"
          class="flex items-center space-x-2"
        >
          <input
            :id="`${field.id}-${option.value}`"
            type="radio"
            :name="field.id"
            :value="option.value"
            :checked="stringValue(field.id) === option.value"
            :disabled="disabled"
            class="h-4 w-4"
            @change="handleInput(field.id, option.value)"
            @blur="handleBlur(field.id)"
          >
          <Label :for="`${field.id}-${option.value}`" class="font-normal">
            {{ option.label }}
          </Label>
        </div>
      </div>

      <!-- Single Checkbox -->
      <div v-else-if="field.type === 'checkbox'" class="flex items-center space-x-2">
        <Checkbox
          :id="field.id"
          :checked="rawValue(field.id) === true"
          :disabled="disabled"
          :aria-describedby="describedBy(field)"
          @update:checked="handleInput(field.id, $event)"
          @blur="handleBlur(field.id)"
        />
        <Label :for="field.id" class="font-normal cursor-pointer">
          {{ field.label }}
        </Label>
      </div>

      <!-- Checkbox Group -->
      <div
        v-else-if="field.type === 'checkbox-group'"
        role="group"
        :aria-labelledby="`${field.id}-label`"
        :aria-describedby="describedBy(field)"
        class="space-y-2"
      >
        <div
          v-for="option in optionsOf(field)"
          :key="option.value"
          class="flex items-center space-x-2"
        >
          <Checkbox
            :id="`${field.id}-${option.value}`"
            :checked="arrayValue(field.id).includes(option.value)"
            :disabled="disabled"
            @update:checked="toggleCheckboxGroup(field.id, option.value, $event)"
            @blur="handleBlur(field.id)"
          />
          <Label :for="`${field.id}-${option.value}`" class="font-normal">
            {{ option.label }}
          </Label>
        </div>
      </div>

      <!-- File Upload -->
      <div v-else-if="field.type === 'file'" class="space-y-2">
        <Input
          :id="field.id"
          type="file"
          :accept="acceptOf(field)"
          :disabled="disabled || !uploadUrl || isUploading(field.id)"
          :multiple="maxFilesOf(field) > 1"
          :aria-invalid="!!errorFor(field.id) || !!uploadErrorFor(field.id)"
          :aria-describedby="describedBy(field)"
          class="cursor-pointer"
          @change="handleFileChange(field.id, $event)"
          @blur="handleBlur(field.id)"
        />
        <p :id="`${field.id}-constraints`" class="text-xs text-muted-foreground">
          <template v-if="acceptOf(field)">Formatos: {{ acceptOf(field) }}</template>
          <template v-if="maxSizeOf(field)"> · Tamaño máx: {{ maxSizeOf(field) }}MB</template>
          <template v-if="maxFilesOf(field) > 1"> · Máx {{ maxFilesOf(field) }} archivos</template>
        </p>

        <!-- In flight -->
        <div
          v-for="pending in pendingFor(field.id)"
          :key="pending.key"
          class="space-y-1"
        >
          <div class="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 class="w-3.5 h-3.5 animate-spin shrink-0" />
            <span class="truncate flex-1">Subiendo {{ pending.name }}…</span>
            <span class="tabular-nums">{{ pending.progress }}%</span>
          </div>
          <div
            class="h-1.5 w-full overflow-hidden rounded-full bg-muted"
            role="progressbar"
            :aria-valuenow="pending.progress"
            aria-valuemin="0"
            aria-valuemax="100"
            :aria-label="`Progreso de subida de ${pending.name}`"
          >
            <div
              class="h-full rounded-full bg-primary transition-[width] duration-200"
              :style="{ width: `${pending.progress}%` }"
            />
          </div>
        </div>

        <!-- Uploaded -->
        <ul v-if="uploadedFiles(field.id).length" class="space-y-1">
          <li
            v-for="file in uploadedFiles(field.id)"
            :key="file.path"
            class="flex items-center gap-2 text-xs bg-muted px-2 py-1.5 rounded"
          >
            <Paperclip class="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
            <span class="truncate flex-1">{{ file.name }}</span>
            <span class="text-muted-foreground shrink-0">{{ formatFileSize(file.size) }}</span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              class="h-6 w-6 shrink-0"
              :disabled="disabled || isRemoving(file.path)"
              :aria-label="`Quitar el archivo ${file.name}`"
              @click="removeUploadedFile(field.id, file.path)"
            >
              <Loader2 v-if="isRemoving(file.path)" class="w-3.5 h-3.5 animate-spin" />
              <X v-else class="w-3.5 h-3.5" />
            </Button>
          </li>
        </ul>

        <!-- Upload failure, distinct from a validation error -->
        <p
          v-if="uploadErrorFor(field.id)"
          :id="`${field.id}-upload-error`"
          class="text-xs text-destructive"
          role="alert"
        >
          {{ uploadErrorFor(field.id) }}
        </p>
      </div>

      <!-- Error Message -->
      <p
        v-if="errorFor(field.id)"
        :id="`${field.id}-error`"
        class="text-xs text-destructive"
        role="alert"
      >
        {{ errorFor(field.id) }}
      </p>
    </div>
  </div>
</template>
