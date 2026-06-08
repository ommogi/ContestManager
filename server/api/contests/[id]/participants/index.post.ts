import { defineEventHandler, createError, getRouterParam, readBody } from 'h3'
import { serverSupabaseAdmin, requireOrgOwnerOrMember } from '~~/server/utils/supabase'
import { ParticipantCreateSchema } from '~~/server/utils/schemas'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing contest ID' })
  await requireOrgOwnerOrMember(event, id)

  const admin = serverSupabaseAdmin()
  const rawBody = await readBody(event)

  const parsed = ParticipantCreateSchema.safeParse(rawBody)
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid request', data: parsed.error.issues })
  }
  const { category_id, first_name, last_name, birthdate, dni, country, email, phone } = parsed.data

  const payload: Record<string, unknown> = {
    contest_id: id,
    category_id,
    ...(first_name !== undefined && { first_name }),
    ...(last_name !== undefined && { last_name }),
    ...(birthdate !== undefined && { birthdate }),
    ...(dni !== undefined && { dni }),
    ...(country !== undefined && { country }),
    ...(email !== undefined && { email }),
    ...(phone !== undefined && { phone }),
    name: first_name || last_name
      ? `${first_name || ''} ${last_name || ''}`.trim()
      : null,
  }

  const { data, error } = await admin.from('participants').insert(payload).select().single()
  if (error) { console.error("[api error]", error.message); throw createError({ statusCode: 500, statusMessage: "internal_error" }) }
  return data
})
