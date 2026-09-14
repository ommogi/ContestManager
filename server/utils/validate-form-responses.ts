// server/utils/validate-form-responses.ts
//
// Server-side gate for inscription form responses (KAN-52).
//
// The rules themselves live in shared/inscription-form-validation.ts so the
// public page and this handler cannot drift apart. This module adds only what
// is server-specific: turning a failed result into an h3 400 whose body names
// the offending field ids.
//
// This is the authoritative check. The composable runs the same rules in the
// browser for immediate feedback, but a request that never touches the UI
// (curl, a replayed fetch) still has to come through here.

import { createError } from 'h3'
import type {
  FieldValidationError,
  FormField,
  FormResponses,
  FormValidationResult,
} from '../../shared/inscription-form'
import {
  pickKnownResponses,
  validateFormField,
  validateFormResponses,
} from '../../shared/inscription-form-validation'

export {
  pickKnownResponses,
  validateFormField,
  validateFormResponses,
}
export type { FieldValidationError, FormValidationResult }

/** Shape returned to the client in `data` when validation fails. */
export interface FormValidationErrorPayload {
  code: 'FORM_VALIDATION_FAILED'
  errors: FieldValidationError[]
}

/**
 * Validates `responses` against `fields` and throws 400 if anything fails.
 *
 * Returns the responses narrowed to the ids the schema declares, so callers
 * persist exactly what was validated and nothing else — a caller that writes
 * the raw body instead would reintroduce the hole this closes.
 */
export function assertValidFormResponses(
  fields: FormField[],
  responses: FormResponses,
): FormResponses {
  const known = pickKnownResponses(fields, responses)
  const result = validateFormResponses(fields, known)

  if (!result.isValid) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Form validation failed',
      data: {
        code: 'FORM_VALIDATION_FAILED',
        errors: result.errors,
      } satisfies FormValidationErrorPayload,
    })
  }

  return known
}
