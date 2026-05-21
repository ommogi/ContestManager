import type { SupabaseClient } from '@supabase/supabase-js'
import { sendJudgeInvitationExpiredEmail } from '~~/server/utils/email'

export interface RejectPendingJudgesResult {
  rejectedCount: number
  emailsSent: number
}

/**
 * Reject all pending judge invitations for a contest and notify them.
 * Returns counts for observability. Emails are fire-and-forget.
 */
export async function rejectPendingJudgeInvitations(
  admin: SupabaseClient<any, 'public', any>,
  contestId: string,
  contestName: string,
): Promise<RejectPendingJudgesResult> {
  const { data: pendingJudges } = await admin
    .from('contest_members')
    .select('id, email, full_name')
    .eq('contest_id', contestId)
    .eq('role', 'judge')
    .eq('invitation_status', 'pending')

  if (!pendingJudges || pendingJudges.length === 0) {
    return { rejectedCount: 0, emailsSent: 0 }
  }

  await admin
    .from('contest_members')
    .update({ invitation_status: 'rejected', responded_at: new Date().toISOString() })
    .eq('contest_id', contestId)
    .eq('role', 'judge')
    .eq('invitation_status', 'pending')

  let emailsSent = 0
  for (const judge of pendingJudges) {
    if (judge.email) {
      emailsSent++
      sendJudgeInvitationExpiredEmail({
        to: judge.email,
        first_name: judge.full_name,
        contest_name: contestName,
      }).catch((e: any) => { console.error('[rejectPendingJudgeInvitations] email failed:', e?.message) })
    }
  }

  return { rejectedCount: pendingJudges.length, emailsSent }
}
