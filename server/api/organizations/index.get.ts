import { defineEventHandler, createError } from 'h3'
import { serverSupabaseClient, requireAuth } from '~~/server/utils/supabase'

export default defineEventHandler(async (event) => {
  requireAuth(event)
  const client = serverSupabaseClient(event)
  const { data, error } = await client.from('organizations').select('*')
  if (error) throw createError({ statusCode: 500, statusMessage: error.message })
  return data
})
