import { defineEventHandler, createError, getRouterParam } from 'h3'
import { serverSupabaseAdmin, requireAuth } from '~~/server/utils/supabase'

export default defineEventHandler(async (event) => {
  const user = requireAuth(event)

  const slug = getRouterParam(event, 'slug')
  if (!slug) throw createError({ statusCode: 400, statusMessage: 'Missing slug' })

  const client = serverSupabaseAdmin()

  // Fetch ALL contests with this slug (slug is unique per org, not global),
  // then pick the one where the current user is actually enrolled / member.
  const { data: slugMatches, error: slugErr } = await client
    .from('contests')
    .select('id, name, slug, description, type, status, starts_at, ends_at, settings, is_rounds_dynamic, cover_image_url, created_at')
    .eq('slug', slug)
  if (slugErr) throw createError({ statusCode: 500, statusMessage: slugErr.message })
  if (!slugMatches || slugMatches.length === 0) {
    throw createError({ statusCode: 404, statusMessage: 'Contest not found' })
  }

  const candidateIds = slugMatches.map((c: any) => c.id)

  // Prefer contest where user is participant
  const { data: partMatch } = await client
    .from('participants')
    .select('contest_id')
    .eq('user_id', user.id)
    .in('contest_id', candidateIds)
    .limit(1)
    .maybeSingle()

  let resolvedId: string | null = (partMatch as any)?.contest_id ?? null

  if (!resolvedId) {
    // Fallback: judge / contest member
    const { data: memByUser } = await client
      .from('contest_members').select('contest_id')
      .eq('user_id', user.id).in('contest_id', candidateIds)
      .limit(1).maybeSingle()
    resolvedId = (memByUser as any)?.contest_id ?? null

    if (!resolvedId && user.email) {
      const { data: memByEmail } = await client
        .from('contest_members').select('contest_id')
        .eq('email', user.email).is('user_id', null)
        .in('contest_id', candidateIds)
        .limit(1).maybeSingle()
      resolvedId = (memByEmail as any)?.contest_id ?? null
    }
  }

  if (!resolvedId) {
    throw createError({ statusCode: 403, statusMessage: 'Not enrolled in this contest' })
  }

  const contest = slugMatches.find((c: any) => c.id === resolvedId) as any
  if (!contest) throw createError({ statusCode: 404, statusMessage: 'Contest not found' })

  // Get participant entries for this user in this contest
  const { data: participantEntries, error: pError } = await client
    .from('participants')
    .select(`
      id,
      name,
      status,
      category_id,
      payment_status,
      amount_paid_cents,
      amount_refunded_cents,
      stripe_payment_intent_id,
      categories!inner(id, name, description, status)
    `)
    .eq('contest_id', contest.id)
    .eq('user_id', user.id)

  if (pError) throw createError({ statusCode: 500, statusMessage: pError.message })

  // If user is not a participant, check if they're a judge/member
  // Try by user_id first, then by email (for legacy records added without user_id)
  let memberEntry: { id: string; role: string } | null = null
  const { data: memberByUserId } = await client
    .from('contest_members')
    .select('id, role')
    .eq('contest_id', contest.id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (memberByUserId) {
    memberEntry = memberByUserId
  } else if (user.email) {
    const { data: memberByEmail } = await client
      .from('contest_members')
      .select('id, role')
      .eq('contest_id', contest.id)
      .eq('email', user.email)
      .is('user_id', null)
      .maybeSingle()
    memberEntry = memberByEmail ?? null
  }

  if (!participantEntries?.length && !memberEntry) {
    throw createError({ statusCode: 403, statusMessage: 'Not enrolled in this contest' })
  }

  // Get categories and rounds
  let categoryIds: string[] = []
  let categories: any[] = []

  if (memberEntry?.role === 'judge') {
    // Judges can see all categories in the contest
    const { data: contestCats } = await client
      .from('categories')
      .select('id, name, description, status')
      .eq('contest_id', contest.id)
    
    categories = contestCats ?? []
    categoryIds = categories.map((c: any) => c.id)
  } else {
    // Participants only see categories they are enrolled in
    categories = (participantEntries ?? []).map((p: any) => p.categories)
    categoryIds = categories.map((c: any) => c.id)
  }

  // Deduplicate categories
  const uniqueCategoriesMap = new Map()
  for (const c of categories) {
    if (c) uniqueCategoriesMap.set(c.id, c)
  }
  categories = Array.from(uniqueCategoriesMap.values())

  let rounds: any[] = []

  if (categoryIds.length > 0) {
    const { data: roundsData } = await client
      .from('rounds')
      .select('id, name, order, status, scoring_type, max_score, started_at, closed_at, category_id, is_ranking, is_published, is_final')
      .in('category_id', categoryIds)
      .order('order', { ascending: true })

    // Hide unpublished ranking pseudo-rounds from participants
    rounds = (roundsData ?? []).filter((r: any) => !(r.is_ranking === true && r.is_published !== true))

    // For each round, check if the participant is enrolled and get their schedule
    const roundIds = rounds.map((r: any) => r.id)
    const participantIds = (participantEntries ?? []).map((p: any) => p.id)

    if (roundIds.length > 0 && participantIds.length > 0) {
      const { data: roundParticipants } = await client
        .from('round_participants')
        .select('round_id, participant_id, order, scheduled_at, location, is_qualified')
        .in('round_id', roundIds)
        .in('participant_id', participantIds)

      // Attach round_participant info to each round (will be null for judges)
      rounds = rounds.map((r: any) => ({
        ...r,
        my_slot: (roundParticipants ?? []).find(
          (rp: any) => rp.round_id === r.id && participantIds.includes(rp.participant_id)
        ) ?? null
      }))
    }
  }

  return {
    contest,
    participant: participantEntries ?? [],
    member: memberEntry ?? null,
    categories,
    rounds
  }
})
