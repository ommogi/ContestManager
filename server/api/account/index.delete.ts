import { defineEventHandler, createError } from 'h3'
import { serverSupabaseAdmin, requireAuth } from '~~/server/utils/supabase'

// DELETE /api/account
// Permanently deletes the authenticated user's account.
//
// Safety gates:
//   - org_owner with active/finished contests → blocked (must wind down first)
//   - org_owner with paid participants in any contest → blocked (refund first)
//   - otherwise: cascades through public.profiles + (if org owner) the org row
//     (which cascades contests/categories/rounds/participants/etc.)
export default defineEventHandler(async (event) => {
  const user = requireAuth(event)

  const admin = serverSupabaseAdmin()

  // Org-owner gating
  const { data: org } = await admin
    .from('organizations')
    .select('id, name')
    .eq('owner_id', user.id)
    .maybeSingle()

  if (org?.id) {
    const { data: contests } = await admin
      .from('contests')
      .select('id, status')
      .eq('organization_id', org.id)
    const contestIds = (contests || []).map((c: any) => c.id)
    const hasLive = (contests || []).some((c: any) =>
      ['active', 'finished'].includes(c.status)
    )
    if (hasLive) {
      throw createError({
        statusCode: 409,
        statusMessage: 'Tienes concursos activos o finalizados. Cancela o archiva antes de eliminar la cuenta.',
      })
    }
    if (contestIds.length) {
      const { count } = await admin
        .from('participants')
        .select('id', { count: 'exact', head: true })
        .in('contest_id', contestIds)
        .eq('payment_status', 'paid')
      if ((count || 0) > 0) {
        throw createError({
          statusCode: 409,
          statusMessage: 'Hay inscripciones pagadas pendientes de reembolso. Resuélvelas antes de eliminar la cuenta.',
        })
      }
    }
    // Drop the org first → cascades contests/categories/etc.
    const { error: orgErr } = await admin.from('organizations').delete().eq('id', org.id)
    if (orgErr) {
      throw createError({ statusCode: 500, statusMessage: `org_delete_failed: ${orgErr.message}` })
    }
  }

  // Delete auth user → cascades public.profiles (FK ON DELETE CASCADE)
  const { error: delErr } = await admin.auth.admin.deleteUser(user.id)
  if (delErr) {
    throw createError({ statusCode: 500, statusMessage: `auth_delete_failed: ${delErr.message}` })
  }

  return { success: true }
})
