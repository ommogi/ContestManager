import { defineEventHandler, createError, getRouterParam, readBody } from 'h3'
import { serverSupabaseAdmin, requireOrgOwnerOrMember } from '~~/server/utils/supabase'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing contest ID' })
  await requireOrgOwnerOrMember(event, id)

  const admin = serverSupabaseAdmin()
  const body = await readBody(event)

  const allowed = ['name', 'description', 'max_participants', 'min_age', 'max_age', 'entry_fee_cents']
  const payload: Record<string, any> = { contest_id: id }
  for (const key of allowed) {
    if (key in body) payload[key] = body[key]
  }

  const { data, error } = await admin.from('categories').insert(payload).select().single()
  if (error) { console.error("[api error]", error.message); throw createError({ statusCode: 500, statusMessage: "internal_error" }) }
  return data
})
