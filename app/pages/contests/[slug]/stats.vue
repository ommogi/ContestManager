<script setup lang="ts">
import { 
  Trophy, 
  Users, 
  DollarSign, 
  BarChart3,
  PieChart,
  Globe,
  Layers,
  Activity,
  TrendingUp,
  Calendar,
  ChevronLeft
} from 'lucide-vue-next'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

const route = useRoute()
const router = useRouter()
const slug = route.params.slug as string

const { data: stats, pending } = await useFetch(`/api/contests/${slug}/stats`)

// Helper para formatear moneda
const formatCurrency = (cents: number) => {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR'
  }).format(cents / 100)
}

// Configuración de categorías para gráficas
const donutCategories = computed(() => {
  if (!stats.value?.inscriptions?.byStatus?.length) return {}
  const cats: Record<string, any> = {}
  for (const item of stats.value.inscriptions.byStatus) {
    cats[item.name] = { name: item.name, color: item.color }
  }
  return cats
})

const donutData = computed(() => {
  if (!stats.value?.inscriptions?.byStatus?.length) return []
  return stats.value.inscriptions.byStatus.map((s: any) => s.amount)
})

const timelineCategories = computed(() => {
  return {
    inscripciones: {
      name: 'Inscripciones',
      color: '#6366f1'
    }
  }
})

const categoryCategories = computed(() => {
  return {
    count: {
      name: 'Participantes',
      color: '#10b981'
    }
  }
})

const roundCategories = computed(() => {
  return {
    averageScore: {
      name: 'Puntuación Media',
      color: '#6366f1'
    }
  }
})

// Formatter para eje X
const xFormatter = (i: number, data: any[]) => data[i]?.date || data[i]?.category || data[i]?.round || ''
</script>

<template>
  <div class="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
    <!-- Header con navegación -->
    <div class="flex items-center gap-4">
      <Button variant="ghost" size="icon" @click="router.push(`/contests/${slug}`)">
        <ChevronLeft class="h-5 w-5" />
      </Button>
      <div>
        <h2 class="text-3xl font-bold tracking-tight">{{ stats?.contest?.name || 'Estadísticas' }}</h2>
        <p class="text-muted-foreground">Métricas detalladas del concurso</p>
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
            <CardTitle class="text-sm font-medium">Total Participantes</CardTitle>
            <Users class="h-4 w-4 text-indigo-500" />
          </CardHeader>
          <CardContent>
            <div class="text-3xl font-bold">{{ stats.overview.totalParticipants }}</div>
            <p class="text-xs text-muted-foreground">En {{ stats.overview.totalCategories }} categorías</p>
          </CardContent>
        </Card>

        <Card class="shadow-sm">
          <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle class="text-sm font-medium">Tasa de Ocupación</CardTitle>
            <Layers class="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div class="text-3xl font-bold">{{ stats.overview.globalOccupancyRate }}%</div>
            <p class="text-xs text-muted-foreground">Capacidad total</p>
          </CardContent>
        </Card>

        <Card class="shadow-sm">
          <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle class="text-sm font-medium">Ingresos</CardTitle>
            <DollarSign class="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div class="text-3xl font-bold">{{ formatCurrency(stats.overview.totalRevenue) }}</div>
            <p class="text-xs text-muted-foreground">Ticket medio: {{ formatCurrency(stats.overview.averageTicket) }}</p>
          </CardContent>
        </Card>

        <Card class="shadow-sm">
          <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle class="text-sm font-medium">Rondas</CardTitle>
            <Trophy class="h-4 w-4 text-indigo-500" />
          </CardHeader>
          <CardContent>
            <div class="text-3xl font-bold">{{ stats.overview.totalRounds }}</div>
            <p class="text-xs text-muted-foreground">Rondas activas</p>
          </CardContent>
        </Card>
      </div>

      <!-- Gráficas -->
      <div class="grid gap-6 lg:grid-cols-2">
        <!-- Estado de Inscripciones -->
        <Card class="shadow-sm">
          <CardHeader>
            <CardTitle class="flex items-center gap-2">
              <PieChart class="h-5 w-5 text-muted-foreground" />
              Estado de Inscripciones
            </CardTitle>
            <CardDescription>Distribución por estado de pago</CardDescription>
          </CardHeader>
          <CardContent>
            <div v-if="stats.inscriptions.byStatus?.length > 0" class="h-64">
              <DonutChart :data="donutData" :categories="donutCategories" :radius="80" :height="250" />
            </div>
            <div v-else class="h-64 flex items-center justify-center text-muted-foreground">
              No hay datos disponibles
            </div>
          </CardContent>
        </Card>

        <!-- Timeline de Inscripciones -->
        <Card class="shadow-sm">
          <CardHeader>
            <CardTitle class="flex items-center gap-2">
              <TrendingUp class="h-5 w-5 text-muted-foreground" />
              Timeline de Inscripciones
            </CardTitle>
            <CardDescription>Últimos 30 días</CardDescription>
          </CardHeader>
          <CardContent>
            <div v-if="stats.inscriptions.timeline?.length > 0" class="h-64">
              <LineChart 
                :data="stats.inscriptions.timeline"
                :categories="timelineCategories"
                :height="250"
                :x-formatter="(i: number) => xFormatter(i, stats.inscriptions.timeline)"
                x-label="Fecha"
                y-label="Inscripciones"
              />
            </div>
            <div v-else class="h-64 flex items-center justify-center text-muted-foreground">
              No hay datos de los últimos 30 días
            </div>
          </CardContent>
        </Card>

        <!-- Participantes por Categoría -->
        <Card class="shadow-sm lg:col-span-2">
          <CardHeader>
            <CardTitle class="flex items-center gap-2">
              <Layers class="h-5 w-5 text-muted-foreground" />
              Participantes por Categoría
            </CardTitle>
            <CardDescription>Distribución y ocupación por categoría</CardDescription>
          </CardHeader>
          <CardContent>
            <div v-if="stats.categories?.length > 0" class="h-64">
              <BarChart 
                :data="stats.categories"
                :categories="categoryCategories"
                :y-axis="['count']"
                :height="250"
                :x-formatter="(i: number) => xFormatter(i, stats.categories)"
                x-label="Categoría"
                y-label="Participantes"
              />
            </div>
            <div v-else class="h-64 flex items-center justify-center text-muted-foreground">
              No hay datos disponibles
            </div>
          </CardContent>
        </Card>

        <!-- Distribución Geográfica -->
        <Card class="shadow-sm">
          <CardHeader>
            <CardTitle class="flex items-center gap-2">
              <Globe class="h-5 w-5 text-muted-foreground" />
              Distribución Geográfica
            </CardTitle>
            <CardDescription>Top 10 países</CardDescription>
          </CardHeader>
          <CardContent>
            <div v-if="stats.geographic?.length > 0" class="space-y-2">
              <div v-for="(item, index) in stats.geographic.slice(0, 8)" :key="item.country" class="flex items-center justify-between">
                <div class="flex items-center gap-3">
                  <span class="text-sm font-medium w-6">{{ index + 1 }}.</span>
                  <span class="text-sm">{{ item.country }}</span>
                </div>
                <div class="flex items-center gap-2">
                  <div class="w-32 h-2 bg-muted rounded-full overflow-hidden">
                    <div 
                      class="h-full bg-indigo-500 rounded-full"
                      :style="{ width: `${(item.count / stats.geographic[0].count) * 100}%` }"
                    />
                  </div>
                  <span class="text-sm font-medium w-8 text-right">{{ item.count }}</span>
                </div>
              </div>
            </div>
            <div v-else class="h-64 flex items-center justify-center text-muted-foreground">
              No hay datos geográficos disponibles
            </div>
          </CardContent>
        </Card>

        <!-- Estadísticas de Evaluación -->
        <Card class="shadow-sm">
          <CardHeader>
            <CardTitle class="flex items-center gap-2">
              <BarChart3 class="h-5 w-5 text-muted-foreground" />
              Puntuaciones por Ronda
            </CardTitle>
            <CardDescription>Promedio de calificaciones</CardDescription>
          </CardHeader>
          <CardContent>
            <div v-if="stats.rounds?.length > 0" class="h-64">
              <BarChart 
                :data="stats.rounds"
                :categories="roundCategories"
                :y-axis="['averageScore']"
                :height="250"
                :x-formatter="(i: number) => xFormatter(i, stats.rounds)"
                x-label="Ronda"
                y-label="Puntuación Media"
              />
            </div>
            <div v-else class="h-64 flex items-center justify-center text-muted-foreground">
              No hay rondas completadas
            </div>
          </CardContent>
        </Card>

        <!-- Tabla de Jurados -->
        <Card class="shadow-sm lg:col-span-2">
          <CardHeader>
            <CardTitle class="flex items-center gap-2">
              <Users class="h-5 w-5 text-muted-foreground" />
              Actividad de Jurados
            </CardTitle>
            <CardDescription>Puntuaciones y consistencia de evaluación</CardDescription>
          </CardHeader>
          <CardContent>
            <div v-if="stats.judges?.length > 0" class="overflow-x-auto">
              <table class="w-full">
                <thead>
                  <tr class="border-b">
                    <th class="text-left py-2 px-4 text-sm font-medium">Jurado</th>
                    <th class="text-right py-2 px-4 text-sm font-medium">Calificaciones</th>
                    <th class="text-right py-2 px-4 text-sm font-medium">Puntuación Media</th>
                    <th class="text-right py-2 px-4 text-sm font-medium">Desviación Típica</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="judge in stats.judges" :key="judge.judgeId" class="border-b last:border-0">
                    <td class="py-3 px-4 text-sm font-mono">{{ judge.judgeId.slice(0, 8) }}...</td>
                    <td class="py-3 px-4 text-sm text-right">{{ judge.scoresGiven }}</td>
                    <td class="py-3 px-4 text-sm text-right font-medium">{{ judge.averageScore }}</td>
                    <td class="py-3 px-4 text-sm text-right">
                      <span :class="judge.standardDeviation > 2 ? 'text-amber-500' : 'text-emerald-500'">
                        {{ judge.standardDeviation }}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div v-else class="h-64 flex items-center justify-center text-muted-foreground">
              No hay datos de evaluación disponibles
            </div>
          </CardContent>
        </Card>
      </div>
    </template>
  </div>
</template>
