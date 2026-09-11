// server/api/contests/[id]/form-schema.post.ts
// Save/create form schema for a contest (organizers only)

import { defineEventHandler, createError, getRouterParam, readBody } from 'h3'
import { serverSupabaseAdmin, requireOrgOwnerOrMember } from '~~/server/utils/supabase'
import { validateCoreFields, reconcileFormFields } from '~~/shared/inscription-form-core'
import type { FormField } from '~~/shared/inscription-form'

interface FormSchemaBody {
  fields: FormField[]
  isPublished?: boolean
}

export default defineEventHandler(async (event) => {
  const contestId = getRouterParam(event, 'id')
  if (!contestId) throw createError({ statusCode: 400, statusMessage: 'Missing contest ID' })

  // Auth gate — require org owner or contest member
  await requireOrgOwnerOrMember(event, contestId)

  const body = await readBody<FormSchemaBody>(event)
  if (!body.fields || !Array.isArray(body.fields)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid fields' })
  }

  // KAN-56: core fields are schema entries now. Reject a payload that hides,
  // drops or retypes one of the irreducible three (nombre, apellidos, fecha de
  // nacimiento) — the age filter and the enroll_participant guards depend on
  // them — and reject a custom field squatting on the reserved `core.` prefix.
  const coreIssues = validateCoreFields(body.fields)
  if (coreIssues.length > 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'invalid_core_fields',
      data: { issues: coreIssues },
      message: coreIssues[0]!.message,
    })
  }

  // Restore any omitted core entry and renumber `order` densely, so the stored
  // schema is always a complete, self-describing list.
  const fields = reconcileFormFields(body.fields)

  const client = serverSupabaseAdmin()

  // Get current version
  const { data: currentSchema } = await client
    .from('inscription_form_schemas')
    .select('version')
    .eq('contest_id', contestId)
    .order('version', { ascending: false })
    .limit(1)
    .single()

  const newVersion = (currentSchema?.version || 0) + 1

  // Create new schema
  const { data, error } = await client
    .from('inscription_form_schemas')
    .insert({
      contest_id: contestId,
      version: newVersion,
      is_published: body.isPublished || false,
      schema_json: fields,
    })
    .select()
    .single()

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return data
})
