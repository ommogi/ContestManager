// app/composables/useInscriptionForm.ts

import { ref, computed, reactive } from 'vue'
import type {
  FormField,
  FormFieldType,
  FormResponses,
  FormValidationResult,
  FieldValidationError,
  InscriptionFormSchema
} from '~/types/inscription-form'
import { generateId } from '~/utils'

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
  function setResponse(fieldId: string, value: any) {
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
  function validateField(fieldId: string): boolean {
    const field = fields.value.find(f => f.id === fieldId)
    if (!field) return true

    const value = responses[fieldId]
    const validation = field.validation

    // Required check
    if (validation.required) {
      if (field.type === 'checkbox-group') {
        if (!Array.isArray(value) || value.length === 0) {
          errors.value[fieldId] = 'Este campo es requerido'
          return false
        }
      } else if (field.type === 'checkbox') {
        // Checkbox can be optional even if "required" means "must respond"
        // Usually checkbox required means it must be checked
        if (validation.required && !value) {
          errors.value[fieldId] = 'Debes aceptar este campo'
          return false
        }
      } else {
        if (value === undefined || value === null || value === '') {
          errors.value[fieldId] = 'Este campo es requerido'
          return false
        }
      }
    }

    // Skip further validation if empty and not required
    if (!value || value === '') {
      delete errors.value[fieldId]
      return true
    }

    // String length validation
    if (field.type === 'text' || field.type === 'textarea') {
      const strValue = String(value)
      if (validation.minLength && strValue.length < validation.minLength) {
        errors.value[fieldId] = `Mínimo ${validation.minLength} caracteres`
        return false
      }
      if (validation.maxLength && strValue.length > validation.maxLength) {
        errors.value[fieldId] = `Máximo ${validation.maxLength} caracteres`
        return false
      }
    }

    // Number range validation
    if (field.type === 'number') {
      const numValue = Number(value)
      if (validation.minValue !== undefined && numValue < validation.minValue) {
        errors.value[fieldId] = `Valor mínimo: ${validation.minValue}`
        return false
      }
      if (validation.maxValue !== undefined && numValue > validation.maxValue) {
        errors.value[fieldId] = `Valor máximo: ${validation.maxValue}`
        return false
      }
    }

    // Pattern validation
    if (validation.pattern && typeof value === 'string') {
      const regex = new RegExp(validation.pattern)
      if (!regex.test(value)) {
        errors.value[fieldId] = validation.patternMessage || 'Formato no válido'
        return false
      }
    }

    // Custom rule validation
    if (validation.customRule) {
      switch (validation.customRule) {
        case 'email':
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
          if (!emailRegex.test(String(value))) {
            errors.value[fieldId] = 'Email no válido'
            return false
          }
          break
        case 'phone':
          const phoneRegex = /^[\d\s\+\-\(\)]{8,20}$/
          if (!phoneRegex.test(String(value))) {
            errors.value[fieldId] = 'Teléfono no válido'
            return false
          }
          break
        case 'url':
          try {
            new URL(String(value))
          } catch {
            errors.value[fieldId] = 'URL no válida'
            return false
          }
          break
        case 'dni':
          const dniRegex = /^[0-9]{8}[A-Za-z]$/
          if (!dniRegex.test(String(value).toUpperCase())) {
            errors.value[fieldId] = 'DNI no válido'
            return false
          }
          break
      }
    }

    delete errors.value[fieldId]
    return true
  }

  function validateAll(): FormValidationResult {
    const fieldErrors: FieldValidationError[] = []

    visibleFields.value.forEach(field => {
      const isValid = validateField(field.id)
      if (!isValid && errors.value[field.id]) {
        fieldErrors.push({
          fieldId: field.id,
          message: errors.value[field.id],
          type: 'required' // Simplified - could be more specific
        })
      }
    })

    return {
      isValid: fieldErrors.length === 0,
      errors: fieldErrors
    }
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
