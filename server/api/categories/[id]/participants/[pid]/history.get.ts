import { defineEventHandler, createError, getRouterParam } from 'h3'
import { serverSupabaseAdmin, requireContestOrganizer, internalError } from '~~/server/utils/supabase'

export default defineEventHandler(async (event) => {
  const client = serverSupabaseAdmin()
  const categoryId = getRouterParam(event, 'id')
  const participantId = getRouterParam(event, 'pid')
  if (!categoryId || !participantId) throw createError({ statusCode: 400, statusMessage: 'Missing ID' })

  const { data: category } = await client.from('categories').select('contest_id').eq('id', categoryId).maybeSingle()
  if (!category) throw createError({ statusCode: 404, statusMessage: 'category_not_found' })
  await requireContestOrganizer(event, category.contest_id)

  const { data: participant, error: pErr } = await client
    .from('participants')
    .select('id, name, first_name, last_name')
    .eq('id', participantId)
    .single()
  if (pErr || !participant) throw createError({ statusCode: 404, statusMessage: 'Participant not found' })

  const { data: rounds, error: rErr } = await client
    .from('rounds')
    .select('id, name, order, is_ranking, is_final')
    .eq('category_id', categoryId)
    .order('order', { ascending: true })
  if (rErr) throw internalError(event, rErr, 'rounds.select')
  const rows = (rounds || []).filter(r => !r.is_ranking)

  const roundIds = rows.map(r => r.id)
  if (!roundIds.length) return { participant, rounds: [] }

  const { data: scores, error: sErr } = await client
    .from('scores')
    .select('id, round_id, value, judge_id, created_at')
    .eq('participant_id', participantId)
    .in('round_id', roundIds)
  if (sErr) throw internalError(event, sErr, 'scores.select')

  const { data: rps, error: rpErr } = await client
    .from('round_participants')
    .select('round_id, final_score_override, is_qualified')
    .eq('participant_id', participantId)
    .in('round_id', roundIds)
  if (rpErr) throw internalError(event, rpErr, 'round_participants.select')

  const judgeIds = Array.from(new Set((scores || []).map(s => s.judge_id).filter(Boolean)))
  // Judge name: the profile's full name, else the email the judge was invited
  // with, else a generic label — never the raw id.
  const judgeMap: Record<string, string> = {}
  if (judgeIds.length) {
    const [{ data: profs, error: profErr }, { data: members, error: memErr }] = await Promise.all([
      client.from('profiles').select('id, full_name').in('id', judgeIds as string[]),
      client.from('contest_members').select('user_id, email').eq('contest_id', (category as any).contest_id).in('user_id', judgeIds as string[]),
    ])
    if (profErr) throw internalError(event, profErr, 'profiles.select')
    if (memErr) throw internalError(event, memErr, 'contest_members.select')
    for (const m of (members || []) as { user_id: string | null; email: string | null }[]) if (m.user_id && m.email) judgeMap[m.user_id] = m.email
    for (const p of (profs || []) as { id: string; full_name: string | null }[]) if (p.full_name) judgeMap[p.id] = p.full_name
  }

  const result = rows.map(r => {
    const rp = (rps || []).find(x => x.round_id === r.id)
    const sList = (scores || []).filter(s => s.round_id === r.id)
    const avg = sList.length ? sList.reduce((a, s) => a + Number(s.value), 0) / sList.length : null
    return {
      round_id: r.id,
      round_name: r.name,
      round_order: r.order,
      is_final: r.is_final,
      is_qualified: rp?.is_qualified ?? null,
      override: rp?.final_score_override ?? null,
      avg,
      scores: sList.map(s => ({ judge_id: s.judge_id, judge_name: s.judge_id ? (judgeMap[s.judge_id] || 'Jurado') : '—', value: Number(s.value), created_at: s.created_at })),
    }
  })

  return { participant, rounds: result }
})
