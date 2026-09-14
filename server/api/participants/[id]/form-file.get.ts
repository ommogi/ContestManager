// server/api/participants/[id]/form-file.get.ts
// Mint a short-lived download link for one file attached to an inscription.
//
// This is the path F8's response viewer uses. The bucket is private, so there
// is no URL an organizer could construct by hand: the link is signed here,
// after the authorization check, and expires in five minutes.
//
// ── Authorization ───────────────────────────────────────────────────────────
// Two ways in, and no third: the participant themself, or an owner/member of
// the contest the participant belongs to. `requireOrgOwnerOrMember` takes the
// CONTEST id read from the participant row — not anything the caller sent — so
// an authenticated stranger passing another participant's id gets 403, and one
// passing a path belonging to a different contest gets 403 too, because the
// ledger row is looked up by participant AND path together.

import { defineEventHandler, createError, getRouterParam, getQuery } from 'h3'
import {
  requireAuth,
  requireOrgOwnerOrMember,
  serverSupabaseAdmin,
} from '~~/server/utils/supabase'
import {
  INSCRIPTION_UPLOADS_BUCKET,
  SIGNED_URL_TTL_SECONDS,
} from '~~/server/utils/inscription-uploads'

interface UploadRow {
  path: string
  file_name: string
  mime_type: string
  size_bytes: number
  contest_id: string
  user_id: string
}

export default defineEventHandler(async (event) => {
  const participantId = getRouterParam(event, 'id')
  if (!participantId) throw createError({ statusCode: 400, statusMessage: 'Missing participant ID' })

  const user = requireAuth(event)

  const query = getQuery(event)
  const path = typeof query.path === 'string' ? query.path : ''
  if (!path) throw createError({ statusCode: 400, statusMessage: 'Missing path' })

  const client = serverSupabaseAdmin()

  // Looking the row up by participant AND path at once is what stops a caller
  // authorized for participant A from reading a file belonging to participant B.
  const { data, error } = await client
    .from('inscription_uploads')
    .select('path, file_name, mime_type, size_bytes, contest_id, user_id')
    .eq('participant_id', participantId)
    .eq('path', path)
    .maybeSingle()

  // The supabase-js mocks resolve with `{ data, error }` and never throw.
  if (error) throw createError({ statusCode: 500, statusMessage: 'upload_lookup_failed' })
  if (!data) throw createError({ statusCode: 404, statusMessage: 'File not found' })

  const upload = data as UploadRow

  // The participant reads their own attachment without an organizer gate.
  if (upload.user_id !== user.id) {
    await requireOrgOwnerOrMember(event, upload.contest_id)
  }

  const signed = await client.storage
    .from(INSCRIPTION_UPLOADS_BUCKET)
    .createSignedUrl(upload.path, SIGNED_URL_TTL_SECONDS, {
      download: upload.file_name,
    })

  if (signed.error || !signed.data) {
    throw createError({ statusCode: 500, statusMessage: 'signed_url_failed' })
  }

  return {
    url: signed.data.signedUrl,
    name: upload.file_name,
    mimeType: upload.mime_type,
    size: upload.size_bytes,
    expiresIn: SIGNED_URL_TTL_SECONDS,
  }
})
