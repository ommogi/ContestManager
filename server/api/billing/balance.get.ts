import { defineEventHandler, createError } from 'h3'
import { serverSupabaseAdmin, requireOrgOwner } from '~~/server/utils/supabase'

export default defineEventHandler(async (event) => {
  const { org } = await requireOrgOwner(event)
  const admin = serverSupabaseAdmin()

  const { data: tx, error: txErr } = await admin
    .from('billing_transactions')
    .select('id, entity, delta, reason, plan, amount_cents, balance_after, created_at, contest_id, participant_id')
    .eq('organization_id', org.id)
    .order('created_at', { ascending: false })
    .limit(100)
  if (txErr) throw createError({ statusCode: 500, statusMessage: txErr.message })

  return {
    organization: {
      id: org.id,
      name: org.name,
      ticket_balance: org.ticket_balance,
      activation_balance: org.activation_balance,
    },
    transactions: tx ?? []
  }
})
