// server/api/public/inscriptions/[token]/uploads.get.ts
// The files this participant has already uploaded for this contest and has not
// yet submitted (KAN-67).
//
// Until this existed, a `FormFileReference` only lived in the page's memory:
// reloading lost it, while the ledger row stayed and kept counting against
// `maxFiles`. The field went dead with nothing on screen to explain why.
//
// Migration 0054 anticipated this — `inscription_uploads_owner_field_idx` is
// commented "resuming a half-filled form, and the per-field maxFiles count" —
// but only the count half was ever used.
//
// ── What is returned ────────────────────────────────────────────────────────
// Only the caller's own pending rows: `confirmed_at IS NULL` (never submitted)
// and `purge_after IS NULL` (not already on its way out). Confirmed uploads
// belong to a finished inscription and are the organizer's to show, not this
// endpoint's. The shape is the same `FormFileReference` the upload returns, so
// the page cannot tell a restored file from a fresh one.

import { defineEventHandler, createError, getRouterParam } from 'h3'
import { requireAuth, serverSupabaseAdmin } from '~~/server/utils/supabase'
import { parseSchemaFields } from '~~/server/utils/form-responses'
import { resolvePublishedFields } from '~~/shared/inscription-form-core'
import { pendingUploadsByField } from '~~/server/utils/inscription-uploads'
import type { PendingUploadRow } from '~~/server/utils/inscription-uploads'
import type { FormFileReference } from '~~/shared/inscription-form'

interface ContestByTokenRow {
  id: string
}

interface PublishedSchemaRow {
  schema_json: unknown
}

export default defineEventHandler(async (event): Promise<Record<string, FormFileReference[]>> => {
  const token = getRouterParam(event, 'token')
  if (!token) throw createError({ statusCode: 400, statusMessage: 'Missing token' })

  // Same gate as the upload: the rows are scoped by user id, so there is no
  // anonymous answer to give.
  const user = requireAuth(event)

  const client = serverSupabaseAdmin()

  const contestRes = await client.rpc('get_contest_by_token', { p_token: token })
  if (contestRes.error) {
    throw createError({ statusCode: 500, statusMessage: 'contest_lookup_failed' })
  }
  const contest = (contestRes.data as ContestByTokenRow[] | null)?.[0]
  if (!contest) throw createError({ statusCode: 404, statusMessage: 'Contest not found' })

  // No `registration_open` check: reading back what you already uploaded is not
  // a change to the inscription, and a participant whose contest closed mid-way
  // is better off seeing their files than seeing an error.

  const [schemaRes, rowsRes] = await Promise.all([
    client.rpc('get_inscription_form_schema', { p_contest_id: contest.id }),
    client
      .from('inscription_uploads')
      .select('field_id, path, file_name, size_bytes, mime_type, created_at')
      .eq('contest_id', contest.id)
      .eq('user_id', user.id)
      .is('confirmed_at', null)
      .is('purge_after', null),
  ])

  if (schemaRes.error) {
    throw createError({ statusCode: 500, statusMessage: 'form_schema_lookup_failed' })
  }
  if (rowsRes.error) {
    throw createError({ statusCode: 500, statusMessage: 'pending_uploads_lookup_failed' })
  }

  const schemaRow = (schemaRes.data as PublishedSchemaRow[] | null)?.[0] ?? null
  const fields = resolvePublishedFields(schemaRow ? parseSchemaFields(schemaRow.schema_json) : null)

  // The schema may have been republished since the file was stored, so the
  // grouping drops anything no longer uploadable. `pendingUploadsByField` in
  // `server/utils/inscription-uploads.ts` holds that rule and its tests.
  return pendingUploadsByField((rowsRes.data as PendingUploadRow[] | null) ?? [], fields)
})
