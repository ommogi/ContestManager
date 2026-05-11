import { defineEventHandler, createError, getRouterParam } from 'h3'
import { serverSupabaseAdmin, requireOrgOwner } from '~~/server/utils/supabase'

export default defineEventHandler(async (event) => {
  const { org } = await requireOrgOwner(event)
  const client = serverSupabaseAdmin()
  const organizationId = getRouterParam(event, 'orgId')

  if (!organizationId) {
    throw createError({ statusCode: 400, statusMessage: 'Organization ID is required' })
  }

  if (organizationId !== org.id) {
    throw createError({ statusCode: 403, statusMessage: 'forbidden' })
  }

  const { data, error } = await client.rpc('get_judge_pool', { p_org_id: organizationId })

  if (error) throw createError({ statusCode: 500, statusMessage: error.message })

  return data || []
})
