// app/composables/useInscriptionForm.ts

import { ref, computed, reactive } from 'vue'
import type {
  FormField,
  FormFieldType,
  FormResponses,
  FormResponseValue,
  FormValidationResult,
  FieldValidationError,
  InscriptionFormSchema
} from '~/types/inscription-form'
import {
  validateFormField,
  validateFormResponses
} from '../../shared/inscription-form-validation'

// `generateId` was imported from '~/utils', which does not export it, while an
// identically named function was declared at the bottom of this file — a
// duplicate binding that made the module fail to parse. The local one is the
// real implementation; the import is gone.

/**
 * Composable for managing dynamic inscription forms
 * Handles validation, responses, and field manipulation
 */
export const useInscriptionForm = (initialFields: FormField[] = []) => {
  // ─── State ───────────────────────────────────────────────────────────────
  const fields = ref<FormField[]>([...initialFields])
  const responses = reactive<FormResponses>({})
  const errors = ref<Record<string, string>>({})
  const touchedFields = ref<Set<string>>(new Set())
  const isSubmitting = ref(false)

  // ─── Computed ────────────────────────────────────────────────────────────
  const visibleFields = computed(() =>
    fields.value.filter(f => !f.hidden).sort((a, b) => a.order - b.order)
  )

  const requiredFields = computed(() =>
    visibleFields.value.filter(f => f.required)
  )

  const isFormValid = computed(() => {
    return requiredFields.value.every(field => {
      const value = responses[field.id]
      if (field.type === 'checkbox-group') {
        return Array.isArray(value) && value.length > 0
      }
      if (field.type === 'checkbox') {
        return value !== undefined && value !== null
      }
      return value !== undefined && value !== null && value !== ''
    })
  })

  const completionPercentage = computed(() => {
    if (requiredFields.value.length === 0) return 100
    const completed = requiredFields.value.filter(field => {
      const value = responses[field.id]
      if (field.type === 'checkbox-group') {
        return Array.isArray(value) && value.length > 0
      }
      return value !== undefined && value !== null && value !== ''
    }).length
    return Math.round((completed / requiredFields.value.length) * 100)
  })

  // ─── Field Management ────────────────────────────────────────────────────
  function createField(type: FormFieldType, label: string): FormField {
    const baseField: FormField = {
      id: generateId(),
      type,
      label,
      required: false,
      order: fields.value.length,
      hidden: false,
      validation: { required: false }
    }

    switch (type) {
      case 'select':
      case 'radio':
        return { ...baseField, type, options: [] } as FormField
      case 'checkbox-group':
        return { ...baseField, type, options: [] } as FormField
      case 'textarea':
        return { ...baseField, type, rows: 4 } as FormField
      case 'number':
        return { ...baseField, type, step: 1 } as FormField
      case 'file':
        return { ...baseField, type, maxFiles: 1, maxSizeMB: 10 } as FormField
      default:
        return baseField
    }
  }

  function addField(field: FormField, index?: number) {
    if (index !== undefined) {
      fields.value.splice(index, 0, field)
    } else {
      fields.value.push(field)
    }
    // Update order for all fields
    fields.value.forEach((f, i) => { f.order = i })
  }

  function updateField(fieldId: string, updates: Partial<FormField>) {
    const field = fields.value.find(f => f.id === fieldId)
    if (field) {
      Object.assign(field, updates)
    }
  }

  function removeField(fieldId: string) {
    const index = fields.value.findIndex(f => f.id === fieldId)
    if (index !== -1) {
      fields.value.splice(index, 1)
      // Update order
      fields.value.forEach((f, i) => { f.order = i })
      // Clear response and error
      delete responses[fieldId]
      delete errors.value[fieldId]
    }
  }

  function reorderFields(fromIndex: number, toIndex: number) {
    const [removed] = fields.value.splice(fromIndex, 1)
    fields.value.splice(toIndex, 0, removed)
    // Update order
    fields.value.forEach((f, i) => { f.order = i })
  }

  function duplicateField(fieldId: string) {
    const field = fields.value.find(f => f.id === fieldId)
    if (field) {
      const newField = {
        ...JSON.parse(JSON.stringify(field)),
        id: generateId(),
        label: `${field.label} (copia)`,
        order: fields.value.length
      }
      fields.value.push(newField)
    }
  }

  // ─── Response Management ─────────────────────────────────────────────────
  function setResponse(fieldId: string, value: FormResponseValue) {
    responses[fieldId] = value
    // Clear error when user types
    if (errors.value[fieldId]) {
      delete errors.value[fieldId]
    }
  }

  function getResponse(fieldId: string) {
    return responses[fieldId]
  }

  function clearResponses() {
    fields.value.forEach(f => {
      delete responses[f.id]
    })
  }

  function markFieldTouched(fieldId: string) {
    touchedFields.value.add(fieldId)
  }

  // ─── Validation ──────────────────────────────────────────────────────────
  // The rules themselves live in shared/inscription-form-validation.ts and are
  // the same module the server gate imports, so the browser and the API can no
  // longer reach opposite verdicts. This layer only maps the shared result onto
  // the `errors` record the templates bind to.
  function validateField(fieldId: string): boolean {
    const field = fields.value.find(f => f.id === fieldId)
    if (!field) return true

    const error = validateFormField(field, responses[fieldId])
    if (error) {
      errors.value[fieldId] = error.message
      return false
    }

    delete errors.value[fieldId]
    return true
  }

  function validateAll(): FormValidationResult {
    const result = validateFormResponses(fields.value, responses)

    // Rebuild the record so errors cleared since the last run disappear from
    // the UI instead of lingering.
    const next: Record<string, string> = {}
    result.errors.forEach((e: FieldValidationError) => { next[e.fieldId] = e.message })
    errors.value = next

    return result
  }

  function clearErrors() {
    errors.value = {}
  }

  // ─── Export/Import Schema ────────────────────────────────────────────────
  function exportSchema(): InscriptionFormSchema {
    return {
      id: generateId(),
      contestId: '',
      version: 1,
      isPublished: false,
      fields: JSON.parse(JSON.stringify(fields.value)),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  }

  function importSchema(schema: Partial<InscriptionFormSchema>) {
    if (schema.fields) {
      fields.value = schema.fields.map((f, i) => ({ ...f, order: i }))
      clearResponses()
      clearErrors()
    }
  }

  // ─── Public API ──────────────────────────────────────────────────────────
  return {
    // State
    fields,
    visibleFields,
    responses,
    errors,
    touchedFields,
    isSubmitting,

    // Computed
    requiredFields,
    isFormValid,
    completionPercentage,

    // Field Management
    createField,
    addField,
    updateField,
    removeField,
    reorderFields,
    duplicateField,

    // Response Management
    setResponse,
    getResponse,
    clearResponses,
    markFieldTouched,

    // Validation
    validateField,
    validateAll,
    clearErrors,

    // Schema
    exportSchema,
    importSchema
  }
}

/**
 * Generate unique ID for form fields
 */
function generateId(): string {
  return `field_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}
