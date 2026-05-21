import { defineEventHandler, createError, getRouterParam } from 'h3'
import { serverSupabaseAdmin, requireOrgOwnerOrMember } from '~~/server/utils/supabase'
import { getPagination, paginationResponse } from '~~/server/utils/pagination'

export default defineEventHandler(async (event) => {
  const client = serverSupabaseAdmin()
  const roundId = getRouterParam(event, 'id')
  if (!roundId) throw createError({ statusCode: 400, statusMessage: 'Missing round ID' })
  const { page, limit, offset } = getPagination(event, 50, 100)

  // Resolve contest_id → auth gate
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
  if (!cat?.contest_id) throw createError({ statusCode: 500, statusMessage: 'Could not resolve contest' })
  await requireOrgOwnerOrMember(event, cat.contest_id)

  const { data, error, count } = await client
    .from('score_audit_logs')
    .select('*', { count: 'exact' })
    .eq('round_id', roundId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) { console.error("[api error]", error.message); throw createError({ statusCode: 500, statusMessage: "internal_error" }) }

  // Enrich with participant names
  const participantIds = [...new Set((data ?? []).map(l => l.participant_id))]
  const judgeIds = [...new Set((data ?? []).filter(l => l.judge_id).map(l => l.judge_id as string))]

  const [{ data: parts }, { data: profiles }] = await Promise.all([
    client.from('participants').select('id, name').in('id', participantIds),
    judgeIds.length
      ? client.from('profiles').select('id, full_name').in('id', judgeIds)
      : Promise.resolve({ data: [] }),
  ])

  const partMap = Object.fromEntries((parts ?? []).map(p => [p.id, p.name]))
  const profileMap = Object.fromEntries((profiles ?? []).map(p => [p.id, p.full_name]))

  const enriched = (data ?? []).map(log => ({
    ...log,
    participant_name: partMap[log.participant_id] ?? null,
    judge_name: log.judge_id ? (profileMap[log.judge_id] ?? null) : null,
  }))
  return paginationResponse(enriched, page, limit, count ?? undefined)
})
