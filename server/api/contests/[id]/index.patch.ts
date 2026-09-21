import { defineEventHandler, createError, getRouterParam, readBody } from 'h3'
import { serverSupabaseAdmin, requireOrgOwner, internalError } from '~~/server/utils/supabase'
import { sendContestStartedEmail } from '~~/server/utils/email'
import { rejectPendingJudgeInvitations } from '~~/server/services/contest-activation'
import { ContestPatchSchema } from '~~/server/utils/schemas'

export default defineEventHandler(async (event) => {
  const { org } = await requireOrgOwner(event)

  const admin  = serverSupabaseAdmin()
  const idOrSlug = getRouterParam(event, 'id')
  const rawBody = await readBody(event)

  const parsed = ContestPatchSchema.safeParse(rawBody)
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid request', data: parsed.error.issues })
  }
  const body = parsed.data

  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrSlug || '')

  // Resolve contest once (needed by multiple gates below)
  let contestRow: { id: string; status: string; organization_id: string; entry_fee_cents: number | null } | null = null
  async function loadContest() {
    if (contestRow) return contestRow
    let q = admin.from('contests').select('id, status, organization_id, entry_fee_cents').limit(1)
    if (isUUID) {
      q = q.eq('id', idOrSlug).eq('organization_id', org.id)
    } else {
      q = q.eq('slug', idOrSlug).eq('organization_id', org.id)
    }
    const { data, error } = await q.maybeSingle()
    if (error) { console.error("[api error]", error.message); throw createError({ statusCode: 500, statusMessage: "internal_error" }) }
    if (!data) throw createError({ statusCode: 404, statusMessage: 'contest_not_found' })
    contestRow = data as any
    return contestRow
  }

  // A finished or cancelled contest is closed for good: no status change and no
  // edits of any other field. Reaching those states is still allowed — this only
  // locks the contest once it is already there.
  {
    const cur = await loadContest()
    if (cur!.status === 'finished' || cur!.status === 'cancelled') {
      throw createError({
        statusCode: 409,
        statusMessage: cur!.status === 'finished'
          ? 'El concurso está finalizado y no se puede modificar.'
          : 'El concurso está cancelado y no se puede modificar.',
      })
    }
  }

  // Gate: setting entry_fee_cents > 0 requires org.stripe_charges_enabled
  if (typeof body.entry_fee_cents === 'number' && body.entry_fee_cents > 0) {
    await loadContest()
    if (!org.stripe_charges_enabled) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Completa el onboarding de Stripe antes de cobrar inscripciones.',
      })
    }
  }

  // KAN-23: the voting system is locked once anyone has voted. Changing it
  // would reinterpret the votes already cast — a mark is not a pass/no pass.
  if (body.voting_system) {
    const cur = await loadContest()
    const { data: current } = await admin
      .from('contests')
      .select('voting_system')
      .eq('id', cur!.id)
      .maybeSingle()
    const stored = (current as any)?.voting_system ?? 'numeric'
    if (body.voting_system !== stored) {
      const { count, error: scoreErr } = await admin
        .from('scores')
        .select('id, rounds!inner(categories!inner(contest_id))', { count: 'exact', head: true })
        .eq('rounds.categories.contest_id', cur!.id)
      if (scoreErr) throw internalError(event, scoreErr, 'scores.select')
      if ((count ?? 0) > 0) {
        throw createError({
          statusCode: 409,
          statusMessage: 'Ya hay puntuaciones registradas: el sistema de votación no se puede cambiar.',
        })
      }
    }
  }

  // Once a contest has been activated, it cannot be reverted to 'draft'.
  // Terminal states ('finished', 'cancelled') are still allowed.
  if (body.status === 'draft') {
    const cur = await loadContest()
    if (cur!.status === 'active' || cur!.status === 'finished') {
      throw createError({
        statusCode: 409,
        statusMessage: 'No se puede desactivar un concurso que ya fue activado.',
      })
    }
  }

  // If transitioning to 'active', gate on activation balance + Stripe onboarding (if fee > 0)
  if (body.status === 'active') {
    const cur = await loadContest()
    const effectiveFee = typeof body.entry_fee_cents === 'number' ? body.entry_fee_cents : (cur!.entry_fee_cents ?? 0)
    if (effectiveFee > 0 && !org.stripe_charges_enabled) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Completa el onboarding de Stripe antes de activar un concurso con tarifa.',
      })
    }

    if (cur!.status !== 'active') {
      // Consume 1 activation BEFORE flipping status
      const { error: actErr } = await admin.rpc('consume_activation', {
        p_org_id: cur!.organization_id,
        p_contest_id: cur!.id,
      })
      if (actErr) {
        if ((actErr.message || '').toLowerCase().includes('insufficient_activations')) {
          throw createError({
            statusCode: 402,
            statusMessage: 'Sin activaciones disponibles. Compra un paquete en /billing.',
          })
        }
        throw internalError(event, actErr, 'rpc:consume_activation')
      }

      // Reject all pending judge invitations when contest starts
      await rejectPendingJudgeInvitations(admin, cur!.id, cur!.name)
    }
  }

  const updates = Object.fromEntries(
    Object.entries(body).filter(([, v]) => v !== undefined),
  )

  // Use resolved id to avoid slug collision across orgs
  const cur = await loadContest()
  const prevStatus = cur!.status
  const { data, error } = await admin.from('contests').update(updates).eq('id', cur!.id).select().single()
  if (error) { console.error("[api error]", error.message); throw createError({ statusCode: 500, statusMessage: "internal_error" }) }

  // Send contest_started emails (fire-and-forget)
  if (body.status === 'active' && prevStatus !== 'active') {
    const { data: participants } = await admin
      .from('participants')
      .select('email, first_name, name')
      .eq('contest_id', data.id)
      .eq('status', 'active')
      .not('email', 'is', null)

    for (const p of participants ?? []) {
      if (!p.email) continue
      sendContestStartedEmail({
        to: p.email,
        first_name: p.first_name || p.name,
        contest_name: data.name,
        contest_slug: data.slug,
      }).catch((e: any) => { console.error('[contests.patch] email failed:', e?.message) })
    }
  }

  return data
})
