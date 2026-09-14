// server/utils/inscription-form-responses.ts
//
// Persistence for inscription form answers (KAN-49).
//
// Everything that writes to `participant_form_responses` goes through here, on
// both inscription paths:
//
//   free  → enroll.post.ts     validates, then writes straight after the RPC
//                              hands back the participant id.
//   paid  → checkout.post.ts   validates, parks the answers in
//                              `pending_form_responses`, and puts only the
//                              draft's id in the Checkout Session metadata.
//           stripe-webhook.ts  resolves that id once the payment is confirmed
//                              and copies the answers onto the participant.
//
// Why the detour through a draft row: a Checkout Session's `metadata` accepts
// 50 keys, 40-character keys and 500-character values, and the enrollment flow
// already spends 13 keys. A single `textarea` answer exceeds 500 characters on
// its own, so Stripe would refuse to create the session. Chunking the JSON
// across keys only moves the cliff; an opaque id removes it.
//
// Deliberately free of `~~/` aliases and h3 auto-imports so vitest can import
// it directly — same constraint as inscription-form-schema.ts.

import { createError } from 'h3'
import { randomUUID } from 'node:crypto'
import type { createClient } from '@supabase/supabase-js'
import type {
  FormFileReference,
  FormResponseValue,
  FormResponses,
} from '../../shared/inscription-form'
import {
  FormSchemaLookupError,
  loadPublishedFormSchemaForContest,
  type FormSchemaRpcClient,
} from './inscription-form-schema'
import { assertValidFormResponses } from './validate-form-responses'
import { parseUploadPath } from './inscription-uploads'

/** Same shape `serverSupabaseAdmin()` returns; also what the webhook passes. */
export type FormResponsesAdmin = ReturnType<typeof createClient>

/**
 * Ceiling on the serialized answer payload, before per-field rules run.
 *
 * The schema's own `maxLength` is the real limit for a well-formed form, but a
 * request that never touches the UI can post megabytes against a schema that
 * declares no limits at all. 256 KB is far above any legitimate form (the
 * acceptance case is a single 5.000-character textarea) and far below anything
 * that would strain the JSONB column or the webhook's memory.
 */
export const MAX_RESPONSES_BYTES = 256 * 1024

/** Validated answers, ready to store, paired with the schema they belong to. */
export interface FormSubmission {
  /**
   * The contest the token resolved to. Carried on the submission because
   * `confirm_inscription_uploads` is scoped by contest, and re-resolving the
   * token at the point of use would be a second round-trip that could disagree
   * with the first.
   */
  contestId: string
  formSchemaId: string
  responses: FormResponses
}

/** The two optional keys the public inscription body may carry. */
export interface RawFormSubmissionBody {
  form_schema_id?: string | null | undefined
  responses?: Record<string, unknown> | null | undefined
}

const SCHEMA_CHANGED_MESSAGE =
  'El formulario de inscripción ha cambiado mientras lo rellenabas. Recarga la página y vuelve a enviar tus respuestas.'

// ─────────────────────────────────────────────────────────────────────────────
// Narrowing
// ─────────────────────────────────────────────────────────────────────────────

function isFileReference(value: unknown): value is FormFileReference {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const candidate = value as Record<string, unknown>
  return typeof candidate.path === 'string' && typeof candidate.name === 'string'
}

/**
 * Narrows an arbitrary JSON value to `FormResponseValue`.
 *
 * The zod schema on the request body deliberately stops at
 * `Record<string, unknown>`: the legal shape of a value depends on the field
 * type, which is only known once the published schema has been loaded. This
 * drops anything that cannot be a response value at all, so
 * `assertValidFormResponses` receives a `FormResponses` without a cast and
 * the per-field rules decide the rest.
 */
function toResponseValue(value: unknown): FormResponseValue | undefined {
  if (value === null) return null
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value
  }
  if (Array.isArray(value)) {
    if (value.every((item): item is string => typeof item === 'string')) return value
    if (value.every(isFileReference)) return value
    return undefined
  }
  return undefined
}

/** Drops keys whose value could not be a response at all. */
export function coerceFormResponses(raw: Record<string, unknown>): FormResponses {
  const out: FormResponses = {}
  for (const [key, value] of Object.entries(raw)) {
    const narrowed = toResponseValue(value)
    if (narrowed !== undefined) out[key] = narrowed
  }
  return out
}

function assertResponsesWithinLimit(responses: FormResponses): void {
  const size = Buffer.byteLength(JSON.stringify(responses), 'utf8')
  if (size > MAX_RESPONSES_BYTES) {
    throw createError({
      statusCode: 413,
      statusMessage: 'Las respuestas del formulario son demasiado grandes.',
    })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolves the contest's published form and validates the submitted answers.
 *
 * Returns `null` when the contest has no published form — the pre-form flow,
 * byte for byte. Otherwise returns exactly what should be stored.
 *
 * Three things are enforced here, and only here:
 *
 *  1. The schema is re-read from the database on every request. The body's
 *     `form_schema_id` is never trusted as a lookup key, only compared against
 *     what is actually published.
 *  2. If the organizer published a new version while the participant was
 *     filling the form, the ids differ and the request is refused in Spanish
 *     rather than stored against a schema the answers were not written for.
 *  3. Validation runs even when the body carries no `responses` at all, so a
 *     handcrafted request cannot skip a required field by simply omitting the
 *     key — `assertValidFormResponses` sees `{}` and raises `required`.
 */
export async function prepareFormSubmission(
  client: FormSchemaRpcClient,
  token: string,
  body: RawFormSubmissionBody,
): Promise<FormSubmission | null> {
  let contestId: string
  let published
  try {
    const resolved = await loadPublishedFormSchemaForContest(client, token)
    contestId = resolved.contestId
    published = resolved.schema
  } catch (err) {
    if (err instanceof FormSchemaLookupError && err.reason === 'contest_not_found') {
      throw createError({ statusCode: 404, statusMessage: 'Concurso no encontrado.' })
    }
    // Never surface the database's own message: KAN-43.
    console.error('[inscription-form] schema lookup failed:', (err as Error)?.message)
    throw createError({ statusCode: 500, statusMessage: 'internal_error' })
  }

  if (!published.id) {
    // Nothing published. A body that names a schema is stale or forged, and
    // storing it is impossible anyway — the FK would reject it.
    if (body.form_schema_id) {
      throw createError({ statusCode: 409, statusMessage: SCHEMA_CHANGED_MESSAGE })
    }
    return null
  }

  if (body.form_schema_id && body.form_schema_id !== published.id) {
    throw createError({ statusCode: 409, statusMessage: SCHEMA_CHANGED_MESSAGE })
  }

  const submitted = coerceFormResponses(body.responses ?? {})
  assertResponsesWithinLimit(submitted)

  // Core fields are schema entries since KAN-56, but their values never travel
  // in `responses`: they arrive as first_name/last_name/birthdate/... in the
  // enrolment body and land in `participants` columns. Validating them here
  // would reject every inscription for a required field the participant did
  // fill in, just not in this bag. `responses_json` stays the organizer's own
  // questions, which is also what keeps it a single source of truth.
  const answerable = published.fields.filter(f => !f.isCore)

  // Throws 400 with per-field errors, and returns the answers narrowed to the
  // ids the schema declares — so nothing unvalidated reaches the database.
  const responses = assertValidFormResponses(answerable, submitted)

  return { contestId, formSchemaId: published.id, responses }
}

// ─────────────────────────────────────────────────────────────────────────────
// Uploaded files (KAN-49)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Every object key referenced by a `file` answer, deduplicated.
 *
 * Read from the VALIDATED submission, never the raw body: by this point
 * `assertValidFormResponses` has already narrowed the bag to the ids the
 * schema declares, so a key invented by the client cannot smuggle a path in.
 */
export function collectUploadPaths(responses: FormResponses): string[] {
  const paths = new Set<string>()
  for (const value of Object.values(responses)) {
    if (!Array.isArray(value)) continue
    for (const item of value) {
      if (isFileReference(item) && item.path.length > 0) paths.add(item.path)
    }
  }
  return [...paths]
}

/**
 * Reject file references that do not belong to this user and this contest.
 *
 * The object key is `{contest_id}/{user_id}/{field_id}/{uuid}-{name}` and
 * `buildUploadPath` is its only writer, so the first two segments are an
 * ownership claim the server can check for free.
 *
 * Defence in depth, deliberately, not the only barrier — be clear about what
 * this does and does not add:
 *
 *  · `validateFileField` only COUNTS file references, so nothing upstream
 *    stops a crafted request from putting somebody else's object key into its
 *    own `responses_json`. This is what stops that reference being stored.
 *  · Such a key could never be read anyway: `form-file.get.ts` looks the
 *    ledger row up by `participant_id` AND `path` together, so a forged
 *    reference resolves to no row and answers 404.
 *  · Nor could it be attached: `confirm_inscription_uploads` filters on
 *    `contest_id` and `user_id`, so it can neither confirm nor purge another
 *    user's object.
 *
 * What is prevented is therefore a poisoned `responses_json` — an organizer
 * shown a file name that can never be downloaded — and the next endpoint that
 * signs by path without re-checking the ledger. Loud 400 rather than a silent
 * strip: a path that fails this check is either forged or a bug, and neither
 * should be swallowed.
 */
export function assertOwnedUploadPaths(
  paths: string[],
  owner: { contestId: string; userId: string },
): void {
  for (const path of paths) {
    const parts = parseUploadPath(path)
    if (!parts || parts.contestId !== owner.contestId || parts.ownerId !== owner.userId) {
      throw createError({
        statusCode: 400,
        statusMessage: 'invalid_file_reference',
        message: 'Uno de los archivos adjuntos no es válido. Vuelve a subirlo.',
      })
    }
  }
}

/**
 * Attach this user's pending uploads to the participant that now exists, and
 * mark everything they uploaded and did NOT reference as purgeable.
 *
 * Both halves live in `confirm_inscription_uploads` (migration 0054), which is
 * `SECURITY DEFINER` and takes the user id as a parameter precisely because
 * the paid path completes inside the Stripe webhook, where there is no
 * session. It filters on `contest_id` + `user_id` + `confirmed_at IS NULL`, so
 * it can neither confirm nor purge another user's object, and re-running it is
 * a no-op for rows it has already confirmed — which is what makes a Stripe
 * redelivery safe.
 *
 * Calling it with an EMPTY path list is meaningful and intended: it means the
 * participant attached files, then removed them all, and the second UPDATE
 * purges them instead of leaving them pending for the 24-hour TTL.
 *
 * Throws on failure. What that means is the caller's decision — see the
 * comments at the two call sites.
 */
export async function confirmInscriptionUploads(
  admin: FormResponsesAdmin,
  params: { contestId: string; userId: string; participantId: string; paths: string[] },
): Promise<number> {
  const { data, error } = await admin.rpc('confirm_inscription_uploads', {
    p_contest_id: params.contestId,
    p_user_id: params.userId,
    p_participant_id: params.participantId,
    p_paths: params.paths,
  })

  // supabase-js resolves with `{ data, error }` and never rejects, so a
  // try/catch around this call would never run. Check `error` explicitly.
  if (error) {
    throw new Error(`confirm_inscription_uploads: ${error.message}`)
  }

  return typeof data === 'number' ? data : 0
}

// ─────────────────────────────────────────────────────────────────────────────
// Writes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Writes the answers against a participant.
 *
 * `upsert` on the `UNIQUE(participant_id, form_schema_id)` pair rather than
 * `insert`, because the paid path can legitimately run twice: Stripe redelivers
 * an event whenever the endpoint did not answer 2xx, and `enroll_participant_paid`
 * is idempotent by session id, so the second delivery arrives with the same
 * participant id. An insert would raise 23505 and turn a retry into a 500 loop.
 *
 * Throws on failure. Callers decide what that means; on the paid path it must
 * propagate so Stripe retries.
 */
export async function persistParticipantFormResponses(
  admin: FormResponsesAdmin,
  participantId: string,
  submission: FormSubmission,
): Promise<void> {
  const { error } = await admin
    .from('participant_form_responses')
    .upsert(
      {
        participant_id: participantId,
        form_schema_id: submission.formSchemaId,
        responses_json: submission.responses,
      },
      { onConflict: 'participant_id,form_schema_id' },
    )

  // supabase-js resolves with `{ data, error }` and does not reject, so this
  // check is the only thing standing between a failed write and a silent loss.
  if (error) {
    throw new Error(`participant_form_responses: ${error.message}`)
  }
}

/**
 * Parks validated answers so only their id has to cross Stripe's metadata.
 *
 * The id is generated here instead of being read back from the insert: the row
 * has to be addressable before the Checkout Session exists, and asking for it
 * back would cost a round trip for a value we already hold.
 */
export async function stashPendingFormResponses(
  admin: FormResponsesAdmin,
  params: { contestId: string; userId: string | null; submission: FormSubmission },
): Promise<string> {
  const draftId = randomUUID()

  const { error } = await admin.from('pending_form_responses').insert({
    id: draftId,
    contest_id: params.contestId,
    form_schema_id: params.submission.formSchemaId,
    user_id: params.userId,
    responses_json: params.submission.responses,
  })
  if (error) {
    throw new Error(`pending_form_responses insert: ${error.message}`)
  }

  return draftId
}

/**
 * Rewrites an existing draft in place.
 *
 * Used when the checkout handler hands back an already-open Stripe session:
 * that session's metadata still points at the original draft, so the answers
 * the participant just re-submitted have to land on that row or the payment
 * would confirm with whatever they typed the first time round.
 */
export async function refreshPendingFormResponses(
  admin: FormResponsesAdmin,
  draftId: string,
  submission: FormSubmission,
): Promise<void> {
  const { error } = await admin
    .from('pending_form_responses')
    .update({
      form_schema_id: submission.formSchemaId,
      responses_json: submission.responses,
    })
    .eq('id', draftId)
    .is('consumed_at', null)

  if (error) {
    throw new Error(`pending_form_responses update: ${error.message}`)
  }
}

/**
 * Resolves a draft id back into answers.
 *
 * Returns `null` for an id that no longer resolves (pruned draft, deleted
 * schema). The caller logs it rather than failing the enrollment: the payment
 * has already been taken and the participant row already exists, so refusing
 * the event would only make Stripe retry something that cannot succeed.
 */
export async function readPendingFormResponses(
  admin: FormResponsesAdmin,
  draftId: string,
): Promise<FormSubmission | null> {
  const { data, error } = await admin
    .from('pending_form_responses')
    // `contest_id` comes from the draft row rather than from the Stripe
    // metadata: the row is what the answers — and the file paths inside them —
    // were validated against, and it cannot be edited from outside the server.
    .select('contest_id, form_schema_id, responses_json')
    .eq('id', draftId)
    .maybeSingle()

  if (error) {
    throw new Error(`pending_form_responses select: ${error.message}`)
  }
  if (!data) return null

  const row = data as { contest_id?: unknown; form_schema_id?: unknown; responses_json?: unknown }
  if (typeof row.form_schema_id !== 'string') return null
  if (typeof row.contest_id !== 'string') return null

  const raw = row.responses_json
  const responses =
    typeof raw === 'object' && raw !== null && !Array.isArray(raw)
      ? coerceFormResponses(raw as Record<string, unknown>)
      : {}

  return { contestId: row.contest_id, formSchemaId: row.form_schema_id, responses }
}

/**
 * Stamps a draft as used. Best effort: the answers are already safe on the
 * participant by the time this runs, and failing the webhook over an audit
 * column would trigger a pointless Stripe retry.
 */
export async function markPendingFormResponsesConsumed(
  admin: FormResponsesAdmin,
  draftId: string,
): Promise<void> {
  const { error } = await admin
    .from('pending_form_responses')
    .update({ consumed_at: new Date().toISOString() })
    .eq('id', draftId)

  if (error) {
    console.error('[inscription-form] could not mark draft consumed:', error.message)
  }
}
