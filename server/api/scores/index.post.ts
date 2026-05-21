import { defineEventHandler, createError, readBody } from 'h3'
import { serverSupabaseAdmin, requireAuth } from '~~/server/utils/supabase'
import { ScoreBodySchema } from '~~/server/utils/schemas'

export default defineEventHandler(async (event) => {
  const user = requireAuth(event)
  const client = serverSupabaseAdmin()
  const rawBody = await readBody(event)
  const parsed = ScoreBodySchema.safeParse(rawBody)
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid request', data: parsed.error.issues })
  }
  const { round_id, participant_id, judge_id, value, notes, promote } = parsed.data

  // Auth gate: if judge_id doesn't match the authenticated user,
  // require org owner of the contest (admin override)
  let isAdminAction = false
  if (judge_id !== user.id) {
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
    isAdminAction = true
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
        admin_user_id: isAdminAction ? user.id : null,
      },
      { onConflict: 'round_id,participant_id,judge_id' }
    )
    .select()
    .single()

  if (error) { console.error("[api error]", error.message); throw createError({ statusCode: 500, statusMessage: "internal_error" }) }

  // Write audit log only if the value actually changed (prevents duplicates on retry)
  const newValueNum = Number(value)
  if (oldValue === null || oldValue !== newValueNum) {
    await client.from('score_audit_logs').insert({
      round_id,
      participant_id,
      judge_id,
      changed_by: user.id,
      changed_by_name: user.email ?? null,
      action: oldValue !== null ? 'score_updated' : 'score_set',
      old_value: oldValue,
      new_value: newValueNum,
      notes: notes ?? null,
      is_admin_action: isAdminAction,
    })
  }

  return data
})
