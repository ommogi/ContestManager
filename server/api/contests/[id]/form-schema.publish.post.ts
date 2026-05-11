// server/api/contests/[id]/form-schema.publish.post.ts
// Publish a form schema (organizers only)

import { defineEventHandler, createError, getRouterParam, readBody } from 'h3'
import { serverSupabaseAdmin, requireOrgOwnerOrMember } from '~~/server/utils/supabase'

export default defineEventHandler(async (event) => {
  const contestId = getRouterParam(event, 'id')
  if (!contestId) throw createError({ statusCode: 400, statusMessage: 'Missing contest ID' })

  // Auth gate — require org owner or contest member
  await requireOrgOwnerOrMember(event, contestId)

  const client = serverSupabaseAdmin()

  // Unpublish all existing schemas for this contest
  await client
    .from('inscription_form_schemas')
    .update({ is_published: false })
    .eq('contest_id', contestId)

  // Publish the latest version
  const { data: latestSchema } = await client
    .from('inscription_form_schemas')
    .select('id')
    .eq('contest_id', contestId)
    .order('version', { ascending: false })
    .limit(1)
    .single()

  if (!latestSchema) {
    throw createError({ statusCode: 404, statusMessage: 'No schema found to publish' })
  }

  const { error } = await client
    .from('inscription_form_schemas')
    .update({ 
      is_published: true,
      published_at: new Date().toISOString()
    })
    .eq('id', latestSchema.id)

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return { success: true, schemaId: latestSchema.id }
})
