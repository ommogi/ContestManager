// server/api/rounds/[id]/draw/import.post.ts
// Import a round's draw from a CSV (KAN-11).
//
// The browser parses the file (`parseDrawCsv`) and sends the rows; matching
// them to participants happens here because it needs DNI and e-mail, which the
// round page never receives. They are read to match and are NOT sent back:
// the answer carries line numbers and round_participants ids only.
//
// `apply: false` is a dry run for the preview; `apply: true` saves through the
// same RPC as the manual editor.

import { defineEventHandler, createError, getRouterParam, readBody } from 'h3'
import { serverSupabaseAdmin, requireOrgOwnerOrMember, internalError } from '~~/server/utils/supabase'
import { RoundDrawImportSchema } from '~~/server/utils/schemas'
import { applyRoundDraw, RoundDrawError } from '~~/server/services/round-draw'
import { matchDrawImport, type DrawCandidate } from '~~/shared/round-draw'

interface CandidateRow {
  id: string
  participant: { dni: string | null; email: string | null } | null
}

export default defineEventHandler(async (event) => {
  const roundId = getRouterParam(event, 'id')
  if (!roundId) throw createError({ statusCode: 400, statusMessage: 'Missing Round ID' })

  const client = serverSupabaseAdmin()

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

  const parsed = RoundDrawImportSchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid request', data: parsed.error.issues })
  }

  const { data, error } = await client
    .from('round_participants')
    .select('id, participant:participants(dni, email)')
    .eq('round_id', roundId)
  if (error) throw internalError(event, error, 'round_participants.select')

  const candidates: DrawCandidate[] = ((data as unknown as CandidateRow[] | null) ?? []).map(row => ({
    id: row.id,
    dni: row.participant?.dni ?? null,
    email: row.participant?.email ?? null,
  }))

  const result = matchDrawImport(parsed.data.rows, candidates)

  let updated = 0
  if (parsed.data.apply && result.matched.length > 0) {
    try {
      updated = await applyRoundDraw(client, roundId, result.matched)
    } catch (err) {
      if (err instanceof RoundDrawError) {
        throw createError({ statusCode: err.statusCode, statusMessage: err.code, message: err.userMessage })
      }
      throw internalError(event, err, 'rpc:set_round_draw')
    }
  }

  return {
    matched: result.matched,
    unmatched: result.unmatched,
    repeated: result.repeated,
    applied: parsed.data.apply,
    updated,
  }
})
