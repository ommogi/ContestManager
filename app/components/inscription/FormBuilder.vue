<!-- app/components/inscription/FormBuilder.vue -->
<script setup lang="ts">
import { ref, computed } from 'vue'
import type { FormField, FormFieldType, FormBuilderState } from '~/types/inscription-form'
import { useInscriptionForm } from '~/composables/useInscriptionForm'
import {
  Plus,
  Trash2,
  Copy,
  GripVertical,
  Eye,
  EyeOff,
  Settings2,
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
import { Switch } from '@/components/ui/switch'
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { cn } from '@/utils'
import { useDraggable } from '@vueuse/core'

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
}>()

const {
  fields,
  visibleFields,
  addField,
  updateField,
  removeField,
  reorderFields,
  duplicateField,
  exportSchema,
  importSchema
} = useInscriptionForm(props.initialFields)

const selectedFieldId = ref<string | null>(null)
const isPreviewMode = ref(false)
const activeTab = ref<'builder' | 'settings'>('builder')

// Field type options with icons
const FIELD_TYPES: { type: FormFieldType; label: string; icon: any }[] = [
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

const selectedField = computed(() =>
  fields.value.find(f => f.id === selectedFieldId.value)
)

// Add new field
function addNewField(type: FormFieldType) {
  const labels: Record<FormFieldType, string> = {
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
  
  const newField = createTypedField(type, labels[type])
  addField(newField)
  selectedFieldId.value = newField.id
}

function createTypedField(type: FormFieldType, label: string): FormField {
  const baseField: any = {
    id: `field_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    type,
    label,
    required: false,
    order: fields.value.length,
    hidden: false,
    validation: { required: false },
    width: 'full'
  }

  if (type === 'textarea') baseField.rows = 4
  if (type === 'number') { baseField.step = 1; baseField.validation = {} }
  if (type === 'select' || type === 'radio' || type === 'checkbox-group') {
    baseField.options = [
      { value: 'option_1', label: 'Opción 1' },
      { value: 'option_2', label: 'Opción 2' }
    ]
  }
  if (type === 'file') {
    baseField.maxFiles = 1
    baseField.maxSizeMB = 10
  }

  return baseField
}

// Field reordering with drag-and-drop
function moveField(index: number, direction: 'up' | 'down') {
  const newIndex = direction === 'up' ? index - 1 : index + 1
  if (newIndex < 0 || newIndex >= fields.value.length) return
  reorderFields(index, newIndex)
}

// Option management for select/radio/checkbox-group
function addOption(field: any) {
  if (!field.options) field.options = []
  field.options.push({
    value: `option_${Date.now()}`,
    label: `Opción ${field.options.length + 1}`
  })
  updateField(field.id, { options: field.options })
}

function removeOption(field: any, optionIndex: number) {
  if (!field.options || field.options.length <= 1) return
  field.options.splice(optionIndex, 1)
  updateField(field.id, { options: field.options })
}

// Save schema
function handleSave() {
  emit('save', fields.value)
}

// Preview mode
function togglePreview() {
  isPreviewMode.value = !isPreviewMode.value
  emit('preview', fields.value)
}

// Reset form
function handleReset() {
  importSchema({ fields: [] })
  selectedFieldId.value = null
}
</script>

<template>
  <div class="space-y-6">
    <!-- Toolbar -->
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          @click="togglePreview"
        >
          <EyeOff v-if="isPreviewMode" class="w-4 h-4 mr-2" />
          <Eye v-else class="w-4 h-4 mr-2" />
          {{ isPreviewMode ? 'Editar' : 'Vista previa' }}
        </Button>
        <Button
          variant="outline"
          size="sm"
          @click="handleReset"
        >
          <RotateCcw class="w-4 h-4 mr-2" />
          Reset
        </Button>
      </div>
      <div class="flex items-center gap-2">
        <Button
          variant="default"
          size="sm"
          @click="handleSave"
          :disabled="disabled"
        >
          <Save class="w-4 h-4 mr-2" />
          Guardar formulario
        </Button>
      </div>
    </div>

    <div class="grid lg:grid-cols-3 gap-6">
      <!-- Left: Field Types Palette -->
      <Card class="lg:col-span-1">
        <CardHeader class="pb-3">
          <CardTitle class="text-base">Tipos de campo</CardTitle>
        </CardHeader>
        <CardContent>
          <div class="grid grid-cols-2 gap-2">
            <Button
              v-for="fieldType in FIELD_TYPES"
              :key="fieldType.type"
              variant="outline"
              size="sm"
              class="h-auto py-3 flex flex-col items-center gap-1"
              @click="addNewField(fieldType.type)"
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
          <CardTitle class="text-base">Campos del formulario</CardTitle>
        </CardHeader>
        <CardContent>
          <div v-if="fields.length === 0" class="text-center py-8 text-muted-foreground">
            <p class="text-sm">No hay campos aún</p>
            <p class="text-xs">Añade campos desde la paleta de la izquierda</p>
          </div>

          <div v-else class="space-y-2">
            <div
              v-for="(field, index) in fields"
              :key="field.id"
              :class="cn(
                'flex items-center gap-2 p-3 border rounded-lg cursor-pointer transition-colors',
                selectedFieldId === field.id
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:bg-accent/50',
                field.hidden && 'opacity-50'
              )"
              @click="selectedFieldId = field.id"
            >
              <!-- Drag handle -->
              <GripVertical class="w-4 h-4 text-muted-foreground shrink-0" />

              <!-- Field icon -->
              <component
                :is="FIELD_TYPES.find(t => t.type === field.type)?.icon || Type"
                class="w-4 h-4 text-muted-foreground shrink-0"
              />

              <!-- Field label -->
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium truncate">
                  {{ field.label }}
                  <span v-if="field.required" class="text-destructive">*</span>
                </p>
                <p class="text-xs text-muted-foreground">
                  {{ FIELD_TYPES.find(t => t.type === field.type)?.label }}
                </p>
              </div>

              <!-- Actions -->
              <div class="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  class="h-8 w-8"
                  @click.stop="moveField(index, 'up')"
                  :disabled="index === 0"
                >
                  <ChevronUp class="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  class="h-8 w-8"
                  @click.stop="moveField(index, 'down')"
                  :disabled="index === fields.length - 1"
                >
                  <ChevronDown class="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  class="h-8 w-8"
                  @click.stop="duplicateField(field.id)"
                >
                  <Copy class="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  class="h-8 w-8"
                  @click.stop="updateField(field.id, { hidden: !field.hidden })"
                >
                  <EyeOff v-if="field.hidden" class="w-4 h-4" />
                  <Eye v-else class="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  class="h-8 w-8 text-destructive hover:text-destructive"
                  @click.stop="removeField(field.id)"
                >
                  <Trash2 class="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>

    <!-- Field Settings Panel -->
    <Dialog v-if="selectedField" :open="!!selectedFieldId" @update:open="open => {
      if (!open) selectedFieldId = null
    }">
      <DialogContent class="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Configurar campo</DialogTitle>
        </DialogHeader>

        <Tabs v-model="activeTab" class="w-full">
          <TabsList class="grid w-full grid-cols-2">
            <TabsTrigger value="builder">General</TabsTrigger>
            <TabsTrigger value="settings">Validación</TabsTrigger>
          </TabsList>

          <TabsContent value="builder" class="space-y-4">
            <!-- Label -->
            <div class="space-y-2">
              <Label for="field-label">Etiqueta</Label>
              <Input
                id="field-label"
                :model-value="selectedField.label"
                @update:model-value="updateField(selectedField.id, { label: $event })"
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
                @update:model-value="updateField(selectedField.id, { description: $event })"
              />
            </div>

            <!-- Placeholder -->
            <div v-if="['text', 'email', 'url', 'number', 'textarea'].includes(selectedField.type)" class="space-y-2">
              <Label for="field-placeholder">Placeholder</Label>
              <Input
                id="field-placeholder"
                :model-value="selectedField.placeholder || ''"
                @update:model-value="updateField(selectedField.id, { placeholder: $event })"
              />
            </div>

            <!-- Required -->
            <div class="flex items-center justify-between">
              <Label for="field-required">Campo requerido</Label>
              <Switch
                id="field-required"
                :checked="selectedField.required"
                @update:checked="updateField(selectedField.id, { required: $event, validation: { ...selectedField.validation, required: $event } })"
              />
            </div>

            <!-- Width -->
            <div class="space-y-2">
              <Label for="field-width">Ancho</Label>
              <Select
                :model-value="selectedField.width || 'full'"
                @update:model-value="updateField(selectedField.id, { width: $event })"
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="full">Completo</SelectItem>
                  <SelectItem value="half">Mitad (50%)</SelectItem>
                  <SelectItem value="third">Tercio (33%)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <!-- Options for select/radio/checkbox-group -->
            <div v-if="['select', 'radio', 'checkbox-group'].includes(selectedField.type)" class="space-y-3">
              <Label>Opciones</Label>
              <div
                v-for="(option, idx) in (selectedField as any).options"
                :key="option.value"
                class="flex items-center gap-2"
              >
                <Input
                  :model-value="option.label"
                  placeholder="Etiqueta"
                  class="flex-1"
                  @update:model-value="
                    (selectedField as any).options[idx].label = $event;
                    updateField(selectedField.id, { options: (selectedField as any).options })
                  "
                />
                <Input
                  :model-value="option.value"
                  placeholder="Valor"
                  class="flex-1"
                  @update:model-value="
                    (selectedField as any).options[idx].value = $event;
                    updateField(selectedField.id, { options: (selectedField as any).options })
                  "
                />
                <Button
                  variant="ghost"
                  size="icon"
                  class="h-9 w-9"
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

            <!-- File settings -->
            <div v-if="selectedField.type === 'file'" class="space-y-3">
              <div class="space-y-2">
                <Label for="file-accept">Tipos de archivo aceptados</Label>
                <Input
                  id="file-accept"
                  :model-value="(selectedField as any).accept || ''"
                  placeholder="image/*,.pdf"
                  @update:model-value="updateField(selectedField.id, { accept: $event })"
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
                  :model-value="(selectedField as any).maxSizeMB || 10"
                  @update:model-value="updateField(selectedField.id, { maxSizeMB: Number($event) })"
                />
              </div>
              <div class="space-y-2">
                <Label for="file-max-files">Número máximo de archivos</Label>
                <Input
                  id="file-max-files"
                  type="number"
                  :model-value="(selectedField as any).maxFiles || 1"
                  @update:model-value="updateField(selectedField.id, { maxFiles: Number($event) })"
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
                  :model-value="(selectedField.validation as any).minLength || ''"
                  @update:model-value="updateField(selectedField.id, {
                    validation: { ...selectedField.validation, minLength: Number($event) || undefined }
                  })"
                />
              </div>
              <div class="space-y-2">
                <Label for="max-length">Longitud máxima</Label>
                <Input
                  id="max-length"
                  type="number"
                  :model-value="(selectedField.validation as any).maxLength || ''"
                  @update:model-value="updateField(selectedField.id, {
                    validation: { ...selectedField.validation, maxLength: Number($event) || undefined }
                  })"
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
                  :model-value="(selectedField.validation as any).minValue || ''"
                  @update:model-value="updateField(selectedField.id, {
                    validation: { ...selectedField.validation, minValue: Number($event) || undefined }
                  })"
                />
              </div>
              <div class="space-y-2">
                <Label for="max-value">Valor máximo</Label>
                <Input
                  id="max-value"
                  type="number"
                  :model-value="(selectedField.validation as any).maxValue || ''"
                  @update:model-value="updateField(selectedField.id, {
                    validation: { ...selectedField.validation, maxValue: Number($event) || undefined }
                  })"
                />
              </div>
            </div>

            <!-- Pattern validation -->
            <div v-if="['text', 'email', 'url'].includes(selectedField.type)" class="space-y-3">
              <div class="space-y-2">
                <Label for="pattern">Expresión regular</Label>
                <Input
                  id="pattern"
                  :model-value="(selectedField.validation as any).pattern || ''"
                  placeholder="^[0-9]+$"
                  @update:model-value="updateField(selectedField.id, {
                    validation: { ...selectedField.validation, pattern: $event }
                  })"
                />
              </div>
              <div class="space-y-2">
                <Label for="pattern-message">Mensaje de error personalizado</Label>
                <Input
                  id="pattern-message"
                  :model-value="(selectedField.validation as any).patternMessage || ''"
                  placeholder="Formato no válido"
                  @update:model-value="updateField(selectedField.id, {
                    validation: { ...selectedField.validation, patternMessage: $event }
                  })"
                />
              </div>
            </div>

            <!-- Custom validation rules -->
            <div class="space-y-2">
              <Label for="custom-rule">Regla predefinida</Label>
              <Select
                :model-value="(selectedField.validation as any).customRule || ''"
                @update:model-value="updateField(selectedField.id, {
                  validation: { ...selectedField.validation, customRule: $event || undefined }
                })"
              >
                <SelectTrigger>
                  <SelectValue placeholder="Ninguna" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="phone">Teléfono</SelectItem>
                  <SelectItem value="url">URL</SelectItem>
                  <SelectItem value="dni">DNI/NIE</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  </div>
</template>
