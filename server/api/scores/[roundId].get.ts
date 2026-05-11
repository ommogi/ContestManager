import { defineEventHandler, createError, getRouterParam } from 'h3'
import { serverSupabaseAdmin, requireOrgOwnerOrMember } from '~~/server/utils/supabase'

export default defineEventHandler(async (event) => {
  const client = serverSupabaseAdmin()
  const roundId = getRouterParam(event, 'roundId')

  if (!roundId) throw createError({ statusCode: 400, statusMessage: 'Missing Round ID' })

  // Resolve contest_id → auth gate
  const { data: round } = await client
    .from('rounds')
    .select('category_id')
    .eq('id', roundId)
    .maybeSingle()
  if (!round?.category_id) throw createError({ statusCode: 404, statusMessage: 'Round not found' })

  const { data: cat } = await client
    .from('categories')
    .select('contest_id')
    .eq('id', round.category_id)
    .maybeSingle()
  if (!cat?.contest_id) throw createError({ statusCode: 500, statusMessage: 'Could not resolve contest' })
  await requireOrgOwnerOrMember(event, cat.contest_id)

  const { data, error } = await client.from('scores').select('*').eq('round_id', roundId)
  if (error) throw createError({ statusCode: 500, statusMessage: error.message })
  return data
})
