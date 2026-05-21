import { defineEventHandler, createError, getRouterParam, readBody } from 'h3'
import { z } from 'zod'
import { serverSupabaseAdmin, requireAuth } from '~~/server/utils/supabase'
import { insertNotifications } from '~~/server/utils/notifications'

const RespondSchema = z.object({
  action: z.enum(['accept', 'reject']),
})

export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token')
  if (!token) throw createError({ statusCode: 400, statusMessage: 'Missing token' })

  const user = requireAuth(event)
  const rawBody = await readBody(event)
  const parsed = RespondSchema.safeParse(rawBody)
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid request', data: parsed.error.issues })
  }
  const { action } = parsed.data

  const admin = serverSupabaseAdmin()

  const { data: member, error: memberErr } = await admin
    .from('contest_members')
    .select('id, contest_id, email, user_id, invitation_status, full_name, role')
    .eq('invitation_token', token)
    .maybeSingle()

  if (memberErr) {
    console.error('[invitations.respond]', memberErr.message)
    throw createError({ statusCode: 500, statusMessage: 'internal_error' })
  }
  if (!member) throw createError({ statusCode: 404, statusMessage: 'Invitation not found' })

  if (member.invitation_status !== 'pending') {
    throw createError({ statusCode: 409, statusMessage: `Invitation already ${member.invitation_status}` })
  }

  const userEmail = (user.email || '').toLowerCase()
  const memberEmail = ((member.email as string) || '').toLowerCase()
  const matches = member.user_id === user.id || (!!memberEmail && memberEmail === userEmail)
  if (!matches) {
    throw createError({ statusCode: 403, statusMessage: 'Esta invitación pertenece a otro correo electrónico.' })
  }

  const nextStatus = action === 'accept' ? 'accepted' : 'rejected'
  const { error: updErr } = await admin
    .from('contest_members')
    .update({
      invitation_status: nextStatus,
      responded_at: new Date().toISOString(),
      user_id: user.id,
    })
    .eq('id', member.id as string)

  if (updErr) {
    console.error('[invitations.respond] update failed:', updErr.message)
    throw createError({ statusCode: 500, statusMessage: 'internal_error' })
  }

  // Auto-add judge to the organization's pool on acceptance (best-effort, never blocks).
  if (action === 'accept') {
    try {
      const { data: contest } = await admin
        .from('contests')
        .select('organization_id')
        .eq('id', member.contest_id as string)
        .maybeSingle()

      const orgId = contest?.organization_id as string | undefined
      if (orgId && memberEmail) {
        // Find or create judge
        let judgeId: string
        const { data: existingJudge } = await admin
          .from('judges')
          .select('id')
          .eq('email', memberEmail)
          .maybeSingle()

        if (existingJudge?.id) {
          judgeId = existingJudge.id
          const updates: Record<string, any> = {}
          if (member.full_name) {
            const { data: j } = await admin.from('judges').select('full_name').eq('id', judgeId).maybeSingle()
            if (!j?.full_name) updates.full_name = member.full_name
          }
          if (Object.keys(updates).length) {
            await admin.from('judges').update(updates).eq('id', judgeId)
          }
        } else {
          const { data: newJudge, error: jErr } = await admin
            .from('judges')
            .insert({
              full_name: (member.full_name as string) || memberEmail.split('@')[0] || memberEmail,
              email: memberEmail,
            })
            .select('id')
            .single()
          if (!jErr && newJudge) judgeId = newJudge.id
          else judgeId = ''
        }

        if (judgeId) {
          await admin.from('judge_pool_members').insert({
            organization_id: orgId,
            judge_id: judgeId,
          }).then(() => {}, () => {}) // ignore duplicates
        }
      }
    } catch (e: any) {
      console.error('[invitations.respond] auto-add to pool failed:', e?.message)
    }
  }

  // Notify the org owner about the response (best-effort).
  try {
    const { data: contest } = await admin
      .from('contests')
      .select('name, slug, organization_id')
      .eq('id', member.contest_id as string)
      .maybeSingle()

    const contestName = (contest?.name as string) || 'el concurso'
    const contestSlug = (contest?.slug as string) || null
    const judgeLabel = (member.full_name as string) || (member.email as string) || 'El jurado invitado'
    const verb = action === 'accept' ? 'ha aceptado' : 'ha rechazado'
    const rows: any[] = []

    if (contest?.organization_id) {
      const { data: org } = await admin
        .from('organizations')
        .select('owner_id')
        .eq('id', contest.organization_id as string)
        .maybeSingle()

      if (org?.owner_id) {
        rows.push({
          user_id: org.owner_id as string,
          type: (action === 'accept' ? 'judge_invitation_accepted' : 'judge_invitation_rejected') as any,
          title: action === 'accept' ? 'Jurado aceptó la invitación' : 'Jurado rechazó la invitación',
          body: `${judgeLabel} ${verb} la invitación al concurso "${contestName}".`,
          payload: {
            contest_id: member.contest_id,
            contest_name: contestName,
            contest_slug: contestSlug,
            member_id: member.id,
          },
        })
      }
    }

    // Confirmation notification for the judge themselves
    rows.push({
      user_id: user.id,
      type: (action === 'accept' ? 'judge_invitation_self_accepted' : 'judge_invitation_self_rejected') as any,
      title: action === 'accept' ? 'Invitación aceptada' : 'Invitación rechazada',
      body: action === 'accept'
        ? `Has aceptado la invitación al concurso "${contestName}". Ya puedes acceder al panel para puntuar.`
        : `Has rechazado la invitación al concurso "${contestName}".`,
      payload: {
        contest_id: member.contest_id,
        contest_name: contestName,
        contest_slug: contestSlug,
        member_id: member.id,
      },
    })

    if (rows.length) await insertNotifications(admin, rows)
  } catch (e: any) {
    console.error('[invitations.respond] owner notify failed:', e?.message)
  }

  return { success: true, status: nextStatus }
})
