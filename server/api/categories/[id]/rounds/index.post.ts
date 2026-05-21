import { defineEventHandler, createError, getRouterParam, readBody } from 'h3'
import { serverSupabaseAdmin, requireOrgOwnerOrMember } from '~~/server/utils/supabase'

export default defineEventHandler(async (event) => {
  const categoryId = getRouterParam(event, 'id')
  if (!categoryId) throw createError({ statusCode: 400, statusMessage: 'Missing category ID' })

  const admin = serverSupabaseAdmin()
  const { data: category } = await admin.from('categories').select('contest_id').eq('id', categoryId).maybeSingle()
  if (!category) throw createError({ statusCode: 404, statusMessage: 'category_not_found' })
  await requireOrgOwnerOrMember(event, category.contest_id)

  const body = await readBody(event)
  const allowed = ['name', 'order', 'scoring_type', 'is_final']
  const roundData: Record<string, any> = { category_id: categoryId }
  for (const key of allowed) {
    if (key in body) roundData[key] = body[key]
  }

  // Gate: if creating an active round, the parent contest must be active
  if (roundData.status === 'active') {
    const { data: categoryInfo, error: catErr } = await admin
      .from('categories')
      .select('contest_id, contests!inner(status)')
      .eq('id', categoryId)
      .single()
    if (catErr) {
      throw createError({ statusCode: 500, statusMessage: catErr.message })
    }
    const contestStatus = (categoryInfo as any)?.contests?.status
    if (contestStatus !== 'active') {
      throw createError({
        statusCode: 400,
        statusMessage: 'El concurso debe estar activo para iniciar una ronda',
      })
    }
  }

  const { data, error } = await admin.from('rounds').insert(roundData).select().single()

  if (error) {
    throw createError({
      statusCode: 500,
      statusMessage: error.message
    })
  }

  return data
})
