// server/utils/form-responses.ts
// Resolve stored participant answers against the schema version they answered.
//
// Why this exists (KAN-58): `inscription_form_schemas.version` is incremental
// and publishing a new version unpublishes the previous ones, so two people
// enrolled a month apart may have answered *different* schemas. The response
// row pins its own schema through `form_schema_id`, and the labels must come
// from THAT row's schema — never from whatever is published today.
//
// Everything below the query wrapper is pure so it can be unit-tested without
// a database.
//
// ── Why the participant row is part of the join (KAN-58) ─────────────────────
// Since KAN-56 the core fields (name, surname, birthdate, DNI, country, phone,
// email) are ordinary schema entries with a reserved `core.` id — so the
// schema DECLARES them — but their values never travel in `responses_json`:
// they arrive as their own keys in the enrolment body and land in typed
// `participants` columns, because `enroll_participant`'s age guards and the
// per-category age filter read those columns. `prepareFormSubmission` filters
// them out of the validated bag on purpose (validating them against
// `responses` rejected every inscription for an empty required field).
//
// The consequence for this module: resolving a core entry against
// `responses[field.id]` can only ever yield an empty cell, and the organizer's
// viewer showed name, surname and birthdate blank. Core entries are therefore
// read from the participant's own columns, and only the organization's own
// questions come from `responses_json`.

import type {
  FormField,
  FormFieldOption,
  FormFieldType,
  FormFileReference,
  FormResponses,
  FormResponseValue,
} from '../../shared/inscription-form'
import { CORE_FIELD_DEFINITIONS, coreFieldColumn } from '../../shared/inscription-form-core'

// ─────────────────────────────────────────────────────────────────────────────
// Shapes
// ─────────────────────────────────────────────────────────────────────────────

/** One answered field, already translated for display. */
export interface ResolvedFormField {
  id: string
  label: string
  type: FormFieldType
  value: FormResponseValue
  displayValue: string
}

/** One participant's answers, plus which schema version produced them. */
export interface ParticipantFormResponses {
  participantId: string
  formSchemaId: string | null
  schemaVersion: number | null
  submittedAt: string | null
  fields: ResolvedFormField[]
}

/** Raw `participant_form_responses` row, as Postgres returns it. */
export interface FormResponseRow {
  participant_id: string
  form_schema_id: string
  responses_json: unknown
  created_at: string
}

/** Raw `inscription_form_schemas` row, trimmed to what the mapping needs. */
export interface FormSchemaRow {
  id: string
  version: number
  schema_json: unknown
}

/**
 * A `participants` row narrowed to the columns the core schema entries read.
 *
 * Every column is optional so a caller that only holds ids still type-checks:
 * a missing column simply leaves that core entry empty, which is the
 * pre-KAN-58 behaviour rather than a crash.
 */
export interface ParticipantCoreRow {
  id: string
  first_name?: string | null
  last_name?: string | null
  birthdate?: string | null
  dni?: string | null
  country?: string | null
  phone?: string | null
  email?: string | null
}

/**
 * The select list for the participant query, derived from the core catalogue
 * so a new core field cannot be added in `shared/` and forgotten here.
 */
export const PARTICIPANT_CORE_COLUMNS: string = [
  'id',
  ...CORE_FIELD_DEFINITIONS.map(d => d.column),
].join(', ')

/**
 * A participant to resolve. A bare id is accepted — it just means no core
 * values are available — so callers that genuinely have nothing else (a
 * one-off lookup, a test) do not have to fabricate a row.
 */
export type ParticipantRef = string | ParticipantCoreRow

function refId(ref: ParticipantRef): string {
  return typeof ref === 'string' ? ref : ref.id
}

function refRow(ref: ParticipantRef): ParticipantCoreRow | undefined {
  return typeof ref === 'string' ? undefined : ref
}

/** Narrow an untyped row from supabase-js into `ParticipantCoreRow`. */
export function toParticipantCoreRow(row: Record<string, unknown>): ParticipantCoreRow {
  const out: ParticipantCoreRow = { id: String(row.id) }
  for (const definition of CORE_FIELD_DEFINITIONS) {
    const raw = row[definition.column]
    if (raw === undefined || raw === null) continue
    ;(out as Record<string, unknown>)[definition.column] =
      typeof raw === 'string' ? raw : String(raw)
  }
  return out
}

// ─────────────────────────────────────────────────────────────────────────────
// Parsing
// ─────────────────────────────────────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * `schema_json` is JSONB, so supabase-js normally hands back a parsed array.
 * Some drivers and some hand-inserted rows hand back the raw text instead, and
 * a malformed row must degrade to "no labels" rather than throw a 500 across
 * the whole contest.
 */
export function parseSchemaFields(schemaJson: unknown): FormField[] {
  let raw: unknown = schemaJson
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw)
    } catch {
      return []
    }
  }
  if (!Array.isArray(raw)) return []
  return raw.filter(isRecord).filter(f => typeof f.id === 'string') as unknown as FormField[]
}

/** Same defensive treatment for `responses_json`. */
export function parseResponses(responsesJson: unknown): FormResponses {
  let raw: unknown = responsesJson
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw)
    } catch {
      return {}
    }
  }
  if (!isRecord(raw)) return {}
  return raw as FormResponses
}

// ─────────────────────────────────────────────────────────────────────────────
// Display translation
// ─────────────────────────────────────────────────────────────────────────────

function isFileReference(value: unknown): value is FormFileReference {
  return isRecord(value) && typeof value.path === 'string' && typeof value.name === 'string'
}

function optionsOf(field: FormField): FormFieldOption[] {
  const candidate = (field as { options?: unknown }).options
  if (!Array.isArray(candidate)) return []
  return candidate.filter(
    (o): o is FormFieldOption => isRecord(o) && typeof o.value === 'string' && typeof o.label === 'string',
  )
}

/** Translate a single stored option value into its label, or echo it back. */
function labelForOption(options: FormFieldOption[], value: unknown): string {
  const asText = String(value)
  const match = options.find(o => o.value === asText)
  return match ? match.label : asText
}

/**
 * Human-readable rendering of a stored value.
 *
 * The UI consumer (table, detail panel, CSV export) must not have to
 * reimplement this — that was the whole point of KAN-58.
 */
export function toDisplayValue(field: FormField, value: FormResponseValue | undefined): string {
  if (value === undefined || value === null) return ''

  switch (field.type) {
    case 'select':
    case 'radio':
      return labelForOption(optionsOf(field), value)

    case 'checkbox-group': {
      const options = optionsOf(field)
      if (!Array.isArray(value)) return labelForOption(options, value)
      return value.map(v => labelForOption(options, v)).join(', ')
    }

    case 'checkbox': {
      const checkbox = field as { checkedLabel?: string; uncheckedLabel?: string }
      if (value === true) return checkbox.checkedLabel ?? 'Sí'
      if (value === false) return checkbox.uncheckedLabel ?? 'No'
      return String(value)
    }

    case 'file': {
      if (!Array.isArray(value)) return ''
      return value.filter(isFileReference).map(f => f.name).join(', ')
    }

    default:
      if (Array.isArray(value)) return value.map(v => String(v)).join(', ')
      if (value === '') return ''
      return String(value)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Resolution
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The value of a core schema entry, read from the participant's own column.
 *
 * Returns `undefined` for anything that is not a core entry, which is how the
 * caller tells "not a core field" from "core field with an empty column".
 * A core field whose column is empty falls back to `responses[field.id]`: it
 * should never be populated, but a row written by an older client would
 * otherwise be silently dropped, and losing a participant's answer is the one
 * outcome this module exists to prevent.
 */
function coreColumnValue(
  participant: ParticipantCoreRow | undefined,
  field: FormField,
): FormResponseValue | undefined {
  if (field.isCore !== true && coreFieldColumn(field.id) === null) return undefined
  const column = coreFieldColumn(field.id)
  // `isCore` on the wire is advisory; only an id in the catalogue names a
  // column. An unknown id flagged `isCore` is treated as an ordinary answer.
  if (!column) return undefined
  if (!participant) return undefined

  const raw = (participant as Record<string, unknown>)[column]
  if (raw === undefined || raw === null) return null
  if (typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean') return raw
  return String(raw)
}

/**
 * Map a response payload onto the fields of the schema it was answered against.
 *
 * Every schema field is returned, in `order`, even when unanswered — an empty
 * cell is information for the organizer. Keys present in the response but
 * absent from the schema (a field deleted from a later draft, or data written
 * by an older client) are appended rather than dropped, labelled by their id,
 * because silently losing a participant's answer is worse than an ugly label.
 *
 * `participant` carries the typed `participants` columns that back the core
 * entries (KAN-56/58). Omit it and core entries resolve empty, exactly as they
 * did before — no caller breaks, it just sees less.
 */
export function resolveResponses(
  fields: FormField[],
  responses: FormResponses,
  participant?: ParticipantCoreRow,
): ResolvedFormField[] {
  const ordered = [...fields].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  const known = new Set<string>()

  const resolved: ResolvedFormField[] = ordered.map((field) => {
    known.add(field.id)
    const fromColumn = coreColumnValue(participant, field)
    // `??` and not `||`: an empty column falls through to the response bag,
    // but a legitimately falsy answer (`false`, `0`) is kept.
    const value = (fromColumn ?? responses[field.id] ?? null) as FormResponseValue
    return {
      id: field.id,
      label: field.label ?? field.id,
      type: field.type,
      value,
      displayValue: toDisplayValue(field, value),
    }
  })

  for (const [id, value] of Object.entries(responses)) {
    if (known.has(id)) continue
    resolved.push({
      id,
      label: id,
      type: 'text',
      value: value as FormResponseValue,
      displayValue: Array.isArray(value)
        ? value.map(v => (isFileReference(v) ? v.name : String(v))).join(', ')
        : value === null || value === undefined
          ? ''
          : String(value),
    })
  }

  return resolved
}

/**
 * Join participants, response rows and schema rows in memory.
 *
 * Constant number of database round-trips regardless of participant count:
 * the caller fetches all three sets up front and this does the rest.
 * Participants with no response row keep their place in the result with an
 * empty `fields` array — they must not disappear from the organizer's table.
 */
export function buildParticipantResponses(
  participants: ParticipantRef[],
  responseRows: FormResponseRow[],
  schemaRows: FormSchemaRow[],
): ParticipantFormResponses[] {
  const schemasById = new Map<string, { version: number; fields: FormField[] }>()
  for (const row of schemaRows) {
    schemasById.set(row.id, { version: row.version, fields: parseSchemaFields(row.schema_json) })
  }

  // A participant can in principle hold rows for several schemas (the table is
  // UNIQUE on participant_id + form_schema_id, not on participant_id alone).
  // Keep the most recent one: that is the answer set the organizer means.
  const latestByParticipant = new Map<string, FormResponseRow>()
  for (const row of responseRows) {
    const current = latestByParticipant.get(row.participant_id)
    if (!current || row.created_at > current.created_at) {
      latestByParticipant.set(row.participant_id, row)
    }
  }

  return participants.map((ref) => {
    const participantId = refId(ref)
    const row = latestByParticipant.get(participantId)
    if (!row) {
      // Enrolled before the contest had a form, or a contest with none at all.
      // An empty list, never a missing entry: the organizer's table is driven
      // by this result and a participant must not vanish from it (KAN-58).
      return {
        participantId,
        formSchemaId: null,
        schemaVersion: null,
        submittedAt: null,
        fields: [],
      }
    }

    const schema = schemasById.get(row.form_schema_id)
    return {
      participantId,
      formSchemaId: row.form_schema_id,
      schemaVersion: schema?.version ?? null,
      submittedAt: row.created_at,
      fields: resolveResponses(
        schema?.fields ?? [],
        parseResponses(row.responses_json),
        refRow(ref),
      ),
    }
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Query wrapper
// ─────────────────────────────────────────────────────────────────────────────

interface QueryResult<T> {
  data: T[] | null
  error: { message: string } | null
}

/**
 * The slice of the Supabase client this module uses. Declared structurally so
 * the loader can be exercised with a stub instead of a live database, and so
 * no `any` leaks in from supabase-js' generics.
 */
export interface FormResponsesClient {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string): PromiseLike<QueryResult<Record<string, unknown>>>
      in(column: string, values: string[]): PromiseLike<QueryResult<Record<string, unknown>>>
    }
  }
}

export class FormResponsesQueryError extends Error {}

async function runQuery(promise: PromiseLike<QueryResult<Record<string, unknown>>>, what: string) {
  const { data, error } = await promise
  if (error) throw new FormResponsesQueryError(`${what}: ${error.message}`)
  return data ?? []
}

/**
 * Two queries, whatever the participant count: their response rows, and the
 * distinct schemas those rows point at. The participants themselves are the
 * caller's single third query — `loadContestParticipants` for the contest-wide
 * endpoint, the per-participant lookup the detail endpoint already runs — so
 * the whole viewer is three round-trips for 1 participant and three for 500.
 *
 * The core values ride along on `participants`, which is why this takes rows
 * and not ids: fetching them here would add a fourth query for a contest whose
 * participants the caller has already read.
 */
export async function loadFormResponsesForParticipants(
  client: FormResponsesClient,
  participants: ParticipantRef[],
): Promise<ParticipantFormResponses[]> {
  if (participants.length === 0) return []

  const participantIds = participants.map(refId)

  const responseRows = (await runQuery(
    client
      .from('participant_form_responses')
      .select('participant_id, form_schema_id, responses_json, created_at')
      .in('participant_id', participantIds),
    'form_responses',
  )) as unknown as FormResponseRow[]

  const schemaIds = [...new Set(responseRows.map(r => r.form_schema_id))]
  const schemaRows = schemaIds.length
    ? ((await runQuery(
        client
          .from('inscription_form_schemas')
          .select('id, version, schema_json')
          .in('id', schemaIds),
        'form_schemas',
      )) as unknown as FormSchemaRow[])
    : []

  return buildParticipantResponses(participants, responseRows, schemaRows)
}

/**
 * Participants of a contest with the columns that back the core schema
 * entries. One query, whatever the contest size — this is the third and last
 * round-trip of the contest-wide endpoint.
 */
export async function loadContestParticipants(
  client: FormResponsesClient,
  contestId: string,
): Promise<ParticipantCoreRow[]> {
  const rows = await runQuery(
    client.from('participants').select(PARTICIPANT_CORE_COLUMNS).eq('contest_id', contestId),
    'participants',
  )
  return rows.map(toParticipantCoreRow)
}
