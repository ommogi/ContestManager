// server/api/contests/[id]/form-schema.post.ts
// Save/create form schema for a contest (organizers only)

import { defineEventHandler, createError, getRouterParam, readBody } from 'h3'
import { serverSupabaseAdmin, requireOrgOwnerOrMember } from '~~/server/utils/supabase'
import type { FormField } from '~/types/inscription-form'

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
      schema_json: body.fields,
    })
    .select()
    .single()

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return data
})
