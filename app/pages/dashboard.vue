<script setup lang="ts">
import {
  Trophy, Users, BarChart3, Ticket, ArrowRight, TrendingUp,
  Activity, DollarSign, Calendar, Zap, Target, PieChart
} from 'lucide-vue-next'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { storeToRefs } from 'pinia'

const authStore = useAuthStore()
const { isOrgOwner, displayName, organization } = storeToRefs(authStore)

// Org owner: fetch all their contests + stats
const { data: contests } = isOrgOwner.value
  ? await useFetch('/api/contests', {
      headers: computed(() => ({
        Authorization: `Bearer ${authStore.session?.access_token ?? ''}`
      }))
    })
  : { data: ref(null) }

const { data: orgStats } = isOrgOwner.value
  ? await useFetch('/api/stats/organization', {
      server: false,
      headers: computed(() => ({
        Authorization: `Bearer ${authStore.session?.access_token ?? ''}`
      }))
    })
  : { data: ref(null) }

// Regular user: fetch their participation data
const { data: myContests } = !isOrgOwner.value
  ? await useFetch('/api/my/contests', {
      server: false,
      headers: computed(() => ({
        Authorization: `Bearer ${authStore.session?.access_token ?? ''}`
      }))
    })
  : { data: ref(null) }

const participantCount = computed(() => (myContests.value as any)?.asParticipant?.length ?? 0)
const judgeCount = computed(() => (myContests.value as any)?.asJudge?.length ?? 0)

// ── Org stats computed ────────────────────────────────────────────────────────
const stats = computed(() => (orgStats.value as any) ?? null)

const totalContests = computed(() => stats.value?.contests?.total ?? 0)
const activeContests = computed(() => {
  const d = stats.value?.contests?.statusData ?? []
  return (d.find((s: any) => s.name === 'Activo')?.value ?? 0) as number
})

const totalParticipants = computed(() => stats.value?.participants?.total ?? 0)
const conversionRate = computed(() => stats.value?.participants?.conversionRate ?? 0)

const avgScore = computed(() => {
  const avg = stats.value?.scores?.average
  return avg != null && avg > 0 ? Number(avg).toFixed(1) : null
})
const totalScores = computed(() => stats.value?.scores?.total ?? 0)

const ticketBalance = computed(() => organization.value?.ticket_balance ?? null)
const totalRevenue = computed(() => stats.value?.revenue?.total ?? 0)
const averageTicket = computed(() => stats.value?.revenue?.averageTicket ?? 0)

// ── Chart data ────────────────────────────────────────────────────────────────
function formatMonth(key: string) {
  if (!key) return ''
  const [y, m] = key.split('-')
  return new Date(Number(y), Number(m) - 1, 1)
    .toLocaleDateString('es-ES', { month: 'short', year: '2-digit' })
}

const participantGrowthData = computed(() => {
  const raw = (stats.value?.participants?.growthData ?? []) as Array<{ month: string; participantes: number }>
  return raw.map(d => ({ ...d, mes: formatMonth(d.month) }))
})

const participantGrowthCategories = computed(() => ({
  participantes: { name: 'Nuevos participantes', color: '#10b981' }
}))

const contestStatusData = computed(() =>
  (stats.value?.contests?.statusData ?? []) as Array<{ name: string; value: number; color: string }>
)

const statusDonutData = computed(() => contestStatusData.value.map(d => d.value))
const statusDonutCategories = computed(() =>
  Object.fromEntries(contestStatusData.value.map((d, i) => [String(i), { name: d.name, color: d.color }]))
)

const participantStatusData = computed(() =>
  (stats.value?.participants?.statusData ?? []) as Array<{ name: string; value: number; color: string }>
)

const participantStatusDonutData = computed(() => participantStatusData.value.map(d => d.value))
const participantStatusDonutCategories = computed(() =>
  Object.fromEntries(participantStatusData.value.map((d, i) => [String(i), { name: d.name, color: d.color }]))
)

const revenueData = computed(() =>
  (stats.value?.revenue?.monthlyData ?? []) as Array<{ month: string; ingresos: number }>
)

const revenueCategories = computed(() => ({
  ingresos: { name: 'Ingresos (€)', color: '#3b82f6' }
}))

const contestGrowthData = computed(() =>
  (stats.value?.contests?.growthData ?? []) as Array<{ month: string; concursos: number }>
)

const contestGrowthCategories = computed(() => ({
  concursos: { name: 'Concursos', color: '#10b981' }
}))

// Flags
const hasGrowthData = computed(() => participantGrowthData.value.length >= 1)
const hasStatusData = computed(() => contestStatusData.value.some(d => d.value > 0))
const hasParticipantStatusData = computed(() => participantStatusData.value.some(d => d.value > 0))
const hasRevenueData = computed(() => revenueData.value.length >= 2)
const hasContestGrowthData = computed(() => contestGrowthData.value.length >= 1)

// Computed para headers de charts
const totalInscripciones = computed(() =>
  participantGrowthData.value.reduce((sum, d) => sum + (d.participantes || 0), 0)
)
const totalIngresos = computed(() =>
  revenueData.value.reduce((sum, d) => sum + (d.ingresos || 0), 0)
)

// ── Recent contests ───────────────────────────────────────────────────────────
const recentContests = computed(() => ((contests.value as any)?.items ?? contests.value ?? []).slice(0, 5) as any[])

const STATUS_LABEL: Record<string, string> = {
  draft: 'Borrador', active: 'Activo', finished: 'Finalizado', cancelled: 'Cancelado'
}
const STATUS_CLASS: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300',
  draft: 'bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-300',
  finished: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
  cancelled: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
}

function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })
}

const todayStr = computed(() =>
  new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })
)

</script>

<template>
  <div class="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">

    <!-- ── ORG OWNER DASHBOARD ───────────────────────────────────────────────── -->
    <template v-if="isOrgOwner">

      <!-- Header -->
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p class="text-xs font-medium text-muted-foreground uppercase tracking-widest">{{ todayStr }}</p>
          <h2 class="text-3xl font-bold tracking-tight mt-1">Panel de control</h2>
          <p class="text-muted-foreground text-sm mt-1">Bienvenido de nuevo, aquí está el estado de tus concursos.</p>
        </div>
        <NuxtLink to="/contests/new">
          <Button size="sm" class="gap-2 shadow-sm">
            <Zap class="w-4 h-4" />
            Nuevo concurso
          </Button>
        </NuxtLink>
      </div>

      <!-- KPI Cards -->
      <div class="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Card class="shadow-sm border-l-4 border-l-zinc-500 overflow-hidden">
          <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle class="text-xs font-medium text-muted-foreground uppercase tracking-wider">Concursos</CardTitle>
            <div class="p-1.5 rounded-md bg-zinc-100 dark:bg-zinc-800">
              <Trophy class="h-3.5 w-3.5 text-zinc-600 dark:text-zinc-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div class="text-2xl font-bold">{{ totalContests }}</div>
            <div class="flex items-center gap-1.5 mt-1">
              <span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">
                {{ activeContests }}
              </span>
              <span class="text-[11px] text-muted-foreground">{{ activeContests === 1 ? 'activo' : 'activos' }}</span>
            </div>
          </CardContent>
        </Card>

        <Card class="shadow-sm border-l-4 border-l-emerald-500 overflow-hidden">
          <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle class="text-xs font-medium text-muted-foreground uppercase tracking-wider">Participantes</CardTitle>
            <div class="p-1.5 rounded-md bg-emerald-50 dark:bg-emerald-950/30">
              <Users class="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div class="text-2xl font-bold">{{ totalParticipants }}</div>
            <div class="flex items-center gap-1 mt-1">
              <TrendingUp class="h-3 w-3 text-emerald-500" />
              <span class="text-[11px] text-muted-foreground">{{ conversionRate }}% conversión</span>
            </div>
          </CardContent>
        </Card>

        <Card class="shadow-sm border-l-4 border-l-blue-500 overflow-hidden">
          <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle class="text-xs font-medium text-muted-foreground uppercase tracking-wider">Calificaciones</CardTitle>
            <div class="p-1.5 rounded-md bg-blue-50 dark:bg-blue-950/30">
              <BarChart3 class="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div class="text-2xl font-bold">{{ avgScore ?? '—' }}</div>
            <div class="flex items-center gap-1 mt-1">
              <Target class="h-3 w-3 text-blue-500" />
              <span class="text-[11px] text-muted-foreground">{{ totalScores }} totales</span>
            </div>
          </CardContent>
        </Card>

        <NuxtLink to="/billing" class="group">
          <Card class="shadow-sm border-l-4 border-l-violet-500 overflow-hidden h-full transition-all group-hover:shadow-md group-hover:border-l-violet-600">
            <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle class="text-xs font-medium text-muted-foreground uppercase tracking-wider">Tickets</CardTitle>
              <div class="p-1.5 rounded-md bg-violet-50 dark:bg-violet-950/30">
                <Ticket class="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />
              </div>
            </CardHeader>
            <CardContent>
              <div class="text-2xl font-bold">{{ ticketBalance ?? '—' }}</div>
              <div class="flex items-center gap-1 mt-1">
                <span class="text-[11px] text-muted-foreground">créditos disponibles</span>
                <ArrowRight class="w-3 h-3 opacity-0 group-hover:opacity-100 transition-all -translate-x-1 group-hover:translate-x-0 text-violet-500" />
              </div>
            </CardContent>
          </Card>
        </NuxtLink>
      </div>

      <!-- Charts Row 1: Inscripciones + Estado -->
      <div class="grid gap-6 lg:grid-cols-5">
        <!-- AreaChart: Inscripciones por mes -->
        <div class="lg:col-span-3 rounded-2xl bg-muted/40 dark:bg-[#0f0f12] border border-border dark:border-zinc-800/40 p-5 shadow-sm">
          <div class="flex items-start justify-between mb-4">
            <div>
              <p class="text-xs font-medium text-muted-foreground uppercase tracking-wider">Inscripciones por mes</p>
              <div class="flex items-baseline gap-3 mt-1">
                <span class="text-2xl font-bold text-foreground">{{ totalInscripciones }}</span>
                <Badge v-if="participantGrowthData.length > 1" variant="outline" class="border-emerald-500/30 text-emerald-400 text-[10px] font-bold">
                  +{{ participantGrowthData[participantGrowthData.length - 1]?.participantes || 0 }} este mes
                </Badge>
              </div>
            </div>
            <div class="p-2 rounded-xl bg-emerald-500/10">
              <TrendingUp class="h-5 w-5 text-emerald-400" />
            </div>
          </div>
          <div v-if="hasGrowthData" class="h-56">
            <AreaChart
              :data="participantGrowthData"
              :categories="participantGrowthCategories"
              :height="224"
              curve-type="natural"
              :x-formatter="(i: number) => participantGrowthData[i]?.mes || ''"
              :hide-legend="true"
              :y-grid-line="true"
              :x-domain-line="false"
              :y-domain-line="false"
              class="h-full"
            />
          </div>
          <div v-else class="h-56 flex flex-col items-center justify-center gap-3 text-center text-muted-foreground">
            <div class="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
              <TrendingUp class="w-6 h-6 opacity-40" />
            </div>
            <div>
              <p class="text-sm font-medium text-muted-foreground">Sin inscripciones todavía</p>
              <p class="text-xs mt-0.5">Aparecerá con las primeras inscripciones</p>
            </div>
          </div>
          <!-- Leyenda custom -->
          <div v-if="hasGrowthData" class="flex items-center gap-4 mt-3 pt-3 border-t border-border">
            <div class="flex items-center gap-2">
              <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
              <span class="text-xs text-muted-foreground">Nuevos participantes</span>
            </div>
            <div class="ml-auto">
              <NuxtLink to="/stats" class="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
                Ver detalles <ArrowRight class="w-3 h-3" />
              </NuxtLink>
            </div>
          </div>
        </div>

        <!-- DonutChart: Estado de concursos -->
        <div class="lg:col-span-2 rounded-2xl bg-muted/40 dark:bg-[#0f0f12] border border-border dark:border-zinc-800/40 p-5 shadow-sm">
          <div class="flex items-start justify-between mb-4">
            <div>
              <p class="text-xs font-medium text-muted-foreground uppercase tracking-wider">Estado de concursos</p>
              <div class="flex items-baseline gap-3 mt-1">
                <span class="text-2xl font-bold text-foreground">{{ totalContests }}</span>
                <span class="text-xs text-muted-foreground">totales</span>
              </div>
            </div>
            <div class="p-2 rounded-xl bg-zinc-500/10">
              <PieChart class="h-5 w-5 text-muted-foreground" />
            </div>
          </div>
          <div v-if="hasStatusData" class="h-52">
            <DonutChart
              :data="statusDonutData"
              :categories="statusDonutCategories"
              :radius="70"
              :height="208"
              :hide-legend="true"
            />
          </div>
          <div v-else class="h-52 flex flex-col items-center justify-center gap-3 text-center text-muted-foreground">
            <div class="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
              <Trophy class="w-6 h-6 opacity-40" />
            </div>
            <div>
              <p class="text-sm font-medium text-muted-foreground">Sin concursos todavía</p>
              <NuxtLink to="/contests/new" class="text-xs text-emerald-400 hover:text-emerald-300 mt-0.5 inline-block">Crea tu primer concurso</NuxtLink>
            </div>
          </div>
          <!-- Leyenda custom -->
          <div v-if="hasStatusData" class="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-border">
            <div v-for="(item, idx) in contestStatusData" :key="idx" class="flex items-center gap-2">
              <span class="w-2 h-2 rounded-full shrink-0" :style="{ backgroundColor: item.color }"></span>
              <span class="text-[11px] text-muted-foreground truncate">{{ item.name }}</span>
              <span class="text-[11px] text-foreground font-semibold ml-auto">{{ item.value }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Charts Row 2: Ingresos + Participantes -->
      <div class="grid gap-6 lg:grid-cols-5">
        <!-- BarChart: Ingresos mensuales -->
        <div class="lg:col-span-3 rounded-2xl bg-muted/40 dark:bg-[#0f0f12] border border-border dark:border-zinc-800/40 p-5 shadow-sm">
          <div class="flex items-start justify-between mb-4">
            <div>
              <p class="text-xs font-medium text-muted-foreground uppercase tracking-wider">Ingresos mensuales</p>
              <div class="flex items-baseline gap-3 mt-1">
                <span class="text-2xl font-bold text-foreground">€{{ totalIngresos.toFixed(2) }}</span>
                <Badge v-if="revenueData.length > 1" variant="outline" class="border-blue-500/30 text-blue-400 text-[10px] font-bold">
                  €{{ (revenueData[revenueData.length - 1]?.ingresos || 0).toFixed(2) }} este mes
                </Badge>
              </div>
            </div>
            <div class="p-2 rounded-xl bg-blue-500/10">
              <DollarSign class="h-5 w-5 text-blue-400" />
            </div>
          </div>
          <div v-if="hasRevenueData" class="h-56">
            <BarChart
              :data="revenueData"
              :categories="revenueCategories"
              :y-axis="['ingresos']"
              x-axis="month"
              :height="224"
              :y-formatter="(v: number) => `€${v.toFixed(0)}`"
              :x-formatter="(i: number) => formatMonth(revenueData[i]?.month || '')"
              :hide-legend="true"
              :y-grid-line="true"
              :x-domain-line="false"
              :y-domain-line="false"
              class="h-full"
            />
          </div>
          <div v-else class="h-56 flex flex-col items-center justify-center gap-3 text-center text-muted-foreground">
            <div class="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
              <DollarSign class="w-6 h-6 opacity-40" />
            </div>
            <div>
              <p class="text-sm font-medium text-muted-foreground">Sin datos de ingresos</p>
              <p class="text-xs mt-0.5">Los ingresos aparecerán cuando vendas tickets</p>
            </div>
          </div>
          <div v-if="hasRevenueData" class="flex items-center gap-4 mt-3 pt-3 border-t border-border">
            <div class="flex items-center gap-2">
              <span class="w-2 h-2 rounded-full bg-blue-500"></span>
              <span class="text-xs text-muted-foreground">Ingresos (€)</span>
            </div>
          </div>
        </div>

        <!-- DonutChart: Estado de participantes -->
        <div class="lg:col-span-2 rounded-2xl bg-muted/40 dark:bg-[#0f0f12] border border-border dark:border-zinc-800/40 p-5 shadow-sm">
          <div class="flex items-start justify-between mb-4">
            <div>
              <p class="text-xs font-medium text-muted-foreground uppercase tracking-wider">Estado de participantes</p>
              <div class="flex items-baseline gap-3 mt-1">
                <span class="text-2xl font-bold text-foreground">{{ totalParticipants }}</span>
                <span class="text-xs text-muted-foreground">totales</span>
              </div>
            </div>
            <div class="p-2 rounded-xl bg-emerald-500/10">
              <Users class="h-5 w-5 text-emerald-400" />
            </div>
          </div>
          <div v-if="hasParticipantStatusData" class="h-52">
            <DonutChart
              :data="participantStatusDonutData"
              :categories="participantStatusDonutCategories"
              :radius="70"
              :height="208"
              :hide-legend="true"
            />
          </div>
          <div v-else class="h-52 flex flex-col items-center justify-center gap-3 text-center text-muted-foreground">
            <div class="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
              <Users class="w-6 h-6 opacity-40" />
            </div>
            <div>
              <p class="text-sm font-medium text-muted-foreground">Sin participantes</p>
              <p class="text-xs mt-0.5">Los datos aparecerán con las primeras inscripciones</p>
            </div>
          </div>
          <div v-if="hasParticipantStatusData" class="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-border">
            <div v-for="(item, idx) in participantStatusData" :key="idx" class="flex items-center gap-2">
              <span class="w-2 h-2 rounded-full shrink-0" :style="{ backgroundColor: item.color }"></span>
              <span class="text-[11px] text-muted-foreground truncate">{{ item.name }}</span>
              <span class="text-[11px] text-foreground font-semibold ml-auto">{{ item.value }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Charts Row 3: Contest growth (condicional) -->
      <div v-if="hasContestGrowthData" class="rounded-2xl bg-muted/40 dark:bg-[#0f0f12] border border-border dark:border-zinc-800/40 p-5 shadow-sm">
        <div class="flex items-start justify-between mb-4">
          <div>
            <p class="text-xs font-medium text-muted-foreground uppercase tracking-wider">Crecimiento de concursos</p>
            <div class="flex items-baseline gap-3 mt-1">
              <span class="text-2xl font-bold text-foreground">{{ totalContests }}</span>
              <span class="text-xs text-muted-foreground">creados en total</span>
            </div>
          </div>
          <div class="p-2 rounded-xl bg-emerald-500/10">
            <Calendar class="h-5 w-5 text-emerald-400" />
          </div>
        </div>
        <div class="h-56">
          <LineChart
            :data="contestGrowthData"
            :categories="contestGrowthCategories"
            :height="224"
            curve-type="natural"
            :x-formatter="(i: number) => formatMonth(contestGrowthData[i]?.month || '')"
            :hide-legend="true"
            :y-grid-line="true"
            :x-domain-line="false"
            :y-domain-line="false"
            class="h-full"
          />
        </div>
        <div class="flex items-center gap-4 mt-3 pt-3 border-t border-border">
          <div class="flex items-center gap-2">
            <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span class="text-xs text-muted-foreground">Concursos creados</span>
          </div>
        </div>
      </div>

      <!-- Recent contests -->
      <div class="space-y-4">
        <div class="flex items-center justify-between">
          <div>
            <h3 class="text-lg font-bold">Concursos recientes</h3>
            <p class="text-xs text-muted-foreground">Tus últimos concursos creados</p>
          </div>
          <NuxtLink to="/contests" class="text-xs font-medium text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
            Ver todos <ArrowRight class="w-3 h-3" />
          </NuxtLink>
        </div>

        <div v-if="recentContests.length" class="grid gap-3">
          <Card
            v-for="c in recentContests"
            :key="c.id"
            class="shadow-sm hover:shadow-md transition-shadow"
          >
            <div class="flex items-center gap-4 px-5 py-4">
              <div
                class="w-12 h-12 rounded-xl bg-muted bg-cover bg-center shrink-0 border border-border shadow-sm"
                :style="c.cover_image_url ? `background-image:url('${c.cover_image_url}')` : ''"
              >
                <div v-if="!c.cover_image_url" class="w-full h-full flex items-center justify-center">
                  <Trophy class="w-5 h-5 text-muted-foreground/40" />
                </div>
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-sm font-semibold truncate">{{ c.name }}</p>
                <div class="flex items-center gap-2 mt-0.5">
                  <Calendar class="w-3 h-3 text-muted-foreground/60" />
                  <p class="text-xs text-muted-foreground">{{ formatDate(c.starts_at) }}</p>
                </div>
              </div>
              <div class="flex items-center gap-3 shrink-0">
                <Badge :class="STATUS_CLASS[c.status]" class="border-none text-[11px] font-medium">
                  {{ STATUS_LABEL[c.status] ?? c.status }}
                </Badge>
                <NuxtLink :to="`/contests/${c.slug}`">
                  <Button variant="ghost" size="icon" class="h-8 w-8 hover:bg-muted">
                    <ArrowRight class="w-4 h-4" />
                  </Button>
                </NuxtLink>
              </div>
            </div>
          </Card>
        </div>
        <div v-else class="rounded-xl border-2 border-dashed border-border bg-muted/30 py-12 text-center">
          <Trophy class="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
          <p class="text-sm text-muted-foreground">Aún no hay concursos</p>
          <NuxtLink to="/contests/new" class="text-xs underline font-medium text-foreground mt-1 inline-block">Crea tu primer concurso</NuxtLink>
        </div>
      </div>
    </template>

    <!-- ── REGULAR USER DASHBOARD ────────────────────────────────────────────── -->
    <template v-else>
      <div>
        <h2 class="text-3xl font-bold tracking-tight">Bienvenido, {{ displayName }}</h2>
        <p class="text-muted-foreground mt-1">Aquí tienes un resumen de tu actividad en la plataforma.</p>
      </div>

      <div class="grid gap-4 md:grid-cols-2">
        <Card class="shadow-sm border-l-4 border-l-emerald-500 overflow-hidden">
          <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle class="text-sm font-medium">Como Participante</CardTitle>
            <div class="p-1.5 rounded-md bg-emerald-50 dark:bg-emerald-950/30">
              <Trophy class="h-4 w-4 text-emerald-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div class="text-3xl font-bold">{{ participantCount }}</div>
            <p class="text-xs text-muted-foreground mt-1">
              {{ participantCount === 1 ? 'Concurso en el que compites' : 'Concursos en los que compites' }}
            </p>
          </CardContent>
        </Card>
        <Card class="shadow-sm border-l-4 border-l-blue-500 overflow-hidden">
          <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle class="text-sm font-medium">Como Jurado</CardTitle>
            <div class="p-1.5 rounded-md bg-blue-50 dark:bg-blue-950/30">
              <Users class="h-4 w-4 text-blue-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div class="text-3xl font-bold">{{ judgeCount }}</div>
            <p class="text-xs text-muted-foreground mt-1">
              {{ judgeCount === 1 ? 'Concurso que evalúas' : 'Concursos que evalúas' }}
            </p>
          </CardContent>
        </Card>
      </div>

      <div class="rounded-xl border-2 border-dashed border-border bg-muted/30 py-10 text-center space-y-2">
        <Trophy class="w-10 h-10 text-muted-foreground/40 mx-auto" />
        <p class="font-medium text-sm">¿Quieres ver tus concursos?</p>
        <p class="text-xs text-muted-foreground">
          Ve a <NuxtLink to="/my-contests" class="underline font-medium text-foreground">Mis Concursos</NuxtLink> para ver todos los detalles de tu participación.
        </p>
      </div>
    </template>

  </div>
</template>
