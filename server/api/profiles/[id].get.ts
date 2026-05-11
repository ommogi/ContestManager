import { defineEventHandler, createError, getRouterParam } from 'h3'
import { serverSupabaseAdmin, requireAuth } from '~~/server/utils/supabase'

// GET /api/profiles/:id
// Returns a user profile + their participations.
// Access: requesting user must be the owner OR an org_owner whose org has a contest
// the target user is enrolled in.
export default defineEventHandler(async (event) => {
  const me = requireAuth(event)

  const targetId = getRouterParam(event, 'id')
  if (!targetId) throw createError({ statusCode: 400, statusMessage: 'Missing id' })

  const admin = serverSupabaseAdmin()

  // Fetch target profile
  const { data: profile, error: profErr } = await admin
    .from('profiles')
    .select('id, full_name, avatar_url, account_type, created_at')
    .eq('id', targetId)
    .maybeSingle()
  if (profErr) throw createError({ statusCode: 500, statusMessage: profErr.message })
  if (!profile) throw createError({ statusCode: 404, statusMessage: 'profile_not_found' })

  // Fetch auth user for email
  const { data: authUser } = await admin.auth.admin.getUserById(targetId)
  const email = authUser?.user?.email || null

  // Authorization
  let allowed = me.id === targetId
  let orgIds: string[] = []
  if (!allowed) {
    const { data: orgs } = await admin
      .from('organizations').select('id').eq('owner_id', me.id)
    orgIds = (orgs || []).map((o: any) => o.id)
    if (orgIds.length) {
      const { data: contests } = await admin
        .from('contests').select('id').in('organization_id', orgIds)
      const contestIds = (contests || []).map((c: any) => c.id)
      if (contestIds.length) {
        const { count } = await admin
          .from('participants')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', targetId)
          .in('contest_id', contestIds)
        if ((count || 0) > 0) allowed = true
      }
    }
  }
  if (!allowed) throw createError({ statusCode: 403, statusMessage: 'forbidden' })

  // Fetch participations (scoped: own → all; org owner → only contests they own)
  let partsQ = admin
    .from('participants')
    .select('id, name, first_name, last_name, dni, country, status, created_at, contest_id, category_id')
    .eq('user_id', targetId)

  if (me.id !== targetId) {
    const { data: contests } = await admin
      .from('contests').select('id').in('organization_id', orgIds)
    const contestIds = (contests || []).map((c: any) => c.id)
    partsQ = partsQ.in('contest_id', contestIds.length ? contestIds : ['00000000-0000-0000-0000-000000000000'])
  }

  const { data: parts } = await partsQ
  const contestIds = Array.from(new Set((parts || []).map((p: any) => p.contest_id)))
  const categoryIds = Array.from(new Set((parts || []).map((p: any) => p.category_id).filter(Boolean)))

  const [{ data: contests }, { data: cats }] = await Promise.all([
    contestIds.length
      ? admin.from('contests').select('id, name, slug').in('id', contestIds)
      : Promise.resolve({ data: [] as any[] }) as any,
    categoryIds.length
      ? admin.from('categories').select('id, name').in('id', categoryIds)
      : Promise.resolve({ data: [] as any[] }) as any,
  ])

  const contestMap = new Map((contests || []).map((c: any) => [c.id, c]))
  const catMap = new Map((cats || []).map((c: any) => [c.id, c]))

  const participations = (parts || []).map((p: any) => {
    const c = contestMap.get(p.contest_id) as any
    const cat = catMap.get(p.category_id) as any
    return {
      id: p.id,
      name: p.name || `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim(),
      dni: p.dni,
      country: p.country,
      status: p.status,
      created_at: p.created_at,
      contest: c ? { id: c.id, name: c.name, slug: c.slug } : null,
      category: cat ? { id: cat.id, name: cat.name } : null,
    }
  })

  return {
    profile: {
      id: profile.id,
      full_name: profile.full_name,
      avatar_url: profile.avatar_url,
      account_type: profile.account_type,
      email,
      created_at: profile.created_at,
    },
    participations,
  }
})
