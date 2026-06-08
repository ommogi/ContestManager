import { defineEventHandler, createError, getRouterParam } from 'h3'
import { serverSupabaseAdmin, requireOrgOwnerOrMember } from '~~/server/utils/supabase'

export default defineEventHandler(async (event) => {
  const categoryId = getRouterParam(event, 'id')
  if (!categoryId) throw createError({ statusCode: 400, statusMessage: 'Missing category ID' })

  const admin = serverSupabaseAdmin()
  const { data: category } = await admin.from('categories').select('contest_id').eq('id', categoryId).maybeSingle()
  if (!category) throw createError({ statusCode: 404, statusMessage: 'category_not_found' })
  await requireOrgOwnerOrMember(event, category.contest_id)

  const { data, error } = await admin.from('rounds')
    .select('*')
    .eq('category_id', categoryId)
    .order('order', { ascending: true })

  if (error) {
    throw createError({
      statusCode: 500,
      statusMessage: error.message
    })
  }

  return data
})
