import { defineEventHandler, createError } from 'h3'
import { serverSupabaseAdmin, requireOrgOwner } from '~~/server/utils/supabase'
import { getPagination, paginationResponse } from '~~/server/utils/pagination'

export default defineEventHandler(async (event) => {
  const { org } = await requireOrgOwner(event)
  const client = serverSupabaseAdmin()
  const { page, limit, offset } = getPagination(event, 50, 100)

  const { data, error, count } = await client
    .from('contests')
    .select('*', { count: 'exact' })
    .eq('organization_id', org.id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) { console.error("[api error]", error.message); throw createError({ statusCode: 500, statusMessage: "internal_error" }) }
  return paginationResponse(data ?? [], page, limit, count ?? undefined)
})
