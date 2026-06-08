import { defineEventHandler, createError, getRouterParam, readBody } from 'h3'
import { serverSupabaseAdmin, requireOrgOwner } from '~~/server/utils/supabase'
import { JudgePoolInviteSchema } from '~~/server/utils/schemas'
import { sendJudgePoolInvitationEmail } from '~~/server/utils/email'

export default defineEventHandler(async (event) => {
  const { org, user } = await requireOrgOwner(event)
  const orgId = getRouterParam(event, 'orgId')
  if (!orgId || orgId !== org.id) {
    throw createError({ statusCode: 403, statusMessage: 'forbidden' })
  }

  const rawBody = await readBody(event)
  const parsed = JudgePoolInviteSchema.safeParse(rawBody)
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid request', data: parsed.error.issues })
  }

  const { email, full_name, specialty } = parsed.data
  const normalizedEmail = email.toLowerCase().trim()

  const client = serverSupabaseAdmin()

  // Prevent duplicate pending invitation for same org+email
  const { data: existingPending } = await client
    .from('judge_pool_invitations')
    .select('id')
    .eq('organization_id', orgId)
    .eq('email', normalizedEmail)
    .eq('invitation_status', 'pending')
    .maybeSingle()

  if (existingPending) {
    throw createError({ statusCode: 409, statusMessage: 'Ya existe una invitación pendiente para este correo.' })
  }

  // Prevent inviting someone already in the pool
  const { data: existingJudge } = await client
    .from('judges')
    .select('id')
    .eq('email', normalizedEmail)
    .maybeSingle()

  if (existingJudge?.id) {
    const { data: existingPool } = await client
      .from('judge_pool_members')
      .select('id')
      .eq('organization_id', orgId)
      .eq('judge_id', existingJudge.id)
      .maybeSingle()

    if (existingPool) {
      throw createError({ statusCode: 409, statusMessage: 'Este jurado ya pertenece al pool de la organización.' })
    }
  }

  const { data: invitation, error } = await client
    .from('judge_pool_invitations')
    .insert({
      organization_id: orgId,
      email: normalizedEmail,
      full_name: full_name || null,
      specialty: specialty || null,
      invited_by: user.id,
    })
    .select()
    .single()

  if (error) {
    console.error('[judge-pool.invite]', error.message)
    throw createError({ statusCode: 500, statusMessage: 'internal_error' })
  }

  // Fire-and-forget email
  const token = invitation.invitation_token as string
  const baseUrl = process.env.APP_BASE_URL || 'https://contestsaas.app'
  const inviteUrl = `${baseUrl}/invite/pool/${token}`

  ;(async () => {
    try {
      let inviterName: string | null = null
      const { data: profile } = await client
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .maybeSingle()
      inviterName = (profile?.full_name as string) || null

      await sendJudgePoolInvitationEmail({
        to: normalizedEmail,
        organization_name: org.name,
        invited_by_name: inviterName,
        invite_url: inviteUrl,
      })
    } catch (e: any) {
      console.error('[judge-pool.invite] email failed:', e?.message)
    }
  })()

  return invitation
})
