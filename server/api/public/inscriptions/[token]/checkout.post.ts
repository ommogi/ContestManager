import { defineEventHandler, createError, getRouterParam, readBody } from 'h3'
import { serverSupabaseAdmin, requireAuth, internalError } from '~~/server/utils/supabase'
import { getStripe } from '~~/server/utils/stripe'
import { CheckoutEnrollmentSchema } from '~~/server/utils/schemas'
import {
  assertOwnedUploadPaths,
  collectUploadPaths,
  prepareFormSubmission,
  refreshPendingFormResponses,
  stashPendingFormResponses,
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
  const { category_id, first_name, last_name, birthdate, dni, country, email, phone } = parsed.data

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

  const effectiveEmail = email || user.email

  const config = useRuntimeConfig()
  const baseUrl = config.appBaseUrl || 'http://localhost:3000'
  const feeBps = Math.max(0, Math.min(10000, parseInt(String(config.platformFeeBps ?? '500'), 10) || 0))
  const applicationFee = Math.floor((contest.entry_fee_cents * feeBps) / 10000)
  const stripe = getStripe()

  // Idempotency: reuse an open session for the same user+contest+category within 24h
  try {
    const existingSessions = await stripe.checkout.sessions.list({
      limit: 1,
      status: 'open',
      customer_email: effectiveEmail ?? undefined,
    })
    const existing = existingSessions.data.find(
      (s) => s.metadata?.user_id === user.id && s.metadata?.contest_id === contest.id && s.metadata?.category_id === category_id && s.status === 'open'
    )
    const draftId = existing?.metadata?.form_draft_id
    // Only reuse a session that can still carry the answers. One opened before
    // the organizer published the form has no `form_draft_id`, and reusing it
    // would confirm a payment with nothing to store — let it fall through and
    // open a fresh session instead.
    if (existing?.url && (!submission || draftId)) {
      if (submission && draftId) {
        // That session's metadata still points at the draft written the first
        // time round, so the answers just submitted must overwrite that row,
        // or the payment confirms against whatever was typed before.
        await refreshPendingFormResponses(admin, draftId, submission)
      }
      return { url: existing.url, id: existing.id }
    }
  } catch {
    // fall through to create a new session
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
    customer_email: effectiveEmail ?? undefined,
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
    metadata: {
      type: 'enrollment',
      organization_id: org.id,
      contest_id: contest.id,
      token,
      user_id: user.id,
      category_id,
      first_name,
      last_name,
      birthdate,
      dni: dni ?? '',
      country: country ?? '',
      email: effectiveEmail ?? '',
      phone: phone ?? '',
      // Opaque pointer into `pending_form_responses`. Absent when the contest
      // has no published form, so those sessions keep their old 13 keys.
      ...(formDraftId ? { form_draft_id: formDraftId } : {}),
    },
    success_url: `${baseUrl}/join/${token}/confirm?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url:  `${baseUrl}/join/${token}?cancel=1`,
  })

  return { url: session.url, id: session.id }
})
