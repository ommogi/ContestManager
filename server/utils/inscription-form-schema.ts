// server/utils/inscription-form-schema.ts
//
// Reads the published inscription form schema for a public invitation token
// (KAN-44).
//
// Kept out of the route handler so it can be unit-tested without Nitro's
// auto-imports and `~~/` aliases, which vitest does not resolve.

import type { FormField, PublishedFormSchema } from '../../shared/inscription-form'
import { resolvePublishedFields } from '../../shared/inscription-form-core'

/**
 * Minimal structural view of the supabase client used here: one `rpc` call
 * that resolves with `{ data, error }`. supabase-js never rejects on a
 * database error — it resolves with `error` populated — so nothing here is
 * wrapped in try/catch, and the test stubs resolve the same way.
 */
export interface RpcResult<T> {
  data: T | null
  error: { message: string } | null
}

export interface FormSchemaRpcClient {
  rpc(fn: string, params: Record<string, unknown>): PromiseLike<RpcResult<unknown>>
}

/** Row shape of `get_contest_by_token`, narrowed to what this module reads. */
interface TokenContestRow {
  id: string
}

/**
 * Row shape of `get_inscription_form_schema`.
 *
 * The deployed function returns
 * `TABLE(id uuid, version int, published_at timestamptz, schema_json jsonb)`
 * and filters drafts internally, so `data` is an array of at most one row: the
 * highest published version.
 *
 * Migration 0033 declares exactly that signature since KAN-62 repaired it, and
 * the repaired definition is the one deployed.
 */
interface FormSchemaRow {
  id: string
  version: number | null
  published_at: string | null
  schema_json: unknown
}

export class FormSchemaLookupError extends Error {
  constructor(
    readonly reason: 'contest_not_found' | 'contest_lookup_failed' | 'schema_lookup_failed',
    message: string,
  ) {
    super(message)
    this.name = 'FormSchemaLookupError'
  }
}

/**
 * A contest with no published form. A normal state, not an error.
 *
 * `fields` carries the default core list rather than an empty array: since
 * KAN-56 the core fields are schema entries, so "no published schema" and
 * "published schema with no custom questions" must describe the same form.
 * Callers that only want the organizer's own questions filter on `isCore`.
 */
export function emptyPublishedFormSchema(): PublishedFormSchema {
  return { id: null, version: null, publishedAt: null, fields: resolvePublishedFields(null) }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * `schema_json` holds a bare array of fields. Anything that is not
 * field-shaped is dropped rather than handed to the renderer, which would
 * throw on a missing `type`.
 */
function looksLikeField(value: unknown): value is FormField {
  if (!isRecord(value)) return false
  return typeof value.id === 'string'
    && typeof value.type === 'string'
    && typeof value.label === 'string'
}

export function normalizeFields(raw: unknown): FormField[] {
  if (Array.isArray(raw)) return raw.filter(looksLikeField)
  // Tolerated legacy wrapping: `{ fields: [...] }`.
  if (isRecord(raw) && Array.isArray(raw.fields)) return raw.fields.filter(looksLikeField)
  return []
}

/**
 * Recognises a schema row specifically, rather than "the first object found".
 *
 * This matters because a `FormField` also has a string `id`: if the database
 * ever answered with the pre-KAN-62 bare `schema_json` array, a looser check
 * would read field[0] as a schema row and return a form with the first
 * field's id, a null version and zero fields — wrong, and silently so. A row
 * is only a row if it carries `schema_json`.
 */
function asSchemaRow(data: unknown): FormSchemaRow | null {
  const candidate = Array.isArray(data) ? data[0] : data
  if (!isRecord(candidate)) return null
  if (!('schema_json' in candidate)) return null
  return candidate as unknown as FormSchemaRow
}

function asContestRow(data: unknown): TokenContestRow | null {
  const candidate = Array.isArray(data) ? data[0] : data
  if (!isRecord(candidate)) return null
  return typeof candidate.id === 'string' ? { id: candidate.id } : null
}

/**
 * Resolves an invitation token to the contest's published form schema.
 *
 * Uses the same token path as `server/api/public/inscriptions/[token].get.ts`
 * (`get_contest_by_token`), so a revoked or rotated token stops working here
 * at the same moment it stops working there. The token is never compared
 * against `contests.registration_token` directly.
 *
 * Contest state is deliberately not consulted: `INSCRIPTION_STATUS_CONFIG`
 * sets `allowPreview: true` for all four statuses, so a closed or finished
 * contest still serves its schema for preview. Whether the form can be
 * *submitted* is decided by the enroll/checkout handlers, not here.
 */
export async function loadPublishedFormSchema(
  client: FormSchemaRpcClient,
  token: string,
): Promise<PublishedFormSchema> {
  return (await loadPublishedFormSchemaForContest(client, token)).schema
}

/**
 * Same lookup, but also handing back the contest the token resolved to.
 *
 * The contest id is needed by anything that has to address contest-scoped rows
 * for this enrolment — `confirm_inscription_uploads` takes it as a parameter
 * (KAN-49) — and re-resolving the token a second time would be both a wasted
 * round-trip and a chance for the two lookups to disagree.
 *
 * Deliberately NOT folded into `PublishedFormSchema`: that type is the wire
 * contract in `shared/` that the public page consumes, and the contest id is a
 * server-side detail the browser has no business receiving.
 */
export async function loadPublishedFormSchemaForContest(
  client: FormSchemaRpcClient,
  token: string,
): Promise<{ contestId: string; schema: PublishedFormSchema }> {
  const contestRes = await client.rpc('get_contest_by_token', { p_token: token })
  if (contestRes.error) {
    throw new FormSchemaLookupError('contest_lookup_failed', contestRes.error.message)
  }

  const contest = asContestRow(contestRes.data)
  if (!contest) {
    throw new FormSchemaLookupError('contest_not_found', 'Contest not found')
  }

  const schemaRes = await client.rpc('get_inscription_form_schema', { p_contest_id: contest.id })
  if (schemaRes.error) {
    throw new FormSchemaLookupError('schema_lookup_failed', schemaRes.error.message)
  }

  const row = asSchemaRow(schemaRes.data)
  if (!row || typeof row.id !== 'string') {
    return { contestId: contest.id, schema: emptyPublishedFormSchema() }
  }

  return {
    contestId: contest.id,
    schema: {
      id: row.id,
      version: typeof row.version === 'number' ? row.version : null,
      publishedAt: row.published_at ?? null,
      // `resolvePublishedFields` restores any missing core entry and preserves
      // the order the schema was published with (KAN-56). Applied here rather
      // than in the route handler so every consumer — the public page and the
      // enrolment path that validates `form_schema_id` — sees one identical
      // field list.
      fields: resolvePublishedFields(normalizeFields(row.schema_json)),
    },
  }
}
