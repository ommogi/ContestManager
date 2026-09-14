import { defineEventHandler, createError, getRouterParam } from 'h3'
import { serverSupabaseAdmin, requireOrgOwner } from '~~/server/utils/supabase'
import { sendJudgePoolInvitationEmail } from '~~/server/utils/email'
import { appBaseUrl } from '~~/server/utils/app-url'

export default defineEventHandler(async (event) => {
  const { org } = await requireOrgOwner(event)
  const orgId = getRouterParam(event, 'orgId')
  const id = getRouterParam(event, 'id')
  if (!orgId || orgId !== org.id) {
    throw createError({ statusCode: 403, statusMessage: 'forbidden' })
  }
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing invitation id' })

  const client = serverSupabaseAdmin()

  const { data: invitation, error } = await client
    .from('judge_pool_invitations')
    .select('id, email, full_name, specialty, invitation_status, invitation_token')
    .eq('id', id)
    .eq('organization_id', orgId)
    .maybeSingle()

  if (error) {
    console.error('[judge-pool.invitations.resend]', error.message)
    throw createError({ statusCode: 500, statusMessage: 'internal_error' })
  }
  if (!invitation) throw createError({ statusCode: 404, statusMessage: 'Invitation not found' })
  if (invitation.invitation_status !== 'pending') {
    throw createError({ statusCode: 409, statusMessage: 'La invitación ya ha sido respondida.' })
  }

  // KAN-40: a resend issues a new token and a new window; the previous link
  // dies with it. See the contest-member resend for why.
  const { data: rotated, error: rotateError } = await admin
    .rpc('rotate_judge_pool_invitation', { p_invitation_id: invitation.id })

  if (rotateError) {
    throw internalError(event, rotateError, 'rpc:rotate_judge_pool_invitation')
  }
  if (!rotated) {
    throw createError({ statusCode: 409, statusMessage: 'La invitación ya ha sido respondida.' })
  }

  // Fire-and-forget resend email
  const token = rotated as string
  const baseUrl = appBaseUrl()
  const inviteUrl = `${baseUrl}/invite/pool/${token}`

  ;(async () => {
    try {
      await sendJudgePoolInvitationEmail({
        to: invitation.email as string,
        organization_name: org.name,
        invited_by_name: null,
        invite_url: inviteUrl,
      })
    } catch (e: any) {
      console.error('[judge-pool.invitations.resend] email failed:', e?.message)
    }
  })()

  return { success: true }
})
