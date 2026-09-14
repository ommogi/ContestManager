// Response validation for the configurable inscription form (KAN-52).
//
// One implementation, imported by both sides:
//   - server/utils/validate-form-responses.ts  (authoritative gate)
//   - app/composables/useInscriptionForm.ts    (UX convenience)
//
// Before this file the rules existed three times and disagreed: the composable
// applied length limits only to `text`/`textarea`, used a lax phone regex and a
// DNI regex that ignored the check digit and rejected every NIE; the SQL
// validator read the rules from the field root instead of `validation` and
// compared `options` as bare strings. A participant could be told "valid" by
// the browser and "invalid" by the database, or worse, the reverse.
//
// The server is the authority. The client shares this module purely so the two
// never disagree — it is not a substitute for the server call.

import type {
  FieldValidationError,
  FieldValidationErrorType,
  FormField,
  FormFieldOption,
  FormResponses,
  FormResponseValue,
  FormValidationResult,
} from './inscription-form'
import { validateDni } from './dni'

// ─────────────────────────────────────────────────────────────────────────────
// Shared rule primitives
// ─────────────────────────────────────────────────────────────────────────────

/** Mirrors `phoneString` in server/utils/schemas.ts — E.164, as stored. */
export const PHONE_PATTERN = /^\+\d{7,15}$/
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Field types whose value is edited and stored as a string. */
const STRING_FIELD_TYPES = new Set<FormField['type']>([
  'text', 'textarea', 'email', 'phone', 'date', 'url', 'select', 'radio',
])

// ─────────────────────────────────────────────────────────────────────────────
// Narrowing helpers
//
// The FormField union carries `options` on some members only. These read it
// without widening anything to `any`.
// ─────────────────────────────────────────────────────────────────────────────

function fieldOptions(field: FormField): FormFieldOption[] | null {
  if ('options' in field && Array.isArray(field.options)) return field.options
  return null
}

function allowsOther(field: FormField): boolean {
  return 'allowOther' in field && field.allowOther === true
}

function isEmptyValue(field: FormField, value: FormResponseValue | undefined): boolean {
  if (value === undefined || value === null) return true
  if (field.type === 'checkbox') return value === false
  if (Array.isArray(value)) return value.length === 0
  if (typeof value === 'string') return value.trim() === ''
  return false
}

/**
 * `required` is mirrored at the field root and inside `validation`. The builder
 * writes both, but hand-edited and legacy schemas set only one, so either wins.
 */
function isRequired(field: FormField): boolean {
  return field.required === true || field.validation?.required === true
}

function err(
  fieldId: string,
  type: FieldValidationErrorType,
  message: string,
): FieldValidationError {
  return { fieldId, type, message }
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-rule checks
// ─────────────────────────────────────────────────────────────────────────────

function checkCustomRule(
  field: FormField,
  raw: string,
): FieldValidationError | null {
  const rule = field.validation?.customRule
  if (!rule) return null

  switch (rule) {
    case 'email':
      return EMAIL_PATTERN.test(raw) ? null : err(field.id, 'custom', 'Email no válido')

    case 'phone':
      // E.164 only. The composable used to accept "600 112 233", which the
      // server's `phoneString` would then reject on the way into the database.
      return PHONE_PATTERN.test(raw) ? null : err(field.id, 'custom', 'Teléfono no válido')

    case 'url': {
      let parsed: URL
      try {
        parsed = new URL(raw)
      } catch {
        return err(field.id, 'custom', 'URL no válida')
      }
      // Reject `javascript:`/`data:` — these values are rendered back to
      // organizers in the responses table.
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return err(field.id, 'custom', 'La URL debe empezar por http:// o https://')
      }
      return null
    }

    case 'dni': {
      // Single implementation, shared with the fixed DNI field on the public
      // page. Accepts DNI and NIE with a correct check letter; the old regex
      // `^[0-9]{8}[A-Za-z]$` accepted 12345678A and rejected X1234567L.
      const result = validateDni(raw, 'dni')
      return result.valid ? null : err(field.id, 'custom', result.error || 'Documento no válido')
    }

    default:
      return null
  }
}

function validateStringField(field: FormField, value: FormResponseValue): FieldValidationError | null {
  const raw = String(value)
  const v = field.validation ?? {}

  // Length applies to every string-valued type, not just text/textarea.
  if (typeof v.minLength === 'number' && raw.length < v.minLength) {
    return err(field.id, 'minLength', `Mínimo ${v.minLength} caracteres`)
  }
  if (typeof v.maxLength === 'number' && raw.length > v.maxLength) {
    return err(field.id, 'maxLength', `Máximo ${v.maxLength} caracteres`)
  }

  if (v.pattern) {
    let re: RegExp
    try {
      re = new RegExp(v.pattern)
    } catch {
      // A malformed pattern is the organizer's bug, not the participant's.
      // Failing open here beats blocking an inscription no answer can satisfy.
      return null
    }
    if (!re.test(raw)) {
      return err(field.id, 'pattern', v.patternMessage || 'Formato no válido')
    }
  }

  return checkCustomRule(field, raw)
}

function validateNumberField(field: FormField, value: FormResponseValue): FieldValidationError | null {
  const num = typeof value === 'number' ? value : Number(String(value).trim())
  if (!Number.isFinite(num)) {
    return err(field.id, 'custom', 'Debe ser un número')
  }

  const v = field.validation ?? {}
  if (typeof v.minValue === 'number' && num < v.minValue) {
    return err(field.id, 'minValue', `Valor mínimo: ${v.minValue}`)
  }
  if (typeof v.maxValue === 'number' && num > v.maxValue) {
    return err(field.id, 'maxValue', `Valor máximo: ${v.maxValue}`)
  }
  return null
}

function validateChoiceField(field: FormField, value: FormResponseValue): FieldValidationError | null {
  const options = fieldOptions(field)
  if (options && options.length > 0 && !allowsOther(field)) {
    // Membership is by `value`, never by `label`. The SQL validator compared
    // against whole `{value,label}` objects and so rejected everything.
    const allowed = options.map(o => o.value)
    if (!allowed.includes(String(value))) {
      return err(field.id, 'option', 'Opción no válida')
    }
  }
  return validateStringField(field, value)
}

function validateCheckboxGroup(field: FormField, value: FormResponseValue): FieldValidationError | null {
  if (!Array.isArray(value)) {
    return err(field.id, 'custom', 'Formato no válido')
  }
  const selected = value.map(v => String(v))

  const options = fieldOptions(field)
  if (options && options.length > 0) {
    const allowed = new Set(options.map(o => o.value))
    if (selected.some(s => !allowed.has(s))) {
      return err(field.id, 'option', 'Opción no válida')
    }
  }

  const min = 'minSelected' in field ? field.minSelected : undefined
  const max = 'maxSelected' in field ? field.maxSelected : undefined
  if (typeof min === 'number' && selected.length < min) {
    return err(field.id, 'minSelected', `Selecciona al menos ${min} ${min === 1 ? 'opción' : 'opciones'}`)
  }
  if (typeof max === 'number' && selected.length > max) {
    return err(field.id, 'maxSelected', `Selecciona como máximo ${max} ${max === 1 ? 'opción' : 'opciones'}`)
  }
  return null
}

function validateFileField(field: FormField, value: FormResponseValue): FieldValidationError | null {
  if (!Array.isArray(value)) {
    return err(field.id, 'custom', 'Formato no válido')
  }
  const maxFiles = 'maxFiles' in field ? field.maxFiles : undefined
  if (typeof maxFiles === 'number' && value.length > maxFiles) {
    return err(field.id, 'maxSelected', `Máximo ${maxFiles} ${maxFiles === 1 ? 'archivo' : 'archivos'}`)
  }
  // Size and MIME type are enforced where the bytes are handled, not here.
  return null
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validates one field in isolation. Returns `null` when the answer is
 * acceptable. Exported so the composable can validate on blur without
 * re-running the whole form.
 */
export function validateFormField(
  field: FormField,
  value: FormResponseValue | undefined,
): FieldValidationError | null {
  // A hidden field is never rendered, so it can never be answered; treating it
  // as required would make the form unsubmittable.
  if (field.hidden) return null

  if (isEmptyValue(field, value)) {
    if (!isRequired(field)) return null
    return field.type === 'checkbox'
      ? err(field.id, 'required', 'Debes aceptar este campo')
      : err(field.id, 'required', 'Este campo es requerido')
  }

  // Narrowed above: not empty, so not undefined/null.
  const present = value as FormResponseValue

  switch (field.type) {
    case 'number':
      return validateNumberField(field, present)
    case 'select':
    case 'radio':
      return validateChoiceField(field, present)
    case 'checkbox-group':
      return validateCheckboxGroup(field, present)
    case 'file':
      return validateFileField(field, present)
    case 'checkbox':
      return typeof present === 'boolean'
        ? null
        : err(field.id, 'custom', 'Formato no válido')
    default:
      return STRING_FIELD_TYPES.has(field.type)
        ? validateStringField(field, present)
        : null
  }
}

/**
 * Validates a full set of responses against a published schema.
 *
 * Errors come back ordered by the field's `order`, so the first error in the
 * list is the first one the participant sees on screen.
 */
export function validateFormResponses(
  fields: FormField[],
  responses: FormResponses,
): FormValidationResult {
  const errors: FieldValidationError[] = []

  const ordered = [...fields].sort((a, b) => a.order - b.order)
  for (const field of ordered) {
    const error = validateFormField(field, responses?.[field.id])
    if (error) errors.push(error)
  }

  return { isValid: errors.length === 0, errors }
}

/**
 * Drops answers that no field in the schema declares.
 *
 * Anything the participant posts is attacker-controlled, and these rows are
 * later rendered back to the organizer and exported. Persisting only declared
 * field ids keeps unbounded junk out of `participant_form_responses`.
 */
export function pickKnownResponses(
  fields: FormField[],
  responses: FormResponses,
): FormResponses {
  const known = new Set(fields.filter(f => !f.hidden).map(f => f.id))
  const out: FormResponses = {}
  for (const [key, value] of Object.entries(responses ?? {})) {
    if (known.has(key) && value !== undefined) out[key] = value
  }
  return out
}
