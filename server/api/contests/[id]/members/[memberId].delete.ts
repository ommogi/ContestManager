import { defineEventHandler, createError, getRouterParam } from 'h3'
import { serverSupabaseAdmin, requireContestOrganizer, internalError } from '~~/server/utils/supabase'

export default defineEventHandler(async (event) => {
  const contestId = getRouterParam(event, 'id')
  const memberId = getRouterParam(event, 'memberId')
  if (!contestId || !memberId) throw createError({ statusCode: 400, statusMessage: 'Missing contest ID or member ID' })
  await requireContestOrganizer(event, contestId)

  const admin = serverSupabaseAdmin()
  const { error } = await admin.from('contest_members').delete().eq('id', memberId).eq('contest_id', contestId)

  if (error) {
    throw internalError(event, error, 'contest_members.delete')
  }

  return { success: true }
})
