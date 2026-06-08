import { defineEventHandler, getHeader, readRawBody, createError, setResponseStatus } from 'h3'
import { serverSupabaseAdmin } from '~~/server/utils/supabase'
import { getStripe } from '~~/server/utils/stripe'
import {
  handleBundle,
  handleTicketsTopup,
  handleActivationsTopup,
  handleEnrollment,
} from '~~/server/services/stripe-webhook'
import type Stripe from 'stripe'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const secret = config.stripeWebhookSecret
  if (!secret) throw createError({ statusCode: 500, statusMessage: 'webhook_secret_missing' })

  const sig = getHeader(event, 'stripe-signature') || ''
  const raw = await readRawBody(event)
  if (!raw) throw createError({ statusCode: 400, statusMessage: 'no_body' })

  const stripe = getStripe()
  let evt: Stripe.Event
  try {
    evt = stripe.webhooks.constructEvent(raw, sig, secret)
  } catch (err: any) {
    console.error('[stripe webhook] sig verify failed:', err?.message)
    throw createError({ statusCode: 400, statusMessage: 'invalid_signature' })
  }

  // Idempotency: guard against duplicate event processing
  const admin = serverSupabaseAdmin()
  const { data: existingEvent } = await admin
    .from('processed_stripe_events')
    .select('stripe_event_id')
    .eq('stripe_event_id', evt.id)
    .maybeSingle()

  if (existingEvent) {
    setResponseStatus(event, 200)
    return { received: true, ignored: 'already_processed' }
  }

  // Account onboarding status sync (Connect)
  if (evt.type === 'account.updated') {
    const acc = evt.data.object as Stripe.Account
    try {
      const admin = serverSupabaseAdmin()
      await admin.from('organizations').update({
        stripe_onboarding_done: !!acc.details_submitted,
        stripe_charges_enabled: !!acc.charges_enabled,
        stripe_payouts_enabled: !!acc.payouts_enabled,
      }).eq('stripe_account_id', acc.id)
    } catch (e: any) {
      console.error('[stripe webhook] account.updated sync failed:', e?.message)
    }
    setResponseStatus(event, 200)
    return { received: true }
  }

  // Refund handling: mark participant as refunded
  if (evt.type === 'charge.refunded' || evt.type === 'charge.refund.updated') {
    const charge = evt.data.object as Stripe.Charge
    const paymentIntent =
      typeof charge.payment_intent === 'string'
        ? charge.payment_intent
        : charge.payment_intent?.id ?? null
    if (!paymentIntent) {
      setResponseStatus(event, 200)
      return { received: true, ignored: 'no_payment_intent' }
    }
    try {
      const admin = serverSupabaseAdmin()
      const refunded = charge.amount_refunded ?? 0
      const total    = charge.amount ?? 0
      const fullyRefunded = refunded > 0 && refunded >= total
      const refundId = charge.refunds?.data?.[0]?.id ?? null
      await admin.from('participants').update({
        amount_refunded_cents: refunded,
        refunded_at: fullyRefunded ? new Date().toISOString() : null,
        payment_status: fullyRefunded ? 'refunded' : (refunded > 0 ? 'partial_refund' : 'paid'),
        stripe_refund_id: refundId,
      }).eq('stripe_payment_intent_id', paymentIntent)
    } catch (e: any) {
      console.error('[stripe webhook] refund sync failed:', e?.message)
    }
    setResponseStatus(event, 200)
    return { received: true }
  }

  // ─── Atomic idempotency: mark event as processing BEFORE handler ───────────
  // If insert succeeds, we own this event. If handler fails, we delete the row
  // so Stripe can retry. If insert fails with 23505, event already processed.
  let eventMarked = false
  try {
    await admin.from('processed_stripe_events').insert({
      stripe_event_id: evt.id,
      event_type: evt.type,
    })
    eventMarked = true
  } catch (e: any) {
    if (e?.code === '23505') {
      setResponseStatus(event, 200)
      return { received: true, ignored: 'already_processed' }
    }
    console.error('[stripe webhook] failed to mark event processing:', e?.message)
    throw createError({ statusCode: 500, statusMessage: 'idempotency_lock_failed' })
  }

  let handlerResult: Record<string, any> = { received: true }

  if (evt.type === 'checkout.session.completed') {
    const session = evt.data.object as Stripe.Checkout.Session
    const type = session.metadata?.type

    try {
      if (type === 'enrollment') {
        handlerResult = { received: true, ...(await handleEnrollment(admin, evt, session)) }
      } else if (type === 'tickets') {
        handlerResult = { received: true, ...(await handleTicketsTopup(admin, evt, session)) }
      } else if (type === 'activations') {
        handlerResult = { received: true, ...(await handleActivationsTopup(admin, evt, session)) }
      } else {
        // Default (bundle purchase — metadata has plan)
        handlerResult = { received: true, ...(await handleBundle(admin, evt, session)) }
      }
    } catch (err: any) {
      console.error('[stripe webhook] handler failed:', err?.message)
      // Rollback idempotency lock so Stripe can retry
      if (eventMarked) {
        await admin.from('processed_stripe_events').delete().eq('stripe_event_id', evt.id)
          .catch((delErr: any) => console.error('[stripe webhook] rollback failed:', delErr?.message))
      }
      throw createError({ statusCode: 500, statusMessage: 'handler_failed' })
    }
  }

  return handlerResult
})
