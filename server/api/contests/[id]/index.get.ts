import { defineEventHandler, createError, getRouterParam } from 'h3'
import { serverSupabaseAdmin, requireOrgOwner } from '~~/server/utils/supabase'

export default defineEventHandler(async (event) => {
  const { org } = await requireOrgOwner(event)

  const client = serverSupabaseAdmin()
  const idOrSlug = getRouterParam(event, 'id')

  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrSlug || '')

  let query = client.from('contests').select('*, organizations(*)').limit(1)
  if (isUUID) {
    query = query.eq('id', idOrSlug).eq('organization_id', org.id)
  } else {
    query = query.eq('slug', idOrSlug).eq('organization_id', org.id)
  }

  const { data, error } = await query.maybeSingle()

  if (error || !data) {
    throw createError({ statusCode: 404, statusMessage: 'Contest not found' })
  }

  return data
})
