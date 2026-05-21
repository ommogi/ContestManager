import { defineEventHandler, createError, getRouterParam } from 'h3'
import { serverSupabaseAdmin, requireAuth } from '~~/server/utils/supabase'

export default defineEventHandler(async (event) => {
  const user = requireAuth(event)
  const admin = serverSupabaseAdmin()
  const orgId = getRouterParam(event, 'orgId')
  if (!orgId) throw createError({ statusCode: 400, statusMessage: 'Missing orgId' })

  const fields = 'id, name, slug, owner_id, ticket_balance, activation_balance, stripe_onboarding_done, stripe_charges_enabled, stripe_payouts_enabled, created_at, updated_at'
  const { data, error } = await admin
    .from('organizations')
    .select(fields)
    .eq('id', orgId)
    .eq('owner_id', user.id)
    .maybeSingle()

  if (error) {
    console.error('[organizations] fetch failed:', error.message)
    throw createError({ statusCode: 500, statusMessage: 'internal_error' })
  }
  if (!data) throw createError({ statusCode: 404, statusMessage: 'Organization not found' })
  return data
})
