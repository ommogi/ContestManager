import { defineEventHandler, createError, readBody } from 'h3'
import { serverSupabaseAdmin, requireAuth, requireOrgOwnerOrMember, internalError } from '~~/server/utils/supabase'
import { ScoreBodySchema } from '~~/server/utils/schemas'
import { checkScoreSubmission } from '~~/shared/voting'

export default defineEventHandler(async (event) => {
  const user = requireAuth(event)
  const client = serverSupabaseAdmin()
  const rawBody = await readBody(event)
  const parsed = ScoreBodySchema.safeParse(rawBody)
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid request', data: parsed.error.issues })
  }
  const { round_id, participant_id, judge_id, value, notes, promote } = parsed.data

  // The round is read for everyone now, not only for the admin override: its
  // status and its scoring_type are what decide whether this score is allowed
  // at all (KAN-24).
  const { data: round } = await client
    .from('rounds')
    .select('category_id, status, scoring_type')
    .eq('id', round_id)
    .maybeSingle()
  if (!round) {
    throw createError({ statusCode: 404, statusMessage: 'round_not_found' })
  }

  async function contestId(): Promise<string> {
    const { data: category } = await client
      .from('categories')
      .select('contest_id')
      .eq('id', round!.category_id)
      .maybeSingle()
    if (!category) {
      throw createError({ statusCode: 404, statusMessage: 'category_not_found' })
    }
    return category.contest_id as string
  }

  // Auth gate: if judge_id doesn't match the authenticated user,
  // require org owner or accepted contest member of the contest (admin override)
  let isAdminAction = false
  if (judge_id !== user.id) {
    await requireOrgOwnerOrMember(event, await contestId())
    isAdminAction = true
  } else if (round.status !== 'active') {
    // Writing one's own score outside an open round is a judge's mistake but an
    // organiser's job — an owner who also sits on the jury corrects their own
    // row like any other. Only asked here, so the ordinary path stays one query.
    try {
      await requireOrgOwnerOrMember(event, await contestId())
      isAdminAction = true
    } catch {
      // Not an organiser: the guard below answers with the round's own reason.
    }
  }

  const check = checkScoreSubmission({
    scoringType: round.scoring_type,
    roundStatus: round.status,
    value: Number(value),
    isAdminAction,
  })
  if (!check.ok) {
    throw createError({ statusCode: check.status, statusMessage: check.code })
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
    const { error: auditError } = await client.from('score_audit_logs').insert({
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
    if (auditError) {
      throw internalError(event, auditError, 'score_audit_logs.insert', 'audit_log_failed')
    }
  }

  return data
})
