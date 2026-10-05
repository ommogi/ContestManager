import { defineEventHandler, createError, getRouterParam, readBody } from 'h3'
import { serverSupabaseUser, requireContestOrganizer, internalError } from '~~/server/utils/supabase'
import { ImportBodySchema } from '~~/server/utils/schemas'

export default defineEventHandler(async (event) => {
  const contestId = getRouterParam(event, 'id')
  if (!contestId) throw createError({ statusCode: 400, statusMessage: 'Missing contest id' })

  // Auth gate — organisers only (not judges or viewers)
  await requireContestOrganizer(event, contestId)

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
    // Business signals raised by the RPC itself keep their semantic 4xx.
    // Anything the RPC did not raise on purpose is an internal failure and
    // must not travel to the client: it would carry table/column/constraint
    // names straight from Postgres.
    const raw = error.message || ''
    const msg = raw.toLowerCase()
    if (msg.includes('insufficient_tickets')) {
      throw createError({ statusCode: 402, statusMessage: 'insufficient_tickets' })
    }
    if (msg.includes('forbidden')) {
      throw createError({ statusCode: 403, statusMessage: 'forbidden' })
    }
    if (msg.includes('already_enrolled_in_category')) {
      // Contract with ImportCsvDialog: "already_enrolled_in_category: dni 123 cat Piano".
      // Only the part matching our own RPC format is echoed back.
      const detail = raw.match(/already_enrolled_in_category:\s*(?:dni|email)\s+\S+\s+cat\s+.+/i)?.[0]
      throw createError({ statusCode: 409, statusMessage: detail ?? 'already_enrolled_in_category' })
    }
    if (msg.includes('contest_active')) {
      throw createError({ statusCode: 409, statusMessage: 'El concurso ya está en curso. No se pueden gestionar inscripciones.' })
    }
    throw internalError(event, error, 'rpc:bulk_enroll_csv')
  }
  return data
})
