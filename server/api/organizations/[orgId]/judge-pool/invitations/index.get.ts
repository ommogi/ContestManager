import { defineEventHandler, createError, getRouterParam } from 'h3'
import { serverSupabaseAdmin, requireOrgOwner } from '~~/server/utils/supabase'

export default defineEventHandler(async (event) => {
  const { org } = await requireOrgOwner(event)
  const orgId = getRouterParam(event, 'orgId')
  if (!orgId || orgId !== org.id) {
    throw createError({ statusCode: 403, statusMessage: 'forbidden' })
  }

  const client = serverSupabaseAdmin()

  const { data, error } = await client
    .from('judge_pool_invitations')
    .select('id, email, full_name, specialty, invitation_status, invited_at, responded_at')
    .eq('organization_id', orgId)
    .order('invited_at', { ascending: false })

  if (error) {
    console.error('[judge-pool.invitations]', error.message)
    throw createError({ statusCode: 500, statusMessage: 'internal_error' })
  }

  return data || []
})
