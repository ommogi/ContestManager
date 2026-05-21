import { defineEventHandler, createError, getRouterParam, readBody } from 'h3'
import { serverSupabaseAdmin, requireOrgOwnerOrMember } from '~~/server/utils/supabase'
import { sendScheduleEmail } from '~~/server/utils/email'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing ID' })

  const admin = serverSupabaseAdmin()

  // Resolve contest_id for auth gate
  const { data: rp } = await admin
    .from('round_participants')
    .select('round_id')
    .eq('id', id)
    .maybeSingle()
  if (!rp) throw createError({ statusCode: 404, statusMessage: 'round_participant_not_found' })

  const { data: round } = await admin
    .from('rounds')
    .select('category_id')
    .eq('id', rp.round_id)
    .maybeSingle()
  if (!round) throw createError({ statusCode: 404, statusMessage: 'round_not_found' })

  const { data: category } = await admin
    .from('categories')
    .select('contest_id')
    .eq('id', round.category_id)
    .maybeSingle()
  if (!category) throw createError({ statusCode: 404, statusMessage: 'category_not_found' })
  await requireOrgOwnerOrMember(event, category.contest_id)

  const body = await readBody(event)
  const allowed = ['rehearsal_room', 'rehearsal_time', 'rehearsal_accompanist', 'performance_time']
  const updates: Record<string, string | null> = {}
  for (const key of allowed) {
    if (key in body) updates[key] = body[key]
  }

  if (Object.keys(updates).length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'No valid fields to update' })
  }

  const { data, error } = await admin
    .from('round_participants')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) { console.error("[api error]", error.message); throw createError({ statusCode: 500, statusMessage: "internal_error" }) }

  // Send schedule email if a scheduling field was first set
  const isPerformance = updates.performance_time != null
  const isRehearsal = updates.rehearsal_time != null
  if (isPerformance || isRehearsal) {
    const { data: rpData } = await admin
      .from('round_participants')
      .select(`
        participant_id,
        participants(email, first_name, name),
        rounds(name, categories(contests(name, slug)))
      `)
      .eq('id', id)
      .single()

    const p = (rpData as any)?.participants
    const roundData = (rpData as any)?.rounds
    const contest = roundData?.categories?.contests
    if (p?.email) {
      sendScheduleEmail({
        to: p.email,
        first_name: p.first_name || p.name,
        contest_name: contest?.name ?? '',
        round_name: roundData?.name ?? '',
        is_performance: isPerformance,
        time: isPerformance ? updates.performance_time! : updates.rehearsal_time!,
        room: updates.rehearsal_room,
        accompanist: updates.rehearsal_accompanist,
        contest_slug: contest?.slug,
      }).catch((e: any) => { console.error('[round-participants.patch] email failed:', e?.message) })
    }
  }

  return data
})
