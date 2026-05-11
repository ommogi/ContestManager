import { defineEventHandler, createError, getRouterParam } from 'h3'
import { serverSupabaseAdmin, requireOrgOwnerOrMember } from '~~/server/utils/supabase'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing ID' })

  // Auth gate — require org owner or contest member
  await requireOrgOwnerOrMember(event, id)

  const client = serverSupabaseAdmin()

  // Fetch contest by ID
  const { data: contest, error: contestError } = await client
    .from('contests')
    .select('id, name, slug, organization_id, status, created_at, entry_fee_cents')
    .eq('id', id)
    .single()

  if (contestError || !contest) {
    throw createError({ statusCode: 404, statusMessage: 'Contest not found' })
  }

  // Get categories for this contest
  const { data: categories } = await client
    .from('categories')
    .select('id, name, max_participants, status')
    .eq('contest_id', contest.id)

  // Get all participants for this contest
  const { data: participants } = await client
    .from('participants')
    .select('id, category_id, status, payment_status, created_at, amount_paid_cents, country')
    .eq('contest_id', contest.id)

  const participantList = participants || []
  const categoryList = categories || []

  // Estadísticas de inscripciones
  const inscriptionsByStatus = {
    confirmed: participantList.filter(p => p.payment_status === 'paid' || p.payment_status === 'free').length,
    pending: participantList.filter(p => p.payment_status === 'pending').length,
    cancelled: participantList.filter(p => p.payment_status === 'refunded').length
  }

  // Distribución geográfica
  const participantsByCountry = participantList.reduce((acc: any, p: any) => {
    const country = p.country || 'Desconocido'
    acc[country] = (acc[country] || 0) + 1
    return acc
  }, {})

  const geographicData = Object.entries(participantsByCountry)
    .map(([country, count]) => ({ country, count: count as number }))
    .sort((a: any, b: any) => b.count - a.count)
    .slice(0, 10) // Top 10 países

  // Participantes por categoría
  const participantsByCategory = categoryList.map(cat => {
    const count = participantList.filter(p => p.category_id === cat.id).length
    const occupancyRate = cat.max_participants 
      ? Math.round((count / cat.max_participants) * 100)
      : 0
    return {
      category: cat.name,
      count,
      maxParticipants: cat.max_participants,
      occupancyRate
    }
  }).sort((a: any, b: any) => b.count - a.count)

  // Timeline de inscripciones (últimos 30 días)
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  
  const timelineData = participantList
    .filter(p => new Date(p.created_at) >= thirtyDaysAgo)
    .reduce((acc: any, p: any) => {
      const date = new Date(p.created_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
      acc[date] = (acc[date] || 0) + 1
      return acc
    }, {})

  const inscriptionTimeline = Object.entries(timelineData)
    .map(([date, count]) => ({ date, inscripciones: count as number }))
    .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime())

  // Ingresos por concurso
  const totalRevenue = participantList.reduce((sum: number, p: any) => sum + (p.amount_paid_cents || 0), 0)
  const averageTicket = participantList.filter(p => p.amount_paid_cents > 0).length > 0
    ? Math.round(totalRevenue / participantList.filter(p => p.amount_paid_cents > 0).length)
    : 0

  // Tasa de ocupación global
  const totalCapacity = categoryList.reduce((sum: number, cat: any) => sum + (cat.max_participants || 0), 0)
  const globalOccupancyRate = totalCapacity > 0
    ? Math.round((participantList.length / totalCapacity) * 100)
    : 0

  // Get rounds and scores for this contest
  const categoryIds = categoryList.map(c => c.id)
  
  let rounds: any[] = []
  let scores: any[] = []
  
  if (categoryIds.length > 0) {
    const { data: roundsData } = await client
      .from('rounds')
      .select('id, category_id, name, status, order, max_score')
      .in('category_id', categoryIds)
    
    rounds = roundsData || []

    if (rounds.length > 0) {
      const roundIds = rounds.map(r => r.id)
      const { data: scoresData } = await client
        .from('scores')
        .select('round_id, value, judge_id')
        .in('round_id', roundIds)
      
      scores = scoresData || []
    }
  }

  // Estadísticas de evaluación
  const roundsStats = rounds.map(round => {
    const roundScores = scores.filter(s => s.round_id === round.id)
    const avgScore = roundScores.length > 0
      ? roundScores.reduce((sum: number, s: any) => sum + Number(s.value), 0) / roundScores.length
      : 0
    
    return {
      round: round.name,
      category: categoryList.find(c => c.id === round.category_id)?.name || 'Desconocida',
      status: round.status,
      averageScore: Math.round(avgScore * 100) / 100,
      totalScores: roundScores.length
    }
  })

  // Calificaciones por juez (para detectar sesgos)
  const scoresByJudge = scores.reduce((acc: any, score: any) => {
    if (!acc[score.judge_id]) {
      acc[score.judge_id] = []
    }
    acc[score.judge_id].push(Number(score.value))
    return acc
  }, {})

  const judgeStats = Object.entries(scoresByJudge).map(([judgeId, values]: [string, any]) => {
    const scores_array = values as number[]
    const avg = scores_array.reduce((sum: number, v: number) => sum + v, 0) / scores_array.length
    const variance = scores_array.reduce((sum: number, v: number) => sum + Math.pow(v - avg, 2), 0) / scores_array.length
    const stdDev = Math.sqrt(variance)
    
    return {
      judgeId,
      averageScore: Math.round(avg * 100) / 100,
      scoresGiven: scores_array.length,
      standardDeviation: Math.round(stdDev * 100) / 100
    }
  })

  return {
    contest: {
      id: contest.id,
      name: contest.name,
      slug: contest.slug,
      status: contest.status,
      createdAt: contest.created_at,
      entryFeeCents: contest.entry_fee_cents
    },
    overview: {
      totalParticipants: participantList.length,
      totalCategories: categoryList.length,
      totalRounds: rounds.length,
      globalOccupancyRate,
      totalRevenue,
      averageTicket
    },
    inscriptions: {
      byStatus: [
        { name: 'Confirmadas', amount: inscriptionsByStatus.confirmed, color: '#10b981' },
        { name: 'Pendientes', amount: inscriptionsByStatus.pending, color: '#f59e0b' },
        { name: 'Canceladas', amount: inscriptionsByStatus.cancelled, color: '#ef4444' }
      ].filter(item => item.amount > 0),
      timeline: inscriptionTimeline
    },
    geographic: geographicData,
    categories: participantsByCategory,
    rounds: roundsStats,
    judges: judgeStats
  }
})
