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

  const { data: invitation, error: invErr } = await admin
    .from('judge_pool_invitations')
    .select('id, organization_id, email, full_name, specialty, invitation_status')
    .eq('invitation_token', token)
    .maybeSingle()

  if (invErr) {
    console.error('[invitations.pool.respond]', invErr.message)
    throw createError({ statusCode: 500, statusMessage: 'internal_error' })
  }
  if (!invitation) throw createError({ statusCode: 404, statusMessage: 'Invitation not found' })

  if (invitation.invitation_status !== 'pending') {
    throw createError({ statusCode: 409, statusMessage: `Invitation already ${invitation.invitation_status}` })
  }

  const userEmail = (user.email || '').toLowerCase()
  const inviteEmail = ((invitation.email as string) || '').toLowerCase()
  if (inviteEmail !== userEmail) {
    throw createError({ statusCode: 403, statusMessage: 'Esta invitación pertenece a otro correo electrónico.' })
  }

  const nextStatus = action === 'accept' ? 'accepted' : 'rejected'

  // If accepting: create judges row + judge_pool_members link
  if (action === 'accept') {
    // 1. Find or create judge
    let judgeId: string
    const { data: existingJudge } = await admin
      .from('judges')
      .select('id')
      .eq('email', inviteEmail)
      .maybeSingle()

    if (existingJudge?.id) {
      judgeId = existingJudge.id
      // Update full_name/specialty if provided and currently empty
      const updates: Record<string, any> = {}
      if (invitation.full_name) {
        const { data: j } = await admin.from('judges').select('full_name').eq('id', judgeId).maybeSingle()
        if (!j?.full_name) updates.full_name = invitation.full_name
      }
      if (invitation.specialty) {
        const { data: j } = await admin.from('judges').select('specialty').eq('id', judgeId).maybeSingle()
        if (!j?.specialty) updates.specialty = invitation.specialty
      }
      if (Object.keys(updates).length) {
        await admin.from('judges').update(updates).eq('id', judgeId)
      }
    } else {
      const { data: newJudge, error: judgeErr } = await admin
        .from('judges')
        .insert({
          full_name: invitation.full_name || inviteEmail.split('@')[0] || inviteEmail,
          email: inviteEmail,
          specialty: invitation.specialty || null,
        })
        .select('id')
        .single()

      if (judgeErr || !newJudge) {
        console.error('[invitations.pool.respond] judge create failed:', judgeErr?.message)
        throw createError({ statusCode: 500, statusMessage: 'internal_error' })
      }
      judgeId = newJudge.id
    }

    // 2. Link to organization (ignore duplicate)
    const { error: linkErr } = await admin
      .from('judge_pool_members')
      .insert({
        organization_id: invitation.organization_id as string,
        judge_id: judgeId,
      })

    if (linkErr && (linkErr as any).code !== '23505') {
      console.error('[invitations.pool.respond] link failed:', linkErr.message)
      throw createError({ statusCode: 500, statusMessage: 'internal_error' })
    }
  }

  // 3. Update invitation status
  const { error: updErr } = await admin
    .from('judge_pool_invitations')
    .update({
      invitation_status: nextStatus,
      responded_at: new Date().toISOString(),
    })
    .eq('id', invitation.id as string)

  if (updErr) {
    console.error('[invitations.pool.respond] update failed:', updErr.message)
    throw createError({ statusCode: 500, statusMessage: 'internal_error' })
  }

  // Notify org owner (best-effort)
  try {
    const { data: org } = await admin
      .from('organizations')
      .select('owner_id, name')
      .eq('id', invitation.organization_id as string)
      .maybeSingle()

    const orgName = (org?.name as string) || 'la organización'
    const judgeLabel = (invitation.full_name as string) || inviteEmail || 'El jurado invitado'
    const rows: any[] = []

    if (org?.owner_id) {
      rows.push({
        user_id: org.owner_id as string,
        type: (action === 'accept' ? 'judge_pool_invitation_accepted' : 'judge_pool_invitation_rejected') as any,
        title: action === 'accept' ? 'Jurado aceptó la invitación al pool' : 'Jurado rechazó la invitación al pool',
        body: `${judgeLabel} ${action === 'accept' ? 'ha aceptado' : 'ha rechazado'} la invitación al pool de jurados de "${orgName}".`,
        payload: {
          organization_id: invitation.organization_id,
          invitation_id: invitation.id,
        },
      })
    }

    // Confirmation for judge
    rows.push({
      user_id: user.id,
      type: (action === 'accept' ? 'judge_pool_invitation_self_accepted' : 'judge_pool_invitation_self_rejected') as any,
      title: action === 'accept' ? 'Invitación al pool aceptada' : 'Invitación al pool rechazada',
      body: action === 'accept'
        ? `Has aceptado la invitación al pool de jurados de "${orgName}". Ahora puedes ser asignado a concursos.`
        : `Has rechazado la invitación al pool de jurados de "${orgName}".`,
      payload: {
        organization_id: invitation.organization_id,
        invitation_id: invitation.id,
      },
    })

    if (rows.length) await insertNotifications(admin, rows)
  } catch (e: any) {
    console.error('[invitations.pool.respond] notify failed:', e?.message)
  }

  return { success: true, status: nextStatus }
})
