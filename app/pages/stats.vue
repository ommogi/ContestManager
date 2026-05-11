<script setup lang="ts">
import {
  Trophy,
  Users,
  TrendingUp,
  DollarSign,
  BarChart3,
  PieChart,
  Activity,
  Calendar
} from 'lucide-vue-next'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'

definePageMeta({
  layout: 'default'
})

const authStore = useAuthStore()

const { data: stats, pending } = await useFetch('/api/stats/organization', {
  headers: computed(() => ({
    Authorization: authStore.session?.access_token ? `Bearer ${authStore.session.access_token}` : ''
  })),
  watch: [computed(() => authStore.session?.access_token)]
})

const formatCurrency = (cents: number) => {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR'
  }).format(cents / 100)
}

// DonutChart needs number[] — extract values and build indexed categories
const contestDonutData = computed(() =>
  (stats.value?.contests?.statusData || []).map((d: any) => d.value as number)
)
const contestDonutCategories = computed(() =>
  Object.fromEntries(
    (stats.value?.contests?.statusData || []).map((d: any, i: number) =>
      [String(i), { name: d.name, color: d.color }]
    )
  )
)

const participantDonutData = computed(() =>
  (stats.value?.participants?.statusData || []).map((d: any) => d.value as number)
)
const participantDonutCategories = computed(() =>
  Object.fromEntries(
    (stats.value?.participants?.statusData || []).map((d: any, i: number) =>
      [String(i), { name: d.name, color: d.color }]
    )
  )
)

// Static categories — keys must match data object keys used as y-values
const contestGrowthCategories = {
  concursos: { name: 'Concursos creados', color: '#6366f1' }
}

const participantGrowthCategories = {
  participantes: { name: 'Nuevos participantes', color: '#10b981' }
}

const revenueCategories = {
  ingresos: { name: 'Ingresos (€)', color: '#6366f1' }
}
</script>

<template>
  <div class="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-3xl font-bold tracking-tight">Estadísticas</h2>
        <p class="text-muted-foreground">Panel de métricas y análisis de tu organización.</p>
      </div>
    </div>

    <!-- Loading state -->
    <div v-if="pending" class="py-20 text-center text-muted-foreground">
      <Activity class="w-10 h-10 mx-auto mb-4 animate-spin" />
      <p>Cargando estadísticas...</p>
    </div>

    <template v-else-if="stats">
      <!-- KPIs Principales -->
      <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card class="shadow-sm">
          <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle class="text-sm font-medium">Total Concursos</CardTitle>
            <Trophy class="h-4 w-4 text-indigo-500" />
          </CardHeader>
          <CardContent>
            <div class="text-3xl font-bold">{{ stats.contests.total }}</div>
            <p class="text-xs text-muted-foreground">Creados en tu organización</p>
          </CardContent>
        </Card>

        <Card class="shadow-sm">
          <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle class="text-sm font-medium">Total Participantes</CardTitle>
            <Users class="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div class="text-3xl font-bold">{{ stats.participants.total }}</div>
            <p class="text-xs text-muted-foreground">En todos los concursos</p>
          </CardContent>
        </Card>

        <Card class="shadow-sm">
          <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle class="text-sm font-medium">Ingresos Totales</CardTitle>
            <DollarSign class="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div class="text-3xl font-bold">{{ formatCurrency(stats.revenue.total) }}</div>
            <p class="text-xs text-muted-foreground">Desde el inicio</p>
          </CardContent>
        </Card>

        <Card class="shadow-sm">
          <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle class="text-sm font-medium">Media por Concurso</CardTitle>
            <BarChart3 class="h-4 w-4 text-indigo-500" />
          </CardHeader>
          <CardContent>
            <div class="text-3xl font-bold">{{ stats.overview.averageParticipantsPerContest }}</div>
            <p class="text-xs text-muted-foreground">Participantes promedio</p>
          </CardContent>
        </Card>
      </div>

      <!-- Métricas Secundarias -->
      <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card class="shadow-sm">
          <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle class="text-sm font-medium">Tasa de Conversión</CardTitle>
            <TrendingUp class="h-4 w-4 text-violet-500" />
          </CardHeader>
          <CardContent>
            <div class="text-3xl font-bold">{{ stats.participants.conversionRate }}%</div>
            <p class="text-xs text-muted-foreground">Pagados vs. Total</p>
          </CardContent>
        </Card>

        <Card class="shadow-sm">
          <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle class="text-sm font-medium">Ticket Promedio</CardTitle>
            <DollarSign class="h-4 w-4 text-cyan-500" />
          </CardHeader>
          <CardContent>
            <div class="text-3xl font-bold">{{ formatCurrency(stats.revenue.averageTicket) }}</div>
            <p class="text-xs text-muted-foreground">Por compra de bundle</p>
          </CardContent>
        </Card>

        <Card class="shadow-sm">
          <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle class="text-sm font-medium">Estado</CardTitle>
            <Calendar class="h-4 w-4 text-pink-500" />
          </CardHeader>
          <CardContent>
            <div class="text-3xl font-bold">
              {{ stats.contests.statusData.find((s: any) => s.name === 'Activo')?.value || 0 }}
            </div>
            <p class="text-xs text-muted-foreground">Concursos activos</p>
          </CardContent>
        </Card>
      </div>

      <!-- Gráficas -->
      <div class="grid gap-6 lg:grid-cols-2">
        <!-- Distribución de Concursos por Estado -->
        <Card class="shadow-sm">
          <CardHeader>
            <CardTitle class="flex items-center gap-2">
              <PieChart class="h-5 w-5 text-muted-foreground" />
              Distribución de Concursos
            </CardTitle>
            <CardDescription>Por estado actual</CardDescription>
          </CardHeader>
          <CardContent>
            <div v-if="contestDonutData.length > 0" class="h-64">
              <DonutChart
                :data="contestDonutData"
                :categories="contestDonutCategories"
                :radius="80"
                :height="250"
              />
            </div>
            <div v-else class="h-64 flex items-center justify-center text-muted-foreground">
              No hay datos disponibles
            </div>
          </CardContent>
        </Card>

        <!-- Distribución de Participantes por Estado -->
        <Card class="shadow-sm">
          <CardHeader>
            <CardTitle class="flex items-center gap-2">
              <PieChart class="h-5 w-5 text-muted-foreground" />
              Estado de Participantes
            </CardTitle>
            <CardDescription>Activos vs. Eliminados</CardDescription>
          </CardHeader>
          <CardContent>
            <div v-if="participantDonutData.length > 0" class="h-64">
              <DonutChart
                :data="participantDonutData"
                :categories="participantDonutCategories"
                :radius="80"
                :height="250"
              />
            </div>
            <div v-else class="h-64 flex items-center justify-center text-muted-foreground">
              No hay datos disponibles
            </div>
          </CardContent>
        </Card>

        <!-- Crecimiento Mensual de Concursos -->
        <Card class="shadow-sm">
          <CardHeader>
            <CardTitle class="flex items-center gap-2">
              <TrendingUp class="h-5 w-5 text-muted-foreground" />
              Crecimiento de Concursos
            </CardTitle>
            <CardDescription>Concursos creados por mes</CardDescription>
          </CardHeader>
          <CardContent>
            <div v-if="stats.contests.growthData?.length > 0" class="h-64">
              <LineChart
                :data="stats.contests.growthData"
                :categories="contestGrowthCategories"
                :height="250"
                :x-formatter="(i: number) => stats.contests.growthData[i]?.month || ''"
                x-label="Mes"
                y-label="Concursos"
              />
            </div>
            <div v-else class="h-64 flex items-center justify-center text-muted-foreground">
              No hay datos disponibles
            </div>
          </CardContent>
        </Card>

        <!-- Crecimiento Mensual de Participantes -->
        <Card class="shadow-sm">
          <CardHeader>
            <CardTitle class="flex items-center gap-2">
              <Users class="h-5 w-5 text-muted-foreground" />
              Crecimiento de Participantes
            </CardTitle>
            <CardDescription>Nuevos participantes por mes</CardDescription>
          </CardHeader>
          <CardContent>
            <div v-if="stats.participants.growthData?.length > 0" class="h-64">
              <LineChart
                :data="stats.participants.growthData"
                :categories="participantGrowthCategories"
                :height="250"
                :x-formatter="(i: number) => stats.participants.growthData[i]?.month || ''"
                x-label="Mes"
                y-label="Participantes"
              />
            </div>
            <div v-else class="h-64 flex items-center justify-center text-muted-foreground">
              No hay datos disponibles
            </div>
          </CardContent>
        </Card>

        <!-- Ingresos Mensuales -->
        <Card class="shadow-sm lg:col-span-2">
          <CardHeader>
            <CardTitle class="flex items-center gap-2">
              <DollarSign class="h-5 w-5 text-muted-foreground" />
              Ingresos Mensuales
            </CardTitle>
            <CardDescription>Evolución de ingresos por mes</CardDescription>
          </CardHeader>
          <CardContent>
            <div v-if="stats.revenue.monthlyData?.length > 0" class="h-64">
              <BarChart
                :data="stats.revenue.monthlyData"
                :categories="revenueCategories"
                :y-axis="['ingresos']"
                x-axis="month"
                :height="250"
                y-label="Ingresos (€)"
              />
            </div>
            <div v-else class="h-64 flex items-center justify-center text-muted-foreground">
              No hay datos disponibles
            </div>
          </CardContent>
        </Card>
      </div>
    </template>
  </div>
</template>
