import { defineEventHandler, createError, getRouterParam, readBody } from 'h3'
import { serverSupabaseAdmin, requireOrgOwnerOrMember } from '~~/server/utils/supabase'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing contest id' })

  // Auth gate: must be org owner or contest member
  await requireOrgOwnerOrMember(event, id)

  const client = serverSupabaseAdmin()
  const body = await readBody(event)

  // If no user_id provided but email is given, try to resolve an existing auth user
  let userId: string | null = body.user_id ?? null
  if (!userId && body.email) {
    try {
      const target = String(body.email).toLowerCase()
      // listUsers paginates; 1000/page handles most orgs. Could be replaced by an SQL RPC later.
      const { data: listData } = await client.auth.admin.listUsers({ page: 1, perPage: 1000 })
      const found = listData?.users?.find((u: any) => (u.email || '').toLowerCase() === target)
      if (found?.id) userId = found.id
    } catch {
      // swallow — fallback to null user_id (column is nullable for external judges)
    }
  }

  const { data, error } = await client
    .from('contest_members')
    .insert({ ...body, contest_id: id, user_id: userId })
    .select()
    .single()

  if (error) throw createError({ statusCode: 500, statusMessage: error.message })
  return data
})
