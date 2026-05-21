import { defineEventHandler, createError, getRouterParam, readBody } from 'h3'
import { serverSupabaseAdmin, requireOrgOwnerOrMember } from '~~/server/utils/supabase'
import { sendRankingPublishedEmail } from '~~/server/utils/email'

export default defineEventHandler(async (event) => {
  const admin = serverSupabaseAdmin()
  const id = getRouterParam(event, 'id')
  const body = await readBody(event)

  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing ID' })

  // Auth gate: must be org owner or contest member
  // Resolve contest_id from round → category → contest
  const { data: roundInfo } = await admin
    .from('rounds')
    .select('category_id')
    .eq('id', id)
    .maybeSingle()
  if (!roundInfo) throw createError({ statusCode: 404, statusMessage: 'Round not found' })
  const { data: category } = await admin
    .from('categories')
    .select('contest_id')
    .eq('id', roundInfo.category_id)
    .maybeSingle()
  if (!category) throw createError({ statusCode: 404, statusMessage: 'category_not_found' })
  await requireOrgOwnerOrMember(event, category.contest_id)

  // Gate: if activating a round, the parent contest must be active
  if (body?.status === 'active') {
    const { data: contestInfo, error: contestErr } = await admin
      .from('categories')
      .select('contests!inner(status)')
      .eq('id', roundInfo.category_id)
      .single()
    if (contestErr) {
      throw createError({ statusCode: 500, statusMessage: contestErr.message })
    }
    const contestStatus = (contestInfo as any)?.contests?.status
    if (contestStatus !== 'active') {
      throw createError({
        statusCode: 400,
        statusMessage: 'El concurso debe estar activo para iniciar una ronda',
      })
    }
  }

  // Read current state before update to detect is_published transition
  const { data: prev } = await admin
    .from('rounds')
    .select('is_published, is_ranking, category_id')
    .eq('id', id)
    .single()

  const allowed = ['name', 'order', 'status', 'scoring_type', 'max_score', 'next_round_id', 'is_final', 'is_ranking', 'is_published', 'started_at', 'closed_at']
  const updates: Record<string, any> = {}
  for (const key of allowed) {
    if (key in body) updates[key] = body[key]
  }

  const { data, error } = await admin
    .from('rounds')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) { console.error("[api error]", error.message); throw createError({ statusCode: 500, statusMessage: "internal_error" }) }

  // Send ranking_published emails (fire-and-forget)
  if (!prev?.is_published && data.is_published && data.is_ranking) {
    const { data: catInfo } = await admin
      .from('categories')
      .select('name, contests(name, slug)')
      .eq('id', data.category_id)
      .single()

    const contestName = (catInfo as any)?.contests?.name ?? ''
    const contestSlug = (catInfo as any)?.contests?.slug ?? null
    const categoryName = catInfo?.name ?? ''

    const { data: participants } = await admin
      .from('participants')
      .select('email, first_name, name')
      .eq('category_id', data.category_id)
      .eq('status', 'active')
      .not('email', 'is', null)

    for (const p of participants ?? []) {
      if (!p.email) continue
      sendRankingPublishedEmail({
        to: p.email,
        first_name: p.first_name || p.name,
        contest_name: contestName,
        category_name: categoryName,
        contest_slug: contestSlug,
      }).catch((e: any) => { console.error('[rounds.patch] email failed:', e?.message) })
    }
  }

  return data
})
