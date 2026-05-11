import { defineEventHandler, readBody, createError } from 'h3'
import { serverSupabaseAdmin, requireOrgOwner } from '~~/server/utils/supabase'
import { getStripe } from '~~/server/utils/stripe'

const PLAN_NAMES: Record<string, string> = {
  starter: 'Starter — 50 tickets + 1 activación',
  pro: 'Pro — 200 tickets + 3 activaciones',
  enterprise: 'Enterprise — 1000 tickets + 10 activaciones',
}

export default defineEventHandler(async (event) => {
  const { user, org } = await requireOrgOwner(event)

  const { plan } = (await readBody(event)) || {}
  if (!plan || !PLAN_NAMES[plan]) {
    throw createError({ statusCode: 400, statusMessage: 'invalid_plan' })
  }

  const admin = serverSupabaseAdmin()

  const { data: bundles, error: bErr } = await admin.rpc('get_plan_bundles')
  if (bErr) throw createError({ statusCode: 500, statusMessage: bErr.message })
  const bundle = (bundles as any[]).find((b) => b.plan === plan)
  if (!bundle) throw createError({ statusCode: 400, statusMessage: 'unknown_plan' })

  const config = useRuntimeConfig()
  const baseUrl = config.appBaseUrl || 'http://localhost:3000'
  const stripe = getStripe()

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    customer_email: user.email ?? undefined,
    line_items: [{
      quantity: 1,
      price_data: {
        currency: 'eur',
        unit_amount: bundle.price_cents,
        product_data: {
          name: PLAN_NAMES[plan],
          description: `${bundle.tickets} tickets · ${bundle.activations} activaciones`,
        },
      },
    }],
    metadata: {
      organization_id: org.id,
      plan,
    },
    success_url: `${baseUrl}/billing?purchase=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/billing?purchase=cancel`,
  })

  return { url: session.url, id: session.id }
})
