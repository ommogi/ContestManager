// server/api/maintenance/purge-inscription-uploads.post.ts
// Delete the Storage objects the database has marked for purge (KAN-59, KAN-69).
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
// ── Who calls it ────────────────────────────────────────────────────────────
// pg_cron, every 15 minutes, via `invoke_inscription_upload_purge()` from
// migration 0062 (KAN-69), with the secret read from Vault. The endpoint stays
// idempotent: running it twice is harmless, and it is still safe to trigger by
// hand. Each run leaves a row in `maintenance_runs`.

import { defineEventHandler, createError, getHeader, readBody } from 'h3'
import { serverSupabaseAdmin } from '~~/server/utils/supabase'
import { ORPHAN_UPLOAD_TTL_HOURS } from '~~/server/utils/inscription-uploads'
import { PurgeRunError, runScheduledPurge } from '~~/server/services/scheduled-upload-purge'

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

  try {
    return await runScheduledPurge(serverSupabaseAdmin(), {
      ttlHours: ORPHAN_UPLOAD_TTL_HOURS,
      skipSweep: body?.skipSweep === true,
    })
  } catch (err) {
    const code = err instanceof PurgeRunError ? err.code : 'purge_failed'
    console.error('[maintenance] purge failed', err)
    throw createError({ statusCode: 500, statusMessage: code })
  }
})
