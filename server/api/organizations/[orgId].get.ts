import { defineEventHandler, createError, getRouterParam } from 'h3'
import { serverSupabaseClient, requireAuth } from '~~/server/utils/supabase'

export default defineEventHandler(async (event) => {
  requireAuth(event)
  const client = serverSupabaseClient(event)
  const slug = getRouterParam(event, 'slug')
  const { data, error } = await client.from('organizations').select('*').eq('slug', slug).single()
  if (error) throw createError({ statusCode: 404, statusMessage: 'Organization not found' })
  return data
})
