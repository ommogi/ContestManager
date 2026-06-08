import { defineEventHandler, createError, getRouterParam, readBody } from 'h3'
import { serverSupabaseAdmin, requireOrgOwnerOrMember } from '~~/server/utils/supabase'
import { sendPromotionEmail } from '~~/server/utils/email'
import { PromoteBodySchema } from '~~/server/utils/schemas'

export default defineEventHandler(async (event) => {
  const admin = serverSupabaseAdmin()
  const roundId = getRouterParam(event, 'id')

  const rawBody = await readBody(event)
  const parsed = PromoteBodySchema.safeParse(rawBody)
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid request', data: parsed.error.issues })
  }
  const body = parsed.data

  if (!roundId) throw createError({ statusCode: 400, statusMessage: 'Missing round ID' })

  // 1. Get current round info
  const { data: currentRound, error: roundError } = await admin
    .from('rounds')
    .select('*')
    .eq('id', roundId)
    .single()

  if (roundError || !currentRound) throw createError({ statusCode: 404, statusMessage: 'Round not found' })

  // Guard against double-promotion (race condition / retry)
  if (currentRound.status === 'closed') {
    throw createError({ statusCode: 409, statusMessage: 'round_already_closed' })
  }

  // Auth gate: must be org owner or contest member
  // Resolve contest_id from category to check ownership
  const { data: category } = await admin
    .from('categories')
    .select('contest_id')
    .eq('id', currentRound.category_id)
    .maybeSingle()
  if (!category) throw createError({ statusCode: 404, statusMessage: 'category_not_found' })
  await requireOrgOwnerOrMember(event, category.contest_id)

  // Validate participantIds belong to this round
  const { data: allRoundParts } = await admin
    .from('round_participants')
    .select('participant_id')
    .eq('round_id', roundId)

  const validIds = new Set((allRoundParts ?? []).map((rp: any) => rp.participant_id))
  const invalid = body.participantIds.filter((pid: string) => !validIds.has(pid))
  if (invalid.length > 0) {
    throw createError({ statusCode: 400, statusMessage: 'invalid_participant_ids' })
  }

  const allPartIds = (allRoundParts ?? []).map((rp: any) => rp.participant_id)
  const notPromotedIds = allPartIds.filter((pid: string) => !body.participantIds.includes(pid))

  // Close current round
  await admin.from('rounds').update({ status: 'closed' }).eq('id', roundId)

  // Mark promoted participants as qualified
  await admin.from('round_participants')
    .update({ is_qualified: true })
    .eq('round_id', roundId)
    .in('participant_id', body.participantIds)

  // Mark non-promoted as not qualified (fires notify_qualified trigger)
  if (notPromotedIds.length > 0) {
    await admin.from('round_participants')
      .update({ is_qualified: false })
      .eq('round_id', roundId)
      .in('participant_id', notPromotedIds)
  }

  // 3. Find/Create next round
  let { data: nextRound } = await admin
    .from('rounds')
    .select('*')
    .eq('category_id', currentRound.category_id)
    .eq('order', currentRound.order + 1)
    .single()

  if (!nextRound) {
    const { data: created, error: createErrorMsg } = await admin
      .from('rounds')
      .insert({
        category_id: currentRound.category_id,
        name: body.nextRoundName || `Ronda ${currentRound.order + 1}`,
        order: currentRound.order + 1,
        status: 'pending',
        scoring_type: currentRound.scoring_type,
        is_final: !!body.isFinal
      })
      .select()
      .single()

    if (createErrorMsg) throw createError({ statusCode: 500, statusMessage: createErrorMsg.message })
    nextRound = created
  }

  // 4. Add participants to next round
  const roundParticipants = body.participantIds.map((pid: string, idx: number) => ({
    round_id: nextRound!.id,
    participant_id: pid,
    order: idx + 1,
    is_qualified: false
  }))

  const { error: insertError } = await admin
    .from('round_participants')
    .insert(roundParticipants)

  if (insertError) throw createError({ statusCode: 500, statusMessage: insertError.message })

  // Send promotion emails (fire-and-forget)
  const allAffected = [...body.participantIds, ...notPromotedIds]
  if (allAffected.length > 0) {
    const [{ data: contestInfo }, { data: participants }] = await Promise.all([
      admin
        .from('categories')
        .select('contests(name, slug)')
        .eq('id', currentRound.category_id)
        .single(),
      admin
        .from('participants')
        .select('id, email, first_name, name')
        .in('id', allAffected)
        .not('email', 'is', null),
    ])

    const contestName = (contestInfo as any)?.contests?.name ?? ''
    const contestSlug = (contestInfo as any)?.contests?.slug ?? null

    for (const p of participants ?? []) {
      if (!p.email) continue
      sendPromotionEmail({
        to: p.email,
        first_name: p.first_name || p.name,
        contest_name: contestName,
        round_name: currentRound.name,
        is_promoted: body.participantIds.includes(p.id),
        is_final: !!body.isFinal,
        contest_slug: contestSlug,
      }).catch((e: any) => { console.error('[promote] email failed:', e?.message) })
    }
  }

  return { success: true, nextRoundId: nextRound.id }
})
