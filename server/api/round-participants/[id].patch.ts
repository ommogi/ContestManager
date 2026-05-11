import { defineEventHandler, createError, getRouterParam, readBody } from 'h3'
import { serverSupabaseClient, serverSupabaseAdmin } from '~~/server/utils/supabase'
import { sendScheduleEmail } from '~~/server/utils/email'

export default defineEventHandler(async (event) => {
  const client = serverSupabaseClient(event)
  const admin = serverSupabaseAdmin()
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing ID' })

  const body = await readBody(event)
  const allowed = ['rehearsal_room', 'rehearsal_time', 'rehearsal_accompanist', 'performance_time']
  const updates: Record<string, string | null> = {}
  for (const key of allowed) {
    if (key in body) updates[key] = body[key]
  }

  if (Object.keys(updates).length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'No valid fields to update' })
  }

  const { data, error } = await client
    .from('round_participants')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw createError({ statusCode: 500, statusMessage: error.message })

  // Send schedule email if a scheduling field was first set
  const isPerformance = updates.performance_time != null
  const isRehearsal = updates.rehearsal_time != null
  if (isPerformance || isRehearsal) {
    const { data: rp } = await admin
      .from('round_participants')
      .select(`
        participant_id,
        participants(email, first_name, name),
        rounds(name, categories(contests(name, slug)))
      `)
      .eq('id', id)
      .single()

    const p = (rp as any)?.participants
    const round = (rp as any)?.rounds
    const contest = round?.categories?.contests
    if (p?.email) {
      sendScheduleEmail({
        to: p.email,
        first_name: p.first_name || p.name,
        contest_name: contest?.name ?? '',
        round_name: round?.name ?? '',
        is_performance: isPerformance,
        time: isPerformance ? updates.performance_time! : updates.rehearsal_time!,
        room: updates.rehearsal_room,
        accompanist: updates.rehearsal_accompanist,
        contest_slug: contest?.slug,
      }).catch(() => {})
    }
  }

  return data
})
