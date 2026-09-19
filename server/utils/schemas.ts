import { z } from 'zod'
import { validateCoreFields } from '../../shared/inscription-form-core'
import type { FormField } from '../../shared/inscription-form'
import { MAX_WORK_SECONDS } from '../../shared/works-catalog'
import { MAX_PERFORMANCE_MINUTES } from '../../shared/round-draw'
import { MAX_CALL_OFFSET_MINUTES, validateSessionWindow } from '../../shared/session-window'

// ─── Primitives ──────────────────────────────────────────────────────────────

// Postgres' `uuid` type accepts any 8-4-4-4-12 hex string — it does not enforce
// RFC4122 version/variant nibbles. Seeded/demo rows use human-readable ids
// (e.g. "bbbbbbbb-0000-...") that fail Zod's stricter `.uuid()`, so use `.guid()`
// to match what the database actually accepts.
export const uuidString = z.guid()
export const isoDateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD')
export const timeOfDayString = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Expected HH:MM')
export const emailString = z.string().email()
export const phoneString = z.string().regex(/^\+\d{7,15}$/).nullable().optional()
export const dniString = z.string().min(8).max(20).nullable().optional()

// ─── Domain schemas ──────────────────────────────────────────────────────────

/**
 * Answers to the contest's configurable inscription form (KAN-49).
 *
 * Stops at `unknown` on purpose. What a value is *allowed* to be depends on the
 * field's type, and the field types are only known once the published schema
 * has been read from the database — zod cannot decide it from the body alone.
 * `prepareFormSubmission` narrows these and hands them to
 * `assertValidFormResponses`, which is the authority.
 *
 * Both keys are optional so a contest with no published form posts exactly the
 * body it posted before this existed.
 */
const formSubmissionFields = {
  form_schema_id: uuidString.nullable().optional(),
  responses: z.record(z.string(), z.unknown()).nullable().optional(),
}

/** Shared by free enroll and paid checkout public flows */
export const EnrollBodySchema = z.object({
  category_id: uuidString,
  first_name: z.string().min(1).max(100),
  last_name: z.string().min(1).max(100),
  birthdate: isoDateString,
  dni: dniString,
  country: z.string().min(2).max(100).nullable().optional(),
  // Required since KAN-65, the same way first_name/last_name/birthdate are:
  // `core.email` can no longer be hidden or made optional, so every form asks
  // for it. This is what stops a handcrafted body from omitting it and having
  // the server fill `participants.email` from the session instead.
  email: emailString,
  phone: phoneString,
  ...formSubmissionFields,
})

export const ScoreBodySchema = z.object({
  round_id: uuidString,
  participant_id: uuidString,
  judge_id: uuidString,
  value: z.number(),
  notes: z.string().max(1000).nullable().optional(),
  promote: z.boolean().optional().default(false),
})

export const CheckoutPlanSchema = z.object({
  plan: z.enum(['starter', 'pro', 'enterprise']),
})

const returnPathField = z
  .string()
  .refine(v => v.startsWith('/') && !v.startsWith('//'), 'Must be an internal path starting with /')
  .optional()

export const CheckoutTicketsSchema = z.object({
  quantity: z.number().int().min(1).max(500),
  return_path: returnPathField,
})

export const CheckoutActivationsSchema = z.object({
  quantity: z.number().int().min(1).max(50),
  return_path: returnPathField,
})

export const CheckoutEnrollmentSchema = z.object({
  category_id: uuidString,
  first_name: z.string().min(1).max(100),
  last_name: z.string().min(1).max(100),
  birthdate: isoDateString,
  dni: dniString,
  country: z.string().min(2).max(100).nullable().optional(),
  // Required since KAN-65, the same way first_name/last_name/birthdate are:
  // `core.email` can no longer be hidden or made optional, so every form asks
  // for it. This is what stops a handcrafted body from omitting it and having
  // the server fill `participants.email` from the session instead.
  email: emailString,
  phone: phoneString,
  ...formSubmissionFields,
})

export const ContestCreateSchema = z.object({
  name: z.string().min(1).max(200),
  short_description: z.string().max(2000).nullable().optional(),
  prizes: z.string().max(5000).nullable().optional(),
  rules: z.string().max(10000).nullable().optional(),
  starts_at: z.string().nullable().optional(),
  ends_at: z.string().nullable().optional(),
  is_rounds_dynamic: z.boolean().optional().default(false),
  mode: z.enum(['standard', 'tournament']).optional().default('standard'),
})

export const RefundBodySchema = z.object({
  amount_cents: z.number().int().min(1).optional(),
  reverse_transfer: z.boolean().optional().default(true),
})

export const BulkRoundParticipantsSchema = z.object({
  participantIds: z.array(uuidString).min(1).max(500),
})

const drawNumber = z.number().int().positive().nullable()
const performanceMinutes = z.number().int().min(1).max(MAX_PERFORMANCE_MINUTES).nullable()

/**
 * A round's draw and performance lengths (KAN-11). Duplicate draw numbers are
 * rejected here for a clear 400, and again by the database's unique constraint,
 * which is the authority once rows the body does not mention are counted.
 */
export const RoundDrawSchema = z.object({
  rows: z.array(z.object({
    id: uuidString,
    draw_number: drawNumber,
    performance_minutes: performanceMinutes,
  })).min(1).max(500),
}).refine(
  ({ rows }) => {
    const numbers = rows.map(r => r.draw_number).filter((n): n is number => n !== null)
    return new Set(numbers).size === numbers.length
  },
  { message: 'duplicate_draw_number', path: ['rows'] },
).refine(
  ({ rows }) => new Set(rows.map(r => r.id)).size === rows.length,
  { message: 'duplicate_row_id', path: ['rows'] },
)

/** Generate a round's schedule (KAN-13). A dry run is the safe default. */
export const RoundScheduleGenerateSchema = z.object({
  dryRun: z.boolean().default(true),
  overwrite: z.boolean().default(false),
})

/**
 * Rows of a draw CSV, parsed in the browser by `parseDrawCsv`. Matching to
 * participants happens on the server, which is the side that can read DNI and
 * e-mail without sending them to the page.
 */
export const RoundDrawImportSchema = z.object({
  rows: z.array(z.object({
    line: z.number().int().positive(),
    dni: z.string().max(40).nullable(),
    email: z.string().max(320).nullable(),
    draw_number: drawNumber,
    performance_minutes: performanceMinutes,
  })).min(1).max(500),
  /** false = only report what would match; true = also save it. */
  apply: z.boolean().default(false),
})

// ─── Works catalogue (KAN-16) ────────────────────────────────────────────────

export const ComposerBodySchema = z.object({
  name: z.string().trim().min(1).max(200),
  /** Create even though similar composers exist (the user saw the warning). */
  force: z.boolean().optional().default(false),
})

export const ComposerPatchSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  archived: z.boolean().optional(),
})

export const WorkBodySchema = z.object({
  composer_id: uuidString,
  title: z.string().trim().min(1).max(300),
  catalog_ref: z.string().trim().max(60).nullable().optional(),
  duration_seconds: z.number().int().min(1).max(MAX_WORK_SECONDS).nullable().optional(),
})

export const WorkPatchSchema = WorkBodySchema.partial().extend({
  archived: z.boolean().optional(),
})

export const JudgePoolSchema = z.object({
  full_name: z.string().max(200).nullable().optional(),
  email: emailString,
  specialty: z.string().max(200).nullable().optional(),
})

export const JudgePoolInviteSchema = z.object({
  full_name: z.string().max(200).nullable().optional(),
  email: emailString,
  specialty: z.string().max(200).nullable().optional(),
})

export const PromoteBodySchema = z.object({
  participantIds: z.array(uuidString).min(1).max(1000),
  nextRoundName: z.string().min(1).max(200).optional(),
  isFinal: z.boolean().optional().default(false),
})

export const ContestPatchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  slug: z.string().min(1).max(100).optional(),
  description: z.string().max(5000).nullable().optional(),
  type: z.string().min(1).max(50).optional(),
  status: z.enum(['draft', 'active', 'finished', 'cancelled']).optional(),
  is_rounds_dynamic: z.boolean().optional(),
  starts_at: z.string().nullable().optional(),
  ends_at: z.string().nullable().optional(),
  settings: z.record(z.string(), z.unknown()).nullable().optional(),
  cover_image_url: z.string().nullable().optional(),
  rules: z.string().max(10000).nullable().optional(),
  entry_fee_cents: z.number().int().min(0).nullable().optional(),
  registration_open: z.boolean().optional(),
  /** Minutes before their performance a participant is called (KAN-12). */
  call_offset_minutes: z.number().int().min(0).max(MAX_CALL_OFFSET_MINUTES).nullable().optional(),
})

export const ParticipantPatchSchema = z.object({
  first_name: z.string().min(1).max(100).optional(),
  last_name: z.string().min(1).max(100).optional(),
  birthdate: isoDateString.optional(),
  dni: dniString,
  country: z.string().min(2).max(100).nullable().optional(),
  email: emailString.nullable().optional(),
  phone: phoneString,
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  status: z.string().min(1).max(50).optional(),
})

export const CategoryPatchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  order: z.number().int().min(0).optional(),
  status: z.string().min(1).max(50).optional(),
  min_age: z.number().int().min(0).nullable().optional(),
  max_age: z.number().int().min(0).nullable().optional(),
  artistic_type: z.string().max(100).nullable().optional(),
  speciality: z.string().max(100).nullable().optional(),
  max_participants: z.number().int().min(1).nullable().optional(),
})

export const ParticipantCreateSchema = z.object({
  category_id: uuidString,
  first_name: z.string().min(1).max(100).optional(),
  last_name: z.string().min(1).max(100).optional(),
  birthdate: isoDateString.optional(),
  dni: dniString,
  country: z.string().min(2).max(100).nullable().optional(),
  email: emailString.nullable().optional(),
  phone: phoneString,
})

export const ContestMemberSchema = z.object({
  full_name: z.string().min(1).max(200).optional(),
  email: emailString.optional(),
  role: z.enum(['judge', 'viewer', 'staff']).optional(),
  user_id: uuidString.optional(),
})

const ImportRowSchema = z.object({
  category_id: uuidString,
  first_name: z.string().min(1).max(100),
  last_name: z.string().min(1).max(100),
  birthdate: isoDateString,
  dni: dniString,
  country: z.string().min(2).max(100).nullable().optional(),
  email: emailString.nullable().optional(),
  phone: phoneString,
})

export const ImportBodySchema = z.object({
  rows: z.array(ImportRowSchema).min(1).max(1000),
})

export const RoundPatchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  order: z.number().int().min(0).optional(),
  status: z.enum(['pending', 'active', 'closed']).optional(),
  scoring_type: z.enum(['numeric', 'rank', 'vote']).optional(),
  max_score: z.number().min(0).max(1000).nullable().optional(),
  next_round_id: uuidString.nullable().optional(),
  is_final: z.boolean().optional(),
  is_ranking: z.boolean().optional(),
  is_published: z.boolean().optional(),
  started_at: z.string().nullable().optional(),
  closed_at: z.string().nullable().optional(),
  // Session window (KAN-12). Only checked here when both ends come in the same
  // request; the endpoint checks a lone end against the stored one.
  session_date: isoDateString.nullable().optional(),
  session_start: timeOfDayString.nullable().optional(),
  session_end: timeOfDayString.nullable().optional(),
}).refine(
  body => validateSessionWindow(body.session_start, body.session_end) === null,
  { message: 'end_not_after_start', path: ['session_end'] },
)

export const RoundCreateSchema = z.object({
  name: z.string().min(1).max(200),
  order: z.number().int().min(0).optional(),
  scoring_type: z.enum(['numeric', 'rank', 'vote']).optional(),
  max_score: z.number().min(0).max(1000).nullable().optional(),
  is_final: z.boolean().optional(),
  is_ranking: z.boolean().optional(),
  category_id: uuidString.optional(),
})

export const CategoryCreateSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).nullable().optional(),
  order: z.number().int().min(0).optional(),
  min_age: z.number().int().min(0).nullable().optional(),
  max_age: z.number().int().min(0).nullable().optional(),
  artistic_type: z.string().max(100).nullable().optional(),
  speciality: z.string().max(100).nullable().optional(),
  max_participants: z.number().int().min(1).nullable().optional(),
  entry_fee_cents: z.number().int().min(0).nullable().optional(),
})

// `rehearsal_time` / `performance_time` are TEXT (datetime-local strings), per
// the project's time-field convention — not timestamps.
export const RoundParticipantPatchSchema = z.object({
  rehearsal_room: z.string().max(200).nullable().optional(),
  rehearsal_time: z.string().max(64).nullable().optional(),
  rehearsal_accompanist: z.string().max(200).nullable().optional(),
  performance_time: z.string().max(64).nullable().optional(),
})

/** `final_score_override: null` clears the override. */
export const ScoreOverrideSchema = z.object({
  final_score_override: z.number().min(0).max(1000).nullable().optional(),
  final_score_override_notes: z.string().max(1000).nullable().optional(),
})

// Mirrors the contract in shared/inscription-form.ts. The previous version
// demanded `key` and `options: string[]`, neither of which the builder emits,
// so a real form was rejected with 400. It was also `.loose()`, which let any
// unknown key through unvalidated.
const FormFieldOptionSchema = z.object({
  value: z.string().min(1).max(200),
  label: z.string().min(1).max(200),
  icon: z.string().max(100).optional(),
})

const FormFieldValidationSchema = z.object({
  required: z.boolean().optional(),
  minLength: z.number().int().min(0).optional(),
  maxLength: z.number().int().min(0).optional(),
  minValue: z.number().optional(),
  maxValue: z.number().optional(),
  pattern: z.string().max(500).optional(),
  patternMessage: z.string().max(200).optional(),
  customRule: z.enum(['email', 'phone', 'url', 'dni']).optional(),
}).strict()

const FormFieldSchema = z.object({
  id: z.string().min(1).max(100),
  type: z.enum([
    'text', 'textarea', 'number', 'email', 'phone', 'date',
    'select', 'radio', 'checkbox', 'checkbox-group', 'file', 'url',
  ]),
  label: z.string().min(1).max(200),
  labelTranslations: z.record(z.string(), z.string().max(200)).optional(),
  description: z.string().max(1000).optional(),
  descriptionTranslations: z.record(z.string(), z.string().max(1000)).optional(),
  placeholder: z.string().max(200).nullable().optional(),
  defaultValue: z.unknown().optional(),
  required: z.boolean(),
  order: z.number().int().min(0),
  hidden: z.boolean(),
  // KAN-56: core fields travel as ordinary schema entries. The object is
  // .strict(), so without this key every payload carrying a core field would
  // be rejected with an unhelpful "unrecognized key".
  isCore: z.boolean().optional(),
  validation: FormFieldValidationSchema,
  width: z.enum(['full', 'half', 'third']).optional(),

  // Per-type extras. Kept optional here and checked against `type` by the
  // superRefine below, which is simpler to read than a discriminated union
  // spread across twelve members.
  rows: z.number().int().min(1).max(50).optional(),
  step: z.number().optional(),
  options: z.array(FormFieldOptionSchema).max(100).optional(),
  allowOther: z.boolean().optional(),
  checkedLabel: z.string().max(200).optional(),
  uncheckedLabel: z.string().max(200).optional(),
  minSelected: z.number().int().min(0).optional(),
  maxSelected: z.number().int().min(0).optional(),
  accept: z.string().max(200).optional(),
  maxFiles: z.number().int().min(1).max(20).optional(),
  maxSizeMB: z.number().min(0).max(100).optional(),
}).strict().superRefine((field, ctx) => {
  const needsOptions = field.type === 'select'
    || field.type === 'radio'
    || field.type === 'checkbox-group'

  if (needsOptions && (!field.options || field.options.length === 0)) {
    ctx.addIssue({
      code: 'custom',
      path: ['options'],
      message: `El campo de tipo "${field.type}" necesita al menos una opción.`,
    })
  }

  if (field.options) {
    const values = field.options.map(o => o.value)
    if (new Set(values).size !== values.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['options'],
        message: 'Las opciones no pueden repetir el mismo valor.',
      })
    }
  }
})

export const FormSchemaBodySchema = z.object({
  fields: z.array(FormFieldSchema).max(100),
}).superRefine((body, ctx) => {
  // Duplicate ids would silently overwrite each other in FormResponses, which
  // is keyed by field id.
  const ids = body.fields.map(f => f.id)
  const seen = new Set<string>()
  ids.forEach((id, index) => {
    if (seen.has(id)) {
      ctx.addIssue({
        code: 'custom',
        path: ['fields', index, 'id'],
        message: `El identificador de campo "${id}" está repetido.`,
      })
    }
    seen.add(id)
  })

  // KAN-56: the builder UI hides these controls, but the UI is not the
  // boundary. first_name / last_name / birthdate cannot be removed, hidden or
  // made optional here either — the per-category age filter and the
  // age_below_min / age_above_max guards inside enroll_participant read them.
  for (const issue of validateCoreFields(body.fields as unknown as FormField[])) {
    const index = body.fields.findIndex(f => f.id === issue.fieldId)
    ctx.addIssue({
      code: 'custom',
      path: index >= 0 ? ['fields', index] : ['fields'],
      message: issue.message,
    })
  }
})
