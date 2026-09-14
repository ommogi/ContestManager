import { defineEventHandler, createError, getRouterParam } from 'h3'
import { internalError, serverSupabaseAdmin, requireOrgOwnerOrMember } from '~~/server/utils/supabase'
import { sendJudgeInvitationEmail } from '~~/server/utils/email'

export default defineEventHandler(async (event) => {
  const contestId = getRouterParam(event, 'id')
  const memberId  = getRouterParam(event, 'memberId')
  if (!contestId || !memberId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing route params' })
  }

  await requireOrgOwnerOrMember(event, contestId)
  const admin = serverSupabaseAdmin()

  const { data: member, error: memberErr } = await admin
    .from('contest_members')
    .select('id, role, email, invitation_status, invitation_token, contest_id')
    .eq('id', memberId)
    .eq('contest_id', contestId)
    .maybeSingle()

  if (memberErr) {
    console.error('[members.resend]', memberErr.message)
    throw createError({ statusCode: 500, statusMessage: 'internal_error' })
  }
  if (!member) throw createError({ statusCode: 404, statusMessage: 'Member not found' })

  if (member.role !== 'judge') {
    throw createError({ statusCode: 400, statusMessage: 'Solo se pueden reenviar invitaciones a jurados' })
  }
  if (member.invitation_status !== 'pending') {
    throw createError({ statusCode: 409, statusMessage: `Invitation already ${member.invitation_status}` })
  }
  if (!member.email || !member.invitation_token) {
    throw createError({ statusCode: 400, statusMessage: 'Invitation missing email or token' })
  }

  // KAN-40: resending rotates the token and opens a fresh window, so the link
  // that was already out there stops working. Re-sending the same token made
  // resend useless against the case this guards: a leaked invitation the
  // organizer had no way to kill.
  const { data: rotated, error: rotateError } = await admin
    .rpc('rotate_contest_member_invitation', { p_member_id: member.id })

  if (rotateError) {
    throw internalError(event, rotateError, 'rpc:rotate_contest_member_invitation')
  }
  if (!rotated) {
    // The row stopped being pending between the read above and this write.
    throw createError({ statusCode: 409, statusMessage: 'Invitation already answered' })
  }

  const baseUrl   = process.env.APP_BASE_URL || 'https://contestsaas.app'
  const inviteUrl = `${baseUrl}/invite/${rotated as string}`

  const { data: contest } = await admin
    .from('contests')
    .select('name, organization_id')
    .eq('id', contestId)
    .maybeSingle()
  const contestName = (contest?.name as string) || 'concurso'

  let orgName: string | null = null
  let inviterName: string | null = null
  if (contest?.organization_id) {
    const { data: org } = await admin
      .from('organizations')
      .select('name, owner_id')
      .eq('id', contest.organization_id as string)
      .maybeSingle()
    orgName = (org?.name as string) || null
    if (org?.owner_id) {
      const { data: profile } = await admin
        .from('profiles')
        .select('full_name')
        .eq('id', org.owner_id as string)
        .maybeSingle()
      inviterName = (profile?.full_name as string) || null
    }
  }

  const result = await sendJudgeInvitationEmail({
    to: member.email as string,
    contest_name: contestName,
    organization_name: orgName,
    invited_by_name: inviterName,
    invite_url: inviteUrl,
  })

  return { success: true, sent: result?.sent ?? false }
})
