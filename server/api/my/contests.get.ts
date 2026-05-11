import { defineEventHandler, createError } from 'h3'
import { serverSupabaseAdmin, requireAuth } from '~~/server/utils/supabase'

export default defineEventHandler(async (event) => {
  const user = requireAuth(event)
  const client = serverSupabaseAdmin()

  // Participant entries (with category info)
  const { data: participantEntries, error: pError } = await client
    .from('participants')
    .select(`
      contest_id,
      category_id,
      status,
      categories!inner(id, name, status),
      contests!inner(id, name, slug, description, type, status, starts_at, ends_at, organization_id)
    `)
    .eq('user_id', user.id)

  if (pError) throw createError({ statusCode: 500, statusMessage: pError.message })

  // Judge entries at contest level
  const { data: judgeEntries, error: jError } = await client
    .from('contest_members')
    .select(`
      contest_id,
      contests!inner(id, name, slug, description, type, status, starts_at, ends_at, organization_id)
    `)
    .or(`user_id.eq.${user.id},email.eq.${user.email}`)
    .eq('role', 'judge')

  if (jError) throw createError({ statusCode: 500, statusMessage: jError.message })

  // Fetch all categories for judge contests in one query
  const judgeContestIds = (judgeEntries ?? []).map((j: any) => j.contest_id)
  let judgeCategories: any[] = []
  if (judgeContestIds.length > 0) {
    const { data: cats } = await client
      .from('categories')
      .select('id, name, status, contest_id')
      .in('contest_id', judgeContestIds)
    judgeCategories = cats ?? []
  }

  // Merge into contest map
  const contestMap: Record<string, { contest: any; myCategories: any[] }> = {}

  // Add participant categories first
  for (const entry of participantEntries ?? []) {
    const cid = entry.contest_id
    if (!contestMap[cid]) contestMap[cid] = { contest: entry.contests, myCategories: [] }
    contestMap[cid].myCategories.push({
      id: entry.category_id,
      name: (entry.categories as any).name,
      status: (entry.categories as any).status,
      role: 'participant',
      participantStatus: entry.status
    })
  }

  // Add judge categories (skip if already added as participant for that category)
  for (const entry of judgeEntries ?? []) {
    const cid = entry.contest_id
    if (!contestMap[cid]) contestMap[cid] = { contest: entry.contests, myCategories: [] }
    const contestCats = judgeCategories.filter((c: any) => c.contest_id === cid)
    for (const cat of contestCats) {
      if (!contestMap[cid].myCategories.find((c: any) => c.id === cat.id)) {
        contestMap[cid].myCategories.push({
          id: cat.id,
          name: cat.name,
          status: cat.status,
          role: 'judge'
        })
      }
    }
  }

  return { contests: Object.values(contestMap) }
})
