import { defineEventHandler, createError, getRouterParam, readBody } from 'h3'
import { serverSupabaseAdmin, requireOrgOwner, internalError } from '~~/server/utils/supabase'
import { getStripe } from '~~/server/utils/stripe'
import { notifyOrganization } from '~~/server/services/org-notifications'
import { RefundBodySchema } from '~~/server/utils/schemas'

export default defineEventHandler(async (event) => {
  const { org } = await requireOrgOwner(event)

  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing participant id' })

  const rawBody = await readBody(event) || {}
  const parsed = RefundBodySchema.safeParse(rawBody)
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid request', data: parsed.error.issues })
  }
  const body = parsed.data

  const admin = serverSupabaseAdmin()

  // Load participant + contest + org (ownership check)
  const { data: participant, error: pErr } = await admin
    .from('participants')
    .select('id, contest_id, stripe_payment_intent_id, amount_paid_cents, amount_refunded_cents, payment_status')
    .eq('id', id)
    .maybeSingle()
  if (pErr) throw internalError(event, pErr, 'participants.select')
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
      reverse_transfer: body.reverse_transfer,
      refund_application_fee: body.reverse_transfer,
    }, {
      idempotencyKey: `refund:${participant.id}:${remaining}:${amount}`,
    })
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

  // KAN-29. The key includes the refund id: a second, later refund of the same
  // participant is a different event and is reported again.
  void notifyOrganization(admin as never, {
    contestId: participant.contest_id,
    event: 'refund_issued',
    entityId: `${participant.id}:${refund.id}`,
    subject: 'Reembolso emitido',
    title: fullyRefunded ? 'Reembolso completo emitido' : 'Reembolso parcial emitido',
    lines: [`Se ha reembolsado ${(amount / 100).toFixed(2)} € de una inscripción.`],
    facts: [
      { label: 'Importe', value: `${(amount / 100).toFixed(2)} €` },
      { label: 'Estado', value: fullyRefunded ? 'Reembolsado' : 'Reembolso parcial' },
    ],
    payload: { refund_id: refund.id, amount_cents: amount },
  })

  return {
    refund_id: refund.id,
    amount_cents: amount,
    status: fullyRefunded ? 'refunded' : 'partial_refund',
  }
})
