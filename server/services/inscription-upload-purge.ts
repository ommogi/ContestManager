// server/services/inscription-upload-purge.ts
// Delete the Storage objects that a cascading database delete is about to
// orphan.
//
// ── Why this exists ─────────────────────────────────────────────────────────
// Migration 0054 calls `inscription_uploads` "what lets an abandoned checkout be
// swept and a deleted participant's objects be purged". For a deleted
// PARTICIPANT that holds: the FK is `ON DELETE SET NULL`, so the ledger row
// survives and a BEFORE DELETE trigger stamps `purge_after` on it.
//
// For a deleted CONTEST, and for a deleted USER, it does not:
//
//   contest_id UUID NOT NULL REFERENCES contests(id)   ON DELETE CASCADE
//   user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
//
// The cascade takes the ledger rows with it and the objects stay in the bucket
// with nothing pointing at them. That is not a purge arriving late — no purge,
// however well scheduled, could ever find them again. So the paths have to be
// read before the delete and the objects removed after it.
//
// Relative import on purpose, matching ./stripe-webhook.ts: vitest does not
// resolve Nitro's `~~/` alias.
import { createClient } from '@supabase/supabase-js'
import { INSCRIPTION_UPLOADS_BUCKET } from '../utils/inscription-uploads'

export type SupabaseAdmin = ReturnType<typeof createClient>

/**
 * Rows read per round-trip when collecting paths.
 *
 * PostgREST caps an unbounded `select` at 1000 rows, and a contest with many
 * attachments would quietly stop there — leaking exactly the objects this
 * module exists to remove. Paging is not an optimisation here, it is the
 * difference between correct and silently partial.
 */
export const PATH_PAGE_SIZE = 500

/**
 * Objects removed per Storage call. Same figure as `PURGE_BATCH_SIZE` in
 * `server/api/maintenance/purge-inscription-uploads.post.ts`, for the same
 * reason: keep each request bounded.
 */
export const REMOVE_BATCH_SIZE = 200

export interface PurgeScope {
  /** Contests whose uploads are about to cascade away. */
  contestIds?: readonly string[]
  /** A user whose own uploads cascade with their auth row, in any contest. */
  userId?: string | null
}

export interface RemovalOutcome {
  removed: number
  /** Batches Storage refused, with its message. The caller decides what to do. */
  failures: Array<{ paths: string[]; message: string }>
}

/** Split into fixed-size chunks. Exported so the batching itself is testable. */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

async function collectBy(
  client: SupabaseAdmin,
  apply: (q: any) => any,
): Promise<string[]> {
  const paths: string[] = []

  for (let from = 0; ; from += PATH_PAGE_SIZE) {
    const { data, error } = await apply(
      client.from('inscription_uploads').select('path'),
    ).range(from, from + PATH_PAGE_SIZE - 1)

    // supabase-js resolves with `{ data, error }` and does not throw. Treating a
    // failed read as "nothing to delete" would leak the objects silently, so it
    // is raised and the caller logs it against the delete it belongs to.
    if (error) throw new Error(`inscription_uploads.select: ${error.message}`)

    const rows = (data as { path: string }[] | null) ?? []
    for (const row of rows) paths.push(row.path)

    if (rows.length < PATH_PAGE_SIZE) return paths
  }
}

/**
 * Every object key that the pending delete would make unreachable.
 *
 * The two scopes overlap by design — a user's own upload to their own contest
 * matches both — so the result is deduplicated. Asking Storage to remove the
 * same key twice is harmless, but a doubled count would misreport what happened.
 */
export async function collectUploadPathsToPurge(
  client: SupabaseAdmin,
  scope: PurgeScope,
): Promise<string[]> {
  const found = new Set<string>()

  const contestIds = scope.contestIds ?? []
  if (contestIds.length > 0) {
    for (const path of await collectBy(client, q => q.in('contest_id', contestIds))) {
      found.add(path)
    }
  }

  if (scope.userId) {
    for (const path of await collectBy(client, q => q.eq('user_id', scope.userId))) {
      found.add(path)
    }
  }

  return [...found]
}

/**
 * Remove the objects, in batches, without giving up on the first failure.
 *
 * Never throws: by the time this runs the database delete has already happened,
 * so there is nothing to roll back and the caller's answer must describe the
 * delete, not the cleanup. A failed batch is returned so it can be logged with
 * enough detail to be removed by hand.
 */
export async function removeUploadObjects(
  client: SupabaseAdmin,
  paths: readonly string[],
): Promise<RemovalOutcome> {
  const outcome: RemovalOutcome = { removed: 0, failures: [] }
  if (paths.length === 0) return outcome

  for (const batch of chunk(paths, REMOVE_BATCH_SIZE)) {
    const { error } = await client.storage.from(INSCRIPTION_UPLOADS_BUCKET).remove(batch)
    if (error) outcome.failures.push({ paths: batch, message: error.message })
    else outcome.removed += batch.length
  }

  return outcome
}
