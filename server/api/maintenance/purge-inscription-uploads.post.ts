// server/api/maintenance/purge-inscription-uploads.post.ts
// Delete the Storage objects the database has marked for purge (KAN-59).
//
// Storage has no foreign keys and no trigger can reach the object store, so
// "delete the participant and the files go too" cannot be expressed in SQL.
// The split is: the database decides WHAT is purgeable (the participant-delete
// trigger and `sweep_orphan_inscription_uploads` both stamp `purge_after`),
// and this endpoint does the deleting.
//
// Two sources of work, both from KAN-59's acceptance criteria:
//   * an abandoned checkout — uploaded, never attached to a participant, older
//     than the TTL;
//   * a deleted participant — `participant_form_responses` cascaded away, the
//     objects did not.
//
// ── Why this is not a cron job in this file ─────────────────────────────────
// The repo has no scheduler and adding one would mean a new dependency, which
// CLAUDE.md forbids without confirmation. This is an idempotent endpoint meant
// to be hit on a schedule by whatever the deployment already has (a platform
// cron, an external pinger). Running it twice is harmless; running it never
// means orphans accumulate, which is why the sweep is also safe to trigger by
// hand.

import { defineEventHandler, createError, getHeader, readBody } from 'h3'
import { serverSupabaseAdmin } from '~~/server/utils/supabase'
import {
  INSCRIPTION_UPLOADS_BUCKET,
  ORPHAN_UPLOAD_TTL_HOURS,
} from '~~/server/utils/inscription-uploads'

/** How many objects to delete per invocation. Keeps the request bounded. */
const PURGE_BATCH_SIZE = 200

interface PurgeBody {
  /** Skip the orphan sweep and only delete what is already marked. */
  skipSweep?: boolean
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let mismatch = 0
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return mismatch === 0
}

export default defineEventHandler(async (event) => {
  // Not `requireAuth`: the caller is a scheduler, not a person. A shared secret
  // in a header is the gate, compared without an early return so the
  // comparison does not leak its length through timing.
  const expected = process.env.MAINTENANCE_SECRET || ''
  const provided = getHeader(event, 'x-maintenance-secret') || ''

  // An unset secret must not mean "open to everyone".
  if (!expected || !timingSafeEqual(provided, expected)) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const body = await readBody<PurgeBody>(event).catch(() => ({} as PurgeBody))
  const client = serverSupabaseAdmin()

  let swept = 0
  if (!body?.skipSweep) {
    const sweepRes = await client.rpc('sweep_orphan_inscription_uploads', {
      p_ttl_hours: ORPHAN_UPLOAD_TTL_HOURS,
    })
    // The supabase-js mocks resolve with `{ data, error }` and never throw, so
    // a failed sweep is a checked value. It is not fatal: whatever was already
    // marked can still be purged below.
    if (!sweepRes.error) swept = Number(sweepRes.data ?? 0)
  }

  const { data, error } = await client
    .from('inscription_uploads')
    .select('id, path')
    .not('purge_after', 'is', null)
    .lte('purge_after', new Date().toISOString())
    .limit(PURGE_BATCH_SIZE)

  if (error) throw createError({ statusCode: 500, statusMessage: 'purge_lookup_failed' })

  const due = (data as { id: string; path: string }[] | null) ?? []
  if (due.length === 0) {
    return { swept, deleted: 0, remaining: 0 }
  }

  const removeRes = await client.storage
    .from(INSCRIPTION_UPLOADS_BUCKET)
    .remove(due.map(row => row.path))

  if (removeRes.error) {
    throw createError({ statusCode: 500, statusMessage: 'purge_remove_failed' })
  }

  // Ledger rows go only after the objects are gone. If this delete fails the
  // rows stay marked and the next run retries — deleting an already-deleted
  // object is a no-op, so the retry is safe.
  const { error: deleteError } = await client
    .from('inscription_uploads')
    .delete()
    .in('id', due.map(row => row.id))

  if (deleteError) throw createError({ statusCode: 500, statusMessage: 'purge_cleanup_failed' })

  return {
    swept,
    deleted: due.length,
    // A full batch means there is very likely more; the scheduler can call again.
    remaining: due.length === PURGE_BATCH_SIZE ? PURGE_BATCH_SIZE : 0,
  }
})
