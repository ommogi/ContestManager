import type Stripe from 'stripe'
import { defineEventHandler, createError, getRouterParam, readBody } from 'h3'
import { serverSupabaseAdmin, requireAuth, internalError } from '~~/server/utils/supabase'
import { getStripe } from '~~/server/utils/stripe'
import { buildEnrollmentMetadata } from '~~/server/utils/enrollment-metadata'
import { decideSessionReuse } from '~~/server/utils/checkout-session-reuse'
import { CheckoutEnrollmentSchema } from '~~/server/utils/schemas'
import {
  assertOwnedUploadPaths,
  collectUploadPaths,
  prepareFormSubmission,
  refreshPendingFormResponses,
  stashPendingFormResponses,
  stripHiddenCoreValues,
} from '~~/server/utils/inscription-form-responses'

export default defineEventHandler(async (event) => {
  const user = requireAuth(event)

  const token = getRouterParam(event, 'token')
  if (!token) throw createError({ statusCode: 400, statusMessage: 'Missing token' })

  const rawBody = await readBody(event)
  const parsed = CheckoutEnrollmentSchema.safeParse(rawBody)
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid request', data: parsed.error.issues })
  }
  // dni/country/phone are destructured further down, once the published schema
  // says whether this contest asks for them at all (KAN-70).
  const { category_id, first_name, last_name, birthdate, email } = parsed.data

  const admin = serverSupabaseAdmin()

  // Load contest + org via token
  const { data: contest, error: cErr } = await admin
    .from('contests')
    .select('id, name, slug, status, registration_open, entry_fee_cents, organization_id')
    .eq('registration_token', token)
    .maybeSingle()
  if (cErr) throw internalError(event, cErr, 'contests.select')
  if (!contest) throw createError({ statusCode: 404, statusMessage: 'contest_not_found' })
  if (['active','finished','cancelled'].includes((contest as any).status)) {
    throw createError({ statusCode: 409, statusMessage: 'El concurso ya está en curso. Inscripciones cerradas.' })
  }
  if (!contest.registration_open) {
    throw createError({ statusCode: 400, statusMessage: 'registration_closed' })
  }
  if (!contest.entry_fee_cents || contest.entry_fee_cents <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'no_fee_required' })
  }

  const { data: org, error: oErr } = await admin
    .from('organizations')
    .select('id, name, stripe_account_id, stripe_charges_enabled')
    .eq('id', contest.organization_id)
    .single()
  if (oErr) throw internalError(event, oErr, 'organizations.select')
  if (!org.stripe_account_id || !org.stripe_charges_enabled) {
    throw createError({ statusCode: 400, statusMessage: 'org_not_connected' })
  }

  // Category sanity
  const { data: cat, error: catErr } = await admin
    .from('categories')
    .select('id, name, max_participants')
    .eq('id', category_id)
    .eq('contest_id', contest.id)
    .maybeSingle()
  if (catErr) { console.error("[api error]", catErr.message); throw createError({ statusCode: 500, statusMessage: "internal_error" }) }
  if (!cat) throw createError({ statusCode: 404, statusMessage: 'category_not_found' })

  // Validate the configurable form before Stripe is involved at all (KAN-49):
  // a body that fails the schema must not leave a Checkout Session behind.
  const submission = await prepareFormSubmission(admin, token, parsed.data)

  // Drop the core values this contest's form does not ask for (KAN-70), before
  // they are written anywhere — which on this path means before they reach the
  // Checkout Session's `metadata`.
  //
  // That ordering is the whole reason the webhook needs no change: `metadata`
  // is the only channel by which these values cross into `handleEnrollment`,
  // and a hidden one now leaves here as `null`, so the `dni ?? ''` below writes
  // an empty string and the webhook's `m.dni || null` turns it back into null
  // for `enroll_participant_paid`. Same mechanism KAN-65 used for the email.
  //
  // `submission` is null when the contest has no published form, and then
  // nothing is stripped — those contests keep behaving exactly as before.
  const { dni, country, phone } = stripHiddenCoreValues(
    {
      dni: parsed.data.dni ?? null,
      country: parsed.data.country ?? null,
      phone: parsed.data.phone ?? null,
    },
    submission?.hiddenCoreColumns,
  )

  // Ownership of every referenced object key, before Stripe is touched, for
  // the same reason as on the free path (KAN-49). The files themselves are
  // only CONFIRMED once the payment lands — that happens in the webhook, where
  // the participant row finally exists — so nothing is attached here.
  if (submission) {
    assertOwnedUploadPaths(
      collectUploadPaths(submission.responses),
      { contestId: submission.contestId, userId: user.id },
    )
  }

  // No `|| user.email` fallback since KAN-65: `core.email` is irreducible, so
  // the body always carries the address the participant typed. The same value
  // serves three purposes here — Stripe's `customer_email`, the idempotency
  // lookup, and `metadata.email`, which the webhook writes to
  // `participants.email` — and all three should be that address, never the
  // session's.

  const config = useRuntimeConfig()
  const baseUrl = config.appBaseUrl || 'http://localhost:3000'
  const feeBps = Math.max(0, Math.min(10000, parseInt(String(config.platformFeeBps ?? '500'), 10) || 0))
  const applicationFee = Math.floor((contest.entry_fee_cents * feeBps) / 10000)
  const stripe = getStripe()

  // ── Idempotency ────────────────────────────────────────────────────────────
  //
  // Reuse an open session for the same user+contest+category, so that
  // resubmitting the form does not mint a second payable URL. Two open sessions
  // for one inscription means the participant can pay twice: the second payment
  // is captured, `enroll_participant_paid` refuses it with
  // `already_enrolled_in_category` (it is guarded by
  // `participants_unique_user_category`), and the money sits charged with no
  // enrolment against it.
  //
  // This used to filter the list by `customer_email`, which is not a parameter
  // `sessions.list` accepts — Stripe answers
  //   "Received unknown parameter: customer_email. Did you mean customer_details?"
  // so the call threw on every request and a silent `catch` swallowed it. The
  // branch never reused a session once. `customer_details.email` is the
  // real filter, and it is populated from `customer_email` as soon as the
  // session is created, while it is still open — verified against the API.
  let existing: Stripe.Checkout.Session | null = null
  try {
    const existingSessions = await stripe.checkout.sessions.list({
      // Not 1: that asked Stripe for a single session and only then checked the
      // contest and category, so anyone with an open session for a different
      // contest failed to match and got a second one anyway.
      limit: 100,
      status: 'open',
      customer_details: { email },
    })
    existing = existingSessions.data.find(
      (s) => s.metadata?.user_id === user.id && s.metadata?.contest_id === contest.id && s.metadata?.category_id === category_id && s.status === 'open'
    ) ?? null
  } catch (err: any) {
    // Not being able to look is a reason to open a new session, not to fail —
    // but it is never silent again. A swallowed error here is what hid a
    // hundred-percent failure for as long as this branch has existed.
    console.error('[checkout] could not list open sessions:', err?.message)
  }

  const draftId = existing?.metadata?.form_draft_id

  // ── A session we decline cannot be left alive (KAN-79) ─────────────────────
  //
  // This used to fall straight through to creating a new session and leave the
  // declined one open and payable. Two payable URLs for one inscription is the
  // exact thing the branch above exists to prevent: paying both captures money
  // that `enroll_participant_paid` then refuses to enrol (KAN-78).
  //
  // The new reason is `stale_amount`. The fee is baked into `line_items` at
  // creation, so an organizer changing it leaves the open session charging the
  // old price. It cannot simply be re-priced: `line_items` is updatable but
  // `payment_intent_data` is not, so `application_fee_amount` would stay
  // computed from the old amount — the participant would pay the new price and
  // the platform would take its cut on the old one. Verified against the API
  // reference: the updatable fields are `collected_information`, `line_items`,
  // `metadata` and `shipping_options`, and nothing else.
  const decision = existing
    ? decideSessionReuse({
        amountTotal: existing.amount_total,
        url: existing.url,
        formDraftId: draftId,
        hasSubmission: Boolean(submission),
        currentFeeCents: contest.entry_fee_cents,
      })
    : null

  if (existing && decision && !decision.reuse) {
    // Expire before creating the replacement, and fail closed if that does not
    // work. Verified in test mode: expiring moves the session to `expired` and
    // nulls its `url`, so it can no longer be paid — the hosted page still
    // answers 200, but it serves Stripe's expiry screen rather than a checkout.
    //
    // Failing closed is the same call as the metadata refresh below, for a
    // stronger reason: there the alternative was writing wrong data, here it is
    // leaving a second payable URL behind.
    try {
      await stripe.checkout.sessions.expire(existing.id)
      console.info(
        `[checkout] expired a stale session (${decision.reason}) before opening a new one: ` +
        `session=${existing.id} contest=${contest.id} user=${user.id}`,
      )
    } catch (err: any) {
      throw internalError(event, err, 'stripe.checkout.sessions.expire')
    }
    existing = null
  }

  if (existing?.url && decision?.reuse) {
    if (submission && draftId) {
      // That session's metadata still points at the draft written the first
      // time round, so the answers just submitted must overwrite that row,
      // or the payment confirms against whatever was typed before.
      await refreshPendingFormResponses(admin, draftId, submission)
    }

    // The core values are NOT in the draft: they travel in the session's own
    // metadata, which was written the first time round and would otherwise stay
    // frozen. A participant who corrects a typo — or an organizer who hides a
    // core field in between — would have the stale value written at payment.
    // `birthdate` is the sharp edge: `enroll_participant_paid` gates min_age and
    // max_age on it, so a stale one files someone under the wrong category.
    //
    // Deliberately OUTSIDE the try above: a failure here must not fall through
    // to creating a second session. That would leave the old URL open and
    // payable, which is the exact double-charge this branch exists to prevent.
    // Failing closed costs a retry; the alternative writes the wrong data.
    try {
      await stripe.checkout.sessions.update(existing.id, {
        metadata: buildEnrollmentMetadata(
          {
            organizationId: org.id,
            contestId: contest.id,
            token,
            userId: user.id,
            categoryId: category_id,
            firstName: first_name,
            lastName: last_name,
            birthdate,
            dni,
            country,
            email,
            phone,
            // The draft this session already points at, never a new one:
            // `refreshPendingFormResponses` overwrote that same row above.
            formDraftId: draftId ?? null,
          },
          'refresh',
        ),
      })
    } catch (err: any) {
      throw internalError(event, err, 'stripe.checkout.sessions.update')
    }

    return { url: existing.url, id: existing.id }
  }

  // Park the answers and carry only their id across Stripe. `metadata` caps
  // values at 500 characters and this flow already spends 13 of the 50 keys,
  // so a single long `textarea` would make session creation fail outright.
  // An opaque uuid is 36 characters and one key, whatever the form contains.
  let formDraftId: string | null = null
  if (submission) {
    formDraftId = await stashPendingFormResponses(admin, {
      contestId: contest.id,
      userId: user.id,
      submission,
    })
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    customer_email: email,
    line_items: [{
      quantity: 1,
      price_data: {
        currency: 'eur',
        unit_amount: contest.entry_fee_cents,
        product_data: {
          name: `Inscripción · ${contest.name}`,
          description: `Categoría: ${cat.name}`,
        },
      },
    }],
    payment_intent_data: {
      transfer_data: { destination: org.stripe_account_id },
      application_fee_amount: applicationFee > 0 ? applicationFee : undefined,
      metadata: {
        organization_id: org.id,
        contest_id: contest.id,
        platform_fee_bps: String(feeBps),
        platform_fee_amount: String(applicationFee),
      },
    },
    // Same builder as the refresh above, so the two paths cannot drift. On
    // `create` the draft pointer is omitted when there is none, which keeps a
    // formless contest's sessions on their old 13 keys.
    metadata: buildEnrollmentMetadata({
      organizationId: org.id,
      contestId: contest.id,
      token,
      userId: user.id,
      categoryId: category_id,
      firstName: first_name,
      lastName: last_name,
      birthdate,
      dni,
      country,
      email,
      phone,
      formDraftId,
    }),
    success_url: `${baseUrl}/join/${token}/confirm?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url:  `${baseUrl}/join/${token}?cancel=1`,
  })

  return { url: session.url, id: session.id }
})
