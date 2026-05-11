// Notification helpers — server-side only.
// All inserts use the admin client (service_role) and are best-effort:
// failures are logged but never abort the parent request.
import type { SupabaseClient } from '@supabase/supabase-js'

export type NotificationType =
  | 'schedule_assigned'      // rehearsal/performance time scheduled
  | 'promoted'               // qualified to next round
  | 'not_promoted'           // eliminated at round
  | 'contest_started'        // contest status → 'active'
  | 'score_published'        // a judge scored you (or final score available)
  | 'ranking_published'      // ranking pseudo-round flipped is_published=true

export interface NotificationInput {
  user_id: string
  type: NotificationType
  title: string
  body?: string | null
  payload?: Record<string, any> | null
}

export async function insertNotifications(
  admin: SupabaseClient,
  rows: NotificationInput[],
): Promise<void> {
  if (!rows.length) return
  const valid = rows.filter(r => r.user_id)
  if (!valid.length) return
  const { error } = await admin.from('notifications').insert(
    valid.map(r => ({
      user_id: r.user_id,
      type: r.type,
      title: r.title,
      body: r.body ?? null,
      payload: r.payload ?? null,
      read: false,
    })),
  )
  if (error) console.error('[notifications] insert failed:', error.message)
}
