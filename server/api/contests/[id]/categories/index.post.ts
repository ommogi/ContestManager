import { defineEventHandler, createError, getRouterParam, readBody } from 'h3'
import { serverSupabaseAdmin, requireOrgOwnerOrMember, internalError } from '~~/server/utils/supabase'
import { CategoryCreateSchema } from '~~/server/utils/schemas'
import { plannedRoundNames } from '~~/shared/round-plan'
import { scoringTypeFor } from '~~/shared/voting'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing contest ID' })
  await requireOrgOwnerOrMember(event, id)

  const admin = serverSupabaseAdmin()
  const rawBody = await readBody(event)
  const parsed = CategoryCreateSchema.safeParse(rawBody)
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid request', data: parsed.error.issues })
  }
  const body = parsed.data as Record<string, any>

  const allowed = ['name', 'description', 'max_participants', 'min_age', 'max_age', 'entry_fee_cents']
  const payload: Record<string, any> = { contest_id: id }
  for (const key of allowed) {
    if (key in body) payload[key] = body[key]
  }

  const { data, error } = await admin.from('categories').insert(payload).select().single()
  if (error) { console.error("[api error]", error.message); throw createError({ statusCode: 500, statusMessage: "internal_error" }) }

  // KAN-26: the organisation already knows the structure, so create it now.
  const names = plannedRoundNames(body.rounds_count)
  if (names.length === 0) return { ...(data as Record<string, any>), rounds: [] }

  // Draft rounds, scored the way the contest scores (KAN-23). `is_final` is
  // left alone: marking it is what creates the Ranking round, and a final
  // without one would be a half-made category.
  const { data: contest } = await admin
    .from('contests')
    .select('voting_system')
    .eq('id', id)
    .maybeSingle()
  const scoringType = scoringTypeFor((contest as any)?.voting_system)

  const categoryId = (data as any).id
  const { data: rounds, error: roundsError } = await admin
    .from('rounds')
    .insert(names.map((name, index) => ({
      category_id: categoryId,
      name,
      order: index + 1,
      status: 'pending',
      scoring_type: scoringType,
    })) as never)
    .select()
    .order('order', { ascending: true })

  if (roundsError) {
    // A category whose rounds never arrived is not what was asked for, and
    // silence would leave the organisation to discover it later. Undo it.
    await admin.from('categories').delete().eq('id', categoryId)
    throw internalError(event, roundsError, 'rounds.insert')
  }

  return { ...(data as Record<string, any>), rounds: rounds ?? [] }
})
