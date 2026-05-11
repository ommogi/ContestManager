import { defineEventHandler, createError } from 'h3'
import { serverSupabaseAdmin, requireAuth } from '~~/server/utils/supabase'

export default defineEventHandler(async (event) => {
  requireAuth(event)
  const admin = serverSupabaseAdmin()
  const { data, error } = await admin.rpc('get_plan_bundles')
  if (error) throw createError({ statusCode: 500, statusMessage: error.message })
  return data
})
