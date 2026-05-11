import { defineEventHandler, createError, getRouterParam } from 'h3'
import { serverSupabaseAdmin, requireAuth } from '~~/server/utils/supabase'

export default defineEventHandler(async (event) => {
  const user = requireAuth(event)

  const roundId = getRouterParam(event, 'id')
  if (!roundId) throw createError({ statusCode: 400, statusMessage: 'Missing round id' })

  const client = serverSupabaseAdmin()

  // Get the round with its category and contest
  const { data: round, error: roundError } = await client
    .from('rounds')
    .select(`
      id, name, order, status, scoring_type, max_score, started_at, closed_at, category_id, is_ranking, is_published, is_final,
      categories!inner(
        id, name, description, contest_id,
        contests!inner(id, name, slug, description, type, status, starts_at, ends_at)
      )
    `)
    .eq('id', roundId)
    .single()

  if (roundError || !round) throw createError({ statusCode: 404, statusMessage: 'Round not found' })
  if ((round as any).is_ranking === true && (round as any).is_published !== true) {
    throw createError({ statusCode: 404, statusMessage: 'Round not found' })
  }

  const category = (round as any).categories
  const contest = category.contests

  // Parallel: participant lookup + allSlots + criteria (independent of auth result)
  const [participantRes, allSlotsRes, criteriaRes] = await Promise.all([
    client
      .from('participants')
      .select('id, name, status')
      .eq('user_id', user.id)
      .eq('contest_id', contest.id)
      .eq('category_id', category.id)
      .maybeSingle(),
    client
      .from('round_participants')
      .select(`
        id, participant_id, order, scheduled_at, location, is_qualified,
        participants!inner(id, name, first_name, last_name, country)
      `)
      .eq('round_id', roundId)
      .order('order', { ascending: true }),
    client
      .from('score_criteria')
      .select('id, name, weight, max_value, order')
      .eq('round_id', roundId)
      .order('order', { ascending: true }),
  ])

  const myParticipant = participantRes.data
  if (participantRes.error) throw createError({ statusCode: 500, statusMessage: participantRes.error.message })
  const allSlots = allSlotsRes.data ?? []
  const criteria = criteriaRes.data ?? []

  let isJudge = false
  if (!myParticipant) {
    const [memberByUserIdRes, memberByEmailRes] = await Promise.all([
      client
        .from('contest_members')
        .select('id, role')
        .eq('contest_id', contest.id)
        .eq('user_id', user.id)
        .eq('role', 'judge')
        .maybeSingle(),
      user.email
        ? client
            .from('contest_members')
            .select('id, role')
            .eq('contest_id', contest.id)
            .eq('email', user.email)
            .eq('role', 'judge')
            .is('user_id', null)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ])
    if (memberByUserIdRes.data || memberByEmailRes.data) isJudge = true
    if (!isJudge) throw createError({ statusCode: 403, statusMessage: 'Not a participant or judge in this round' })
  }

  // Slot + scores (parallel)
  const [mySlotRes, myScoresRes] = await Promise.all([
    myParticipant
      ? client
          .from('round_participants')
          .select('id, order, scheduled_at, location, is_qualified')
          .eq('round_id', roundId)
          .eq('participant_id', myParticipant.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    myParticipant
      ? client
          .from('scores')
          .select('id, value, criteria_scores, notes, submitted_at, judge_id')
          .eq('round_id', roundId)
          .eq('participant_id', myParticipant.id)
      : isJudge
        ? client
            .from('scores')
            .select('id, participant_id, value, criteria_scores, notes, submitted_at')
            .eq('round_id', roundId)
            .eq('judge_id', user.id)
        : Promise.resolve({ data: [] }),
  ])
  const mySlot = mySlotRes.data ?? null
  const myScores: any[] = (myScoresRes.data as any[]) ?? []

  // Compute average score if any scores exist
  const avgScore = myScores?.length
    ? myScores.reduce((sum: number, s: any) => sum + s.value, 0) / myScores.length
    : null

  return {
    round: {
      ...round,
      categories: undefined,
    },
    category: {
      id: category.id,
      name: category.name,
      description: category.description,
    },
    contest,
    myParticipant: myParticipant ?? null,
    isJudge,
    mySlot: mySlot ?? null,
    allSlots: allSlots ?? [],
    myScores: myScores ?? [],
    criteria: criteria ?? [],
    avgScore
  }
})
