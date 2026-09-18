// server/api/rounds/[id]/draw/index.put.ts
// Save the draw numbers and performance lengths of a round (KAN-11).
//
// One request for the whole table, not a PATCH per row: the per-round unique
// constraint is checked at the end of the RPC's single UPDATE, which is what
// lets two participants swap numbers.

import { defineEventHandler, createError, getRouterParam, readBody } from 'h3'
import { serverSupabaseAdmin, requireOrgOwnerOrMember, internalError } from '~~/server/utils/supabase'
import { RoundDrawSchema } from '~~/server/utils/schemas'
import { applyRoundDraw, RoundDrawError } from '~~/server/services/round-draw'

export default defineEventHandler(async (event) => {
  const roundId = getRouterParam(event, 'id')
  if (!roundId) throw createError({ statusCode: 400, statusMessage: 'Missing Round ID' })

  const client = serverSupabaseAdmin()

  // Resolve contest_id → auth gate, before reading the body.
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
  await requireOrgOwnerOrMember(event, cat.contest_id)

  const parsed = RoundDrawSchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid request', data: parsed.error.issues })
  }

  try {
    const updated = await applyRoundDraw(client, roundId, parsed.data.rows)
    return { updated }
  } catch (err) {
    if (err instanceof RoundDrawError) {
      throw createError({ statusCode: err.statusCode, statusMessage: err.code, message: err.userMessage })
    }
    throw internalError(event, err, 'rpc:set_round_draw')
  }
})
