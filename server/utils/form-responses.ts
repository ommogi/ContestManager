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

import type {
  FormField,
  FormFieldOption,
  FormFieldType,
  FormFileReference,
  FormResponses,
  FormResponseValue,
} from '../../shared/inscription-form'

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
 * Map a response payload onto the fields of the schema it was answered against.
 *
 * Every schema field is returned, in `order`, even when unanswered — an empty
 * cell is information for the organizer. Keys present in the response but
 * absent from the schema (a field deleted from a later draft, or data written
 * by an older client) are appended rather than dropped, labelled by their id,
 * because silently losing a participant's answer is worse than an ugly label.
 */
export function resolveResponses(fields: FormField[], responses: FormResponses): ResolvedFormField[] {
  const ordered = [...fields].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  const known = new Set<string>()

  const resolved: ResolvedFormField[] = ordered.map((field) => {
    known.add(field.id)
    const value = (responses[field.id] ?? null) as FormResponseValue
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
  participantIds: string[],
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

  return participantIds.map((participantId) => {
    const row = latestByParticipant.get(participantId)
    if (!row) {
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
      fields: resolveResponses(schema?.fields ?? [], parseResponses(row.responses_json)),
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
 * Three queries, always: participants of the contest, their response rows, and
 * the distinct schemas those rows point at. No per-participant round-trip.
 */
export async function loadFormResponsesForParticipants(
  client: FormResponsesClient,
  participantIds: string[],
): Promise<ParticipantFormResponses[]> {
  if (participantIds.length === 0) return []

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

  return buildParticipantResponses(participantIds, responseRows, schemaRows)
}

/** Participant ids of a contest, ordered, for the contest-wide endpoint. */
export async function loadContestParticipantIds(
  client: FormResponsesClient,
  contestId: string,
): Promise<string[]> {
  const rows = await runQuery(
    client.from('participants').select('id').eq('contest_id', contestId),
    'participants',
  )
  return rows.map(r => String(r.id))
}
