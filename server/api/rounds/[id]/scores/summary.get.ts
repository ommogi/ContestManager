import { defineEventHandler, createError, getRouterParam } from 'h3'
import { serverSupabaseAdmin, requireOrgOwnerOrMember } from '~~/server/utils/supabase'

export default defineEventHandler(async (event) => {
  const client = serverSupabaseAdmin()
  const roundId = getRouterParam(event, 'id')

  if (!roundId) throw createError({ statusCode: 400, statusMessage: 'Missing Round ID' })

  // 1. Get round info to find contest_id
  const { data: roundData, error: roundError } = await client
    .from('rounds')
    .select('category_id, categories!inner(contest_id)')
    .eq('id', roundId)
    .single()

  if (roundError || !roundData) throw createError({ statusCode: 404, statusMessage: 'Round not found' })
  const categories = Array.isArray(roundData.categories) ? roundData.categories[0] : roundData.categories
  const contestId = (categories as { contest_id: string } | null | undefined)?.contest_id
  if (!contestId) throw createError({ statusCode: 500, statusMessage: 'Could not resolve contest ID' })

  // Auth gate — require org owner or contest member
  await requireOrgOwnerOrMember(event, contestId)

  // 2. Get judges with avatar_url via RPC (same logic as judge pool: email → auth.users → profiles)
  const { data: allMembers, error: judgesError } = await client
    .rpc('get_contest_members_with_avatar', { p_contest_id: contestId })

  if (judgesError) throw createError({ statusCode: 500, statusMessage: judgesError.message })

  const judges = ((allMembers ?? []) as Array<{
    id: string; user_id: string | null; full_name: string | null
    email: string | null; role: string; avatar_url: string | null
  }>)
    .filter(j => j.role === 'judge')
    .map(j => ({
      id: j.id,
      user_id: j.user_id ?? j.id,
      name: j.full_name || j.email || `Juez ${j.id.substring(0, 4)}`,
      email: j.email,
      avatar_url: j.avatar_url ?? null,
    }))

  const judgeCount = judges.length

  // 3. Get all scores + round_participants (all of them, not just those with scores)
  const [{ data: scores, error: scoresError }, { data: roundParticipants }] = await Promise.all([
    client
      .from('scores')
      .select('participant_id, judge_id, value, notes, promote, submitted_at, set_by_admin, admin_user_id')
      .eq('round_id', roundId),
    client
      .from('round_participants')
      .select('participant_id, final_score_override, final_score_override_by, final_score_override_at, final_score_override_notes')
      .eq('round_id', roundId),
  ])

  if (scoresError) throw createError({ statusCode: 500, statusMessage: scoresError.message })

  const overrideMap: Record<string, { final_score_override: number | null; final_score_override_by: string | null; final_score_override_at: string | null; final_score_override_notes: string | null }> = {}
  for (const rp of roundParticipants ?? []) {
    overrideMap[rp.participant_id] = {
      final_score_override: rp.final_score_override != null ? Number(rp.final_score_override) : null,
      final_score_override_by: rp.final_score_override_by,
      final_score_override_at: rp.final_score_override_at,
      final_score_override_notes: rp.final_score_override_notes,
    }
  }

  // 4. Summarize per participant — start from all round_participants so overrides are always visible
  const summary: Record<string, { total: number; count: number; promotes: number; judgeScores: any[] }> = {}

  // Seed all round_participants so even those without scores appear
  for (const rp of roundParticipants ?? []) {
    if (!summary[rp.participant_id]) {
      summary[rp.participant_id] = { total: 0, count: 0, promotes: 0, judgeScores: [] }
    }
  }

  for (const s of scores ?? []) {
    if (!summary[s.participant_id]) {
      summary[s.participant_id] = { total: 0, count: 0, promotes: 0, judgeScores: [] }
    }
    const entry = summary[s.participant_id]!
    entry.total += Number(s.value)
    entry.count += 1
    if (s.promote) entry.promotes += 1
    entry.judgeScores.push({
      judge_id: s.judge_id,
      value: s.value,
      notes: s.notes,
      promote: s.promote ?? false,
      submitted_at: s.submitted_at,
      set_by_admin: s.set_by_admin ?? false,
      admin_user_id: s.admin_user_id ?? null,
    })
  }

  const participant_summaries = Object.entries(summary).map(([participantId, val]) => {
    const override = overrideMap[participantId] ?? null
    const average = val.count > 0 ? val.total / val.count : 0
    return {
      participant_id: participantId,
      average,
      final_score: override?.final_score_override ?? average,
      has_override: override?.final_score_override != null,
      final_score_override: override?.final_score_override ?? null,
      final_score_override_by: override?.final_score_override_by ?? null,
      final_score_override_at: override?.final_score_override_at ?? null,
      final_score_override_notes: override?.final_score_override_notes ?? null,
      total: val.total,
      promotes: val.promotes,
      score_count: val.count,
      is_fully_scored: (override?.final_score_override != null) || (judgeCount > 0 ? val.count >= judgeCount : val.count > 0),
      missing_judges: Math.max(0, judgeCount - val.count),
      judge_details: val.judgeScores
    }
  })

  return {
    judges,
    participant_summaries,
    all_scored: participant_summaries.length > 0 && participant_summaries.every(r => r.is_fully_scored)
  }
})
