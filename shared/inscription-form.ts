// Wire contract for the configurable inscription form.
//
// Single source of truth, deliberately in `shared/` so both `app/` and
// `server/` can import it without crossing the Nuxt boundary. Before this
// file the contract existed three times and disagreed with itself: the
// builder emitted `id` + nested `validation` + `{value,label}` options, the
// server's zod schema demanded `key` + flat rules + `string[]` options, and
// the SQL validator read the rules from the field root. The server would have
// rejected every real form.
//
// Nothing here may be redefined elsewhere. Extend it instead.

export type Json = string | number | boolean | null | Json[] | { [key: string]: Json }

/** Contest lifecycle, mirroring the database enum. */
export type ContestStatus = 'draft' | 'active' | 'finished' | 'cancelled'

// ─────────────────────────────────────────────────────────────────────────────
// Fields
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

/** Every value in `FormFieldType`, for runtime validation and UI palettes. */
export const FORM_FIELD_TYPES: readonly FormFieldType[] = [
  'text', 'textarea', 'number', 'email', 'phone', 'date',
  'select', 'radio', 'checkbox', 'checkbox-group', 'file', 'url',
] as const

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
  /** Stable identifier, unique within a schema. Keys into `FormResponses`. */
  id: string
  type: FormFieldType
  label: string
  labelTranslations?: Record<string, string>
  description?: string
  descriptionTranslations?: Record<string, string>
  placeholder?: string
  defaultValue?: Json
  required: boolean
  order: number
  hidden: boolean
  /** Rules live here, never at the field root. */
  validation: FormFieldValidation
  width?: 'full' | 'half' | 'third'
}

/**
 * Types that need no extra configuration beyond the base.
 *
 * These four were declared in FormFieldType but had no interface, so a field
 * of any of them did not satisfy the FormField union.
 */
export interface FormFieldSimple extends FormFieldBase {
  type: 'email' | 'phone' | 'date' | 'url'
}

export interface FormFieldText extends FormFieldBase {
  type: 'text'
}

export interface FormFieldTextarea extends FormFieldBase {
  type: 'textarea'
  rows?: number
}

export interface FormFieldNumber extends FormFieldBase {
  type: 'number'
  step?: number
}

export interface FormFieldSelect extends FormFieldBase {
  type: 'select' | 'radio'
  options: FormFieldOption[]
  /** Accept a value outside `options`. */
  allowOther?: boolean
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
  /** MIME types or extensions, e.g. 'image/*,.pdf'. Enforced server-side. */
  accept?: string
  maxFiles?: number
  maxSizeMB?: number
}

export type FormField =
  | FormFieldSimple
  | FormFieldText
  | FormFieldTextarea
  | FormFieldNumber
  | FormFieldSelect
  | FormFieldCheckbox
  | FormFieldCheckboxGroup
  | FormFieldFile

// ─────────────────────────────────────────────────────────────────────────────
// Schema
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

/**
 * What the public endpoint hands to the inscription page.
 *
 * `id` is required to record `participant_form_responses.form_schema_id`; a
 * contest with no published form answers with nulls and an empty array, which
 * is a normal state rather than an error.
 */
export interface PublishedFormSchema {
  id: string | null
  version: number | null
  publishedAt: string | null
  fields: FormField[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Responses
// ─────────────────────────────────────────────────────────────────────────────

/** A stored reference to an uploaded file. Never the file contents. */
export interface FormFileReference {
  path: string
  name: string
  size: number
  mimeType: string
  uploadedAt: string
}

export type FormResponseValue =
  | string
  | number
  | boolean
  | string[]
  | FormFileReference[]
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
// Validation
// ─────────────────────────────────────────────────────────────────────────────

export type FieldValidationErrorType =
  | 'required'
  | 'minLength'
  | 'maxLength'
  | 'minValue'
  | 'maxValue'
  | 'pattern'
  | 'minSelected'
  | 'maxSelected'
  | 'option'
  | 'custom'

export interface FieldValidationError {
  fieldId: string
  message: string
  type: FieldValidationErrorType
}

export interface FormValidationResult {
  isValid: boolean
  errors: FieldValidationError[]
}
