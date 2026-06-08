import { defineEventHandler, createError } from 'h3'
import { serverSupabaseAdmin, requireAuth } from '~~/server/utils/supabase'

export default defineEventHandler(async (event) => {
  const user = requireAuth(event)
  const admin = serverSupabaseAdmin()
  const fields = 'id, name, slug, owner_id, ticket_balance, activation_balance, stripe_onboarding_done, stripe_charges_enabled, stripe_payouts_enabled, created_at, updated_at'
  const { data, error } = await admin.from('organizations').select(fields).eq('owner_id', user.id)
  if (error) {
    console.error('[organizations] fetch failed:', error.message)
    throw createError({ statusCode: 500, statusMessage: 'internal_error' })
  }
  return data
})
