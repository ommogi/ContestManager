// server/api/rounds/[id]/schedule/generate.post.ts
// Generate a round's performance slots from its draw and window (KAN-13).
//
//   { dryRun: true }                 → the plan, nothing written (preview)
//   { dryRun: false }                → 409 schedule_exists if any slot is set
//   { dryRun: false, overwrite: true } → writes, replacing existing slots
//
// The plan is rebuilt from the database on every call; the client only says
// whether to write it.

import { defineEventHandler, createError, getRouterParam, readBody } from 'h3'
import { serverSupabaseAdmin, requireOrgOwnerOrMember, internalError } from '~~/server/utils/supabase'
import { RoundScheduleGenerateSchema } from '~~/server/utils/schemas'
import {
  applyRoundSchedule,
  loadRoundSchedule,
  RoundScheduleError,
} from '~~/server/services/round-schedule'
import { SCHEDULE_ERROR_MESSAGES } from '~~/shared/schedule-generator'

export default defineEventHandler(async (event) => {
  const roundId = getRouterParam(event, 'id')
  if (!roundId) throw createError({ statusCode: 400, statusMessage: 'Missing Round ID' })

  const client = serverSupabaseAdmin()

  // Resolve contest_id → auth gate, before anything else is read.
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

  const parsed = RoundScheduleGenerateSchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid request', data: parsed.error.issues })
  }
  const { dryRun, overwrite } = parsed.data

  try {
    const ctx = await loadRoundSchedule(client, roundId)
    const preview = {
      plan: ctx.plan,
      names: ctx.names,
      alreadyScheduled: ctx.alreadyScheduled,
      roundClosed: ctx.roundStatus === 'closed',
    }
    if (dryRun) return preview

    if (ctx.roundStatus === 'closed') throw new RoundScheduleError('round_closed')

    if (!ctx.plan.ok) {
      const code = ctx.plan.error ?? 'does_not_fit'
      throw createError({
        statusCode: code === 'does_not_fit' ? 409 : 400,
        statusMessage: code,
        message: SCHEDULE_ERROR_MESSAGES[code],
      })
    }

    if (ctx.alreadyScheduled > 0 && !overwrite) {
      throw createError({
        statusCode: 409,
        statusMessage: 'schedule_exists',
        message: `${ctx.alreadyScheduled} participante${ctx.alreadyScheduled === 1 ? ' ya tiene' : 's ya tienen'} hora de actuación. Confirma para sobrescribir.`,
        data: { alreadyScheduled: ctx.alreadyScheduled },
      })
    }

    const updated = await applyRoundSchedule(client, roundId, ctx.plan)
    return { ...preview, updated }
  } catch (err) {
    if (err instanceof RoundScheduleError) {
      throw createError({ statusCode: err.statusCode, statusMessage: err.code, message: err.userMessage })
    }
    // Errors built above with createError pass through untouched.
    if ((err as { statusCode?: number })?.statusCode) throw err
    throw internalError(event, err, 'round_schedule.generate')
  }
})
