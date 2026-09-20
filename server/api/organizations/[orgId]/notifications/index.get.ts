// The organisation's alert preferences (KAN-30): where they go and which are on.
import { defineEventHandler, createError, getRouterParam } from 'h3'
import { serverSupabaseAdmin, requireOrgOwner, internalError } from '~~/server/utils/supabase'
import { prefsToMap } from '~~/shared/org-notifications'

export default defineEventHandler(async (event) => {
  const { org, user } = await requireOrgOwner(event)
  const orgId = getRouterParam(event, 'orgId')
  if (!orgId) throw createError({ statusCode: 400, statusMessage: 'Organization ID is required' })
  if (orgId !== org.id) throw createError({ statusCode: 403, statusMessage: 'forbidden' })

  const { data, error } = await serverSupabaseAdmin()
    .from('organizations')
    .select('notification_email, notification_prefs')
    .eq('id', orgId)
    .maybeSingle()
  if (error) throw internalError(event, error, 'organizations.select')

  const row = data as { notification_email: string | null; notification_prefs: unknown } | null
  return {
    notification_email: row?.notification_email ?? null,
    /** Shown as the placeholder: where alerts go when no address is set. */
    owner_email: user.email ?? null,
    events: prefsToMap(row?.notification_prefs),
  }
})
