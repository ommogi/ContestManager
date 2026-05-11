import { defineEventHandler, createError } from 'h3'
import { serverSupabaseAdmin, requireOrgOwner } from '~~/server/utils/supabase'
import { getStripe } from '~~/server/utils/stripe'

export default defineEventHandler(async (event) => {
  const { org } = await requireOrgOwner(event)

  const admin = serverSupabaseAdmin()

  if (!org.stripe_account_id) {
    return {
      connected: false,
      onboarding_done: false,
      charges_enabled: false,
      payouts_enabled: false,
    }
  }

  const stripe = getStripe()
  const acc = await stripe.accounts.retrieve(org.stripe_account_id)
  const done    = !!acc.details_submitted
  const charges = !!acc.charges_enabled
  const payouts = !!acc.payouts_enabled

  // Sync DB
  if (
    done !== org.stripe_onboarding_done ||
    charges !== org.stripe_charges_enabled ||
    payouts !== org.stripe_payouts_enabled
  ) {
    await admin.from('organizations').update({
      stripe_onboarding_done: done,
      stripe_charges_enabled: charges,
      stripe_payouts_enabled: payouts,
    }).eq('id', org.id)
  }

  return {
    connected: true,
    onboarding_done: done,
    charges_enabled: charges,
    payouts_enabled: payouts,
    account_id: org.stripe_account_id,
  }
})
