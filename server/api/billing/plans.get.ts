import { defineEventHandler, createError } from 'h3'
import { serverSupabaseAdmin, requireAuth } from '~~/server/utils/supabase'

export default defineEventHandler(async (event) => {
  requireAuth(event)
  const admin = serverSupabaseAdmin()
  const { data, error } = await admin.rpc('get_plan_bundles')
  if (error) { console.error("[api error]", error.message); throw createError({ statusCode: 500, statusMessage: "internal_error" }) }
  return data
})
