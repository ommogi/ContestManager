// server/services/org-notifications.ts
// Tell the organisation what a participant just did (KAN-29).
//
// The Fundació asked to hear about any interaction without having to look. The
// organisation chooses which of these it wants and where they go (KAN-30).
//
// ── Never in the way ────────────────────────────────────────────────────────
// This runs after the operation it reports, and it never throws: an enrolment
// must not fail because an e-mail did. Same rule as `insertNotifications()`.
//
// ── Once per event ──────────────────────────────────────────────────────────
// The e-mail carries a `dedupe_key`, unique in `email_logs`. A retried Stripe
// webhook loses the insert and sends nothing.
//
// Relative imports: vitest does not resolve Nitro's `~~/` alias.
import { sendOrgEventEmail } from '../utils/email'
import { insertNotifications } from '../utils/notifications'
import {
  dedupeKey,
  isEventEnabled,
  notificationRecipient,
  ORG_NOTIFICATION_EVENTS,
  type OrgNotificationEvent,
} from '../../shared/org-notifications'
import type { SupabaseAdmin } from './inscription-upload-purge'

export interface NotifyOrganizationInput {
  /** The contest the event happened in; its organisation is looked up. */
  contestId?: string | null
  /** Or the organisation directly, for events with no contest. */
  organizationId?: string | null
  event: OrgNotificationEvent
  /** What the event is about (a participant, an invitation…); part of the key. */
  entityId: string
  subject: string
  title: string
  lines: string[]
  facts?: Array<{ label: string; value: string }>
  actionPath?: string | null
  payload?: Record<string, unknown>
}

interface OrgRow {
  id: string
  name: string | null
  owner_id: string
  notification_email: string | null
  notification_prefs: Record<string, unknown> | null
}

const LABELS = new Map(ORG_NOTIFICATION_EVENTS.map(e => [e.id, e.label]))

async function resolveOrg(client: SupabaseAdmin, input: NotifyOrganizationInput): Promise<OrgRow | null> {
  const columns = 'id, name, owner_id, notification_email, notification_prefs'
  if (input.organizationId) {
    const { data } = await client.from('organizations').select(columns).eq('id', input.organizationId).maybeSingle()
    return (data as unknown as OrgRow | null) ?? null
  }
  if (!input.contestId) return null
  const { data } = await client
    .from('contests')
    .select(`organization:organizations(${columns})`)
    .eq('id', input.contestId)
    .maybeSingle()
  return (data as unknown as { organization: OrgRow | null } | null)?.organization ?? null
}

/**
 * The owner's address lives in auth.users — `profiles` does not carry e-mail —
 * so it is read with the admin API. Only needed when the organisation has not
 * chosen an address of its own.
 */
async function ownerEmail(client: SupabaseAdmin, ownerId: string): Promise<string | null> {
  try {
    const { data } = await client.auth.admin.getUserById(ownerId)
    return data?.user?.email ?? null
  } catch (e: unknown) {
    console.error('[org-notifications] owner lookup failed:', (e as Error)?.message)
    return null
  }
}

/**
 * Sends the alert if the organisation wants it. Returns what happened, which
 * is what the tests assert on; callers ignore it and never await a failure.
 */
export async function notifyOrganization(
  client: SupabaseAdmin,
  input: NotifyOrganizationInput,
): Promise<{ sent: boolean; reason?: 'disabled' | 'no_recipient' | 'duplicate' | 'failed' | 'no_organization' }> {
  try {
    const org = await resolveOrg(client, input)
    if (!org) return { sent: false, reason: 'no_organization' }
    if (!isEventEnabled(org.notification_prefs, input.event)) return { sent: false, reason: 'disabled' }

    const to = org.notification_email?.trim()
      ? notificationRecipient(org, null)
      : notificationRecipient(org, await ownerEmail(client, org.owner_id))
    if (!to) return { sent: false, reason: 'no_recipient' }

    const result = await sendOrgEventEmail({
      to,
      kicker: LABELS.get(input.event) ?? 'Aviso',
      subject: input.subject,
      title: input.title,
      lines: input.lines,
      facts: input.facts,
      actionPath: input.actionPath ?? null,
      template: `org_${input.event}`,
      dedupeKey: dedupeKey(input.event, input.entityId),
      payload: { event: input.event, entity_id: input.entityId, ...(input.payload ?? {}) },
    })

    if (result.duplicate) return { sent: false, reason: 'duplicate' }

    // In-app notification for the owner, so the alert is not only an e-mail.
    // Best-effort like the rest: insertNotifications() logs and moves on.
    await insertNotifications(client as never, [{
      user_id: org.owner_id,
      type: `org_${input.event}` as never,
      title: input.title,
      body: input.lines[0] ?? null,
      payload: { event: input.event, entity_id: input.entityId, ...(input.payload ?? {}) },
    }])

    return result.sent ? { sent: true } : { sent: false, reason: 'failed' }
  } catch (e: unknown) {
    // An alert must never take the operation it reports down with it.
    console.error('[org-notifications] failed:', (e as Error)?.message)
    return { sent: false, reason: 'failed' }
  }
}
