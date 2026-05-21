import { defineEventHandler, createError, getRouterParam, readBody } from 'h3'
import { serverSupabaseAdmin, requireOrgOwnerOrMember } from '~~/server/utils/supabase'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing contest ID' })
  await requireOrgOwnerOrMember(event, id)

  const admin = serverSupabaseAdmin()
  const body = await readBody(event)

  // Validate category belongs to this contest if provided
  if (body.category_id) {
    const { data: catCheck } = await admin.from('categories').select('id').eq('id', body.category_id).eq('contest_id', id).maybeSingle()
    if (!catCheck) throw createError({ statusCode: 400, statusMessage: 'category_not_in_contest' })
  }

  // Validation for dynamic rounds
  const { data: contest } = await admin.from('contests').select('is_rounds_dynamic').eq('id', id).single()

  if (contest?.is_rounds_dynamic) {
    // Check if there are active rounds
    const { data: activeRounds } = await admin.from('rounds')
      .select('id, categories!inner(contest_id)')
      .eq('categories.contest_id', id)
      .eq('status', 'active')

    if (activeRounds && activeRounds.length > 0) {
      throw createError({ statusCode: 400, statusMessage: 'Cannot create a new dynamic round while another is active' })
    }
  }

  const allowed = ['category_id', 'name', 'order', 'scoring_type']
  const payload: Record<string, any> = {}
  for (const key of allowed) {
    if (key in body) payload[key] = body[key]
  }

  const { data, error } = await admin.from('rounds').insert(payload).select().single()
  if (error) { console.error("[api error]", error.message); throw createError({ statusCode: 500, statusMessage: "internal_error" }) }
  return data
})
