import { defineEventHandler, createError, getRouterParam, readBody } from 'h3'
import { serverSupabaseAdmin, requireContestOrganizer } from '~~/server/utils/supabase'
import { CategoryPatchSchema } from '~~/server/utils/schemas'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing ID' })

  const admin = serverSupabaseAdmin()
  const { data: category } = await admin
    .from('categories')
    .select('contest_id, status')
    .eq('id', id)
    .maybeSingle()
  if (!category) throw createError({ statusCode: 404, statusMessage: 'category_not_found' })
  await requireContestOrganizer(event, category.contest_id)

  // A closed category is locked: it cannot be reopened nor edited. Closing one
  // is still allowed — this only applies once it is already closed.
  if (category.status === 'closed') {
    throw createError({
      statusCode: 409,
      statusMessage: 'La categoría está cerrada y no se puede modificar.',
    })
  }

  const rawBody = await readBody(event)
  const parsed = CategoryPatchSchema.safeParse(rawBody)
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid request', data: parsed.error.issues })
  }

  const updates = Object.fromEntries(
    Object.entries(parsed.data).filter(([, v]) => v !== undefined),
  )
  if (Object.keys(updates).length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'No valid fields to update' })
  }

  const { data, error } = await admin
    .from('categories')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) { console.error("[api error]", error.message); throw createError({ statusCode: 500, statusMessage: "internal_error" }) }
  return data
})
