// server/api/contests/[id]/form-schema.get.ts
// Get form schema for a contest (organizers only)

import { defineEventHandler, createError, getRouterParam } from 'h3'
import { serverSupabaseAdmin, requireOrgOwnerOrMember, internalError } from '~~/server/utils/supabase'
import { normalizeFields } from '~~/server/utils/inscription-form-schema'
import { resolvePublishedFields } from '~~/shared/inscription-form-core'

export default defineEventHandler(async (event) => {
  const contestId = getRouterParam(event, 'id')
  if (!contestId) throw createError({ statusCode: 400, statusMessage: 'Missing contest ID' })

  // Auth gate — require org owner or contest member
  await requireOrgOwnerOrMember(event, contestId)

  const client = serverSupabaseAdmin()

  // Get latest schema (published or draft)
  const { data, error } = await client
    .from('inscription_form_schemas')
    .select('*')
    .eq('contest_id', contestId)
    .order('version', { ascending: false })
    .limit(1)
    .single()

  if (error && error.code !== 'PGRST116') { // PGRST116 = not found
    throw internalError(event, error, 'inscription_form_schemas.select')
  }

  if (!data) return null

  // Normalise before handing it to the builder, the way the public endpoint
  // already does (`server/utils/inscription-form-schema.ts`). Returning the raw
  // row let the editor show a state the server would refuse to store: after
  // KAN-65 made `core.email` irreducible, a draft saved while it was still
  // hideable came back hidden and optional, `validateCoreFields` rejected it on
  // save, and the controls to fix it no longer existed — the field is not
  // hideable any more, so there is no eye to click. Reconciling here means the
  // editor shows what a save would actually store.
  return { ...data, schema_json: resolvePublishedFields(normalizeFields(data.schema_json)) }
})
