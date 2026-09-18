// server/api/public/inscriptions/[token]/upload.delete.ts
// Let a participant take back a file they uploaded but have not submitted
// (KAN-67).
//
// ── The bug this closes ─────────────────────────────────────────────────────
// Removing a file used to be a client-side edit and nothing more: the ledger
// row stayed, and `upload.post.ts` counts every row with `purge_after IS NULL`
// against the field's `maxFiles`. With the builder's default of one file that
// made REPLACING a file impossible — the UI even said "quita el actual para
// subir otro", instructions that could not work.
//
// ── Why the object goes now instead of being marked ─────────────────────────
// `purge_after` exists for work nobody is waiting on: a deleted participant, an
// abandoned checkout. This is neither. It is a signed-in person acting on their
// own unconfirmed file, and nothing about it needs deferring — waiting up to 15
// minutes for the scheduled purge (migration 0062) would also keep the object
// counted against the contest's storage quota in the meantime.

import { defineEventHandler, createError, getRouterParam, readBody } from 'h3'
import { requireAuth, serverSupabaseAdmin } from '~~/server/utils/supabase'
import { INSCRIPTION_UPLOADS_BUCKET } from '~~/server/utils/inscription-uploads'

interface ContestByTokenRow {
  id: string
  registration_open?: boolean
}

interface DeleteBody {
  /** The object key returned by the upload, as stored in the reference. */
  path?: unknown
}

export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token')
  if (!token) throw createError({ statusCode: 400, statusMessage: 'Missing token' })

  const user = requireAuth(event)

  const body = await readBody<DeleteBody>(event).catch(() => ({} as DeleteBody))
  const path = typeof body?.path === 'string' ? body.path.trim() : ''
  if (!path) throw createError({ statusCode: 400, statusMessage: 'Missing path' })

  const client = serverSupabaseAdmin()

  const contestRes = await client.rpc('get_contest_by_token', { p_token: token })
  if (contestRes.error) {
    throw createError({ statusCode: 500, statusMessage: 'contest_lookup_failed' })
  }
  const contest = (contestRes.data as ContestByTokenRow[] | null)?.[0]
  if (!contest) throw createError({ statusCode: 404, statusMessage: 'Contest not found' })

  if (contest.registration_open === false) {
    throw createError({
      statusCode: 409,
      statusMessage: 'registration_closed',
      message: 'Las inscripciones de este concurso están cerradas.',
    })
  }

  // The ownership gate, written out rather than left to RLS because this runs
  // on the admin client: the row must belong to this user, in this contest, and
  // must still be unconfirmed. A confirmed upload is part of a completed
  // inscription and is not the participant's to drop from here.
  //
  // Someone else's path and a path that never existed answer the same 404: the
  // difference between them is not this endpoint's to reveal.
  const rowRes = await client
    .from('inscription_uploads')
    .select('id, path')
    .eq('contest_id', contest.id)
    .eq('user_id', user.id)
    .eq('path', path)
    .is('confirmed_at', null)
    .maybeSingle()

  if (rowRes.error) {
    throw createError({ statusCode: 500, statusMessage: 'upload_lookup_failed' })
  }

  const row = rowRes.data as { id: string; path: string } | null
  if (!row) throw createError({ statusCode: 404, statusMessage: 'upload_not_found' })

  // Object first, row second — the order `purge-inscription-uploads.post.ts`
  // uses, and for its reason: a row left pointing at a deleted object is
  // retryable (removing an absent object is a no-op), while a deleted row
  // pointing at a live object leaves storage nobody can reach or purge, which
  // is exactly what `upload.post.ts` guards against when the ledger insert
  // fails.
  const removeRes = await client.storage.from(INSCRIPTION_UPLOADS_BUCKET).remove([row.path])
  if (removeRes.error) {
    throw createError({
      statusCode: 500,
      statusMessage: 'upload_remove_failed',
      message: 'No se ha podido quitar el archivo. Inténtalo de nuevo.',
    })
  }

  const deleteRes = await client.from('inscription_uploads').delete().eq('id', row.id)
  if (deleteRes.error) {
    // The object is gone but the row is not, so the slot is still taken. Saying
    // so is honest, and retrying the same call clears it.
    throw createError({
      statusCode: 500,
      statusMessage: 'upload_ledger_delete_failed',
      message: 'No se ha podido quitar el archivo. Inténtalo de nuevo.',
    })
  }

  return { deleted: true as const, path: row.path }
})
