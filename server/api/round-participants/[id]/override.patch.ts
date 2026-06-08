import { defineEventHandler, createError, getRouterParam, readBody } from 'h3'
import { serverSupabaseAdmin, requireOrgOwnerOrMember } from '~~/server/utils/supabase'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing ID' })

  const admin = serverSupabaseAdmin()

  // Resolve contest_id for auth gate
  const { data: rp } = await admin
    .from('round_participants')
    .select('round_id')
    .eq('id', id)
    .maybeSingle()
  if (!rp) throw createError({ statusCode: 404, statusMessage: 'round_participant_not_found' })

  const { data: round } = await admin
    .from('rounds')
    .select('category_id')
    .eq('id', rp.round_id)
    .maybeSingle()
  if (!round) throw createError({ statusCode: 404, statusMessage: 'round_not_found' })

  const { data: category } = await admin
    .from('categories')
    .select('contest_id')
    .eq('id', round.category_id)
    .maybeSingle()
  if (!category) throw createError({ statusCode: 404, statusMessage: 'category_not_found' })
  await requireOrgOwnerOrMember(event, category.contest_id)

  const user = event.context.user as { id: string; email?: string } | undefined
  const body = await readBody(event)
  const { final_score_override, final_score_override_notes } = body

  // Read existing for audit
  const { data: existing } = await admin
    .from('round_participants')
    .select('final_score_override, round_id, participant_id')
    .eq('id', id)
    .single()

  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Round participant not found' })

  const isRemoving = final_score_override === null || final_score_override === undefined

  const { data, error } = await admin
    .from('round_participants')
    .update({
      final_score_override: isRemoving ? null : Number(final_score_override),
      final_score_override_by: isRemoving ? null : user?.id ?? null,
      final_score_override_at: isRemoving ? null : new Date().toISOString(),
      final_score_override_notes: isRemoving ? null : (final_score_override_notes ?? null),
    })
    .eq('id', id)
    .select()
    .single()

  if (error) { console.error("[api error]", error.message); throw createError({ statusCode: 500, statusMessage: "internal_error" }) }

  // Audit log
  await admin.from('score_audit_logs').insert({
    round_id: existing.round_id,
    participant_id: existing.participant_id,
    judge_id: null,
    changed_by: user?.id ?? null,
    changed_by_name: user?.email ?? null,
    action: isRemoving ? 'override_removed' : 'override_set',
    old_value: existing.final_score_override ? Number(existing.final_score_override) : null,
    new_value: isRemoving ? null : Number(final_score_override),
    notes: final_score_override_notes ?? null,
    is_admin_action: true,
  })

  return data
})
