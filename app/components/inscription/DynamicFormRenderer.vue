<!-- app/components/inscription/DynamicFormRenderer.vue -->
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type {
  FormField,
  FormFieldOption,
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
import { cn } from '@/utils'

interface Props {
  fields: FormField[]
  modelValue?: FormResponses
  /** Validation messages keyed by `field.id`. Painted under the field. */
  errors?: Record<string, string>
  disabled?: boolean
  showRequiredIndicator?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: () => ({}),
  errors: () => ({}),
  disabled: false,
  showRequiredIndicator: true
})

const emit = defineEmits<{
  'update:modelValue': [value: FormResponses]
  'field-blur': [fieldId: string]
  'field-change': [fieldId: string, value: FormResponseValue]
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

/**
 * Files sit in the model as `File` objects until KAN-59 uploads them and
 * swaps them for `FormFileReference`s, so they are read back defensively.
 */
function selectedFiles(fieldId: string): File[] {
  const value = rawValue(fieldId)
  if (!Array.isArray(value)) return []
  return (value as unknown[]).filter((item): item is File => item instanceof File)
}

function handleFileChange(fieldId: string, event: Event) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  // Same transient shape as above: not a `FormResponseValue` until uploaded.
  handleInput(fieldId, files as unknown as FormResponseValue)
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
          :disabled="disabled"
          :multiple="maxFilesOf(field) > 1"
          :aria-invalid="!!errorFor(field.id)"
          :aria-describedby="describedBy(field)"
          class="cursor-pointer"
          @change="handleFileChange(field.id, $event)"
          @blur="handleBlur(field.id)"
        />
        <p class="text-xs text-muted-foreground">
          <template v-if="acceptOf(field)">Formatos: {{ acceptOf(field) }}</template>
          <template v-if="maxSizeOf(field)"> · Tamaño máx: {{ maxSizeOf(field) }}MB</template>
          <template v-if="maxFilesOf(field) > 1"> · Máx {{ maxFilesOf(field) }} archivos</template>
        </p>
        <div v-if="selectedFiles(field.id).length" class="flex flex-wrap gap-2">
          <div
            v-for="file in selectedFiles(field.id)"
            :key="file.name"
            class="flex items-center gap-2 text-xs bg-muted px-2 py-1 rounded"
          >
            <span class="truncate max-w-[150px]">{{ file.name }}</span>
            <span class="text-muted-foreground">({{ (file.size / 1024).toFixed(0) }}KB)</span>
          </div>
        </div>
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
