// server/api/contests/[id]/program/days.get.ts
// The days of a contest that have performances, with how many (KAN-21), so the
// organisation picks a jornada from what exists instead of guessing a date.
import { defineEventHandler, createError, getRouterParam } from 'h3'
import { serverSupabaseAdmin, requireOrgOwnerOrMember, internalError } from '~~/server/utils/supabase'
import { loadProgramSources } from '~~/server/services/public-program'
import { programDays } from '~~/server/utils/pdf/public-program'

export default defineEventHandler(async (event) => {
  const contestId = getRouterParam(event, 'id')
  if (!contestId) throw createError({ statusCode: 400, statusMessage: 'Missing contest ID' })

  const access = await requireOrgOwnerOrMember(event, contestId)
  if (access.member && !['organizer', 'judge'].includes(access.member.role)) {
    throw createError({ statusCode: 403, statusMessage: 'forbidden' })
  }

  const admin = serverSupabaseAdmin()
  try {
    const sources = await loadProgramSources(admin, contestId)
    return {
      days: programDays(sources),
      unscheduled: sources.filter(s => !s.performance_time).length,
    }
  } catch (err) {
    throw internalError(event, err, 'round_participants.select')
  }
})
