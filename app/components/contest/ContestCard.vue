<script setup lang="ts">
import { ref } from 'vue'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CalendarClock, Users, Trash, AlertTriangle } from 'lucide-vue-next'

const DEFAULT_COVER = 'https://thaftosvbwcoudzfwiou.supabase.co/storage/v1/object/public/contest-assets/default-cover.png'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

const props = defineProps({
  contest: { type: Object, required: true }
})

const emit = defineEmits<{
  (e: 'delete', id: string): void
}>()

const isDeleteDialogOpen = ref(false)

const getStatusColor = (status: string) => {
  switch(status) {
    case 'active': return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300'
    case 'draft': return 'bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-300'
    case 'finished': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300'
    case 'cancelled': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300'
    default: return 'bg-zinc-100 text-zinc-800'
  }
}
</script>

<template>
  <Card
    class="group relative overflow-hidden border-border dark:shadow-none hover:shadow-lg transition-all duration-300 hover:border-zinc-700 bg-card flex flex-col min-h-[28rem]"
  >
    <!-- Background image (default fallback) -->
    <div
      class="absolute inset-0 bg-muted bg-center bg-cover transition-transform duration-500 group-hover:scale-105"
      :style="`background-image: url('${contest.cover_image_url || DEFAULT_COVER}')`"
    ></div>

    <!-- Dark gradient overlay -->
    <div class="absolute inset-0 bg-gradient-to-t from-black/90 via-black/60 to-black/10 pointer-events-none"></div>

    <!-- Top-right delete -->
    <div class="relative z-10 flex justify-end p-3">
      <AlertDialog v-model:open="isDeleteDialogOpen">
        <AlertDialogTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            class="h-8 w-8 text-white/70 hover:text-white bg-black/40 hover:bg-red-600/80 backdrop-blur-sm transition-colors"
          >
            <Trash class="w-4 h-4" />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent class="border-border">
          <AlertDialogHeader>
            <div class="flex items-center gap-3">
              <div class="p-2 bg-destructive/10 rounded-full h-fit">
                <AlertTriangle class="w-5 h-5 text-destructive" />
              </div>
              <AlertDialogTitle>¿Estás completamente seguro?</AlertDialogTitle>
            </div>
            <AlertDialogDescription class="pt-2 text-zinc-600 dark:text-zinc-400">
              Esta acción es irreversible. Al eliminar el concurso <strong class="text-zinc-900 dark:text-zinc-100">"{{ contest.name }}"</strong> se borrarán todos los datos asociados de forma permanente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel class="h-9">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              @click="emit('delete', contest.id)"
              class="h-9 bg-red-600 hover:bg-red-700 text-white shadow-md shadow-red-600/20"
            >
              Eliminar permanentemente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>

    <!-- Spacer to push text content down -->
    <div class="relative z-10 flex-1"></div>

    <!-- Text content over gradient -->
    <div class="relative z-10 px-6 pt-4 pb-3 space-y-2 text-white">
      <Badge :class="getStatusColor(contest.status)" class="capitalize border-none shadow-none font-medium text-xs">
        {{ contest.status }}
      </Badge>
      <h3 class="text-xl font-bold leading-tight drop-shadow-md">{{ contest.name }}</h3>
    </div>

    <CardContent class="relative z-10 py-3">
      <div class="flex items-center justify-between text-sm text-white/70">
        <div class="flex items-center gap-1.5">
          <CalendarClock class="w-4 h-4" />
          <span>{{ new Date(contest.created_at).toLocaleDateString('es-ES') }}</span>
        </div>
        <div class="flex items-center gap-1.5">
          <Users class="w-4 h-4" />
          <span class="capitalize">{{ contest.type }}</span>
        </div>
      </div>
    </CardContent>

    <CardFooter class="relative z-10 pt-0 pb-4 px-6 flex gap-3">
      <NuxtLink :to="`/contests/${contest.slug}`" class="w-full">
        <Button class="w-full bg-white text-zinc-900 hover:bg-zinc-100 transition-all shadow-sm font-bold">
          Administrar
        </Button>
      </NuxtLink>
    </CardFooter>
  </Card>
</template>
