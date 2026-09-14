<!-- app/components/inscription/FormBuilder.vue -->
<script setup lang="ts">
import { ref, computed, watch, type Component } from 'vue'
import type {
  FormField,
  FormFieldType,
  FormFieldOption,
  FormFieldValidation
} from '~/types/inscription-form'
import { useInscriptionForm } from '~/composables/useInscriptionForm'
import {
  Plus,
  Trash2,
  Copy,
  GripVertical,
  Eye,
  EyeOff,
  Type,
  AlignLeft,
  Hash,
  Mail,
  Phone,
  Calendar,
  List,
  CheckSquare,
  FileText,
  Link,
  ChevronUp,
  ChevronDown,
  Save,
  RotateCcw
} from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/utils'

interface Props {
  initialFields?: FormField[]
  disabled?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  initialFields: () => [],
  disabled: false
})

const emit = defineEmits<{
  'save': [fields: FormField[]]
  'preview': [fields: FormField[]]
  'update:dirty': [dirty: boolean]
}>()

const {
  fields,
  addField,
  updateField,
  removeField,
  reorderFields,
  duplicateField,
  importSchema
} = useInscriptionForm(props.initialFields)

const selectedFieldId = ref<string | null>(null)
const isPreviewMode = ref(false)
const activeTab = ref<'builder' | 'settings'>('builder')

// ─── Dirty tracking ────────────────────────────────────────────────────────
// The save endpoint inserts a new version rather than updating the current
// one, so the page needs to know whether publishing would publish stale work.

const baseline = ref(serialize(props.initialFields))

function serialize(value: FormField[]): string {
  return JSON.stringify(value.map((f, i) => ({ ...f, order: i })))
}

const isDirty = computed(() => serialize(fields.value) !== baseline.value)

watch(isDirty, dirty => emit('update:dirty', dirty), { immediate: true })

// The page hands over a fresh array after loading and after every save; both
// are a new baseline, not an edit.
watch(
  () => props.initialFields,
  (next) => {
    importSchema({ fields: next })
    baseline.value = serialize(fields.value)
    selectedFieldId.value = null
  }
)

// ─── Field palette ─────────────────────────────────────────────────────────

interface FieldTypeOption {
  type: FormFieldType
  label: string
  icon: Component
}

// `file` was withheld while the renderer only held browser `File` objects in
// memory: offering it would have created a field that loses its answer
// silently. The uploads are real since KAN-41, so it is back in the palette.
const FIELD_TYPES: FieldTypeOption[] = [
  { type: 'text', label: 'Texto corto', icon: Type },
  { type: 'textarea', label: 'Texto largo', icon: AlignLeft },
  { type: 'number', label: 'Número', icon: Hash },
  { type: 'email', label: 'Email', icon: Mail },
  { type: 'phone', label: 'Teléfono', icon: Phone },
  { type: 'date', label: 'Fecha', icon: Calendar },
  { type: 'select', label: 'Desplegable', icon: List },
  { type: 'radio', label: 'Opción única', icon: List },
  { type: 'checkbox', label: 'Casilla', icon: CheckSquare },
  { type: 'checkbox-group', label: 'Selección múltiple', icon: CheckSquare },
  { type: 'file', label: 'Archivo', icon: FileText },
  { type: 'url', label: 'URL', icon: Link }
]

const NEW_FIELD_LABELS: Record<FormFieldType, string> = {
  text: 'Nuevo campo de texto',
  textarea: 'Nueva área de texto',
  number: 'Nuevo campo numérico',
  email: 'Nuevo email',
  phone: 'Nuevo teléfono',
  date: 'Nueva fecha',
  select: 'Nueva selección',
  radio: 'Nueva opción',
  checkbox: 'Nueva casilla',
  'checkbox-group': 'Nueva selección múltiple',
  file: 'Nuevo archivo',
  url: 'Nueva URL'
}

function iconFor(type: FormFieldType): Component {
  return FIELD_TYPES.find(t => t.type === type)?.icon ?? Type
}

function typeLabel(type: FormFieldType): string {
  return FIELD_TYPES.find(t => t.type === type)?.label ?? type
}

const selectedField = computed(() =>
  fields.value.find(f => f.id === selectedFieldId.value)
)

const selectedOptions = computed<FormFieldOption[]>(() => {
  const field = selectedField.value
  return field && 'options' in field ? field.options : []
})

function nextFieldId(): string {
  return `field_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
}

function createTypedField(type: FormFieldType, label: string): FormField {
  const base = {
    id: nextFieldId(),
    label,
    required: false,
    order: fields.value.length,
    hidden: false,
    validation: { required: false } satisfies FormFieldValidation,
    width: 'full' as const
  }

  switch (type) {
    case 'textarea':
      return { ...base, type, rows: 4 }
    case 'number':
      return { ...base, type, step: 1, validation: {} }
    case 'select':
    case 'radio':
      return { ...base, type, options: defaultOptions() }
    case 'checkbox-group':
      return { ...base, type, options: defaultOptions() }
    case 'checkbox':
      return { ...base, type }
    case 'file':
      return { ...base, type, maxFiles: 1, maxSizeMB: 10 }
    case 'text':
      return { ...base, type }
    default:
      // email | phone | date | url — no extra configuration.
      return { ...base, type }
  }
}

function defaultOptions(): FormFieldOption[] {
  return [
    { value: 'option_1', label: 'Opción 1' },
    { value: 'option_2', label: 'Opción 2' }
  ]
}

function addNewField(option: FieldTypeOption) {
  if (props.disabled) return
  const newField = createTypedField(option.type, NEW_FIELD_LABELS[option.type])
  addField(newField)
  selectedFieldId.value = newField.id
}

// ─── Reordering: buttons and native drag & drop ────────────────────────────
// The HTML Drag and Drop API is not keyboard operable, so the ↑/↓ buttons
// stay as the accessible route and both paths funnel into `reorderFields`.

const draggingIndex = ref<number | null>(null)
const dropTargetIndex = ref<number | null>(null)
const reorderAnnouncement = ref('')

function applyReorder(from: number, to: number) {
  if (to < 0 || to >= fields.value.length || from === to) return
  const label = fields.value[from]?.label ?? 'Campo'
  reorderFields(from, to)
  reorderAnnouncement.value =
    `${label} movido a la posición ${to + 1} de ${fields.value.length}.`
}

function moveField(index: number, direction: 'up' | 'down') {
  applyReorder(index, direction === 'up' ? index - 1 : index + 1)
}

function onDragStart(index: number, event: DragEvent) {
  if (props.disabled) return
  draggingIndex.value = index
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    // Firefox refuses to start a drag without payload.
    event.dataTransfer.setData('text/plain', String(index))
  }
}

function onDragOver(index: number, event: DragEvent) {
  if (draggingIndex.value === null) return
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
  dropTargetIndex.value = index
}

function onDrop(index: number, event: DragEvent) {
  event.preventDefault()
  const from = draggingIndex.value
  resetDrag()
  if (from === null) return
  applyReorder(from, index)
}

function resetDrag() {
  draggingIndex.value = null
  dropTargetIndex.value = null
}

function isDropTarget(index: number): boolean {
  return dropTargetIndex.value === index && draggingIndex.value !== index
}

// ─── Option management ─────────────────────────────────────────────────────

function setOptions(field: FormField, options: FormFieldOption[]) {
  if (!('options' in field)) return
  updateField(field.id, { options })
}

function addOption(field: FormField) {
  if (!('options' in field)) return
  setOptions(field, [
    ...field.options,
    { value: `option_${Date.now()}`, label: `Opción ${field.options.length + 1}` }
  ])
}

function removeOption(field: FormField, optionIndex: number) {
  if (!('options' in field) || field.options.length <= 1) return
  setOptions(field, field.options.filter((_, i) => i !== optionIndex))
}

function updateOption(
  field: FormField,
  optionIndex: number,
  patch: Partial<FormFieldOption>
) {
  if (!('options' in field)) return
  setOptions(
    field,
    field.options.map((option, i) => (i === optionIndex ? { ...option, ...patch } : option))
  )
}

// ─── Typed field setters ───────────────────────────────────────────────────

function toText(value: unknown): string {
  return value === undefined || value === null ? '' : String(value)
}

function toNumberOrUndefined(value: unknown): number | undefined {
  const parsed = Number(toText(value))
  return Number.isFinite(parsed) && toText(value) !== '' ? parsed : undefined
}

function setValidation(field: FormField, patch: Partial<FormFieldValidation>) {
  updateField(field.id, { validation: { ...field.validation, ...patch } })
}

function setRequired(field: FormField, required: boolean) {
  updateField(field.id, { required, validation: { ...field.validation, required } })
}

const WIDTHS = ['full', 'half', 'third'] as const
type FieldWidth = (typeof WIDTHS)[number]

function setWidth(field: FormField, value: unknown) {
  const width = WIDTHS.find(w => w === toText(value))
  if (width) updateField(field.id, { width: width as FieldWidth })
}

const CUSTOM_RULES = ['email', 'phone', 'url', 'dni'] as const

function setCustomRule(field: FormField, value: unknown) {
  const rule = CUSTOM_RULES.find(r => r === toText(value))
  setValidation(field, { customRule: rule })
}

function fileConfig(field: FormField) {
  return field.type === 'file'
    ? { accept: field.accept ?? '', maxFiles: field.maxFiles ?? 1, maxSizeMB: field.maxSizeMB ?? 10 }
    : { accept: '', maxFiles: 1, maxSizeMB: 10 }
}

// ─── Toolbar actions ───────────────────────────────────────────────────────

function handleSave() {
  emit('save', fields.value)
}

function togglePreview() {
  isPreviewMode.value = !isPreviewMode.value
  emit('preview', fields.value)
}

function handleReset() {
  importSchema({ fields: [] })
  selectedFieldId.value = null
  reorderAnnouncement.value = 'Formulario vaciado.'
}
</script>

<template>
  <div class="space-y-6">
    <!-- Toolbar -->
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div class="flex items-center gap-2">
        <Button variant="outline" size="sm" @click="togglePreview">
          <EyeOff v-if="isPreviewMode" class="w-4 h-4 mr-2" />
          <Eye v-else class="w-4 h-4 mr-2" />
          {{ isPreviewMode ? 'Editar' : 'Vista previa' }}
        </Button>
        <Button
          variant="outline"
          size="sm"
          :disabled="disabled || fields.length === 0"
          @click="handleReset"
        >
          <RotateCcw class="w-4 h-4 mr-2" />
          Vaciar
        </Button>
      </div>
      <div class="flex items-center gap-2">
        <span v-if="isDirty" class="text-xs text-muted-foreground">
          Cambios sin guardar
        </span>
        <Button variant="default" size="sm" :disabled="disabled" @click="handleSave">
          <Save class="w-4 h-4 mr-2" />
          Guardar formulario
        </Button>
      </div>
    </div>

    <div class="grid lg:grid-cols-3 gap-6">
      <!-- Left: Field Types Palette -->
      <Card class="lg:col-span-1">
        <CardHeader class="pb-3">
          <CardTitle class="text-base">
            Tipos de campo
          </CardTitle>
        </CardHeader>
        <CardContent class="space-y-3">
          <div class="grid grid-cols-2 gap-2">
            <Button
              v-for="fieldType in FIELD_TYPES"
              :key="fieldType.type"
              variant="outline"
              size="sm"
              class="h-auto py-3 flex flex-col items-center gap-1"
              :disabled="disabled"
              @click="addNewField(fieldType)"
            >
              <component :is="fieldType.icon" class="w-5 h-5" />
              <span class="text-xs">{{ fieldType.label }}</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      <!-- Center: Form Fields List -->
      <Card class="lg:col-span-2">
        <CardHeader class="pb-3">
          <CardTitle class="text-base">
            Campos del formulario
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div v-if="fields.length === 0" class="text-center py-8 text-muted-foreground">
            <p class="text-sm">
              No hay campos aún
            </p>
            <p class="text-xs">
              Añade campos desde la paleta de la izquierda
            </p>
          </div>

          <ul v-else class="space-y-2" @dragleave="dropTargetIndex = null">
            <li
              v-for="(field, index) in fields"
              :key="field.id"
              :draggable="!disabled"
              :class="cn(
                'flex items-center gap-2 p-3 border rounded-lg cursor-pointer transition-colors',
                selectedFieldId === field.id
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:bg-accent/50',
                field.hidden && 'opacity-50',
                draggingIndex === index && 'opacity-40 ring-2 ring-primary',
                isDropTarget(index) && 'border-t-2 border-t-primary'
              )"
              @click="selectedFieldId = field.id"
              @dragstart="onDragStart(index, $event)"
              @dragover="onDragOver(index, $event)"
              @drop="onDrop(index, $event)"
              @dragend="resetDrag"
            >
              <!-- Drag handle -->
              <span
                role="img"
                :aria-label="`Arrastra para reordenar el campo ${field.label}`"
                class="shrink-0 cursor-grab active:cursor-grabbing touch-none"
              >
                <GripVertical class="w-4 h-4 text-muted-foreground" />
              </span>

              <!-- Field icon -->
              <component :is="iconFor(field.type)" class="w-4 h-4 text-muted-foreground shrink-0" />

              <!-- Field label -->
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium truncate">
                  {{ field.label }}
                  <span v-if="field.required" class="text-destructive">*</span>
                </p>
                <p class="text-xs text-muted-foreground">
                  {{ typeLabel(field.type) }}
                </p>
              </div>

              <!-- Actions -->
              <div class="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  class="h-8 w-8"
                  :disabled="index === 0 || disabled"
                  :aria-label="`Subir el campo ${field.label}`"
                  @click.stop="moveField(index, 'up')"
                >
                  <ChevronUp class="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  class="h-8 w-8"
                  :disabled="index === fields.length - 1 || disabled"
                  :aria-label="`Bajar el campo ${field.label}`"
                  @click.stop="moveField(index, 'down')"
                >
                  <ChevronDown class="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  class="h-8 w-8"
                  :disabled="disabled"
                  :aria-label="`Duplicar el campo ${field.label}`"
                  @click.stop="duplicateField(field.id)"
                >
                  <Copy class="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  class="h-8 w-8"
                  :disabled="disabled"
                  :aria-label="field.hidden ? `Mostrar el campo ${field.label}` : `Ocultar el campo ${field.label}`"
                  @click.stop="updateField(field.id, { hidden: !field.hidden })"
                >
                  <EyeOff v-if="field.hidden" class="w-4 h-4" />
                  <Eye v-else class="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  class="h-8 w-8 text-destructive hover:text-destructive"
                  :disabled="disabled"
                  :aria-label="`Eliminar el campo ${field.label}`"
                  @click.stop="removeField(field.id)"
                >
                  <Trash2 class="w-4 h-4" />
                </Button>
              </div>
            </li>
          </ul>

          <p aria-live="polite" class="sr-only">
            {{ reorderAnnouncement }}
          </p>
        </CardContent>
      </Card>
    </div>

    <!-- Field Settings Panel -->
    <Dialog
      v-if="selectedField"
      :open="!!selectedFieldId"
      @update:open="open => { if (!open) selectedFieldId = null }"
    >
      <DialogContent class="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Configurar campo</DialogTitle>
        </DialogHeader>

        <Tabs v-model="activeTab" class="w-full">
          <TabsList class="grid w-full grid-cols-2">
            <TabsTrigger value="builder">
              General
            </TabsTrigger>
            <TabsTrigger value="settings">
              Validación
            </TabsTrigger>
          </TabsList>

          <TabsContent value="builder" class="space-y-4">
            <!-- Label -->
            <div class="space-y-2">
              <Label for="field-label">Etiqueta</Label>
              <Input
                id="field-label"
                :model-value="selectedField.label"
                @update:model-value="updateField(selectedField.id, { label: toText($event) })"
              />
            </div>

            <!-- Description -->
            <div class="space-y-2">
              <Label for="field-description">Descripción (opcional)</Label>
              <Textarea
                id="field-description"
                :model-value="selectedField.description || ''"
                placeholder="Ayuda o instrucciones para este campo"
                rows="2"
                @update:model-value="updateField(selectedField.id, { description: toText($event) })"
              />
            </div>

            <!-- Placeholder -->
            <div
              v-if="['text', 'email', 'url', 'number', 'textarea'].includes(selectedField.type)"
              class="space-y-2"
            >
              <Label for="field-placeholder">Placeholder</Label>
              <Input
                id="field-placeholder"
                :model-value="selectedField.placeholder || ''"
                @update:model-value="updateField(selectedField.id, { placeholder: toText($event) })"
              />
            </div>

            <!-- Required -->
            <div class="flex items-center justify-between">
              <Label for="field-required" class="cursor-pointer">Campo requerido</Label>
              <Checkbox
                id="field-required"
                :checked="selectedField.required"
                @update:checked="setRequired(selectedField, $event)"
              />
            </div>

            <!-- Width -->
            <div class="space-y-2">
              <Label for="field-width">Ancho</Label>
              <Select
                :model-value="selectedField.width || 'full'"
                @update:model-value="setWidth(selectedField, $event)"
              >
                <SelectTrigger id="field-width">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="full">
                    Completo
                  </SelectItem>
                  <SelectItem value="half">
                    Mitad (50%)
                  </SelectItem>
                  <SelectItem value="third">
                    Tercio (33%)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <!-- Options for select/radio/checkbox-group -->
            <div
              v-if="['select', 'radio', 'checkbox-group'].includes(selectedField.type)"
              class="space-y-3"
            >
              <Label>Opciones</Label>
              <div
                v-for="(option, idx) in selectedOptions"
                :key="`${idx}-${option.value}`"
                class="flex items-center gap-2"
              >
                <Input
                  :model-value="option.label"
                  placeholder="Etiqueta"
                  class="flex-1"
                  :aria-label="`Etiqueta de la opción ${idx + 1}`"
                  @update:model-value="updateOption(selectedField, idx, { label: toText($event) })"
                />
                <Input
                  :model-value="option.value"
                  placeholder="Valor"
                  class="flex-1"
                  :aria-label="`Valor de la opción ${idx + 1}`"
                  @update:model-value="updateOption(selectedField, idx, { value: toText($event) })"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  class="h-9 w-9"
                  :disabled="selectedOptions.length <= 1"
                  :aria-label="`Eliminar la opción ${idx + 1}`"
                  @click="removeOption(selectedField, idx)"
                >
                  <Trash2 class="w-4 h-4" />
                </Button>
              </div>
              <Button variant="outline" size="sm" @click="addOption(selectedField)">
                <Plus class="w-4 h-4 mr-2" />
                Añadir opción
              </Button>
            </div>

            <!-- File settings. The platform caps these regardless of what is
                 configured here: 25 MB per file and 10 files per field, in
                 server/utils/inscription-uploads.ts. -->
            <div v-if="selectedField.type === 'file'" class="space-y-3">
              <div class="space-y-2">
                <Label for="file-accept">Tipos de archivo aceptados</Label>
                <Input
                  id="file-accept"
                  :model-value="fileConfig(selectedField).accept"
                  placeholder="image/*,.pdf"
                  @update:model-value="updateField(selectedField.id, { accept: toText($event) })"
                />
                <p class="text-xs text-muted-foreground">
                  Ejemplo: image/* para imágenes, .pdf para PDFs
                </p>
              </div>
              <div class="space-y-2">
                <Label for="file-max-size">Tamaño máximo (MB)</Label>
                <Input
                  id="file-max-size"
                  type="number"
                  :model-value="fileConfig(selectedField).maxSizeMB"
                  @update:model-value="updateField(selectedField.id, { maxSizeMB: toNumberOrUndefined($event) })"
                />
              </div>
              <div class="space-y-2">
                <Label for="file-max-files">Número máximo de archivos</Label>
                <Input
                  id="file-max-files"
                  type="number"
                  :model-value="fileConfig(selectedField).maxFiles"
                  @update:model-value="updateField(selectedField.id, { maxFiles: toNumberOrUndefined($event) })"
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="settings" class="space-y-4">
            <!-- Text length validation -->
            <div v-if="['text', 'textarea'].includes(selectedField.type)" class="space-y-3">
              <div class="space-y-2">
                <Label for="min-length">Longitud mínima</Label>
                <Input
                  id="min-length"
                  type="number"
                  :model-value="selectedField.validation.minLength ?? ''"
                  @update:model-value="setValidation(selectedField, { minLength: toNumberOrUndefined($event) })"
                />
              </div>
              <div class="space-y-2">
                <Label for="max-length">Longitud máxima</Label>
                <Input
                  id="max-length"
                  type="number"
                  :model-value="selectedField.validation.maxLength ?? ''"
                  @update:model-value="setValidation(selectedField, { maxLength: toNumberOrUndefined($event) })"
                />
              </div>
            </div>

            <!-- Number range validation -->
            <div v-if="selectedField.type === 'number'" class="space-y-3">
              <div class="space-y-2">
                <Label for="min-value">Valor mínimo</Label>
                <Input
                  id="min-value"
                  type="number"
                  :model-value="selectedField.validation.minValue ?? ''"
                  @update:model-value="setValidation(selectedField, { minValue: toNumberOrUndefined($event) })"
                />
              </div>
              <div class="space-y-2">
                <Label for="max-value">Valor máximo</Label>
                <Input
                  id="max-value"
                  type="number"
                  :model-value="selectedField.validation.maxValue ?? ''"
                  @update:model-value="setValidation(selectedField, { maxValue: toNumberOrUndefined($event) })"
                />
              </div>
            </div>

            <!-- Pattern validation -->
            <div v-if="['text', 'email', 'url'].includes(selectedField.type)" class="space-y-3">
              <div class="space-y-2">
                <Label for="pattern">Expresión regular</Label>
                <Input
                  id="pattern"
                  :model-value="selectedField.validation.pattern || ''"
                  placeholder="^[0-9]+$"
                  @update:model-value="setValidation(selectedField, { pattern: toText($event) || undefined })"
                />
              </div>
              <div class="space-y-2">
                <Label for="pattern-message">Mensaje de error personalizado</Label>
                <Input
                  id="pattern-message"
                  :model-value="selectedField.validation.patternMessage || ''"
                  placeholder="Formato no válido"
                  @update:model-value="setValidation(selectedField, { patternMessage: toText($event) || undefined })"
                />
              </div>
            </div>

            <!-- Custom validation rules -->
            <div class="space-y-2">
              <Label for="custom-rule">Regla predefinida</Label>
              <Select
                :model-value="selectedField.validation.customRule || ''"
                @update:model-value="setCustomRule(selectedField, $event)"
              >
                <SelectTrigger id="custom-rule">
                  <SelectValue placeholder="Ninguna" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="email">
                    Email
                  </SelectItem>
                  <SelectItem value="phone">
                    Teléfono
                  </SelectItem>
                  <SelectItem value="url">
                    URL
                  </SelectItem>
                  <SelectItem value="dni">
                    DNI/NIE
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  </div>
</template>
