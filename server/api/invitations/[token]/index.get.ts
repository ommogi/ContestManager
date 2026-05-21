import { defineEventHandler, createError, getRouterParam } from 'h3'
import { serverSupabaseAdmin } from '~~/server/utils/supabase'

export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token')
  if (!token) throw createError({ statusCode: 400, statusMessage: 'Missing token' })

  const admin = serverSupabaseAdmin()

  const { data: member, error } = await admin
    .from('contest_members')
    .select('id, contest_id, email, full_name, role, invitation_status, invited_at, responded_at')
    .eq('invitation_token', token)
    .maybeSingle()

  if (error) {
    console.error('[invitations.get]', error.message)
    throw createError({ statusCode: 500, statusMessage: 'internal_error' })
  }
  if (!member) throw createError({ statusCode: 404, statusMessage: 'Invitation not found' })

  const { data: contest } = await admin
    .from('contests')
    .select('id, name, slug, short_description, organization_id')
    .eq('id', member.contest_id as string)
    .maybeSingle()

  let organization_name: string | null = null
  if (contest?.organization_id) {
    const { data: org } = await admin
      .from('organizations')
      .select('name')
      .eq('id', contest.organization_id as string)
      .maybeSingle()
    organization_name = (org?.name as string) || null
  }

  return {
    member: {
      id: member.id,
      email: member.email,
      full_name: member.full_name,
      role: member.role,
      status: member.invitation_status,
      invited_at: member.invited_at,
      responded_at: member.responded_at,
    },
    contest: contest
      ? {
          id: contest.id,
          name: contest.name,
          slug: contest.slug,
          short_description: contest.short_description,
        }
      : null,
    organization_name,
  }
})
