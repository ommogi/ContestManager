import { defineEventHandler, createError } from 'h3'
import { serverSupabaseAdmin, requireOrgOwner } from '~~/server/utils/supabase'

export default defineEventHandler(async (event) => {
  const { org } = await requireOrgOwner(event)
  const client = serverSupabaseAdmin()

  const orgIds = [org.id]

  // 1. Estadísticas de Concursos
  const { data: contests, error: contestsError } = await client
    .from('contests')
    .select('id, status, created_at')
    .in('organization_id', orgIds)

  if (contestsError) throw createError({ statusCode: 500, statusMessage: contestsError.message })

  // Datos para DonutChart - Distribución por estado
  const statusColors: Record<string, string> = {
    draft: '#64748b',
    active: '#6366f1',
    finished: '#10b981',
    cancelled: '#ef4444'
  }

  const statusNames: Record<string, string> = {
    draft: 'Borrador',
    active: 'Activo',
    finished: 'Finalizado',
    cancelled: 'Cancelado'
  }

  const contestsByStatus = contests?.reduce((acc: any, c: any) => {
    acc[c.status] = (acc[c.status] || 0) + 1
    return acc
  }, {}) || {}

  const contestStatusData = Object.entries(contestsByStatus).map(([status, count]) => ({
    name: statusNames[status] || status,
    value: count as number,
    color: statusColors[status] || '#94a3b8'
  }))

  // Datos para LineChart - Crecimiento mensual
  const monthlyContests = contests?.reduce((acc: any, c: any) => {
    const month = new Date(c.created_at).toLocaleDateString('es-ES', { month: 'short', year: 'numeric' })
    acc[month] = (acc[month] || 0) + 1
    return acc
  }, {}) || {}

  const contestGrowthData = Object.entries(monthlyContests)
    .map(([month, concursos]) => ({ month, concursos: concursos as number }))
    .sort((a: any, b: any) => {
      const dateA = new Date(a.month)
      const dateB = new Date(b.month)
      return dateA.getTime() - dateB.getTime()
    })

  // 2. Estadísticas de Participantes
  const contestIds = contests?.map((c: any) => c.id) || []

  let participants: any[] = []
  if (contestIds.length > 0) {
    const { data: partsData, error: partsError } = await client
      .from('participants')
      .select('id, status, payment_status, created_at, amount_paid_cents, contest_id')
      .in('contest_id', contestIds)

    if (partsError) throw createError({ statusCode: 500, statusMessage: partsError.message })
    participants = partsData || []
  }

  // Datos para DonutChart - Estado de participantes
  const participantsByStatus = participants.reduce((acc: any, p: any) => {
    acc[p.status] = (acc[p.status] || 0) + 1
    return acc
  }, {})

  const participantStatusData = [
    {
      name: 'Activo',
      value: participantsByStatus.active || 0,
      color: '#10b981'
    },
    {
      name: 'Eliminado',
      value: participantsByStatus.eliminated || 0,
      color: '#ef4444'
    }
  ].filter(item => item.value > 0)

  // Datos para LineChart - Crecimiento mensual de participantes
  const monthlyParticipants = participants.reduce((acc: any, p: any) => {
    const month = new Date(p.created_at).toLocaleDateString('es-ES', { month: 'short', year: 'numeric' })
    acc[month] = (acc[month] || 0) + 1
    return acc
  }, {})

  const participantGrowthData = Object.entries(monthlyParticipants)
    .map(([month, participantes]) => ({ month, participantes: participantes as number }))
    .sort((a: any, b: any) => {
      const dateA = new Date(a.month)
      const dateB = new Date(b.month)
      return dateA.getTime() - dateB.getTime()
    })

  // Tasa de conversión
  const paidParticipants = participants.filter((p: any) => p.payment_status === 'paid').length
  const conversionRate = participants.length > 0
    ? Math.round((paidParticipants / participants.length) * 100)
    : 0

  // 3. Estadísticas de Ingresos
  const { data: transactions, error: transactionsError } = await client
    .from('billing_transactions')
    .select('amount_cents, created_at, reason, entity')
    .in('organization_id', orgIds)
    .eq('reason', 'purchase_bundle')

  if (transactionsError) throw createError({ statusCode: 500, statusMessage: transactionsError.message })

  const totalRevenue = transactions?.reduce((sum: number, t: any) => sum + (t.amount_cents || 0), 0) || 0

  // Datos para BarChart - Ingresos mensuales
  const monthlyRevenue = transactions?.reduce((acc: any, t: any) => {
    const month = new Date(t.created_at).toLocaleDateString('es-ES', { month: 'short', year: 'numeric' })
    acc[month] = (acc[month] || 0) + (t.amount_cents || 0)
    return acc
  }, {}) || {}

  const revenueMonthlyData = Object.entries(monthlyRevenue)
    .map(([month, ingresos]) => ({ month, ingresos: (ingresos as number) / 100 }))
    .sort((a: any, b: any) => {
      const dateA = new Date(a.month)
      const dateB = new Date(b.month)
      return dateA.getTime() - dateB.getTime()
    })

  // Ticket promedio
  const averageTicket = transactions && transactions.length > 0
    ? Math.round(totalRevenue / transactions.length)
    : 0

  // 4. Estadísticas de Calificaciones (Scores)
  let totalScores = 0
  let averageScore = 0

  if (contestIds.length > 0) {
    // Get categories → rounds → scores
    const { data: cats } = await client
      .from('categories')
      .select('id')
      .in('contest_id', contestIds)
    const catIds = (cats || []).map((c: any) => c.id)

    if (catIds.length > 0) {
      const { data: rounds } = await client
        .from('rounds')
        .select('id')
        .in('category_id', catIds)
      const roundIds = (rounds || []).map((r: any) => r.id)

      if (roundIds.length > 0) {
        const { data: allScores, error: scoresError } = await client
          .from('scores')
          .select('value')
          .in('round_id', roundIds)

        if (!scoresError && allScores) {
          totalScores = allScores.length
          if (totalScores > 0) {
            const sum = allScores.reduce((acc: number, s: any) => acc + Number(s.value), 0)
            averageScore = Math.round((sum / totalScores) * 10) / 10
          }
        }
      }
    }
  }

  // 5. Resumen general
  const averageParticipantsPerContest = contests && contests.length > 0
    ? Math.round(participants.length / contests.length)
    : 0

  return {
    contests: {
      total: contests?.length || 0,
      statusData: contestStatusData,
      growthData: contestGrowthData
    },
    participants: {
      total: participants.length,
      statusData: participantStatusData,
      growthData: participantGrowthData,
      conversionRate
    },
    scores: {
      total: totalScores,
      average: averageScore
    },
    revenue: {
      total: totalRevenue,
      monthlyData: revenueMonthlyData,
      averageTicket
    },
    overview: {
      averageParticipantsPerContest
    }
  }
})
