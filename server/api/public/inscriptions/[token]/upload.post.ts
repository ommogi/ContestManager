// server/api/public/inscriptions/[token]/upload.post.ts
// Upload one file for a `file` field of a contest's published form (KAN-59).
//
// Returns a `FormFileReference`, which is what the inscription page puts into
// `responses_json`. The bytes go to the private `inscription-uploads` bucket;
// `responses_json` never holds file contents.
//
// ── What is trusted ─────────────────────────────────────────────────────────
// The session (`requireAuth`), the registration token, and the bytes. Not the
// filename, not the multipart `Content-Type`, not the field's `accept` as sent
// by the client — the field definition is re-read from the PUBLISHED schema in
// the database on every request, and the file type is sniffed from the content.
// `validateUpload` in `server/utils/inscription-uploads.ts` holds those rules.

import { randomUUID } from 'node:crypto'
import { defineEventHandler, createError, getRouterParam, readMultipartFormData } from 'h3'
import { requireAuth, serverSupabaseAdmin } from '~~/server/utils/supabase'
import { parseSchemaFields } from '~~/server/utils/form-responses'
import { resolvePublishedFields } from '~~/shared/inscription-form-core'
import {
  INSCRIPTION_UPLOADS_BUCKET,
  PLATFORM_MAX_FILE_SIZE_MB,
  buildUploadPath,
  toFileReference,
  validateUpload,
} from '~~/server/utils/inscription-uploads'
import type { FormFileReference } from '~~/shared/inscription-form'

interface ContestByTokenRow {
  id: string
  registration_open?: boolean
}

interface PublishedSchemaRow {
  schema_json: unknown
}

/**
 * Hard ceiling on the request body, independent of any field's `maxSizeMB`.
 * Checked against the decoded part before anything else touches it, so an
 * oversized upload is rejected rather than sniffed, hashed and stored.
 */
const ABSOLUTE_MAX_BYTES = PLATFORM_MAX_FILE_SIZE_MB * 1024 * 1024

export default defineEventHandler(async (event): Promise<FormFileReference> => {
  const token = getRouterParam(event, 'token')
  if (!token) throw createError({ statusCode: 400, statusMessage: 'Missing token' })

  // Anonymous uploads are never allowed: the object key is scoped by user id
  // and the storage policy compares it to auth.uid().
  const user = requireAuth(event)

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

  const parts = await readMultipartFormData(event)
  if (!parts || parts.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'Missing multipart body' })
  }

  const fieldPart = parts.find(p => p.name === 'fieldId' && !p.filename)
  const filePart = parts.find(p => p.name === 'file' && p.filename !== undefined)

  const fieldId = fieldPart?.data.toString('utf8').trim()
  if (!fieldId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing fieldId' })
  }
  if (!filePart) {
    throw createError({ statusCode: 400, statusMessage: 'Missing file' })
  }

  if (filePart.data.byteLength > ABSOLUTE_MAX_BYTES) {
    throw createError({
      statusCode: 413,
      statusMessage: 'file_too_large',
      message: `El archivo supera el tamaño máximo de ${PLATFORM_MAX_FILE_SIZE_MB} MB.`,
    })
  }

  // The field definition comes from the published schema in the database, so a
  // client cannot widen its own `accept`, `maxSizeMB` or `maxFiles`.
  const schemaRes = await client.rpc('get_inscription_form_schema', { p_contest_id: contest.id })
  if (schemaRes.error) {
    throw createError({ statusCode: 500, statusMessage: 'form_schema_lookup_failed' })
  }
  const schemaRow = (schemaRes.data as PublishedSchemaRow[] | null)?.[0] ?? null
  const fields = resolvePublishedFields(schemaRow ? parseSchemaFields(schemaRow.schema_json) : null)
  const field = fields.find(f => f.id === fieldId && f.hidden !== true)

  // Two counts, one round-trip each, both needed by validateUpload: how many
  // files this user already has on this field, and how much this contest is
  // already storing.
  const [countRes, usageRes] = await Promise.all([
    client
      .from('inscription_uploads')
      .select('id', { count: 'exact', head: true })
      .eq('contest_id', contest.id)
      .eq('user_id', user.id)
      .eq('field_id', fieldId)
      .is('purge_after', null),
    client
      .from('inscription_uploads')
      .select('size_bytes')
      .eq('contest_id', contest.id)
      .is('purge_after', null),
  ])

  if (countRes.error) throw createError({ statusCode: 500, statusMessage: 'upload_count_failed' })
  if (usageRes.error) throw createError({ statusCode: 500, statusMessage: 'upload_usage_failed' })

  const contestBytesUsed = (usageRes.data as { size_bytes: number }[] | null ?? [])
    .reduce((total, row) => total + Number(row.size_bytes ?? 0), 0)

  const validation = validateUpload(
    field,
    { fileName: filePart.filename ?? 'archivo', bytes: filePart.data },
    { existingCount: countRes.count ?? 0, contestBytesUsed },
  )

  if (!validation.ok) {
    throw createError({
      statusCode: 400,
      statusMessage: validation.error.code,
      message: validation.error.message,
    })
  }

  const accepted = validation.value
  const path = buildUploadPath(
    { contestId: contest.id, ownerId: user.id, fieldId, fileName: accepted.fileName },
    randomUUID(),
  )

  const uploadRes = await client.storage
    .from(INSCRIPTION_UPLOADS_BUCKET)
    .upload(path, filePart.data, {
      // The sniffed type, not the declared one — this is what a later signed
      // URL will serve the object as.
      contentType: accepted.mimeType,
      upsert: false,
    })

  if (uploadRes.error) {
    throw createError({
      statusCode: 500,
      statusMessage: 'upload_failed',
      message: 'No se ha podido guardar el archivo. Inténtalo de nuevo.',
    })
  }

  const uploadedAt = new Date().toISOString()

  // The ledger row is what makes the object sweepable. If it cannot be
  // written, the object would be unreachable and unpurgeable, so remove it and
  // fail rather than leaking storage.
  const ledgerRes = await client.from('inscription_uploads').insert({
    contest_id: contest.id,
    user_id: user.id,
    field_id: fieldId,
    path,
    file_name: accepted.fileName,
    size_bytes: accepted.size,
    mime_type: accepted.mimeType,
    created_at: uploadedAt,
  })

  if (ledgerRes.error) {
    await client.storage.from(INSCRIPTION_UPLOADS_BUCKET).remove([path])
    throw createError({
      statusCode: 500,
      statusMessage: 'upload_ledger_failed',
      message: 'No se ha podido registrar el archivo. Inténtalo de nuevo.',
    })
  }

  return toFileReference(path, accepted, uploadedAt)
})
