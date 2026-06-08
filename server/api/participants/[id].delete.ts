import { defineEventHandler, createError, getRouterParam } from 'h3'
import { serverSupabaseClient, serverSupabaseAdmin, requireOrgOwnerOrMember } from '~~/server/utils/supabase'

export default defineEventHandler(async (event) => {
  const admin  = serverSupabaseAdmin()
  const id = getRouterParam(event, 'id')

  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing ID' })

  // 1. Load participant + parent contest (need contest.status + organization_id)
  const { data: participant, error: partError } = await admin
    .from('participants')
    .select('id, category_id, contest_id, payment_status, contests:contest_id(status, organization_id)')
    .eq('id', id)
    .single() as any

  if (partError || !participant) {
    throw createError({ statusCode: 404, statusMessage: 'Participant not found' })
  }

  // Auth gate — require org owner or contest member
  await requireOrgOwnerOrMember(event, participant.contest_id)

  const contestStatus = participant.contests?.status as string | undefined
  const orgId = participant.contests?.organization_id as string | undefined

  // Block delete when contest is active/finished/cancelled
  if (contestStatus && ['active','finished','cancelled'].includes(contestStatus)) {
    throw createError({ statusCode: 409, statusMessage: 'El concurso ya está en curso. No se pueden gestionar inscripciones.' })
  }

  // 2. Block delete if any round in this category has already started
  const { data: rounds, error: roundsError } = await admin
    .from('rounds')
    .select('status')
    .eq('category_id', participant.category_id)
    .neq('status', 'pending')

  if (roundsError) throw createError({ statusCode: 500, statusMessage: roundsError.message })

  if (rounds && rounds.length > 0) {
    throw createError({
      statusCode: 409,
      statusMessage: 'No se puede eliminar el participante porque las rondas ya han comenzado o finalizado.',
    })
  }

  // 3. Refund ticket if contest is NOT yet activated.
  //    Idempotent at the SQL layer; safe to call always.
  let refunded = false
  if (orgId && contestStatus !== 'active' && contestStatus !== 'finished') {
    const { data: newBalance, error: refErr } = await admin.rpc('refund_ticket', {
      p_org_id:         orgId,
      p_participant_id: participant.id,
      p_contest_id:     participant.contest_id,
    })
    if (refErr) {
      // Non-fatal: log but don't block deletion. Surface in dev console.
      console.error('[participants.delete] refund_ticket failed:', refErr.message)
    } else if (newBalance !== null) {
      refunded = true
    }
  }

  // 4. Delete participant (uses admin client — auth gate already passed)
  const { error: deleteError } = await admin
    .from('participants')
    .delete()
    .eq('id', id)

  if (deleteError) throw createError({ statusCode: 500, statusMessage: deleteError.message })

  return { success: true, refunded }
})
