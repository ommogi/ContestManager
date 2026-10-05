import { defineEventHandler, createError, getRouterParam, readBody } from 'h3'
import { serverSupabaseAdmin, requireContestOrganizer, internalError } from '~~/server/utils/supabase'
import { BulkRoundParticipantsSchema } from '~~/server/utils/schemas'

export default defineEventHandler(async (event) => {
  const client = serverSupabaseAdmin()
  const roundId = getRouterParam(event, 'id')

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
  if (!cat?.contest_id) throw internalError(event, 'round has no resolvable contest', 'rounds.select:contest_resolution')
  await requireContestOrganizer(event, cat.contest_id)

  const rawBody = await readBody(event)
  const parsed = BulkRoundParticipantsSchema.safeParse(rawBody)
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid request', data: parsed.error.issues })
  }
  const { participantIds } = parsed.data

  // NULL, not false: being added to a round is not a qualification verdict.
  const roundParticipants = participantIds.map((pid: string, idx: number) => ({
    round_id: roundId,
    participant_id: pid,
    order: idx + 1,
    is_qualified: null
  }))

  const { error } = await client
    .from('round_participants')
    .insert(roundParticipants)
    
  if (error) { console.error("[api error]", error.message); throw createError({ statusCode: 500, statusMessage: "internal_error" }) }
  return { success: true }
})
