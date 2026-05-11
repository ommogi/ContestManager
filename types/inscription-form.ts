// types/inscription-form.ts

import type { Json } from './index'

// ─────────────────────────────────────────────────────────────────────────────
// Form Field Types
// ─────────────────────────────────────────────────────────────────────────────

export type FormFieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'email'
  | 'phone'
  | 'date'
  | 'select'
  | 'radio'
  | 'checkbox'
  | 'checkbox-group'
  | 'file'
  | 'url'

export interface FormFieldOption {
  value: string
  label: string
  icon?: string
}

export interface FormFieldValidation {
  required?: boolean
  minLength?: number
  maxLength?: number
  minValue?: number
  maxValue?: number
  pattern?: string
  patternMessage?: string
  customRule?: 'email' | 'phone' | 'url' | 'dni'
}

export interface FormFieldBase {
  id: string
  type: FormFieldType
  label: string
  labelTranslations?: Record<string, string>  // i18n support
  description?: string
  descriptionTranslations?: Record<string, string>
  placeholder?: string
  defaultValue?: Json
  required: boolean
  order: number
  hidden: boolean
  validation: FormFieldValidation
  width?: 'full' | 'half' | 'third'  // For grid layouts
}

export interface FormFieldText extends FormFieldBase {
  type: 'text'
  validation: FormFieldValidation & {
    minLength?: number
    maxLength?: number
  }
}

export interface FormFieldTextarea extends FormFieldBase {
  type: 'textarea'
  rows?: number
  validation: FormFieldValidation & {
    minLength?: number
    maxLength?: number
  }
}

export interface FormFieldNumber extends FormFieldBase {
  type: 'number'
  step?: number
  validation: FormFieldValidation & {
    minValue?: number
    maxValue?: number
  }
}

export interface FormFieldSelect extends FormFieldBase {
  type: 'select' | 'radio'
  options: FormFieldOption[]
  allowOther?: boolean  // Allow custom value not in options
}

export interface FormFieldCheckbox extends FormFieldBase {
  type: 'checkbox'
  checkedLabel?: string
  uncheckedLabel?: string
}

export interface FormFieldCheckboxGroup extends FormFieldBase {
  type: 'checkbox-group'
  options: FormFieldOption[]
  minSelected?: number
  maxSelected?: number
}

export interface FormFieldFile extends FormFieldBase {
  type: 'file'
  accept?: string  // MIME types: 'image/*,.pdf'
  maxFiles?: number
  maxSizeMB?: number
}

export type FormField =
  | FormFieldText
  | FormFieldTextarea
  | FormFieldNumber
  | FormFieldSelect
  | FormFieldCheckbox
  | FormFieldCheckboxGroup
  | FormFieldFile

// ─────────────────────────────────────────────────────────────────────────────
// Form Schema
// ─────────────────────────────────────────────────────────────────────────────

export interface InscriptionFormSchema {
  id: string
  contestId: string
  version: number
  isPublished: boolean
  fields: FormField[]
  createdAt: string
  updatedAt: string
  publishedAt?: string
}

export interface InscriptionFormSchemaCreate {
  contestId: string
  fields: FormField[]
}

export interface InscriptionFormSchemaUpdate {
  fields?: FormField[]
  isPublished?: boolean
}

// ─────────────────────────────────────────────────────────────────────────────
// Form Responses
// ─────────────────────────────────────────────────────────────────────────────

export type FormResponseValue =
  | string
  | number
  | boolean
  | string[]
  | null

export interface FormResponses {
  [fieldId: string]: FormResponseValue
}

export interface ParticipantFormResponse {
  id: string
  participantId: string
  formSchemaId: string
  responses: FormResponses
  createdAt: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation Errors
// ─────────────────────────────────────────────────────────────────────────────

export interface FieldValidationError {
  fieldId: string
  message: string
  type: 'required' | 'minLength' | 'maxLength' | 'minValue' | 'maxValue' | 'pattern' | 'custom'
}

export interface FormValidationResult {
  isValid: boolean
  errors: FieldValidationError[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Form Builder UI State
// ─────────────────────────────────────────────────────────────────────────────

export interface FormBuilderDragItem {
  type: 'FIELD'
  field: FormField
  index: number
}

export interface FormBuilderState {
  fields: FormField[]
  selectedFieldId: string | null
  isDirty: boolean
  isPreviewMode: boolean
  activeLanguage: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Contest Status Config (for inscription page)
// ─────────────────────────────────────────────────────────────────────────────

import type { ContestStatus } from './index'

export interface InscriptionStatusConfig {
  status: ContestStatus
  registrationOpen: boolean
  badgeVariant: 'default' | 'secondary' | 'destructive' | 'outline'
  badgeIcon: string
  showForm: boolean
  message: {
    title: string
    description: string
  }
  allowPreview: boolean
}

export const INSCRIPTION_STATUS_CONFIG: Record<ContestStatus, InscriptionStatusConfig> = {
  draft: {
    status: 'draft',
    registrationOpen: true,
    badgeVariant: 'default',
    badgeIcon: 'CheckCircle2',
    showForm: true,
    message: {
      title: 'Inscripciones abiertas',
      description: 'Completa el formulario para participar en este concurso.'
    },
    allowPreview: true
  },
  active: {
    status: 'active',
    registrationOpen: false,
    badgeVariant: 'secondary',
    badgeIcon: 'Trophy',
    showForm: false,
    message: {
      title: 'Concurso en progreso',
      description: 'Las inscripciones han cerrado. El concurso está actualmente en progreso.'
    },
    allowPreview: true
  },
  finished: {
    status: 'finished',
    registrationOpen: false,
    badgeVariant: 'outline',
    badgeIcon: 'Award',
    showForm: false,
    message: {
      title: 'Concurso finalizado',
      description: 'Este concurso ha terminado. Consulta los resultados.'
    },
    allowPreview: true
  },
  cancelled: {
    status: 'cancelled',
    registrationOpen: false,
    badgeVariant: 'destructive',
    badgeIcon: 'CircleX',
    showForm: false,
    message: {
      title: 'Concurso cancelado',
      description: 'Este concurso ha sido cancelado por el organizador.'
    },
    allowPreview: true
  }
}
