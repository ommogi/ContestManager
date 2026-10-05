import { defineEventHandler, createError, readBody } from 'h3'
import {
  serverSupabaseAdmin,
  requireAuth,
  requireContestOrganizer,
  requireContestJudgeOrOrganizer,
  internalError,
} from '~~/server/utils/supabase'
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

  // Auth gate. Before this, a judge could score in another judge's name (the
  // "admin override" only asked for any contest member) and score in a closed
  // round, and any signed-in user could score any open round under their own
  // id, since membership was never checked on that path.
  //   * Scoring for someone else is the organiser's override, never a judge's.
  //   * Scoring as oneself needs to be a judge (or organiser) of this contest.
  //   * Outside an open round only the organiser may write; a judge gets the
  //     round's own reason from checkScoreSubmission below.
  let isAdminAction = false
  if (judge_id !== user.id) {
    await requireContestOrganizer(event, await contestId())
    isAdminAction = true
  } else {
    const access = await requireContestJudgeOrOrganizer(event, await contestId())
    const isOrganizer = !access.member || access.member.role === 'organizer'
    if (round.status !== 'active' && isOrganizer) isAdminAction = true
  }

  // The participant must be in this round, or a score could be pinned on
  // someone from another round or contest.
  const { data: inRound } = await client
    .from('round_participants')
    .select('id')
    .eq('round_id', round_id)
    .eq('participant_id', participant_id)
    .maybeSingle()
  if (!inRound) {
    throw createError({ statusCode: 404, statusMessage: 'participant_not_in_round' })
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
