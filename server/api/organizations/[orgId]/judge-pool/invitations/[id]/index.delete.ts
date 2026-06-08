import { defineEventHandler, createError, getRouterParam } from 'h3'
import { serverSupabaseAdmin, requireOrgOwner } from '~~/server/utils/supabase'

export default defineEventHandler(async (event) => {
  const { org } = await requireOrgOwner(event)
  const orgId = getRouterParam(event, 'orgId')
  const id = getRouterParam(event, 'id')
  if (!orgId || orgId !== org.id) {
    throw createError({ statusCode: 403, statusMessage: 'forbidden' })
  }
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing invitation id' })

  const client = serverSupabaseAdmin()

  const { error } = await client
    .from('judge_pool_invitations')
    .delete()
    .eq('id', id)
    .eq('organization_id', orgId)
    .eq('invitation_status', 'pending')

  if (error) {
    console.error('[judge-pool.invitations.delete]', error.message)
    throw createError({ statusCode: 500, statusMessage: 'internal_error' })
  }

  return { success: true }
})
