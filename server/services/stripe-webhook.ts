import { createClient } from '@supabase/supabase-js'
import type Stripe from 'stripe'
import { sendEnrollmentEmail } from '~~/server/utils/email'
// Relative on purpose: vitest does not resolve Nitro's `~~/` alias, and unlike
// the email util this one is exercised rather than mocked in the tests.
import {
  collectUploadPaths,
  confirmInscriptionUploads,
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

      // ── Confirm the uploaded files (KAN-49) ────────────────────────────────
      //
      // This is the only moment on the paid path where the participant row
      // exists, so it is the only moment the files a participant uploaded
      // before Checkout can be attached to it. Until it runs they are still
      // `pending` in `inscription_uploads` and
      // `sweep_orphan_inscription_uploads` marks them purgeable after 24 hours
      // — which would leave a PAID inscription whose answers point at deleted
      // objects. The same call purges what the participant picked and then
      // discarded, hence calling it even for an empty path list.
      //
      // Failure policy: let it throw, so Stripe retries. That is the same
      // reasoning as the answer write above and it holds because every write in
      // this handler is idempotent — `enroll_participant_paid` returns the
      // existing participant for a session it has seen, the answers are an
      // upsert on the unique pair, and `confirm_inscription_uploads` filters on
      // `confirmed_at IS NULL` so a redelivery is a no-op for rows already
      // confirmed. A retry therefore repairs a failed confirmation instead of
      // duplicating a successful one, and the draft is only stamped consumed
      // afterwards so a retry can still read it.
      //
      // The one absorbed case is an empty path list: nothing the answers
      // reference is at risk, only the early purge of discarded uploads, which
      // the orphan sweep performs anyway. Making Stripe redeliver a paid event
      // over that would be disproportionate.
      const uploadPaths = collectUploadPaths(submission.responses)
      try {
        await confirmInscriptionUploads(admin, {
          contestId: submission.contestId,
          userId: m.user_id,
          participantId,
          paths: uploadPaths,
        })
      } catch (e) {
        console.error(
          `[webhook] uploads not confirmed for participant ${participantId} ` +
          `(contest ${submission.contestId}, ${uploadPaths.length} file(s)):`,
          (e as Error)?.message,
        )
        if (uploadPaths.length > 0) throw e
      }

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

// ─────────────────────────────────────────────────────────────────────────────
// Dispatch + idempotency (KAN-51)
// ─────────────────────────────────────────────────────────────────────────────
//
// Lives here rather than in `server/api/stripe/webhook.post.ts` so it can be
// unit-tested: vitest resolves neither Nitro's `~~/` alias nor its auto-imports,
// which is why every tested unit in this repo is a service or a util and the
// route handlers stay thin. The route keeps signature verification — the one
// step that must own the raw body — and maps the outcome to HTTP.

// Relative on purpose, same reason as the imports at the top of this file.
import {
  claimStripeEvent,
  releaseStripeEvent,
  wasStripeEventProcessed,
} from '../utils/stripe-idempotency'

/**
 * Event types this endpoint acts on.
 *
 * Anything outside the set is acknowledged and deliberately NOT recorded in
 * `processed_stripe_events`: the ledger exists to make handlers idempotent and
 * auditable, and a row for an event nobody handles carries no information while
 * growing the table with every `invoice.*` and `payment_intent.*` Stripe sends.
 */
export const HANDLED_EVENT_TYPES = new Set<string>([
  'account.updated',
  'charge.refunded',
  'charge.refund.updated',
  'checkout.session.completed',
])

export class StripeWebhookError extends Error {
  constructor(
    readonly code: 'idempotency_lookup_failed' | 'idempotency_lock_failed' | 'handler_failed',
    message: string,
  ) {
    super(message)
    this.name = 'StripeWebhookError'
  }
}

/**
 * Connect onboarding status sync.
 *
 * Absolute values copied from the account object, so a redelivery is a no-op
 * rather than a double-apply. Matching zero rows is normal — the account may
 * not be ours — and is not an error.
 */
export async function syncConnectAccount(admin: SupabaseAdmin, acc: Stripe.Account) {
  // supabase-js resolves with `{ data, error }` and never throws, so the error
  // is read rather than caught. The previous try/catch here was dead code.
  const { error } = await admin.from('organizations').update({
    stripe_onboarding_done: !!acc.details_submitted,
    stripe_charges_enabled: !!acc.charges_enabled,
    stripe_payouts_enabled: !!acc.payouts_enabled,
  }).eq('stripe_account_id', acc.id)

  if (error) throw new Error(`organizations.update: ${error.message}`)
  return { synced: true }
}

/**
 * Refund sync.
 *
 * Every written value is derived from the charge itself (`amount_refunded`,
 * `amount`), never incremented, so reprocessing leaves the row identical.
 * `payment_status` stays inside the allowed enum.
 */
export async function syncRefund(admin: SupabaseAdmin, charge: Stripe.Charge, paymentIntent: string) {
  const refunded = charge.amount_refunded ?? 0
  const total = charge.amount ?? 0
  const fullyRefunded = refunded > 0 && refunded >= total

  const { error } = await admin.from('participants').update({
    amount_refunded_cents: refunded,
    refunded_at: fullyRefunded ? new Date().toISOString() : null,
    payment_status: fullyRefunded ? 'refunded' : (refunded > 0 ? 'partial_refund' : 'paid'),
    stripe_refund_id: charge.refunds?.data?.[0]?.id ?? null,
  }).eq('stripe_payment_intent_id', paymentIntent)

  if (error) throw new Error(`participants.update: ${error.message}`)
  return { refunded: true }
}

async function runCheckoutSession(admin: SupabaseAdmin, evt: Stripe.Event, session: Stripe.Checkout.Session) {
  switch (session.metadata?.type) {
    case 'enrollment':  return handleEnrollment(admin, evt, session)
    case 'tickets':     return handleTicketsTopup(admin, evt, session)
    case 'activations': return handleActivationsTopup(admin, evt, session)
    // Default: bundle purchase — metadata carries the plan.
    default:            return handleBundle(admin, evt, session)
  }
}

/**
 * Claims the event, dispatches it, and releases the claim if the handler fails.
 *
 * Before KAN-51 `account.updated` and the two refund types returned before
 * reaching the claim, so only `checkout.session.completed` was protected and
 * the other two left no trace in the ledger to reconstruct a payments incident
 * from.
 *
 * @throws StripeWebhookError so the caller can answer 5xx and let Stripe retry.
 */
export async function processStripeEvent(admin: SupabaseAdmin, evt: Stripe.Event) {
  let alreadyProcessed: boolean
  try {
    alreadyProcessed = await wasStripeEventProcessed(admin, evt.id)
  } catch (e: any) {
    // An unreadable ledger must not be mistaken for an empty one, or every
    // retry re-runs the handler and re-credits balances.
    throw new StripeWebhookError('idempotency_lookup_failed', e?.message ?? 'lookup failed')
  }

  if (alreadyProcessed) return { received: true as const, ignored: 'already_processed' }

  if (!HANDLED_EVENT_TYPES.has(evt.type)) {
    return { received: true as const, ignored: 'unhandled_event_type' }
  }

  let claim: Awaited<ReturnType<typeof claimStripeEvent>>
  try {
    claim = await claimStripeEvent(admin, evt.id, evt.type)
  } catch (e: any) {
    throw new StripeWebhookError('idempotency_lock_failed', e?.message ?? 'claim failed')
  }

  if (claim === 'already_processed') {
    return { received: true as const, ignored: 'already_processed' }
  }

  try {
    if (evt.type === 'account.updated') {
      return { received: true as const, ...(await syncConnectAccount(admin, evt.data.object as Stripe.Account)) }
    }

    if (evt.type === 'charge.refunded' || evt.type === 'charge.refund.updated') {
      const charge = evt.data.object as Stripe.Charge
      const paymentIntent =
        typeof charge.payment_intent === 'string'
          ? charge.payment_intent
          : charge.payment_intent?.id ?? null

      if (!paymentIntent) {
        // Not one of our charges: nothing to reconcile. Release the claim
        // rather than keeping a ledger row for an event we did not act on,
        // matching how an unhandled type is treated above.
        await releaseStripeEvent(admin, evt.id)
        return { received: true as const, ignored: 'no_payment_intent' }
      }

      return { received: true as const, ...(await syncRefund(admin, charge, paymentIntent)) }
    }

    const session = evt.data.object as Stripe.Checkout.Session
    return { received: true as const, ...(await runCheckoutSession(admin, evt, session)) }
  } catch (err: any) {
    // Retry policy, decided in KAN-51 and now applied to every handled type:
    // a failed handler answers 5xx so Stripe redelivers, and the claim is
    // released so the redelivery can actually run.
    //
    // This is a deliberate change for the refund and account branches, which
    // used to answer 200 after swallowing the failure:
    //   * Answering 200 told Stripe the refund was recorded when it was not,
    //     leaving the participant marked `paid` after a real refund with
    //     nothing to reconcile it later.
    //   * Both syncs write absolute values taken from the Stripe object, so a
    //     redelivery repairs the row instead of double-applying. Retrying is
    //     strictly safer than not retrying.
    console.error(`[stripe webhook] handler failed for ${evt.type}:`, err?.message)
    await releaseStripeEvent(admin, evt.id)
    throw new StripeWebhookError('handler_failed', err?.message ?? 'handler failed')
  }
}
