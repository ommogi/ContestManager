import { defineEventHandler, createError, getRouterParam } from 'h3'
import { serverSupabaseAdmin, requireContestOrganizer } from '~~/server/utils/supabase'
import { getPagination, paginationResponse } from '~~/server/utils/pagination'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing contest ID' })
  await requireContestOrganizer(event, id)

  const admin = serverSupabaseAdmin()
  const { page, limit, offset } = getPagination(event, 50, 100)
  // Include fields needed for the admin UI. The payment columns ARE needed:
  // the inscriptions table renders a payment badge, filters by payment status
  // and gates the refund action on it. Stripe identifiers stay excluded.
  const fields = 'id, contest_id, category_id, name, first_name, last_name, dni, email, phone, country, birthdate, status, payment_status, amount_paid_cents, amount_refunded_cents, created_at, updated_at'
  const { data, error, count } = await admin
    .from('participants')
    .select(fields, { count: 'exact' })
    .eq('contest_id', id)
    .range(offset, offset + limit - 1)
  if (error) {
    console.error('[participants] fetch failed:', error.message)
    throw createError({ statusCode: 500, statusMessage: 'internal_error' })
  }
  return paginationResponse(data ?? [], page, limit, count ?? undefined)
})
