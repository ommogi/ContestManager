import { defineEventHandler, createError, getRouterParam, readBody } from 'h3'
import { serverSupabaseUser, serverSupabaseAdmin, requireOrgOwnerOrMember } from '~~/server/utils/supabase'

interface Row {
  category_id: string
  first_name: string
  last_name: string
  birthdate: string
  dni?: string | null
  country?: string | null
  email?: string | null
  phone?: string | null
}

export default defineEventHandler(async (event) => {
  const contestId = getRouterParam(event, 'id')
  if (!contestId) throw createError({ statusCode: 400, statusMessage: 'Missing contest id' })

  // Auth gate — require org owner or contest member
  await requireOrgOwnerOrMember(event, contestId)

  const body = await readBody<{ rows: Row[] }>(event)
  const rows = body?.rows ?? []
  if (!Array.isArray(rows) || rows.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'No rows' })
  }

  // Quick validation
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    if (!r.category_id || !r.first_name || !r.last_name || !r.birthdate) {
      throw createError({ statusCode: 400, statusMessage: `Row ${i + 1}: missing required field` })
    }
  }

  const client = serverSupabaseUser(event)
  const { data, error } = await client.rpc('bulk_enroll_csv', {
    p_contest_id: contestId,
    p_rows: rows,
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
