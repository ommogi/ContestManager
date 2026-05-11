<script setup lang="ts">
import { Trophy, Users, Activity, BarChart3 } from 'lucide-vue-next'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import ContestCard from '~/components/contest/ContestCard.vue'
import { storeToRefs } from 'pinia'

const authStore = useAuthStore()
const { isOrgOwner, displayName } = storeToRefs(authStore)

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

// Real stats from orgStats
const totalParticipants = computed(() => (orgStats.value as any)?.participants?.total ?? 0)
const totalScores = computed(() => {
  const scores = (orgStats.value as any)?.scores?.total
  return scores != null ? scores : 0
})
const avgScore = computed(() => {
  const avg = (orgStats.value as any)?.scores?.average
  return avg != null ? Number(avg).toFixed(1) : '0.0'
})
</script>

<template>
  <div class="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">

    <!-- ── ORG OWNER DASHBOARD ───────────────────────────────────────────────── -->
    <template v-if="isOrgOwner">
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-3xl font-bold tracking-tight">Resumen</h2>
          <p class="text-muted-foreground">Bienvenido de nuevo, aquí está el estado de tus concursos.</p>
        </div>
      </div>

      <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card class="shadow-sm">
          <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle class="text-sm font-medium">Concursos Activos</CardTitle>
            <Trophy class="h-4 w-4 text-zinc-900" />
          </CardHeader>
          <CardContent>
            <div class="text-3xl font-bold">{{ (contests as any[])?.length || 0 }}</div>
            <p class="text-xs text-muted-foreground">Gestionados por tu organización</p>
          </CardContent>
        </Card>
        <Card class="shadow-sm">
          <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle class="text-sm font-medium">Participantes</CardTitle>
            <Users class="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div class="text-3xl font-bold">{{ totalParticipants }}</div>
            <p class="text-xs text-muted-foreground">En todas las categorías</p>
          </CardContent>
        </Card>
        <Card class="shadow-sm">
          <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle class="text-sm font-medium">Calificaciones</CardTitle>
            <Activity class="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div class="text-3xl font-bold">{{ totalScores }}</div>
            <p class="text-xs text-muted-foreground">Registradas en total</p>
          </CardContent>
        </Card>
        <Card class="shadow-sm">
          <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle class="text-sm font-medium">Promedio General</CardTitle>
            <BarChart3 class="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div class="text-3xl font-bold">{{ avgScore }}</div>
            <p class="text-xs text-muted-foreground">Puntos de un max 10</p>
          </CardContent>
        </Card>
      </div>

      <div class="space-y-4">
        <h3 class="text-xl font-bold tracking-tight">Actividad Reciente</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <ContestCard v-for="c in (contests as any[])" :key="c.id" :contest="c" />
          <div v-if="!(contests as any[])?.length" class="col-span-full py-12 text-center text-muted-foreground border-2 border-dashed rounded-lg">
            Aún no hay concursos activos. <NuxtLink to="/contests/new" class="underline font-medium">Crea uno</NuxtLink> para comenzar.
          </div>
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
        <Card class="shadow-sm">
          <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle class="text-sm font-medium">Como Participante</CardTitle>
            <Trophy class="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div class="text-3xl font-bold">{{ participantCount }}</div>
            <p class="text-xs text-muted-foreground">
              {{ participantCount === 1 ? 'Concurso en el que compites' : 'Concursos en los que compites' }}
            </p>
          </CardContent>
        </Card>
        <Card class="shadow-sm">
          <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle class="text-sm font-medium">Como Jurado</CardTitle>
            <Users class="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div class="text-3xl font-bold">{{ judgeCount }}</div>
            <p class="text-xs text-muted-foreground">
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
