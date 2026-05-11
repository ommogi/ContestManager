import { defineEventHandler, createError, getRouterParam } from 'h3'
import { serverSupabaseAdmin, requireOrgOwner } from '~~/server/utils/supabase'

export default defineEventHandler(async (event) => {
  const { org } = await requireOrgOwner(event)

  const client = serverSupabaseAdmin()
  const idOrSlug = getRouterParam(event, 'id')
  if (!idOrSlug) throw createError({ statusCode: 400, statusMessage: 'ID or Slug is required' })

  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrSlug)

  // Resolve to id scoped to user's org (slug is unique per org)
  let q = client.from('contests').select('id').limit(1)
  if (isUUID) {
    q = q.eq('id', idOrSlug)
  } else {
    q = q.eq('slug', idOrSlug).eq('organization_id', org.id)
  }
  const { data: row } = await q.maybeSingle()
  if (!row) throw createError({ statusCode: 404, statusMessage: 'contest_not_found' })

  const { error } = await client.from('contests').delete().eq('id', (row as any).id)
  if (error) throw createError({ statusCode: 500, statusMessage: error.message })
  return { success: true }
})
