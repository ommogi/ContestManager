import { defineEventHandler, createError, getRouterParam } from 'h3'
import { serverSupabaseAdmin, requireOrgOwnerOrMember } from '~~/server/utils/supabase'

export default defineEventHandler(async (event) => {
  const client = serverSupabaseAdmin()
  const id = getRouterParam(event, 'id')

  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing contest ID' })
  await requireOrgOwnerOrMember(event, id)

  const { data, error } = await client.rpc('get_contest_members_with_avatar', { p_contest_id: id })

  if (error) { console.error("[api error]", error.message); throw createError({ statusCode: 500, statusMessage: "internal_error" }) }
  return data || []
})
