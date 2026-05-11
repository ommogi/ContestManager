<!-- app/components/inscription/DynamicFormRenderer.vue -->
<script setup lang="ts">
import { computed, ref } from 'vue'
import type { FormField, FormResponses } from '~/types/inscription-form'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
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
  disabled?: boolean
  showRequiredIndicator?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: () => ({}),
  disabled: false,
  showRequiredIndicator: true
})

const emit = defineEmits<{
  'update:modelValue': [value: FormResponses]
  'field-blur': [fieldId: string]
  'field-change': [fieldId: string, value: any]
}>()

const internalResponses = ref<FormResponses>({ ...props.modelValue })

const visibleFields = computed(() =>
  props.fields
    .filter(f => !f.hidden)
    .sort((a, b) => a.order - b.order)
)

function handleInput(fieldId: string, value: any) {
  internalResponses.value[fieldId] = value
  emit('update:modelValue', { ...internalResponses.value })
  emit('field-change', fieldId, value)
}

function handleBlur(fieldId: string) {
  emit('field-blur', fieldId)
}

// Date picker helpers
function parseDateValue(dateStr?: string): DateValue | undefined {
  if (!dateStr) return undefined
  try {
    return parseDate(String(dateStr).slice(0, 10))
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

// Grid width classes
function getWidthClass(width?: string) {
  switch (width) {
    case 'half': return 'sm:col-span-1'
    case 'third': return 'sm:col-span-1'
    default: return 'col-span-full'
  }
}
</script>

<template>
  <div class="space-y-6">
    <div
      v-for="field in visibleFields"
      :key="field.id"
      :class="cn('grid gap-2', getWidthClass(field.width))"
    >
      <!-- Label -->
      <Label
        :for="field.id"
        :class="cn(field.required && 'after:content-[\'_*\'] after:text-destructive')"
      >
        {{ field.label }}
      </Label>

      <!-- Description -->
      <p v-if="field.description" class="text-xs text-muted-foreground -mt-1">
        {{ field.description }}
      </p>

      <!-- Text Input -->
      <Input
        v-if="field.type === 'text' || field.type === 'email' || field.type === 'url'"
        :id="field.id"
        :type="field.type"
        :placeholder="field.placeholder"
        :disabled="disabled"
        :model-value="internalResponses[field.id]"
        @update:model-value="handleInput(field.id, $event)"
        @blur="handleBlur(field.id)"
      />

      <!-- Textarea -->
      <Textarea
        v-else-if="field.type === 'textarea'"
        :id="field.id"
        :placeholder="field.placeholder"
        :rows="field.rows || 4"
        :disabled="disabled"
        :model-value="internalResponses[field.id]"
        @update:model-value="handleInput(field.id, $event)"
        @blur="handleBlur(field.id)"
      />

      <!-- Number Input -->
      <Input
        v-else-if="field.type === 'number'"
        :id="field.id"
        type="number"
        :step="field.step || 1"
        :placeholder="field.placeholder"
        :disabled="disabled"
        :model-value="internalResponses[field.id]"
        @update:model-value="handleInput(field.id, $event)"
        @blur="handleBlur(field.id)"
      />

      <!-- Phone Input -->
      <PhoneInput
        v-else-if="field.type === 'phone'"
        :id="field.id"
        :model-value="internalResponses[field.id]"
        :disabled="disabled"
        @update:model-value="handleInput(field.id, $event)"
        @blur="handleBlur(field.id)"
      />

      <!-- Date Picker -->
      <DatePicker
        v-else-if="field.type === 'date'"
        :id="field.id"
        :model-value="parseDateValue(String(internalResponses[field.id]))"
        :placeholder="field.placeholder || 'Selecciona fecha'"
        :disabled="disabled"
        @update:model-value="handleInput(field.id, formatDateValue($event))"
        @blur="handleBlur(field.id)"
      />

      <!-- Select -->
      <Select
        v-else-if="field.type === 'select'"
        :model-value="String(internalResponses[field.id] || '')"
        :disabled="disabled"
        @update:model-value="handleInput(field.id, $event)"
      >
        <SelectTrigger :id="field.id">
          <SelectValue :placeholder="field.placeholder || 'Selecciona una opción'" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem
            v-for="option in (field as any).options"
            :key="option.value"
            :value="option.value"
          >
            {{ option.label }}
          </SelectItem>
          <!-- Allow other option -->
          <template v-if="(field as any).allowOther && !(field as any).options?.find((o: any) => o.value === internalResponses[field.id])">
            <SelectItem :value="String(internalResponses[field.id] || '')">
              {{ internalResponses[fieldId] }} (Otro)
            </SelectItem>
          </template>
        </SelectContent>
      </Select>

      <!-- Radio Group -->
      <div v-else-if="field.type === 'radio'" class="space-y-2">
        <div
          v-for="option in (field as any).options"
          :key="option.value"
          class="flex items-center space-x-2"
        >
          <input
            type="radio"
            :id="`${field.id}-${option.value}`"
            :name="field.id"
            :value="option.value"
            :checked="internalResponses[field.id] === option.value"
            :disabled="disabled"
            class="h-4 w-4"
            @change="handleInput(field.id, option.value)"
            @blur="handleBlur(field.id)"
          />
          <Label :for="`${field.id}-${option.value}`" class="font-normal">
            {{ option.label }}
          </Label>
        </div>
      </div>

      <!-- Single Checkbox -->
      <div v-else-if="field.type === 'checkbox'" class="flex items-center space-x-2">
        <Checkbox
          :id="field.id"
          :checked="!!internalResponses[field.id]"
          :disabled="disabled"
          @update:checked="handleInput(field.id, $event)"
          @blur="handleBlur(field.id)"
        />
        <Label :for="field.id" class="font-normal cursor-pointer">
          {{ field.label }}
        </Label>
      </div>

      <!-- Checkbox Group -->
      <div v-else-if="field.type === 'checkbox-group'" class="space-y-2">
        <div
          v-for="option in (field as any).options"
          :key="option.value"
          class="flex items-center space-x-2"
        >
          <Checkbox
            :id="`${field.id}-${option.value}`"
            :checked="(Array.isArray(internalResponses[field.id]) && (internalResponses[field.id] as string[]).includes(option.value))"
            :disabled="disabled"
            @update:checked="checked => {
              const current = Array.isArray(internalResponses[field.id]) ? [...internalResponses[field.id]] : []
              if (checked) {
                current.push(option.value)
              } else {
                const idx = current.indexOf(option.value)
                if (idx > -1) current.splice(idx, 1)
              }
              handleInput(field.id, current)
            }"
            @blur="handleBlur(field.id)"
          />
          <Label :for="`${field.id}-${option.value}`" class="font-normal">
            {{ option.label }}
          </Label>
        </div>
      </div>

      <!-- File Upload -->
      <div v-else-if="field.type === 'file'" class="space-y-2">
        <div class="flex items-center gap-2">
          <Input
            :id="field.id"
            type="file"
            :accept="(field as any).accept"
            :disabled="disabled"
            :multiple="(field as any).maxFiles && (field as any).maxFiles > 1"
            class="cursor-pointer"
            @change="e => {
              const files = Array.from((e.target as HTMLInputElement).files || [])
              handleInput(field.id, files)
            }"
            @blur="handleBlur(field.id)"
          />
        </div>
        <p class="text-xs text-muted-foreground">
          <template v-if="(field as any).accept">
            Formatos: {{ (field as any).accept }}
          </template>
          <template v-if="(field as any).maxSizeMB">
            · Tamaño máx: {{ (field as any).maxSizeMB }}MB
          </template>
          <template v-if="(field as any).maxFiles && (field as any).maxFiles > 1">
            · Máx {{ (field as any).maxFiles }} archivos
          </template>
        </p>
        <!-- File preview -->
        <div v-if="Array.isArray(internalResponses[field.id]) && (internalResponses[field.id] as File[]).length > 0" class="flex flex-wrap gap-2">
          <div
            v-for="(file, idx) in (internalResponses[field.id] as File[])"
            :key="idx"
            class="flex items-center gap-2 text-xs bg-muted px-2 py-1 rounded"
          >
            <span class="truncate max-w-[150px]">{{ file.name }}</span>
            <span class="text-muted-foreground">({{ (file.size / 1024).toFixed(0) }}KB)</span>
          </div>
        </div>
      </div>

      <!-- Error Message -->
      <p v-if="false" class="text-xs text-destructive">
        <!-- Error will be shown by parent form validator -->
      </p>
    </div>
  </div>
</template>

<style scoped>
/* Custom styles for better mobile experience */
@media (max-width: 640px) {
  .grid {
    grid-template-columns: 1fr;
  }
}
</style>
