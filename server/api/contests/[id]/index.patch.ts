import { defineEventHandler, createError, getRouterParam, readBody } from 'h3'
import { serverSupabaseClient, serverSupabaseAdmin, requireOrgOwner } from '~~/server/utils/supabase'
import { sendContestStartedEmail } from '~~/server/utils/email'

export default defineEventHandler(async (event) => {
  const { org } = await requireOrgOwner(event)

  const client = serverSupabaseClient(event)
  const admin  = serverSupabaseAdmin()
  const idOrSlug = getRouterParam(event, 'id')
  const body = await readBody(event)

  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrSlug || '')

  // Resolve contest once (needed by multiple gates below)
  let contestRow: { id: string; status: string; organization_id: string; entry_fee_cents: number | null } | null = null
  async function loadContest() {
    if (contestRow) return contestRow
    let q = admin.from('contests').select('id, status, organization_id, entry_fee_cents').limit(1)
    if (isUUID) {
      q = q.eq('id', idOrSlug)
    } else {
      q = q.eq('slug', idOrSlug).eq('organization_id', org.id)
    }
    const { data, error } = await q.maybeSingle()
    if (error) throw createError({ statusCode: 500, statusMessage: error.message })
    if (!data) throw createError({ statusCode: 404, statusMessage: 'contest_not_found' })
    contestRow = data as any
    return contestRow
  }

  // Gate: setting entry_fee_cents > 0 requires org.stripe_charges_enabled
  if (typeof body?.entry_fee_cents === 'number' && body.entry_fee_cents > 0) {
    const cur = await loadContest()
    if (!org.stripe_charges_enabled) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Completa el onboarding de Stripe antes de cobrar inscripciones.',
      })
    }
  }

  // Once a contest has been activated, it cannot be reverted to 'draft'.
  // Terminal states ('finished', 'cancelled') are still allowed.
  if (typeof body?.status === 'string' && body.status === 'draft') {
    const cur = await loadContest()
    if (cur!.status === 'active' || cur!.status === 'finished') {
      throw createError({
        statusCode: 409,
        statusMessage: 'No se puede desactivar un concurso que ya fue activado.',
      })
    }
  }

  // If transitioning to 'active', gate on activation balance + Stripe onboarding (if fee > 0)
  if (body?.status === 'active') {
    const cur = await loadContest()
    const effectiveFee = typeof body?.entry_fee_cents === 'number' ? body.entry_fee_cents : (cur!.entry_fee_cents ?? 0)
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
        throw createError({ statusCode: 500, statusMessage: actErr.message })
      }
    }
  }

  // Use resolved id to avoid slug collision across orgs
  const cur = await loadContest()
  const prevStatus = cur!.status
  const { data, error } = await client.from('contests').update(body).eq('id', cur!.id).select().single()
  if (error) throw createError({ statusCode: 500, statusMessage: error.message })

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
      }).catch(() => {})
    }
  }

  return data
})
