import { defineEventHandler, getHeader, readRawBody, createError, setResponseStatus } from 'h3'
import { serverSupabaseAdmin } from '~~/server/utils/supabase'
import { getStripe } from '~~/server/utils/stripe'
import { sendEnrollmentEmail } from '~~/server/utils/email'
import type Stripe from 'stripe'

async function handleBundle(evt: Stripe.Event, session: Stripe.Checkout.Session) {
  const orgId = session.metadata?.organization_id
  const plan  = session.metadata?.plan
  if (!orgId || !plan) return { ignored: 'missing_metadata' }
  if (session.payment_status !== 'paid') return { ignored: `payment_status:${session.payment_status}` }

  const admin = serverSupabaseAdmin()
  const { error } = await admin.rpc('credit_bundle', {
    p_org_id: orgId,
    p_plan: plan,
    p_stripe_session_id: session.id,
    p_stripe_event_id: evt.id,
  })
  if (error) throw new Error(`credit_bundle: ${error.message}`)
  return { credited: true }
}

async function handleTicketsTopup(evt: Stripe.Event, session: Stripe.Checkout.Session) {
  const orgId = session.metadata?.organization_id
  const qty = parseInt(session.metadata?.quantity || '0', 10)
  if (!orgId || !qty || qty <= 0) return { ignored: 'missing_metadata' }
  if (session.payment_status !== 'paid') return { ignored: `payment_status:${session.payment_status}` }

  const admin = serverSupabaseAdmin()
  const { error } = await admin.rpc('credit_tickets', {
    p_org_id:            orgId,
    p_quantity:          qty,
    p_price_cents:       session.amount_total ?? 0,
    p_stripe_session_id: session.id,
    p_stripe_event_id:   evt.id,
  })
  if (error) throw new Error(`credit_tickets: ${error.message}`)
  return { credited_tickets: qty }
}

async function handleActivationsTopup(evt: Stripe.Event, session: Stripe.Checkout.Session) {
  const orgId = session.metadata?.organization_id
  const qty = parseInt(session.metadata?.quantity || '0', 10)
  if (!orgId || !qty || qty <= 0) return { ignored: 'missing_metadata' }
  if (session.payment_status !== 'paid') return { ignored: `payment_status:${session.payment_status}` }

  const admin = serverSupabaseAdmin()
  const { error } = await admin.rpc('credit_activations', {
    p_org_id:            orgId,
    p_quantity:          qty,
    p_price_cents:       session.amount_total ?? 0,
    p_stripe_session_id: session.id,
    p_stripe_event_id:   evt.id,
  })
  if (error) throw new Error(`credit_activations: ${error.message}`)
  return { credited_activations: qty }
}

async function handleEnrollment(evt: Stripe.Event, session: Stripe.Checkout.Session) {
  if (session.payment_status !== 'paid') return { ignored: `payment_status:${session.payment_status}` }

  const m = session.metadata || {}
  if (!m.token || !m.user_id || !m.category_id) return { ignored: 'missing_enrollment_metadata' }

  const admin = serverSupabaseAdmin()
  const paymentIntent =
    typeof session.payment_intent === 'string'
      ? session.payment_intent
      : session.payment_intent?.id ?? null

  const { data, error } = await admin.rpc('enroll_participant_paid', {
    p_user_id:         m.user_id,
    p_token:           m.token,
    p_category_id:     m.category_id,
    p_first_name:      m.first_name,
    p_last_name:       m.last_name,
    p_birthdate:       m.birthdate,
    p_dni:             m.dni || null,
    p_country:         m.country || null,
    p_email:           m.email || null,
    p_phone:           m.phone || null,
    p_session_id:      session.id,
    p_payment_intent:  paymentIntent,
    p_amount_cents:    session.amount_total ?? 0,
  })
  if (error) throw new Error(`enroll_participant_paid: ${error.message}`)

  // Fire-and-forget confirmation email
  const recipient = m.email || session.customer_email || session.customer_details?.email
  if (recipient) {
    try {
      const { data: ctx } = await admin
        .from('participants')
        .select('contests(name, slug), categories(name), first_name, amount_paid_cents')
        .eq('id', data)
        .single() as any
      await sendEnrollmentEmail({
        to: recipient,
        first_name: ctx?.first_name ?? m.first_name ?? null,
        contest_name: ctx?.contests?.name ?? 'Concurso',
        category_name: ctx?.categories?.name ?? '',
        amount_paid_cents: ctx?.amount_paid_cents ?? session.amount_total ?? null,
        is_paid: true,
        contest_slug: ctx?.contests?.slug ?? null,
      })
    } catch (e: any) {
      console.error('[webhook] enrollment email failed:', e?.message)
    }
  }

  return { participant_id: data }
}

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
    evt = stripe.webhooks.constructEvent(raw as any, sig, secret)
  } catch (err: any) {
    console.error('[stripe webhook] sig verify failed:', err?.message)
    throw createError({ statusCode: 400, statusMessage: `invalid_signature: ${err?.message}` })
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

  if (evt.type === 'checkout.session.completed') {
    const session = evt.data.object as Stripe.Checkout.Session
    const type = session.metadata?.type

    try {
      if (type === 'enrollment') {
        const r = await handleEnrollment(evt, session)
        return { received: true, ...r }
      }
      if (type === 'tickets') {
        const r = await handleTicketsTopup(evt, session)
        return { received: true, ...r }
      }
      if (type === 'activations') {
        const r = await handleActivationsTopup(evt, session)
        return { received: true, ...r }
      }
      // Default (bundle purchase — metadata has plan)
      const r = await handleBundle(evt, session)
      return { received: true, ...r }
    } catch (err: any) {
      console.error('[stripe webhook] handler failed:', err?.message)
      throw createError({ statusCode: 500, statusMessage: err?.message || 'handler_failed' })
    }
  }

  return { received: true }
})
