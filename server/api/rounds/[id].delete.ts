import { defineEventHandler, createError, getRouterParam } from 'h3'
import { serverSupabaseAdmin, requireOrgOwnerOrMember } from '~~/server/utils/supabase'

export default defineEventHandler(async (event) => {
  const client = serverSupabaseAdmin()
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing ID' })

  // Fetch round to resolve contest_id for auth check
  const { data: target, error: tErr } = await client
    .from('rounds')
    .select('id, category_id, order, is_ranking')
    .eq('id', id)
    .single()
  if (tErr || !target) throw createError({ statusCode: 404, statusMessage: 'Round not found' })

  // Resolve contest_id → auth gate
  const { data: cat } = await client
    .from('categories')
    .select('contest_id')
    .eq('id', target.category_id)
    .maybeSingle()
  if (!cat?.contest_id) throw createError({ statusCode: 500, statusMessage: 'Could not resolve contest' })
  await requireOrgOwnerOrMember(event, cat.contest_id)

  // Max order in category
  const { data: siblings, error: sErr } = await client
    .from('rounds')
    .select('id, order, status')
    .eq('category_id', target.category_id)
    .order('order', { ascending: false })
  if (sErr) throw createError({ statusCode: 500, statusMessage: sErr.message })

  const list = siblings || []
  const maxOrder = list[0]?.order ?? target.order
  if (target.order !== maxOrder) {
    throw createError({ statusCode: 400, statusMessage: 'Solo se puede eliminar la ronda más reciente' })
  }

  // Check parent contest status before reactivating previous round
  const { data: contestInfo } = await client
    .from('categories')
    .select('contests!inner(status)')
    .eq('id', target.category_id)
    .single()
  const contestStatus = (contestInfo as any)?.contests?.status
  const canReactivate = contestStatus === 'active'

  // Delete (FKs cascade: scores, round_participants, etc.)
  const { error: dErr } = await client.from('rounds').delete().eq('id', id)
  if (dErr) throw createError({ statusCode: 500, statusMessage: dErr.message })

  // Previous round becomes active (clear is_final too — user reopening final round)
  // Only if the parent contest is still active
  const prev = list.find(r => r.id !== id)
  if (prev && canReactivate) {
    const { error: uErr } = await client
      .from('rounds')
      .update({ status: 'active', closed_at: null, is_final: false })
      .eq('id', prev.id)
    if (uErr) throw createError({ statusCode: 500, statusMessage: uErr.message })
  }

  // If deleted round was ranking, reopen category
  let categoryReopened = false
  if ((target as any).is_ranking) {
    const { error: cErr } = await client
      .from('categories')
      .update({ status: 'active' })
      .eq('id', target.category_id)
    if (!cErr) categoryReopened = true
  }

  return { deleted: id, reactivated: (prev && canReactivate) ? prev.id : null, categoryReopened }
})
