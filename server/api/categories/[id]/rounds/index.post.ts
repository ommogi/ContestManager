import { defineEventHandler, createError, getRouterParam, readBody } from 'h3'
import { serverSupabaseClient } from '~~/server/utils/supabase'

export default defineEventHandler(async (event) => {
  const client = serverSupabaseClient(event)
  const categoryId = getRouterParam(event, 'id')
  const body = await readBody(event)

  // Ensure the body has the category_id
  const roundData = {
    ...body,
    category_id: categoryId
  }

  // Gate: if creating an active round, the parent contest must be active
  if (roundData.status === 'active') {
    const { data: categoryInfo, error: catErr } = await client
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

  const { data, error } = await client.from('rounds').insert(roundData).select().single()

  if (error) {
    throw createError({
      statusCode: 500,
      statusMessage: error.message
    })
  }

  return data
})
