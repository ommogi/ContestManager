// Change where the alerts go and which ones are on (KAN-30).
import { defineEventHandler, createError, getRouterParam, readBody } from 'h3'
import { serverSupabaseAdmin, requireOrgOwner, internalError } from '~~/server/utils/supabase'
import { OrgNotificationPrefsSchema } from '~~/server/utils/schemas'
import { mapToPrefs, prefsToMap } from '~~/shared/org-notifications'

export default defineEventHandler(async (event) => {
  const { org, user } = await requireOrgOwner(event)
  const orgId = getRouterParam(event, 'orgId')
  if (!orgId) throw createError({ statusCode: 400, statusMessage: 'Organization ID is required' })
  if (orgId !== org.id) throw createError({ statusCode: 403, statusMessage: 'forbidden' })

  const parsed = OrgNotificationPrefsSchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid request', data: parsed.error.issues })
  }

  const updates: Record<string, unknown> = {}
  if ('notification_email' in parsed.data) {
    // Empty means "back to the owner's address", stored as NULL.
    updates.notification_email = parsed.data.notification_email?.trim() || null
  }
  // Only what is switched off is stored, so new event types start on.
  if (parsed.data.events) updates.notification_prefs = mapToPrefs(parsed.data.events)

  if (Object.keys(updates).length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'No valid fields to update' })
  }

  const { data, error } = await serverSupabaseAdmin()
    .from('organizations')
    .update(updates as never)
    .eq('id', orgId)
    .select('notification_email, notification_prefs')
    .single()
  if (error) throw internalError(event, error, 'organizations.update')

  const row = data as { notification_email: string | null; notification_prefs: unknown }
  return {
    notification_email: row.notification_email,
    owner_email: user.email ?? null,
    events: prefsToMap(row.notification_prefs),
  }
})
