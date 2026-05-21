import { defineEventHandler, createError, getRouterParam, getQuery } from 'h3'
import { serverSupabaseAdmin, requireAuth } from '~~/server/utils/supabase'

export default defineEventHandler(async (event) => {
  const user = requireAuth(event)

  const token = getRouterParam(event, 'token')
  const { session_id } = getQuery(event)
  if (!token || !session_id) throw createError({ statusCode: 400, statusMessage: 'Missing params' })

  const admin = serverSupabaseAdmin()
  const { data: p, error } = await admin
    .from('participants')
    .select('id, contest_id, user_id, payment_status, amount_paid_cents')
    .eq('stripe_checkout_session_id', String(session_id))
    .maybeSingle()
  if (error) { console.error("[api error]", error.message); throw createError({ statusCode: 500, statusMessage: "internal_error" }) }
  if (!p) return { status: 'pending' }
  if (p.user_id !== user.id) throw createError({ statusCode: 403, statusMessage: 'forbidden' })

  const { data: contest } = await admin
    .from('contests')
    .select('slug, name')
    .eq('id', p.contest_id)
    .single()

  return {
    status: 'paid',
    participant_id: p.id,
    amount_paid_cents: p.amount_paid_cents,
    contest_slug: contest?.slug,
    contest_name: contest?.name,
  }
})
