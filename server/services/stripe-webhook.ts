import { createClient } from '@supabase/supabase-js'
import type Stripe from 'stripe'
import { sendEnrollmentEmail } from '~~/server/utils/email'
// Relative on purpose: vitest does not resolve Nitro's `~~/` alias, and unlike
// the email util this one is exercised rather than mocked in the tests.
import {
  markPendingFormResponsesConsumed,
  persistParticipantFormResponses,
  readPendingFormResponses,
} from '../utils/inscription-form-responses'

export type SupabaseAdmin = ReturnType<typeof createClient>

export async function handleBundle(admin: SupabaseAdmin, evt: Stripe.Event, session: Stripe.Checkout.Session) {
  const orgId = session.metadata?.organization_id
  const plan  = session.metadata?.plan
  if (!orgId || !plan) return { ignored: 'missing_metadata' }
  if (session.payment_status !== 'paid') return { ignored: `payment_status:${session.payment_status}` }

  const { error } = await admin.rpc('credit_bundle', {
    p_org_id: orgId,
    p_plan: plan,
    p_stripe_session_id: session.id,
    p_stripe_event_id: evt.id,
  })
  if (error) throw new Error(`credit_bundle: ${error.message}`)
  return { credited: true }
}

export async function handleTicketsTopup(admin: SupabaseAdmin, evt: Stripe.Event, session: Stripe.Checkout.Session) {
  const orgId = session.metadata?.organization_id
  const qty = parseInt(session.metadata?.quantity || '0', 10)
  if (!orgId || !qty || qty <= 0) return { ignored: 'missing_metadata' }
  if (session.payment_status !== 'paid') return { ignored: `payment_status:${session.payment_status}` }

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

export async function handleActivationsTopup(admin: SupabaseAdmin, evt: Stripe.Event, session: Stripe.Checkout.Session) {
  const orgId = session.metadata?.organization_id
  const qty = parseInt(session.metadata?.quantity || '0', 10)
  if (!orgId || !qty || qty <= 0) return { ignored: 'missing_metadata' }
  if (session.payment_status !== 'paid') return { ignored: `payment_status:${session.payment_status}` }

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

export async function handleEnrollment(admin: SupabaseAdmin, evt: Stripe.Event, session: Stripe.Checkout.Session) {
  if (session.payment_status !== 'paid') return { ignored: `payment_status:${session.payment_status}` }

  const m = session.metadata || {}
  if (!m.token || !m.user_id || !m.category_id) return { ignored: 'missing_enrollment_metadata' }

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

  // ── Configurable form answers (KAN-49) ─────────────────────────────────────
  //
  // Runs inside the block the route guards with `processed_stripe_events`, and
  // deliberately *before* the email: if this throws, the route drops the
  // idempotency row and answers 500, Stripe redelivers, and the whole handler
  // runs again. That is safe because both writes are idempotent —
  // `enroll_participant_paid` returns the existing participant for a session it
  // has already seen, and the upsert resolves `UNIQUE(participant_id,
  // form_schema_id)` instead of raising 23505. So a redelivery repairs a failed
  // write rather than duplicating a successful one, and a paid inscription
  // never ends up with its answers silently missing.
  const participantId = typeof data === 'string' ? data : null
  const draftId = m.form_draft_id

  if (draftId && participantId) {
    const submission = await readPendingFormResponses(admin, draftId)
    if (submission) {
      await persistParticipantFormResponses(admin, participantId, submission)
      await markPendingFormResponsesConsumed(admin, draftId)
    } else {
      // The draft is gone (pruned, or its schema was deleted). Retrying cannot
      // bring it back, so record it loudly and let the paid enrollment stand
      // rather than making Stripe redeliver forever.
      console.error(
        `[webhook] form draft ${draftId} not found for participant ${participantId}; ` +
        'paid enrollment kept without form responses',
      )
    }
  }

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
