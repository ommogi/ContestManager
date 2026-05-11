import { defineEventHandler, createError, getRouterParam } from 'h3'
import { serverSupabaseAdmin, requireOrgOwner } from '~~/server/utils/supabase'

export default defineEventHandler(async (event) => {
  const { org } = await requireOrgOwner(event)
  const client = serverSupabaseAdmin()
  const organizationId = getRouterParam(event, 'orgId')
  const judgeId = getRouterParam(event, 'judgeId')

  if (!judgeId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Judge ID is required'
    })
  }

  if (organizationId !== org.id) {
    throw createError({ statusCode: 403, statusMessage: 'forbidden' })
  }

  const { error } = await client
    .from('judge_pool_members')
    .delete()
    .eq('id', judgeId)

  if (error) {
    throw createError({
      statusCode: 500,
      statusMessage: error.message
    })
  }

  return { success: true }
})
