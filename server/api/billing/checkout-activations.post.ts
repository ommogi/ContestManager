import { defineEventHandler, readBody, createError } from 'h3'
import { serverSupabaseAdmin, requireOrgOwner } from '~~/server/utils/supabase'
import { getStripe } from '~~/server/utils/stripe'
import { CheckoutActivationsSchema } from '~~/server/utils/schemas'

const ACTIVATION_UNIT_CENTS = 5000 // 50.00 €
const MAX_QUANTITY          = 50

export default defineEventHandler(async (event) => {
  const { user, org } = await requireOrgOwner(event)

  const rawBody = await readBody(event)
  const parsed = CheckoutActivationsSchema.safeParse(rawBody)
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'invalid_quantity', data: parsed.error.issues })
  }
  const { quantity, return_path } = parsed.data
  const returnPath = return_path ?? '/billing'

  const config = useRuntimeConfig()
  const baseUrl = config.appBaseUrl || 'http://localhost:3000'

  const sep = returnPath.includes('?') ? '&' : '?'
  const successUrl = `${baseUrl}${returnPath}${sep}topup=success&session_id={CHECKOUT_SESSION_ID}`
  const cancelUrl  = `${baseUrl}${returnPath}${sep}topup=cancel`

  const stripe = getStripe()

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    customer_email: user.email ?? undefined,
    line_items: [{
      quantity,
      price_data: {
        currency: 'eur',
        unit_amount: ACTIVATION_UNIT_CENTS,
        product_data: {
          name: 'Activaciones de concurso',
          description: 'Compra unitaria · 50,00 € por activación',
        },
      },
    }],
    metadata: {
      type: 'activations',
      organization_id: org.id,
      quantity: String(quantity),
      unit_amount: String(ACTIVATION_UNIT_CENTS),
    },
    success_url: successUrl,
    cancel_url:  cancelUrl,
  })

  return { url: session.url, id: session.id, quantity, unit_cents: ACTIVATION_UNIT_CENTS }
})
