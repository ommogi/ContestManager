import { defineEventHandler, createError, getQuery } from 'h3'
import { serverSupabaseAdmin, requireOrgOwner } from '~~/server/utils/supabase'

// GET /api/calendar?from=&to=&contest_id=&category_id=&type=&participant_id=
// Returns rehearsal + performance events for contests owned by the current user's org.
//
// Schedule data is stored on `round_participants` (TEXT columns from migration 0009):
//   rehearsal_time / rehearsal_room / rehearsal_accompanist
//   performance_time
// (the legacy `rehearsals` table is unused by the current UI).
export default defineEventHandler(async (event) => {
  const { org } = await requireOrgOwner(event)

  const q = getQuery(event)
  const from = (q.from as string) || null
  const to   = (q.to as string)   || null
  const contestIdF     = (q.contest_id as string) || null
  const categoryIdF    = (q.category_id as string) || null
  const participantIdF = (q.participant_id as string) || null
  const typeF          = (q.type as string) || null // 'rehearsal' | 'performance' | null

  const fromMs = from ? new Date(from).getTime() : null
  const toMs   = to   ? new Date(to).getTime()   : null

  const admin = serverSupabaseAdmin()

  // Contests for this org
  let contestQ = admin
    .from('contests').select('id, name, slug').eq('organization_id', org.id)
  if (contestIdF) contestQ = contestQ.eq('id', contestIdF)
  const { data: contests } = await contestQ
  const contestIds = (contests || []).map((c: any) => c.id)
  if (!contestIds.length) {
    return { events: [], facets: { contests: contests || [], categories: [], participants: [] } }
  }

  // Parallel: categories + participants
  let catQuery = admin.from('categories').select('id, name, contest_id').in('contest_id', contestIds)
  if (categoryIdF) catQuery = catQuery.eq('id', categoryIdF)

  const [{ data: cats }, { data: parts }] = await Promise.all([
    catQuery,
    admin
      .from('participants')
      .select('id, name, first_name, last_name, user_id, category_id, contest_id')
      .in('contest_id', contestIds),
  ])

  const catMap = new Map((cats || []).map((c: any) => [c.id, c]))
  const categoryIds = Array.from(catMap.keys())
  if (!categoryIds.length) {
    return {
      events: [],
      facets: { contests: contests || [], categories: cats || [], participants: facetParts(parts) },
    }
  }

  const { data: rnds } = await admin
    .from('rounds').select('id, name, category_id, "order"').in('category_id', categoryIds)
  const roundMap = new Map((rnds || []).map((r: any) => [r.id, r]))
  const roundIds = Array.from(roundMap.keys())
  const partMap = new Map((parts || []).map((p: any) => [p.id, p]))

  let events: any[] = []

  if (roundIds.length) {
    let rpQ = admin
      .from('round_participants')
      .select('id, round_id, participant_id, "order", rehearsal_room, rehearsal_time, rehearsal_accompanist, performance_time, scheduled_at, location')
      .in('round_id', roundIds)
    if (participantIdF) rpQ = rpQ.eq('participant_id', participantIdF)
    const { data: rps } = await rpQ

    for (const rp of rps || []) {
      const r = roundMap.get((rp as any).round_id) as any
      if (!r) continue
      const cat = catMap.get(r.category_id) as any
      if (!cat) continue
      const contest = (contests || []).find((c: any) => c.id === cat.contest_id) as any
      const p = partMap.get((rp as any).participant_id) as any
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
        participant_user_id: p?.user_id || null,
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
            title: baseTitle || 'Ensayo',
            location: (rp as any).rehearsal_room || null,
            order: null,
            accompanist: (rp as any).rehearsal_accompanist || null,
          })
        }
      }

      // Performance — prefer performance_time, fallback to legacy scheduled_at
      const perfRaw = (rp as any).performance_time || (rp as any).scheduled_at
      if ((!typeF || typeF === 'performance') && perfRaw && String(perfRaw).trim()) {
        const iso = toIso(perfRaw)
        if (iso) {
          events.push({
            ...baseEvent,
            id: `perf:${(rp as any).id}`,
            type: 'performance',
            scheduled_at: iso,
            title: baseTitle || 'Actuación',
            location: (rp as any).location || (rp as any).rehearsal_room || null,
            order: (rp as any).order ?? null,
            accompanist: null,
          })
        }
      }
    }
  }

  // Date range filter in JS (rehearsal_time stored as TEXT)
  if (fromMs !== null || toMs !== null) {
    events = events.filter((e) => {
      const t = new Date(e.scheduled_at).getTime()
      if (Number.isNaN(t)) return false
      if (fromMs !== null && t < fromMs) return false
      if (toMs   !== null && t > toMs)   return false
      return true
    })
  }

  events.sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())

  return {
    events,
    facets: {
      contests: contests || [],
      categories: cats || [],
      participants: facetParts(parts),
    },
  }
})

// Normalize TEXT timestamp ("2026-04-25T01:00", "2026-04-25 01:00:00", ISO with tz...) to ISO.
function toIso(raw: any): string | null {
  if (!raw) return null
  const s = String(raw).trim()
  if (!s) return null
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

function facetParts(parts: any[] | null | undefined) {
  return (parts || []).map((p: any) => ({
    id: p.id,
    name: p.name || `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim(),
    contest_id: p.contest_id,
    category_id: p.category_id,
  }))
}
