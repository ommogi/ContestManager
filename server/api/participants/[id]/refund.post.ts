import { defineEventHandler, createError, getRouterParam, readBody } from 'h3'
import { serverSupabaseAdmin, requireOrgOwner } from '~~/server/utils/supabase'
import { getStripe } from '~~/server/utils/stripe'

export default defineEventHandler(async (event) => {
  const { org } = await requireOrgOwner(event)

  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing participant id' })

  const body = await readBody<{ amount_cents?: number; reverse_transfer?: boolean }>(event) || {}

  const admin = serverSupabaseAdmin()

  // Load participant + contest + org (ownership check)
  const { data: participant, error: pErr } = await admin
    .from('participants')
    .select('id, contest_id, stripe_payment_intent_id, amount_paid_cents, amount_refunded_cents, payment_status')
    .eq('id', id)
    .maybeSingle()
  if (pErr) throw createError({ statusCode: 500, statusMessage: pErr.message })
  if (!participant) throw createError({ statusCode: 404, statusMessage: 'participant_not_found' })

  if (!participant.stripe_payment_intent_id || participant.payment_status !== 'paid') {
    throw createError({ statusCode: 400, statusMessage: 'Inscripción no pagada (nada que reembolsar)' })
  }

  const { data: contest, error: cErr } = await admin
    .from('contests')
    .select('organization_id')
    .eq('id', participant.contest_id)
    .single()
  if (cErr || !contest) throw createError({ statusCode: 404, statusMessage: 'contest_not_found' })

  if (contest.organization_id !== org.id) {
    throw createError({ statusCode: 403, statusMessage: 'forbidden' })
  }

  // Compute refund amount (default: full remaining)
  const paid = participant.amount_paid_cents ?? 0
  const already = participant.amount_refunded_cents ?? 0
  const remaining = Math.max(0, paid - already)
  if (remaining <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Ya reembolsado por completo' })
  }
  const amount = body.amount_cents && body.amount_cents > 0
    ? Math.min(body.amount_cents, remaining)
    : remaining

  const stripe = getStripe()
  let refund
  try {
    refund = await stripe.refunds.create({
      payment_intent: participant.stripe_payment_intent_id,
      amount,
      reverse_transfer: body.reverse_transfer !== false, // default true: claw back from connected acct
      refund_application_fee: body.reverse_transfer !== false, // also refund platform fee proportionally
    } as any)
  } catch (err: any) {
    throw createError({ statusCode: 400, statusMessage: `stripe_refund_failed: ${err?.message}` })
  }

  // Optimistic DB update (webhook will also sync)
  const newRefunded = already + amount
  const fullyRefunded = newRefunded >= paid
  await admin.from('participants').update({
    amount_refunded_cents: newRefunded,
    refunded_at: fullyRefunded ? new Date().toISOString() : null,
    payment_status: fullyRefunded ? 'refunded' : 'partial_refund',
    stripe_refund_id: refund.id,
  }).eq('id', id)

  return {
    refund_id: refund.id,
    amount_cents: amount,
    status: fullyRefunded ? 'refunded' : 'partial_refund',
  }
})
