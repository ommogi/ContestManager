import { defineEventHandler, createError, getRouterParam, readBody } from 'h3'
import { serverSupabaseAdmin, requireAuth } from '~~/server/utils/supabase'
import { getStripe } from '~~/server/utils/stripe'

export default defineEventHandler(async (event) => {
  const user = requireAuth(event)

  const token = getRouterParam(event, 'token')
  if (!token) throw createError({ statusCode: 400, statusMessage: 'Missing token' })

  const body = await readBody(event)
  const {
    category_id, first_name, last_name, birthdate,
    dni = null, country = null, email = null, phone = null,
  } = body || {}
  if (!category_id || !first_name || !last_name || !birthdate) {
    throw createError({ statusCode: 400, statusMessage: 'Faltan campos requeridos' })
  }

  const admin = serverSupabaseAdmin()

  // Load contest + org via token
  const { data: contest, error: cErr } = await admin
    .from('contests')
    .select('id, name, slug, status, registration_open, entry_fee_cents, organization_id')
    .eq('registration_token', token)
    .maybeSingle()
  if (cErr) throw createError({ statusCode: 500, statusMessage: cErr.message })
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
  if (oErr) throw createError({ statusCode: 500, statusMessage: oErr.message })
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
  if (catErr) throw createError({ statusCode: 500, statusMessage: catErr.message })
  if (!cat) throw createError({ statusCode: 404, statusMessage: 'category_not_found' })

  const effectiveEmail = email || user.email

  const config = useRuntimeConfig()
  const baseUrl = config.appBaseUrl || 'http://localhost:3000'
  const feeBps = Math.max(0, Math.min(10000, parseInt(String(config.platformFeeBps ?? '500'), 10) || 0))
  const applicationFee = Math.floor((contest.entry_fee_cents * feeBps) / 10000)
  const stripe = getStripe()

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
    },
    success_url: `${baseUrl}/join/${token}/confirm?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url:  `${baseUrl}/join/${token}?cancel=1`,
  })

  return { url: session.url, id: session.id }
})
