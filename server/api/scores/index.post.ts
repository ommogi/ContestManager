import { defineEventHandler, createError, readBody } from 'h3'
import { serverSupabaseAdmin, requireAuth } from '~~/server/utils/supabase'

export default defineEventHandler(async (event) => {
  const user = requireAuth(event)
  const client = serverSupabaseAdmin()
  const body = await readBody(event)

  const { round_id, participant_id, judge_id, value, notes, promote, admin_user_id, admin_user_name } = body

  if (!round_id || !participant_id || !judge_id) {
    throw createError({ statusCode: 400, statusMessage: 'round_id, participant_id and judge_id are required' })
  }

  if (value === undefined || value === null || isNaN(Number(value))) {
    throw createError({ statusCode: 400, statusMessage: 'value is required and must be a number' })
  }

  // Auth gate: judge_id must match the authenticated user's id
  // (admins may submit on behalf of a judge via admin_user_id)
  const isAdminAction = !!admin_user_id
  if (!isAdminAction && judge_id !== user.id) {
    throw createError({ statusCode: 403, statusMessage: 'forbidden' })
  }

  // If admin action, require org owner of the contest
  if (isAdminAction) {
    const { data: round } = await client
      .from('rounds')
      .select('category_id')
      .eq('id', round_id)
      .maybeSingle()
    if (!round) {
      throw createError({ statusCode: 404, statusMessage: 'round_not_found' })
    }
    const { data: category } = await client
      .from('categories')
      .select('contest_id')
      .eq('id', round.category_id)
      .maybeSingle()
    if (!category) {
      throw createError({ statusCode: 404, statusMessage: 'category_not_found' })
    }
    const { data: contest } = await client
      .from('contests')
      .select('organization_id')
      .eq('id', category.contest_id)
      .maybeSingle()
    if (!contest) {
      throw createError({ statusCode: 404, statusMessage: 'contest_not_found' })
    }
    const { data: org } = await client
      .from('organizations')
      .select('id')
      .eq('id', contest.organization_id)
      .eq('owner_id', user.id)
      .maybeSingle()
    if (!org) {
      throw createError({ statusCode: 403, statusMessage: 'forbidden' })
    }
  }

  // Read existing score for audit
  const { data: existing } = await client
    .from('scores')
    .select('value')
    .eq('round_id', round_id)
    .eq('participant_id', participant_id)
    .eq('judge_id', judge_id)
    .maybeSingle()

  const oldValue = existing ? Number(existing.value) : null

  // Upsert score
  const { data, error } = await client
    .from('scores')
    .upsert(
      {
        round_id,
        participant_id,
        judge_id,
        value: Number(value),
        notes: notes ?? null,
        promote: promote ?? false,
        submitted_at: new Date().toISOString(),
        set_by_admin: isAdminAction,
        admin_user_id: admin_user_id ?? null,
      },
      { onConflict: 'round_id,participant_id,judge_id' }
    )
    .select()
    .single()

  if (error) throw createError({ statusCode: 500, statusMessage: error.message })

  // Write audit log
  const changedBy = admin_user_id ?? judge_id
  await client.from('score_audit_logs').insert({
    round_id,
    participant_id,
    judge_id,
    changed_by: changedBy,
    changed_by_name: admin_user_name ?? null,
    action: oldValue !== null ? 'score_updated' : 'score_set',
    old_value: oldValue,
    new_value: Number(value),
    notes: notes ?? null,
    is_admin_action: isAdminAction,
  })

  return data
})
