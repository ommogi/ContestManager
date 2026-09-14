// server/api/stripe/webhook.post.ts
//
// Thin shell on purpose (KAN-51). It owns the two things that need the HTTP
// request — verifying the signature against the RAW body, and turning the
// outcome into a status code — and delegates claim + dispatch to
// `processStripeEvent`, which is unit-tested. vitest resolves neither Nitro's
// `~~/` alias nor its auto-imports, so anything worth testing lives in a
// service or a util, never in a route handler.

import { defineEventHandler, getHeader, readRawBody, createError, setResponseStatus } from 'h3'
import { serverSupabaseAdmin } from '~~/server/utils/supabase'
import { getStripe } from '~~/server/utils/stripe'
import { processStripeEvent, StripeWebhookError } from '~~/server/services/stripe-webhook'
import type Stripe from 'stripe'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const secret = config.stripeWebhookSecret
  if (!secret) throw createError({ statusCode: 500, statusMessage: 'webhook_secret_missing' })

  const sig = getHeader(event, 'stripe-signature') || ''
  const raw = await readRawBody(event)
  if (!raw) throw createError({ statusCode: 400, statusMessage: 'no_body' })

  // First, always: nothing below may trust `evt` until the payload is proven
  // to be Stripe's.
  const stripe = getStripe()
  let evt: Stripe.Event
  try {
    evt = stripe.webhooks.constructEvent(raw, sig, secret)
  } catch (err: any) {
    console.error('[stripe webhook] sig verify failed:', err?.message)
    throw createError({ statusCode: 400, statusMessage: 'invalid_signature' })
  }

  try {
    const result = await processStripeEvent(serverSupabaseAdmin(), evt)
    setResponseStatus(event, 200)
    return result
  } catch (err: any) {
    if (err instanceof StripeWebhookError) {
      // The code is a fixed internal label, never a database message (KAN-43).
      console.error(`[stripe webhook] ${err.code}:`, err.message)
      throw createError({ statusCode: 500, statusMessage: err.code })
    }
    throw err
  }
})
