import { defineEventHandler, createError } from 'h3'
import { serverSupabaseAdmin, requireOrgOwner } from '~~/server/utils/supabase'
import { getStripe } from '~~/server/utils/stripe'

export default defineEventHandler(async (event) => {
  const { user, org } = await requireOrgOwner(event)

  const admin = serverSupabaseAdmin()
  const config = useRuntimeConfig()
  const baseUrl = config.appBaseUrl || 'http://localhost:3000'
  const stripe = getStripe()

  let accountId = org.stripe_account_id
  if (!accountId) {
    const account = await stripe.accounts.create({
      type: 'express',
      email: user.email ?? undefined,
      business_profile: { name: org.name },
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      metadata: { organization_id: org.id },
    })
    accountId = account.id
    const { error: upErr } = await admin
      .from('organizations')
      .update({ stripe_account_id: accountId })
      .eq('id', org.id)
    if (upErr) throw createError({ statusCode: 500, statusMessage: upErr.message })
  }

  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${baseUrl}/billing?connect=refresh`,
    return_url:  `${baseUrl}/billing?connect=return`,
    type: 'account_onboarding',
  })

  return { url: link.url }
})
