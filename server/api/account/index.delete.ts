import { defineEventHandler, createError } from 'h3'
import { serverSupabaseAdmin, requireAuth, internalError } from '~~/server/utils/supabase'
import {
  collectUploadPathsToPurge,
  removeUploadObjects,
} from '~~/server/services/inscription-upload-purge'

// DELETE /api/account
// Permanently deletes the authenticated user's account.
//
// Safety gates:
//   - org_owner with active/finished contests → blocked (must wind down first)
//   - org_owner with paid participants in any contest → blocked (refund first)
//   - otherwise: cascades through public.profiles + (if org owner) the org row
//     (which cascades contests/categories/rounds/participants/etc.)
//
// Uploaded files need their own step. `inscription_uploads` cascades twice over
// on this path — by `contest_id` when the org's contests go, and by `user_id`
// when the auth row does — so the ledger disappears and the Storage objects are
// left unreachable. "Delete my account" leaving the person's files in a bucket
// forever is the worst version of that bug, so the keys are read before
// anything is deleted and the objects removed after.
export default defineEventHandler(async (event) => {
  const user = requireAuth(event)

  const admin = serverSupabaseAdmin()
  let contestIds: string[] = []

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
    contestIds = (contests || []).map((c: any) => c.id)
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
  }

  // Read the object keys while the ledger still exists — after the gates above,
  // so a refused deletion reads nothing, and before either delete below. Both
  // scopes are needed: the org's contests, and this user's own uploads, which
  // may sit in contests belonging to someone else entirely.
  //
  // A failed read is fatal: deleting the account anyway would leak the files
  // with no record they were ever there, which is the bug being fixed.
  let paths: string[] = []
  try {
    paths = await collectUploadPathsToPurge(admin, { contestIds, userId: user.id })
  } catch (e) {
    console.error('[account.delete] could not read upload paths:', (e as Error)?.message)
    throw createError({ statusCode: 500, statusMessage: 'internal_error' })
  }

  if (org?.id) {
    // Drop the org first → cascades contests/categories/etc.
    const { error: orgErr } = await admin.from('organizations').delete().eq('id', org.id)
    if (orgErr) {
      throw internalError(event, orgErr, 'organizations.delete', 'org_delete_failed')
    }
  }

  // Delete auth user → cascades public.profiles (FK ON DELETE CASCADE)
  const { error: delErr } = await admin.auth.admin.deleteUser(user.id)
  if (delErr) {
    throw internalError(event, delErr, 'auth.admin.deleteUser', 'auth_delete_failed')
  }

  // Objects last, best-effort: the account is already gone, so a 500 here would
  // describe the wrong thing. Anything Storage refuses is logged with its keys.
  if (paths.length > 0) {
    const { removed, failures } = await removeUploadObjects(admin, paths)
    for (const failure of failures) {
      console.error(
        `[account.delete] ${failure.paths.length} object(s) left in the bucket after ` +
        `deleting account ${user.id}: ${failure.message}`,
        failure.paths,
      )
    }
    if (removed > 0) {
      console.info(`[account.delete] removed ${removed} upload(s) for account ${user.id}`)
    }
  }

  return { success: true }
})
