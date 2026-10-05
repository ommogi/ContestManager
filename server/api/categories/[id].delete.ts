import { defineEventHandler, createError, getRouterParam } from 'h3'
import { serverSupabaseAdmin, requireContestOrganizer, internalError } from '~~/server/utils/supabase'

export default defineEventHandler(async (event) => {
  const client = serverSupabaseAdmin()
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing ID' })

  // Load category with parent contest info
  const { data: category, error: catErr } = await client
    .from('categories')
    .select('id, contest_id, contests:contest_id(status, organization_id)')
    .eq('id', id)
    .single() as any

  if (catErr || !category) {
    throw createError({ statusCode: 404, statusMessage: 'Categoría no encontrada' })
  }

  // Auth gate — organisers only (not judges or viewers)
  await requireContestOrganizer(event, category.contest_id)

  const contestStatus = category.contests?.status as string | undefined
  const orgId = category.contests?.organization_id as string | undefined

  if (!['draft', 'active'].includes(contestStatus || '')) {
    throw createError({ statusCode: 409, statusMessage: 'No se puede eliminar una categoría de un concurso finalizado o cancelado.' })
  }

  const { data: rounds, error: roundsErr } = await client
    .from('rounds')
    .select('status')
    .eq('category_id', id)
    .neq('status', 'pending')

  if (roundsErr) throw internalError(event, roundsErr, 'rounds.select')

  if (rounds && rounds.length > 0) {
    throw createError({
      statusCode: 409,
      statusMessage: 'No se puede eliminar la categoría porque las rondas ya han comenzado o finalizado.',
    })
  }

  let refundedCount = 0
  if (contestStatus === 'draft') {
    const { data: paidParticipants } = await client
      .from('participants')
      .select('id')
      .eq('category_id', id)
      .eq('payment_status', 'paid')

    if (paidParticipants && paidParticipants.length > 0) {
      for (const p of paidParticipants) {
        const { error: refErr } = await client.rpc('refund_ticket', {
          p_org_id: orgId,
          p_participant_id: p.id,
          p_contest_id: category.contest_id,
        })
        if (!refErr) refundedCount++
        else console.error('[categories.delete] refund_ticket failed:', refErr.message)
      }
    }
  }

  const { error: delErr } = await client.from('categories').delete().eq('id', id)
  if (delErr) throw internalError(event, delErr, 'categories.delete')

  return { deleted: id, refundedCount }
})
