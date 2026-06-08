import { defineEventHandler, createError, getRouterParam } from 'h3'
import { serverSupabaseAdmin, requireAuth } from '~~/server/utils/supabase'
import { getStripe } from '~~/server/utils/stripe'

export default defineEventHandler(async (event) => {
  const user = requireAuth(event)

  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing participant id' })

  const admin = serverSupabaseAdmin()

  // Load participant
  const { data: p, error: pErr } = await admin
    .from('participants')
    .select('id, user_id, category_id, contest_id, stripe_payment_intent_id, amount_paid_cents, amount_refunded_cents, payment_status')
    .eq('id', id)
    .maybeSingle()
  if (pErr) throw createError({ statusCode: 500, statusMessage: pErr.message })
  if (!p) throw createError({ statusCode: 404, statusMessage: 'participant_not_found' })

  // Ownership check: participant must belong to the requesting user
  if (p.user_id !== user.id) throw createError({ statusCode: 403, statusMessage: 'forbidden' })

  // Block if any non-pending rounds in category
  const { data: rounds, error: rErr } = await admin
    .from('rounds')
    .select('status')
    .eq('category_id', p.category_id)
    .neq('status', 'pending')
  if (rErr) throw createError({ statusCode: 500, statusMessage: rErr.message })
  if (rounds && rounds.length > 0) {
    throw createError({
      statusCode: 409,
      statusMessage: 'No puedes cancelar: las rondas ya han comenzado.',
    })
  }

  // If paid, refund remaining amount via Stripe
  let refundInfo: { refund_id: string; amount_cents: number } | null = null
  if (p.stripe_payment_intent_id && p.payment_status === 'paid') {
    const paid = p.amount_paid_cents ?? 0
    const already = p.amount_refunded_cents ?? 0
    const remaining = Math.max(0, paid - already)
    if (remaining > 0) {
      const stripe = getStripe()
      try {
        const refund = await stripe.refunds.create({
          payment_intent: p.stripe_payment_intent_id,
          amount: remaining,
          reverse_transfer: true,
          refund_application_fee: true,
        } as any, {
          idempotencyKey: `cancel:${p.id}:${remaining}`,
        })
        refundInfo = { refund_id: refund.id, amount_cents: remaining }
      } catch (err: any) {
        throw createError({ statusCode: 400, statusMessage: `stripe_refund_failed: ${err?.message}` })
      }
    }
  }

  // Delete participant (trigger notifies org owner)
  const { error: dErr } = await admin.from('participants').delete().eq('id', id)
  if (dErr) {
    console.error('[cancel] delete failed after refund:', dErr.message, 'participant:', id)
    throw createError({ statusCode: 500, statusMessage: 'cancel_partial: participant could not be deleted after refund' })
  }

  return { cancelled: true, refund: refundInfo }
})
