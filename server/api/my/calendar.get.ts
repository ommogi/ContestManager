import { defineEventHandler, createError, getQuery } from 'h3'
import { serverSupabaseAdmin, requireAuth } from '~~/server/utils/supabase'

// GET /api/my/calendar?from=&to=&contest_id=&type=
// Returns rehearsal + performance events for the current user
// (as participant or judge).
export default defineEventHandler(async (event) => {
  const user = requireAuth(event)

  const q = getQuery(event)
  const from = (q.from as string) || null
  const to = (q.to as string) || null
  const contestIdF = (q.contest_id as string) || null
  const typeF = (q.type as string) || null // 'rehearsal' | 'performance' | null

  const fromMs = from ? new Date(from).getTime() : null
  const toMs = to ? new Date(to).getTime() : null

  if ((from && Number.isNaN(fromMs)) || (to && Number.isNaN(toMs))) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid date range' })
  }

  const admin = serverSupabaseAdmin()

  // ── Find contests where user is participant or judge ───────────────────────
  let participantQ = admin
    .from('participants')
    .select('id, contest_id, category_id, name, first_name, last_name')
    .eq('user_id', user.id)
  if (contestIdF) participantQ = participantQ.eq('contest_id', contestIdF)
  const { data: myParticipants } = await participantQ

  // Judge memberships
  let judgeQ = admin
    .from('contest_members')
    .select('contest_id, category_id')
    .eq('user_id', user.id)
    .eq('invitation_status', 'accepted')
    .eq('role', 'judge')
  if (contestIdF) judgeQ = judgeQ.eq('contest_id', contestIdF)
  const { data: judgeMembers } = await judgeQ

  const participantIds = (myParticipants || []).map((p: any) => p.id)
  const contestIds = new Set<string>([
    ...(myParticipants || []).map((p: any) => p.contest_id),
    ...(judgeMembers || []).map((m: any) => m.contest_id),
  ])

  if (!contestIds.size) {
    return { events: [], facets: { contests: [], categories: [] } }
  }

  // ── Fetch contests + categories ────────────────────────────────────────────
  const { data: contests } = await admin
    .from('contests')
    .select('id, name, slug')
    .in('id', Array.from(contestIds))

  const contestMap = new Map((contests || []).map((c: any) => [c.id, c]))

  let catQuery = admin
    .from('categories')
    .select('id, name, contest_id')
    .in('contest_id', Array.from(contestIds))
  if (contestIdF) catQuery = catQuery.eq('contest_id', contestIdF)
  const { data: cats } = await catQuery

  const catMap = new Map((cats || []).map((c: any) => [c.id, c]))
  const categoryIds = Array.from(catMap.keys())

  if (!categoryIds.length) {
    return {
      events: [],
      facets: {
        contests: contests || [],
        categories: cats || [],
      },
    }
  }

  // ── Fetch rounds ───────────────────────────────────────────────────────────
  const { data: rnds } = await admin
    .from('rounds')
    .select('id, name, category_id, "order"')
    .in('category_id', categoryIds)

  const roundMap = new Map((rnds || []).map((r: any) => [r.id, r]))
  const roundIds = Array.from(roundMap.keys())

  let events: any[] = []

  // ── Participant events (rehearsal + performance) ───────────────────────────
  if (participantIds.length && roundIds.length) {
    const { data: rps } = await admin
      .from('round_participants')
      .select(
        'id, round_id, participant_id, "order", rehearsal_room, rehearsal_time, rehearsal_accompanist, performance_time, scheduled_at, location'
      )
      .in('round_id', roundIds)
      .in('participant_id', participantIds)

    for (const rp of rps || []) {
      const r = roundMap.get((rp as any).round_id) as any
      if (!r) continue
      const cat = catMap.get(r.category_id) as any
      if (!cat) continue
      const contest = contestMap.get(cat.contest_id) as any
      const p = (myParticipants || []).find((x: any) => x.id === (rp as any).participant_id)
      const baseTitle = p ? (p.name || `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim()) : null

      const baseEvent = {
        contest_id: contest?.id || null,
        contest_name: contest?.name || null,
        contest_slug: contest?.slug || null,
        category_id: cat.id,
        category_name: cat.name,
        round_id: r.id,
        round_name: r.name,
        round_order: r.order,
        participant_id: p?.id || null,
        participant_name: baseTitle,
      }

      // Rehearsal
      const rehTimeRaw = (rp as any).rehearsal_time
      if ((!typeF || typeF === 'rehearsal') && rehTimeRaw && String(rehTimeRaw).trim()) {
        const iso = toIso(rehTimeRaw)
        if (iso) {
          events.push({
            ...baseEvent,
            id: `reh:${(rp as any).id}`,
            type: 'rehearsal',
            scheduled_at: iso,
            title: 'Ensayo',
            subtitle: baseTitle,
            location: (rp as any).rehearsal_room || null,
            order: null,
            accompanist: (rp as any).rehearsal_accompanist || null,
          })
        }
      }

      // Performance
      const perfRaw = (rp as any).performance_time || (rp as any).scheduled_at
      if ((!typeF || typeF === 'performance') && perfRaw && String(perfRaw).trim()) {
        const iso = toIso(perfRaw)
        if (iso) {
          events.push({
            ...baseEvent,
            id: `perf:${(rp as any).id}`,
            type: 'performance',
            scheduled_at: iso,
            title: 'Actuación',
            subtitle: baseTitle,
            location: (rp as any).location || (rp as any).rehearsal_room || null,
            order: (rp as any).order ?? null,
            accompanist: null,
          })
        }
      }
    }
  }

  // ── Judge events (performances only, for judged rounds) ────────────────────
  if ((judgeMembers || []).length && roundIds.length) {
    // For judges: fetch round_participants in rounds of judged categories
    const judgeCategoryIds = (judgeMembers || []).map((m: any) => m.category_id)
    const judgeRounds = (rnds || []).filter((r: any) => judgeCategoryIds.includes(r.category_id))
    const judgeRoundIds = judgeRounds.map((r: any) => r.id)

    if (judgeRoundIds.length) {
      const { data: judgeRps } = await admin
        .from('round_participants')
        .select(
          'id, round_id, participant_id, "order", rehearsal_room, rehearsal_time, rehearsal_accompanist, performance_time, scheduled_at, location'
        )
        .in('round_id', judgeRoundIds)

      // Need participant names for judge view
      const rpParticipantIds = Array.from(
        new Set((judgeRps || []).map((rp: any) => rp.participant_id))
      )
      let participantNameMap = new Map()
      if (rpParticipantIds.length) {
        const { data: rpParts } = await admin
          .from('participants')
          .select('id, name, first_name, last_name')
          .in('id', rpParticipantIds)
        participantNameMap = new Map((rpParts || []).map((p: any) => [p.id, p]))
      }

      for (const rp of judgeRps || []) {
        const r = roundMap.get((rp as any).round_id) as any
        if (!r) continue
        const cat = catMap.get(r.category_id) as any
        if (!cat) continue
        const contest = contestMap.get(cat.contest_id) as any
        const p = participantNameMap.get((rp as any).participant_id)
        const pName = p ? (p.name || `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim()) : null

        // Judge only sees performances (not rehearsals) unless they are also participant
        const perfRaw = (rp as any).performance_time || (rp as any).scheduled_at
        if ((!typeF || typeF === 'performance') && perfRaw && String(perfRaw).trim()) {
          // Skip if this event is already added because user is also participant
          const alreadyAdded = events.some(
            (e) => e.id === `perf:${(rp as any).id}` && e.participant_id === (rp as any).participant_id
          )
          if (alreadyAdded) continue

          const iso = toIso(perfRaw)
          if (iso) {
            events.push({
              contest_id: contest?.id || null,
              contest_name: contest?.name || null,
              contest_slug: contest?.slug || null,
              category_id: cat.id,
              category_name: cat.name,
              round_id: r.id,
              round_name: r.name,
              round_order: r.order,
              participant_id: p?.id || null,
              participant_name: pName,
              id: `judge-perf:${(rp as any).id}`,
              type: 'performance',
              scheduled_at: iso,
              title: 'Actuación',
              subtitle: pName,
              location: (rp as any).location || (rp as any).rehearsal_room || null,
              order: (rp as any).order ?? null,
              accompanist: null,
              isJudgeView: true,
            })
          }
        }
      }
    }
  }

  // ── Date range filter ──────────────────────────────────────────────────────
  if (fromMs !== null || toMs !== null) {
    events = events.filter((e) => {
      const t = new Date(e.scheduled_at).getTime()
      if (Number.isNaN(t)) return false
      if (fromMs !== null && t < fromMs) return false
      if (toMs !== null && t > toMs) return false
      return true
    })
  }

  events.sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())

  return {
    events,
    facets: {
      contests: contests || [],
      categories: cats || [],
    },
  }
})

function toIso(raw: any): string | null {
  if (!raw) return null
  const s = String(raw).trim()
  if (!s) return null
  const localPattern = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}$/
  const normalized = localPattern.test(s) ? `${s}:00Z` : s
  const d = new Date(normalized)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}
