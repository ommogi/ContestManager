import { defineEventHandler, createError, getRouterParam, readBody } from 'h3'
import { serverSupabaseUser, requireOrgOwnerOrMember } from '~~/server/utils/supabase'
import { ImportBodySchema } from '~~/server/utils/schemas'

export default defineEventHandler(async (event) => {
  const contestId = getRouterParam(event, 'id')
  if (!contestId) throw createError({ statusCode: 400, statusMessage: 'Missing contest id' })

  // Auth gate — require org owner or contest member
  await requireOrgOwnerOrMember(event, contestId)

  const rawBody = await readBody(event)
  const parsed = ImportBodySchema.safeParse(rawBody)
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid request', data: parsed.error.issues })
  }

  const client = serverSupabaseUser(event)
  const { data, error } = await client.rpc('bulk_enroll_csv', {
    p_contest_id: contestId,
    p_rows: parsed.data.rows,
  })
  if (error) {
    const msg = (error.message || '').toLowerCase()
    if (msg.includes('insufficient_tickets')) {
      throw createError({ statusCode: 402, statusMessage: error.message })
    }
    if (msg.includes('forbidden')) {
      throw createError({ statusCode: 403, statusMessage: 'forbidden' })
    }
    if (msg.includes('already_enrolled_in_category')) {
      throw createError({ statusCode: 409, statusMessage: error.message })
    }
    if (msg.includes('contest_active')) {
      throw createError({ statusCode: 409, statusMessage: 'El concurso ya está en curso. No se pueden gestionar inscripciones.' })
    }
    throw createError({ statusCode: 400, statusMessage: error.message })
  }
  return data
})
