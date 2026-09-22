<script setup lang="ts">
import { ref, computed } from 'vue'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CalendarClock, Tag, Trash, AlertTriangle } from 'lucide-vue-next'
import { getStatusBannerClasses } from '@/utils/styles'
import {
import { DEFAULT_CONTEST_COVER_URL } from '~~/shared/brand-assets'
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


const props = withDefaults(defineProps<{
  contest: Record<string, any>
  /** Link target — differs between the organizer and participant views. */
  to: string
  /** Show the delete action (organizer view only). */
  deletable?: boolean
  /** Overrides merged over the default status labels. */
  statusLabels?: Record<string, string>
}>(), {
  deletable: false,
  statusLabels: undefined,
})

const emit = defineEmits<{
  (e: 'delete', id: string): void
}>()

const isDeleteDialogOpen = ref(false)

const DEFAULT_STATUS_LABELS: Record<string, string> = {
  draft: 'Borrador',
  active: 'Activo',
  finished: 'Finalizado',
  cancelled: 'Cancelado',
}

const statusLabel = computed(() => {
  const labels = { ...DEFAULT_STATUS_LABELS, ...(props.statusLabels ?? {}) }
  return labels[props.contest.status] ?? props.contest.status
})

const startsAtLabel = computed(() => {
  const raw = props.contest.starts_at
  if (!raw) return '—'
  return new Date(raw).toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
})
</script>

<template>
  <Card
    class="group relative flex min-h-[11rem] flex-col justify-end overflow-hidden border-border bg-muted transition-all duration-200 hover:border-zinc-400 hover:shadow-md dark:hover:border-zinc-600 dark:shadow-none"
  >
    <!-- Cover fills the whole card -->
    <div
      class="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-105"
      :style="`background-image: url('${contest.cover_image_url || DEFAULT_CONTEST_COVER_URL}')`"
    />
    <!-- Bottom-weighted so the text block stays readable over any artwork -->
    <div class="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-black/20 pointer-events-none" />

    <Badge
      :class="getStatusBannerClasses(contest.status)"
      class="absolute left-2 top-2 border text-[10px] font-semibold shadow-sm backdrop-blur-sm"
    >
      {{ statusLabel }}
    </Badge>

    <!-- Sits above the stretched link so it doesn't navigate -->
    <AlertDialog v-if="deletable" v-model:open="isDeleteDialogOpen">
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Eliminar concurso"
          class="absolute right-2 top-2 z-20 h-7 w-7 bg-black/40 text-white/80 opacity-0 backdrop-blur-sm transition hover:bg-red-600/80 hover:text-white focus-visible:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100"
        >
          <Trash class="h-3.5 w-3.5" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent class="border-border">
        <AlertDialogHeader>
          <div class="flex items-center gap-3">
            <div class="h-fit rounded-full bg-destructive/10 p-2">
              <AlertTriangle class="h-5 w-5 text-destructive" />
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
            class="h-9 bg-red-600 text-white shadow-md shadow-red-600/20 hover:bg-red-700"
          >
            Eliminar permanentemente
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <!-- Content, anchored to the bottom over the gradient -->
    <div class="relative flex flex-col gap-1.5 p-4 text-white">
      <div class="empty:hidden flex flex-wrap gap-1.5">
        <slot name="badges" />
      </div>

      <h3 class="line-clamp-2 text-sm font-semibold leading-snug drop-shadow-md">
        {{ contest.name }}
      </h3>

      <!-- Wraps instead of overflowing once the grid gets dense (2xl = 6 columns) -->
      <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-white/70">
        <span class="flex items-center gap-1 whitespace-nowrap">
          <CalendarClock class="h-3.5 w-3.5 shrink-0" />
          {{ startsAtLabel }}
        </span>
        <span class="flex min-w-0 items-center gap-1">
          <Tag class="h-3.5 w-3.5 shrink-0" />
          <span class="truncate capitalize">{{ contest.type }}</span>
        </span>
      </div>
    </div>

    <!-- Stretched link: makes the whole card clickable without nesting the
         delete button inside an anchor. -->
    <NuxtLink
      :to="to"
      :aria-label="contest.name"
      class="absolute inset-0 z-10 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    />
  </Card>
</template>
