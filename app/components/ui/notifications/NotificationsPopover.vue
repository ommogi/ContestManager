<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { Bell } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useNotifications } from '@/composables/useNotifications'

const { notifications, unreadCount, unreadNotifications, readNotifications, loading, init, markAsRead, markAllAsRead } = useNotifications()

type Tab = 'all' | 'unread' | 'read'
const activeTab = ref<Tab>('all')

onMounted(() => init())

function onOpenChange(open: boolean) {
  if (open && unreadCount.value > 0) {
    markAllAsRead()
  }
}

const filteredNotifications = computed(() => {
  if (activeTab.value === 'unread') return unreadNotifications.value
  if (activeTab.value === 'read') return readNotifications.value
  return notifications.value
})

const tabs: { key: Tab; label: string; badge?: number }[] = [
  { key: 'all', label: 'Todas' },
  { key: 'unread', label: 'Nuevas', badge: unreadCount.value },
  { key: 'read', label: 'Vistas' },
]

function formatDate(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `Hace ${mins} min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `Hace ${hours} h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `Hace ${days} día${days > 1 ? 's' : ''}`
  return new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
}

// Route per notification type
function targetPath(type: string, payload: Record<string, unknown>): string | null {
  const slug = payload?.contest_slug as string | undefined
  if (!slug) return null
  if (type === 'org_participant_enrolled' || type === 'org_participant_unenrolled') {
    return `/contests/${slug}/inscriptions`
  }
  if (type === 'judge_assigned') {
    return `/contests/${slug}`
  }
  return `/my-contests/${slug}`
}

// Split body text into segments, turning the quoted contest name into a link
function bodyParts(notification: any) {
  const body = notification.body as string
  const payload = (notification.payload || {}) as Record<string, unknown>
  const name = payload?.contest_name as string | undefined
  const path = targetPath(notification.type, payload)
  if (!path || !name) return [{ text: body, link: null }]

  const quoted = `"${name}"`
  const idx = body.indexOf(quoted)
  if (idx === -1) return [{ text: body, link: null }]

  return [
    { text: body.slice(0, idx), link: null },
    { text: quoted, link: path },
    { text: body.slice(idx + quoted.length), link: null },
  ]
}
</script>

<template>
  <Popover @update:open="onOpenChange">
    <PopoverTrigger as-child>
      <Button size="icon" variant="ghost" class="relative rounded-full w-9 h-9" aria-label="Abrir notificaciones">
        <Bell :size="16" :stroke-width="2" aria-hidden="true" />
        <Badge
          v-if="unreadCount > 0"
          class="absolute -top-2 left-full min-w-5 -translate-x-1/2 px-1 pointer-events-none"
        >
          {{ unreadCount > 99 ? '99+' : unreadCount }}
        </Badge>
      </Button>
    </PopoverTrigger>

    <PopoverContent class="w-80 p-1 max-h-[480px] flex flex-col" align="end">
      <div class="flex items-baseline justify-between gap-4 px-3 py-2 shrink-0">
        <div class="text-sm font-semibold">Notificaciones</div>
      </div>

      <!-- Tabs -->
      <div class="flex gap-1 px-2 pb-1 shrink-0">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          @click="activeTab = tab.key"
          :class="[
            'flex-1 text-xs font-medium py-1.5 rounded-md transition-colors',
            activeTab === tab.key
              ? 'bg-accent text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          ]"
        >
          {{ tab.label }}
          <Badge
            v-if="tab.badge"
            variant="secondary"
            class="ml-1 h-4 min-w-4 px-1 text-[10px] font-semibold"
          >
            {{ tab.badge }}
          </Badge>
        </button>
      </div>

      <div role="separator" aria-orientation="horizontal" class="-mx-1 my-1 h-px bg-border shrink-0" />

      <div v-if="loading" class="px-3 py-6 text-center text-sm text-muted-foreground">
        Cargando...
      </div>

      <div v-else class="flex-1 overflow-y-auto -mx-1 px-1">
      <template v-if="filteredNotifications.length > 0">
        <div
          v-for="notification in filteredNotifications"
          :key="notification.id"
          class="rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent cursor-pointer"
          @click="markAsRead(notification.id)"
        >
          <div class="relative flex items-start pe-3">
            <div class="flex-1 space-y-1">
              <p class="font-medium text-foreground leading-snug">{{ notification.title }}</p>
              <p class="text-foreground/70 leading-snug">
                <template v-for="(part, i) in bodyParts(notification)" :key="i">
                  <NuxtLink
                    v-if="part.link"
                    :to="part.link"
                    class="font-medium text-foreground underline underline-offset-2 hover:text-primary"
                    @click.stop="markAsRead(notification.id)"
                  >{{ part.text }}</NuxtLink>
                  <span v-else>{{ part.text }}</span>
                </template>
              </p>
              <p class="text-xs text-muted-foreground">{{ formatDate(notification.created_at) }}</p>
            </div>
            <div v-if="!notification.read" class="absolute end-0 top-1 self-start">
              <span class="sr-only">No leída</span>
              <svg width="6" height="6" fill="currentColor" viewBox="0 0 6 6" aria-hidden="true" class="text-primary">
                <circle cx="3" cy="3" r="3" />
              </svg>
            </div>
          </div>
        </div>
      </template>

      <div v-else class="px-3 py-6 text-center text-sm text-muted-foreground">
        <template v-if="activeTab === 'unread'">No tienes notificaciones nuevas</template>
        <template v-else-if="activeTab === 'read'">No tienes notificaciones vistas</template>
        <template v-else>No tienes notificaciones</template>
      </div>
      </div>
    </PopoverContent>
  </Popover>
</template>
