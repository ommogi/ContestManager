import { defineEventHandler, readBody, createError } from 'h3'
import { serverSupabaseAdmin, requireOrgOwner } from '~~/server/utils/supabase'
import { getStripe } from '~~/server/utils/stripe'
import { CheckoutTicketsSchema } from '~~/server/utils/schemas'

const TICKET_UNIT_CENTS = 100 // 1.00 €
const MAX_QUANTITY      = 500

export default defineEventHandler(async (event) => {
  const { user, org } = await requireOrgOwner(event)

  const rawBody = await readBody(event)
  const parsed = CheckoutTicketsSchema.safeParse(rawBody)
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
        unit_amount: TICKET_UNIT_CENTS,
        product_data: {
          name: 'Tickets de inscripción',
          description: 'Compra unitaria · 1,00 € por ticket',
        },
      },
    }],
    metadata: {
      type: 'tickets',
      organization_id: org.id,
      quantity: String(quantity),
      unit_amount: String(TICKET_UNIT_CENTS),
    },
    success_url: successUrl,
    cancel_url:  cancelUrl,
  })

  return { url: session.url, id: session.id, quantity, unit_cents: TICKET_UNIT_CENTS }
})
