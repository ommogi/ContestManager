import { defineEventHandler, createError, getRouterParam } from 'h3'
import { serverSupabaseAdmin, requireAuth } from '~~/server/utils/supabase'
import { getStripe } from '~~/server/utils/stripe'

export default defineEventHandler(async (event) => {
  const user = requireAuth(event)

  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing participant id' })

  const admin = serverSupabaseAdmin()

  const { data: p, error: pErr } = await admin
    .from('participants')
    .select('id, user_id, stripe_payment_intent_id, payment_status, amount_paid_cents, amount_refunded_cents, created_at')
    .eq('id', id)
    .maybeSingle()
  if (pErr) throw createError({ statusCode: 500, statusMessage: pErr.message })
  if (!p) throw createError({ statusCode: 404, statusMessage: 'participant_not_found' })
  if (p.user_id !== user.id) throw createError({ statusCode: 403, statusMessage: 'forbidden' })
  if (!p.stripe_payment_intent_id) {
    throw createError({ statusCode: 404, statusMessage: 'no_payment_intent' })
  }

  const stripe = getStripe()
  try {
    const pi = await stripe.paymentIntents.retrieve(p.stripe_payment_intent_id, {
      expand: ['latest_charge', 'latest_charge.refunds'],
    } as any)
    const charge: any = (pi as any).latest_charge
    const receiptUrl: string | null = charge?.receipt_url ?? null
    const refundId: string | null = charge?.refunds?.data?.[0]?.id ?? null
    return {
      receipt_url: receiptUrl,
      refund_id: refundId,
      payment_status: p.payment_status,
      amount_paid_cents: p.amount_paid_cents,
      amount_refunded_cents: p.amount_refunded_cents,
      paid_at: p.created_at,
    }
  } catch (err: any) {
    throw createError({ statusCode: 500, statusMessage: `stripe_error: ${err?.message || 'unknown'}` })
  }
})
