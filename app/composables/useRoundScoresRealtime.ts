import { watch, onUnmounted } from 'vue'
import type { RealtimeChannel } from '@supabase/supabase-js'

/**
 * Subscribes to real-time score changes for a given round.
 * Calls `onScoreChange` whenever a score is inserted or updated.
 *
 * The Supabase client is captured in the composable's setup context (not inside
 * a watch callback) to avoid calling useNuxtApp() outside of setup.
 */
export function useRoundScoresRealtime(
  roundId: Ref<string>,
  onScoreChange: (roundId: string) => void
) {
  // Capture the client during setup — this is the correct context for useNuxtApp()
  const supabase = useNuxtApp().$supabase as ReturnType<typeof import('@supabase/supabase-js').createClient>

  let channel: RealtimeChannel | null = null

  async function subscribe(id: string) {
    if (!id) return
    // Ensure socket has user JWT before subscribing — otherwise RLS rejects
    // events even though SUBSCRIBED returns OK.
    try {
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      if (token) (supabase as any).realtime.setAuth(token)
    } catch { /* ignore */ }

    channel = supabase
      .channel(`scores:round:${id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'scores',
          filter: `round_id=eq.${id}`,
        },
        () => onScoreChange(id),
      )
      .subscribe((status, err) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error('[realtime/scores] subscribe failed:', status, err)
        }
      })
  }

  function unsubscribe() {
    if (channel) {
      supabase.removeChannel(channel)
      channel = null
    }
  }

  watch(
    roundId,
    (newId, oldId) => {
      if (oldId) unsubscribe()
      if (newId) subscribe(newId)
    },
    { immediate: true }
  )

  onUnmounted(unsubscribe)

  return { unsubscribe }
}
