import { defineEventHandler, createError, getRouterParam } from 'h3'
import { serverSupabaseAdmin, requireOrgOwnerOrMember } from '~~/server/utils/supabase'

type RoundAvg = { round_id: string; round_order: number; round_name: string; avg: number | null }

export default defineEventHandler(async (event) => {
  const client = serverSupabaseAdmin()
  const categoryId = getRouterParam(event, 'id')
  if (!categoryId) throw createError({ statusCode: 400, statusMessage: 'Missing category ID' })

  const { data: category } = await client.from('categories').select('contest_id').eq('id', categoryId).maybeSingle()
  if (!category) throw createError({ statusCode: 404, statusMessage: 'category_not_found' })
  await requireOrgOwnerOrMember(event, category.contest_id)

  // Rounds for this category, ordered
  const { data: roundsData, error: roundsError } = await client
    .from('rounds')
    .select('id, name, order')
    .eq('category_id', categoryId)
    .order('order', { ascending: true })

  if (roundsError) throw createError({ statusCode: 500, statusMessage: roundsError.message })
  const rounds = roundsData || []

  // Participants in category
  const { data: participantsData, error: pErr } = await client
    .from('participants')
    .select('id, name, first_name, last_name')
    .eq('category_id', categoryId)

  if (pErr) throw createError({ statusCode: 500, statusMessage: pErr.message })
  const participants = participantsData || []

  if (!rounds.length || !participants.length) {
    return { rounds: [], ranking: [] }
  }

  const roundIds = rounds.map(r => r.id)
  const partIds = participants.map(p => p.id)

  // Scores across all rounds for this category
  const { data: scoresData, error: sErr } = await client
    .from('scores')
    .select('round_id, participant_id, value')
    .in('round_id', roundIds)
    .in('participant_id', partIds)

  if (sErr) throw createError({ statusCode: 500, statusMessage: sErr.message })

  // Overrides on round_participants
  const { data: rpData, error: rpErr } = await client
    .from('round_participants')
    .select('round_id, participant_id, final_score_override')
    .in('round_id', roundIds)
    .in('participant_id', partIds)

  if (rpErr) throw createError({ statusCode: 500, statusMessage: rpErr.message })

  const overrideMap = new Map<string, number>()
  for (const rp of rpData || []) {
    if (rp.final_score_override != null) {
      overrideMap.set(`${rp.round_id}:${rp.participant_id}`, Number(rp.final_score_override))
    }
  }

  // Group scores by (round, participant) → compute average
  const sumCount = new Map<string, { sum: number; count: number }>()
  for (const s of scoresData || []) {
    const key = `${s.round_id}:${s.participant_id}`
    const entry = sumCount.get(key) ?? { sum: 0, count: 0 }
    entry.sum += Number(s.value)
    entry.count += 1
    sumCount.set(key, entry)
  }

  // Build per-participant round array
  const ranking = participants.map(p => {
    const perRound: RoundAvg[] = rounds.map(r => {
      const key = `${r.id}:${p.id}`
      const ov = overrideMap.get(key)
      if (ov != null) return { round_id: r.id, round_order: r.order, round_name: r.name, avg: ov }
      const sc = sumCount.get(key)
      if (!sc || sc.count === 0) return { round_id: r.id, round_order: r.order, round_name: r.name, avg: null }
      return { round_id: r.id, round_order: r.order, round_name: r.name, avg: sc.sum / sc.count }
    })
    const rounds_played = perRound.filter(r => r.avg != null).length
    return { participant_id: p.id, name: p.name, rounds_played, per_round: perRound }
  })

  // Sort: rounds_played DESC, then compare averages last→first (higher wins; null counts as -Infinity)
  ranking.sort((a, b) => {
    if (b.rounds_played !== a.rounds_played) return b.rounds_played - a.rounds_played
    for (let i = rounds.length - 1; i >= 0; i--) {
      const av = a.per_round[i]?.avg ?? -Infinity
      const bv = b.per_round[i]?.avg ?? -Infinity
      if (bv !== av) return bv - av
    }
    return 0
  })

  return {
    rounds: rounds.map(r => ({ id: r.id, name: r.name, order: r.order })),
    ranking: ranking.map((r, i) => ({ ...r, rank: i + 1 })),
  }
})
