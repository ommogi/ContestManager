import { defineEventHandler, createError, getRouterParam } from 'h3'
import { serverSupabaseAdmin } from '~~/server/utils/supabase'

export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token')
  if (!token) throw createError({ statusCode: 400, statusMessage: 'Missing token' })

  const admin = serverSupabaseAdmin()

  const { data: invitation, error } = await admin
    .from('judge_pool_invitations')
    .select('id, organization_id, email, full_name, specialty, invitation_status, invited_at, responded_at')
    .eq('invitation_token', token)
    .maybeSingle()

  if (error) {
    console.error('[invitations.pool.get]', error.message)
    throw createError({ statusCode: 500, statusMessage: 'internal_error' })
  }
  if (!invitation) throw createError({ statusCode: 404, statusMessage: 'Invitation not found' })

  const { data: org } = await admin
    .from('organizations')
    .select('id, name')
    .eq('id', invitation.organization_id as string)
    .maybeSingle()

  return {
    invitation: {
      id: invitation.id,
      email: invitation.email,
      full_name: invitation.full_name,
      specialty: invitation.specialty,
      status: invitation.invitation_status,
      invited_at: invitation.invited_at,
      responded_at: invitation.responded_at,
    },
    organization: org
      ? {
          id: org.id,
          name: org.name,
        }
      : null,
  }
})
