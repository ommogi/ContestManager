<script setup lang="ts">
import { Trophy, Users, CalendarClock, Layers } from 'lucide-vue-next'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

const DEFAULT_COVER = 'https://thaftosvbwcoudzfwiou.supabase.co/storage/v1/object/public/contest-assets/default-cover.png'

const authStore = useAuthStore()
const { data, error } = await useFetch('/api/my/contests', {
  server: false,
  headers: computed(() => ({
    Authorization: `Bearer ${authStore.session?.access_token ?? ''}`
  })),
  watch: [computed(() => authStore.session?.access_token)]
})

const contests = computed(() => (data.value as any)?.contests ?? [])

function statusLabel(status: string) {
  const map: Record<string, string> = { draft: 'No empezado', active: 'Activo', finished: 'Finalizado', cancelled: 'Cancelado' }
  return map[status] ?? status
}

function getStatusColor(status: string) {
  switch (status) {
    case 'active': return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300'
    case 'draft': return 'bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-300'
    case 'finished': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300'
    case 'cancelled': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300'
    default: return 'bg-zinc-100 text-zinc-800'
  }
}

function roleCount(myCategories: any[], role: string) {
  return (myCategories || []).filter((c: any) => c.role === role).length
}
</script>

<template>
  <div class="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
    <!-- Header -->
    <div>
      <h1 class="text-3xl font-bold tracking-tight">Mis Concursos</h1>
      <p class="text-muted-foreground mt-1">Los concursos en los que participas o evalúas como jurado.</p>
    </div>

    <!-- Error -->
    <div v-if="error" class="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/20 p-4 text-sm text-red-600 dark:text-red-400">
      No se pudo cargar la información. Intenta recargar la página.
    </div>

    <!-- Contest grid -->
    <div v-if="contests.length" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      <Card
        v-for="entry in contests"
        :key="entry.contest.id"
        class="group relative overflow-hidden border-border dark:shadow-none hover:shadow-lg transition-all duration-300 hover:border-zinc-700 bg-card flex flex-col min-h-[28rem]"
      >
        <!-- Background -->
        <div
          class="absolute inset-0 bg-muted bg-center bg-cover transition-transform duration-500 group-hover:scale-105"
          :style="`background-image: url('${entry.contest.cover_image_url || DEFAULT_COVER}')`"
        ></div>
        <div class="absolute inset-0 bg-gradient-to-t from-black/90 via-black/60 to-black/10 pointer-events-none"></div>

        <!-- Spacer -->
        <div class="relative z-10 flex-1"></div>

        <!-- Text -->
        <div class="relative z-10 px-6 pt-4 pb-3 space-y-2 text-white">
          <div class="flex flex-wrap gap-1.5">
            <Badge :class="getStatusColor(entry.contest.status)" class="capitalize border-none shadow-none font-medium text-xs">
              {{ statusLabel(entry.contest.status) }}
            </Badge>
            <Badge
              v-if="roleCount(entry.myCategories, 'participant') > 0"
              class="text-[10px] font-bold border-none gap-1 bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300"
            >
              <Trophy class="w-2.5 h-2.5" />
              {{ roleCount(entry.myCategories, 'participant') }} participante
            </Badge>
            <Badge
              v-if="roleCount(entry.myCategories, 'judge') > 0"
              class="text-[10px] font-bold border-none gap-1 bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300"
            >
              <Users class="w-2.5 h-2.5" />
              {{ roleCount(entry.myCategories, 'judge') }} jurado
            </Badge>
          </div>
          <h3 class="text-xl font-bold leading-tight drop-shadow-md">{{ entry.contest.name }}</h3>
        </div>

        <CardContent class="relative z-10 py-3">
          <div class="flex items-center justify-between text-sm text-white/70">
            <div class="flex items-center gap-1.5">
              <CalendarClock class="w-4 h-4" />
              <span>{{ entry.contest.starts_at ? new Date(entry.contest.starts_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) : '—' }}</span>
            </div>
            <div class="flex items-center gap-1.5">
              <Users class="w-4 h-4" />
              <span class="capitalize">{{ entry.contest.type }}</span>
            </div>
          </div>
        </CardContent>

        <CardFooter class="relative z-10 pt-0 pb-4 px-6 flex gap-3">
          <NuxtLink :to="`/my-contests/${entry.contest.slug}`" class="w-full">
            <Button class="w-full bg-white text-zinc-900 hover:bg-zinc-100 transition-all shadow-sm font-bold">
              Ver
            </Button>
          </NuxtLink>
        </CardFooter>
      </Card>
    </div>

    <!-- Empty state -->
    <div v-else-if="!error" class="rounded-xl border-2 border-dashed border-border bg-muted/30 py-16 text-center">
      <Layers class="w-12 h-12 text-muted-foreground/40 mx-auto mb-4" />
      <p class="text-base font-semibold text-muted-foreground">Sin concursos</p>
      <p class="text-sm text-muted-foreground/70 mt-1">No estás inscrito en ningún concurso aún.</p>
    </div>
  </div>
</template>
