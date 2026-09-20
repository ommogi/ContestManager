// shared/org-notifications.ts
// Alerts an organisation can receive about what participants do (KAN-29), and
// the preferences that switch them off (KAN-30).

export const ORG_NOTIFICATION_EVENTS = [
  {
    id: 'enrollment_created',
    label: 'Inscripción completada',
    description: 'Cuando alguien termina una inscripción, de pago o gratuita.',
  },
  {
    id: 'payment_confirmed',
    label: 'Pago confirmado',
    description: 'Cuando Stripe confirma el cobro de una inscripción.',
  },
  {
    id: 'participant_cancelled',
    label: 'Cancelación',
    description: 'Cuando un participante cancela su inscripción.',
  },
  {
    id: 'refund_issued',
    label: 'Reembolso',
    description: 'Cuando se devuelve el importe de una inscripción.',
  },
  {
    id: 'judge_invitation_answered',
    label: 'Respuesta del jurado',
    description: 'Cuando alguien acepta o rechaza una invitación de jurado.',
  },
] as const

export type OrgNotificationEvent = (typeof ORG_NOTIFICATION_EVENTS)[number]['id']

export const ORG_NOTIFICATION_EVENT_IDS = ORG_NOTIFICATION_EVENTS.map(e => e.id) as readonly OrgNotificationEvent[]

export type OrgNotificationPrefs = Partial<Record<OrgNotificationEvent, boolean>>

/**
 * Active unless explicitly switched off. The map only stores what the
 * organisation turned off, so an event type added later starts on for
 * everybody without touching a single row.
 */
export function isEventEnabled(prefs: unknown, event: OrgNotificationEvent): boolean {
  if (!prefs || typeof prefs !== 'object') return true
  return (prefs as Record<string, unknown>)[event] !== false
}

/** The full on/off map, for the settings page. */
export function prefsToMap(prefs: unknown): Record<OrgNotificationEvent, boolean> {
  return Object.fromEntries(
    ORG_NOTIFICATION_EVENT_IDS.map(id => [id, isEventEnabled(prefs, id)]),
  ) as Record<OrgNotificationEvent, boolean>
}

/** Back to storage shape: keep only what is off. */
export function mapToPrefs(map: Partial<Record<OrgNotificationEvent, boolean>>): OrgNotificationPrefs {
  const prefs: OrgNotificationPrefs = {}
  for (const id of ORG_NOTIFICATION_EVENT_IDS) {
    if (map[id] === false) prefs[id] = false
  }
  return prefs
}

/** Where the alerts go: the address the organisation chose, else the owner's. */
export function notificationRecipient(
  org: { notification_email?: string | null } | null,
  ownerEmail: string | null | undefined,
): string | null {
  const chosen = org?.notification_email?.trim()
  if (chosen) return chosen
  const owner = ownerEmail?.trim()
  return owner || null
}

/** Identifies the event an e-mail belongs to; unique in email_logs. */
export function dedupeKey(event: OrgNotificationEvent, entityId: string): string {
  return `${event}:${entityId}`
}
