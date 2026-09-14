// Core inscription fields, expressed as entries of the form schema (KAN-56).
//
// Extends the contract in `./inscription-form.ts` — it is not redefined here.
//
// Before this file the core fields (name, DNI, country, phone…) lived
// hardcoded in three places that did not know the form builder existed: the
// public page's markup, the server's zod body schemas, and the
// `enroll_participant` SQL signature. An organization could not reorder them,
// could not drop the ones it does not need, and could not put its own field
// between two of them.
//
// The model chosen is option 1 of KAN-56: core fields are ordinary schema
// entries with a reserved `core.` id and `isCore: true`. One ordered list, one
// renderer, one source of order. Their VALUES still land in the typed
// `participants` columns — only their presentation is schema-driven — because
// `enroll_participant`'s age guards and the per-category age filter read those
// columns.
//
// ── Decision on `participants.metadata` (KAN-56) ─────────────────────────────
// Not used, deliberately. The column has existed unused since migration 0001.
// Custom answers already have a versioned home in `participant_form_responses`
// keyed by `form_schema_id`; copying them into an unversioned JSONB column
// would create a second source of truth that drifts from the first, which is
// precisely the failure KAN-58 exists to work around. Core values stay in
// their typed columns because SQL guards read them. The column is left in
// place (dropping it is a separate, riskier migration) but is documented as
// off-limits for form data — see the COMMENT in the KAN-56 migration and the
// note in CLAUDE.md.

import type { FormField, FormFieldType } from './inscription-form'

/** Reserved id prefix. A custom field may never use it. */
export const CORE_FIELD_PREFIX = 'core.'

export type CoreFieldId =
  | 'core.first_name'
  | 'core.last_name'
  | 'core.birthdate'
  | 'core.dni'
  | 'core.country'
  | 'core.phone'
  | 'core.email'

/**
 * Core fields the business logic cannot do without.
 *
 * `first_name`/`last_name` identify the participant on every listing and
 * scorecard; `birthdate` drives the per-category age filter on the public page
 * and the `age_below_min` / `age_above_max` guards inside `enroll_participant`.
 * Hiding any of them would make an enrolment either anonymous or unassignable,
 * so they are never hideable and never optional.
 */
export const IRREDUCIBLE_CORE_FIELD_IDS: readonly CoreFieldId[] = [
  'core.first_name',
  'core.last_name',
  'core.birthdate',
] as const

export interface CoreFieldDefinition {
  id: CoreFieldId
  /** Column in `participants` that receives the value. */
  column: 'first_name' | 'last_name' | 'birthdate' | 'dni' | 'country' | 'phone' | 'email'
  type: FormFieldType
  label: string
  /** Default order, matching the public form as it renders today. */
  order: number
  /** False only for the three irreducible fields. */
  optionalAllowed: boolean
  /** False only for the three irreducible fields. */
  hideAllowed: boolean
  /** Default `required` when a contest has no schema yet. */
  defaultRequired: boolean
  placeholder?: string
  description?: string
}

/**
 * The catalogue, in the order the public form renders today. A contest with no
 * published schema must look exactly as it does now, so these defaults are the
 * current form, field for field.
 */
export const CORE_FIELD_DEFINITIONS: readonly CoreFieldDefinition[] = [
  {
    id: 'core.first_name',
    column: 'first_name',
    type: 'text',
    label: 'Nombre',
    order: 0,
    optionalAllowed: false,
    hideAllowed: false,
    defaultRequired: true,
  },
  {
    id: 'core.last_name',
    column: 'last_name',
    type: 'text',
    label: 'Apellidos',
    order: 1,
    optionalAllowed: false,
    hideAllowed: false,
    defaultRequired: true,
  },
  {
    id: 'core.birthdate',
    column: 'birthdate',
    type: 'date',
    label: 'Fecha de nacimiento',
    order: 2,
    optionalAllowed: false,
    hideAllowed: false,
    defaultRequired: true,
    description: 'Determina las categorías en las que puedes inscribirte.',
  },
  {
    id: 'core.dni',
    column: 'dni',
    type: 'text',
    label: 'DNI / NIE / Pasaporte',
    order: 3,
    optionalAllowed: true,
    hideAllowed: true,
    defaultRequired: true,
  },
  {
    id: 'core.country',
    column: 'country',
    type: 'text',
    label: 'País',
    order: 4,
    optionalAllowed: true,
    hideAllowed: true,
    defaultRequired: true,
  },
  {
    id: 'core.phone',
    column: 'phone',
    type: 'phone',
    label: 'Teléfono',
    order: 5,
    optionalAllowed: true,
    hideAllowed: true,
    defaultRequired: false,
  },
  {
    // Hideable, but the organization is warned in the builder: this address is
    // what `sendEnrollmentEmail` writes to. Hiding it means the participant
    // gets no confirmation mail.
    id: 'core.email',
    column: 'email',
    type: 'email',
    label: 'Email',
    order: 6,
    optionalAllowed: true,
    hideAllowed: true,
    defaultRequired: true,
    description: 'Se usa para enviar la confirmación de la inscripción.',
  },
] as const

const DEFINITIONS_BY_ID = new Map<string, CoreFieldDefinition>(
  CORE_FIELD_DEFINITIONS.map(d => [d.id, d]),
)

export const CORE_FIELD_IDS: readonly CoreFieldId[] = CORE_FIELD_DEFINITIONS.map(d => d.id)

export function isCoreFieldId(id: string): id is CoreFieldId {
  return DEFINITIONS_BY_ID.has(id)
}

export function coreFieldDefinition(id: string): CoreFieldDefinition | undefined {
  return DEFINITIONS_BY_ID.get(id)
}

export function isIrreducibleCoreFieldId(id: string): boolean {
  return (IRREDUCIBLE_CORE_FIELD_IDS as readonly string[]).includes(id)
}

/** The `participants` column a core field id writes to, if any. */
export function coreFieldColumn(id: string): CoreFieldDefinition['column'] | null {
  return DEFINITIONS_BY_ID.get(id)?.column ?? null
}

// ─────────────────────────────────────────────────────────────────────────────
// Building
// ─────────────────────────────────────────────────────────────────────────────

function toField(definition: CoreFieldDefinition, overrides: Partial<FormField> = {}): FormField {
  const required = overrides.required ?? definition.defaultRequired
  const base = {
    id: definition.id,
    type: definition.type,
    label: definition.label,
    description: definition.description,
    placeholder: definition.placeholder,
    required,
    order: definition.order,
    hidden: false,
    isCore: true,
    validation: definition.id === 'core.dni'
      ? { customRule: 'dni' as const }
      : {},
  }
  return {
    ...base,
    ...overrides,
    // `validation.required` must never disagree with the field's own
    // `required`: the SQL validator reads the first, the renderer the second.
    validation: { ...base.validation, ...overrides.validation, required },
    id: definition.id,
    type: definition.type,
    isCore: true,
  } as FormField
}

/**
 * The implicit schema of a contest that has never published one.
 *
 * Renders byte-for-byte like today's public form, which is the KAN-56
 * acceptance criterion for untouched contests: no migration of existing
 * contests is needed, the renderer falls back to this.
 */
export function buildDefaultFormFields(): FormField[] {
  return CORE_FIELD_DEFINITIONS.map(d => toField(d))
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────────

export interface CoreFieldIssue {
  fieldId: string
  /** Spanish, ready to surface in the builder or an API 400. */
  message: string
}

/**
 * Reject schemas that break the core-field invariants.
 *
 * The builder UI enforces the same rules, but the UI is not the boundary: this
 * runs on the server against whatever arrives on the wire.
 *
 * A schema carrying NO core entry at all is the pre-KAN-56 shape and stays
 * legal: such a contest renders the default core block plus its custom fields,
 * so nothing is missing from the participant's form. The "cannot delete" rule
 * only bites once a schema has opted into the core model by declaring at least
 * one `core.` entry — otherwise every existing custom-only schema in the
 * database, and every payload the current builder emits, would 400.
 */
export function validateCoreFields(fields: FormField[]): CoreFieldIssue[] {
  const declaresCore = fields.some(f => isCoreFieldId(f.id))
  const issues: CoreFieldIssue[] = []
  const seen = new Map<string, FormField>()

  for (const f of fields) {
    if (f.id.startsWith(CORE_FIELD_PREFIX) && !isCoreFieldId(f.id)) {
      issues.push({
        fieldId: f.id,
        message: `El prefijo "${CORE_FIELD_PREFIX}" está reservado para los campos del sistema.`,
      })
      continue
    }
    if (!isCoreFieldId(f.id)) continue

    seen.set(f.id, f)
    const definition = DEFINITIONS_BY_ID.get(f.id)!

    if (f.type !== definition.type) {
      issues.push({
        fieldId: f.id,
        message: `El campo "${definition.label}" no puede cambiar de tipo.`,
      })
    }
    if (f.hidden && !definition.hideAllowed) {
      issues.push({
        fieldId: f.id,
        message: `El campo "${definition.label}" no se puede ocultar.`,
      })
    }
    if (!f.required && !definition.optionalAllowed) {
      issues.push({
        fieldId: f.id,
        message: `El campo "${definition.label}" es obligatorio y no puede marcarse como opcional.`,
      })
    }
  }

  for (const id of IRREDUCIBLE_CORE_FIELD_IDS) {
    if (declaresCore && !seen.has(id)) {
      issues.push({
        fieldId: id,
        message: `El campo "${DEFINITIONS_BY_ID.get(id)!.label}" no se puede eliminar del formulario.`,
      })
    }
  }

  return issues
}

/**
 * Normalise a schema before it is stored.
 *
 * Restores any core field the payload omitted (an optional one may be dropped
 * from the UI, but the stored schema keeps it, hidden, so the renderer has a
 * complete picture), forces the invariants on the irreducible three, and
 * renumbers `order` into a dense 0..n-1 sequence so a later reorder cannot
 * collide. Custom fields keep their relative position, including when the
 * organization dragged one above a core field.
 */
export function reconcileFormFields(fields: FormField[]): FormField[] {
  const submittedCore = new Map<string, FormField>()
  const custom: FormField[] = []

  for (const f of fields) {
    if (isCoreFieldId(f.id)) {
      // First occurrence wins; a duplicate id is rejected upstream anyway.
      if (!submittedCore.has(f.id)) submittedCore.set(f.id, f)
    } else {
      custom.push(f)
    }
  }

  const core: FormField[] = CORE_FIELD_DEFINITIONS.map((definition) => {
    const submitted = submittedCore.get(definition.id)
    if (!submitted) {
      // Omitted entirely: restore it. Irreducible fields come back visible and
      // required; the rest come back hidden, which is what omission meant.
      return toField(definition, definition.hideAllowed ? { hidden: true, required: false } : {})
    }
    const hidden = definition.hideAllowed ? submitted.hidden === true : false
    const required = definition.optionalAllowed ? submitted.required === true : true
    return toField(definition, {
      label: submitted.label || definition.label,
      description: submitted.description ?? definition.description,
      placeholder: submitted.placeholder ?? definition.placeholder,
      width: submitted.width,
      order: typeof submitted.order === 'number' ? submitted.order : definition.order,
      hidden,
      required,
      validation: { ...submitted.validation, required },
    })
  })

  return [...core, ...custom]
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((f, index) => ({ ...f, order: index }))
}

// ─────────────────────────────────────────────────────────────────────────────
// Reading
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The field list the public form should render for a contest.
 *
 * Three cases, and the KAN-56 acceptance criterion "a contest with no
 * published schema renders exactly like today" covers two of them:
 *
 *  1. No published schema at all → the default catalogue, i.e. today's form.
 *  2. A *legacy* schema, saved before core fields existed, carrying only
 *     custom entries → the default core block first, then the custom fields
 *     after it. This is what those contests render today (hardcoded core
 *     markup, then `DynamicFormRenderer`), so their appearance is unchanged.
 *     `reconcileFormFields` must NOT be used here: it sorts by `order`, and a
 *     legacy custom field at order 0 would be spliced into the middle of the
 *     core block, silently reordering a live form.
 *  3. A schema that declares core entries → its own order is authoritative,
 *     including a custom field dragged above a core one.
 */
export function resolvePublishedFields(fields: FormField[] | null | undefined): FormField[] {
  if (!fields || fields.length === 0) return buildDefaultFormFields()

  if (fields.some(f => isCoreFieldId(f.id))) return reconcileFormFields(fields)

  const core = buildDefaultFormFields()
  const custom = [...fields]
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((f, index) => ({ ...f, order: core.length + index }))

  return [...core, ...custom]
}

/** The fields a renderer actually shows: `hidden` ones are configuration only. */
export function visibleFields(fields: FormField[]): FormField[] {
  return fields.filter(f => f.hidden !== true)
}
