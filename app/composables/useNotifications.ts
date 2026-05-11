import { ref, computed, onUnmounted, watch } from 'vue'
import type { RealtimeChannel } from '@supabase/supabase-js'

export interface AppNotification {
  id: string
  type: string
  title: string
  body: string
  payload: Record<string, unknown>
  read: boolean
  created_at: string
}

export function useNotifications() {
  const notifications = ref<AppNotification[]>([])
  const loading = ref(false)
  let channel: RealtimeChannel | null = null

  const unreadCount = computed(() => notifications.value.filter((n) => !n.read).length)
  const readCount = computed(() => notifications.value.filter((n) => n.read).length)
  const unreadNotifications = computed(() => notifications.value.filter((n) => !n.read))
  const readNotifications = computed(() => notifications.value.filter((n) => n.read))

  function getSupabase() {
    return useNuxtApp().$supabase as ReturnType<typeof import('@supabase/supabase-js').createClient>
  }

  async function fetchNotifications() {
    const authStore = useAuthStore()
    if (!authStore.user) return

    loading.value = true
    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', authStore.user.id)
      .order('created_at', { ascending: false })
      .limit(20)

    if (!error && data) {
      notifications.value = data as AppNotification[]
    }
    loading.value = false
  }

  async function markAsRead(id: string) {
    const n = notifications.value.find((n) => n.id === id)
    if (!n || n.read) return
    n.read = true
    const supabase = getSupabase()
    await supabase.from('notifications').update({ read: true }).eq('id', id)
  }

  async function markAllAsRead() {
    const unread = notifications.value.filter((n) => !n.read)
    if (!unread.length) return
    unread.forEach((n) => (n.read = true))
    const supabase = getSupabase()
    await supabase
      .from('notifications')
      .update({ read: true })
      .in('id', unread.map((n) => n.id))
  }

  async function subscribeRealtime(userId: string) {
    const supabase = getSupabase()
    try {
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      if (token) (supabase as any).realtime.setAuth(token)
    } catch { /* ignore */ }

    channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          notifications.value.unshift(payload.new as AppNotification)
        }
      )
      .subscribe((status, err) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error('[realtime/notifications] subscribe failed:', status, err)
          // Auto-retry once after 2s — common when JWT not yet propagated
          setTimeout(() => {
            unsubscribe()
            const u = useAuthStore().user
            if (u) subscribeRealtime(u.id)
          }, 2000)
        }
      })
  }

  function unsubscribe() {
    if (channel) {
      const supabase = getSupabase()
      supabase.removeChannel(channel)
      channel = null
    }
  }

  async function init() {
    const authStore = useAuthStore()
    if (!authStore.user) return
    await fetchNotifications()
    subscribeRealtime(authStore.user.id)
  }

  // Cleanup realtime channel on logout
  const authStore = useAuthStore()
  watch(() => authStore.user, (newUser) => {
    if (!newUser && channel) {
      unsubscribe()
      notifications.value = [] // Clear notifications on logout
    }
  })

  onUnmounted(unsubscribe)

  return {
    notifications,
    unreadCount,
    readCount,
    unreadNotifications,
    readNotifications,
    loading,
    init,
    markAsRead,
    markAllAsRead,
    unsubscribe,
  }
}
