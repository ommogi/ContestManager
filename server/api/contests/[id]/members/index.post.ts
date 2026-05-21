import { defineEventHandler, createError, getRouterParam, readBody } from 'h3'
import { serverSupabaseAdmin, requireOrgOwnerOrMember } from '~~/server/utils/supabase'
import { ContestMemberSchema } from '~~/server/utils/schemas'
import { sendJudgeInvitationEmail } from '~~/server/utils/email'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing contest id' })

  // Auth gate: must be org owner or contest member
  await requireOrgOwnerOrMember(event, id)

  const client = serverSupabaseAdmin()
  const rawBody = await readBody(event)

  const parsed = ContestMemberSchema.safeParse(rawBody)
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid request', data: parsed.error.issues })
  }
  const body = parsed.data

  // If no user_id provided but email is given, try to resolve an existing auth user
  let userId: string | null = body.user_id ?? null
  if (!userId && body.email) {
    try {
      const target = body.email.toLowerCase()
      const perPage = 1000
      const maxPages = 5 // Cap at 5000 users to avoid runaway requests
      let page = 1
      let found: any = null
      while (page <= maxPages && !found) {
        const { data: listData } = await client.auth.admin.listUsers({ page, perPage })
        const users = listData?.users ?? []
        found = users.find((u: any) => (u.email || '').toLowerCase() === target)
        if (users.length < perPage) break // Last page
        page += 1
      }
      if (found?.id) userId = found.id
    } catch {
      // swallow — fallback to null user_id (column is nullable for external judges)
    }
  }

  if (userId) {
    const { count } = await client
      .from('participants')
      .select('id', { count: 'exact', head: true })
      .eq('contest_id', id)
      .eq('user_id', userId)
      .neq('status', 'eliminated')
    if ((count ?? 0) > 0) {
      throw createError({ statusCode: 409, statusMessage: 'Este usuario ya está inscrito como participante en este concurso.' })
    }
  }

  const insertPayload: Record<string, unknown> = {
    contest_id: id,
    user_id: userId,
    ...(body.full_name !== undefined && { full_name: body.full_name }),
    ...(body.email !== undefined && { email: body.email }),
    ...(body.role !== undefined && { role: body.role }),
  }

  const { data, error } = await client
    .from('contest_members')
    .insert(insertPayload)
    .select()
    .single()

  if (error) {
    if ((error as any).code === '23505') {
      throw createError({ statusCode: 409, statusMessage: 'Este usuario ya ha sido invitado a este concurso.' })
    }
    console.error("[api error]", error.message)
    throw createError({ statusCode: 500, statusMessage: "internal_error" })
  }

  // Fire-and-forget invitation email for judges.
  if (data?.role === 'judge' && data?.invitation_token && data?.email) {
    const memberEmail = data.email as string
    const token = data.invitation_token as string
    const baseUrl = process.env.APP_BASE_URL || 'https://contestsaas.app'
    const inviteUrl = `${baseUrl}/invite/${token}`

    ;(async () => {
      try {
        const { data: contest } = await client
          .from('contests')
          .select('name, organization_id')
          .eq('id', id)
          .maybeSingle()
        const contestName = (contest?.name as string) || 'concurso'

        let orgName: string | null = null
        let inviterName: string | null = null
        if (contest?.organization_id) {
          const { data: org } = await client
            .from('organizations')
            .select('name, owner_id')
            .eq('id', contest.organization_id)
            .maybeSingle()
          orgName = (org?.name as string) || null
          if (org?.owner_id) {
            const { data: profile } = await client
              .from('profiles')
              .select('full_name')
              .eq('id', org.owner_id)
              .maybeSingle()
            inviterName = (profile?.full_name as string) || null
          }
        }

        await sendJudgeInvitationEmail({
          to: memberEmail,
          contest_name: contestName,
          organization_name: orgName,
          invited_by_name: inviterName,
          invite_url: inviteUrl,
        })
      } catch (e: any) {
        console.error('[members.post] judge invitation email failed:', e?.message)
      }
    })()
  }

  return data
})
