// server/utils/invitation-expiry.ts
//
// Whether an invitation token is still inside its validity window (KAN-40).
//
// One place rather than four copies: the check runs in both handlers of both
// invitation flows, and a rule duplicated four times is a rule that will
// eventually disagree with itself.
//
// Deliberately *not* a WHERE clause on the lookup. Filtering the expiry in SQL
// would make an expired invitation indistinguishable from one that never
// existed, and "this link has expired, ask for a new one" is a different thing
// to tell someone than "this link is wrong".

import { createError } from 'h3'

/** Grace for clock skew between the database and the runtime. */
const SKEW_TOLERANCE_MS = 60_000

export function isInvitationExpired(
  expiresAt: string | null | undefined,
  now: number = Date.now(),
): boolean {
  // NULL is "no expiry". Only rows issued before KAN-40 and already answered
  // carry it, and those are stopped by the invitation_status check anyway.
  if (!expiresAt) return false

  const deadline = Date.parse(expiresAt)
  // An unparseable timestamp is treated as no expiry rather than as expired:
  // locking people out of valid invitations over a malformed column would be a
  // worse failure than the one this guards against.
  if (Number.isNaN(deadline)) return false

  return now > deadline + SKEW_TOLERANCE_MS
}

/**
 * 410 Gone, on purpose.
 *
 * The handlers already answer 404 for a token that does not exist and 409 for
 * one that was already answered. An expired invitation is neither, and the
 * acceptance criterion asks for all three to be distinguishable — mostly so
 * the UI can offer "request a new invitation" instead of "check the link".
 */
export function assertInvitationNotExpired(
  expiresAt: string | null | undefined,
  now: number = Date.now(),
): void {
  if (!isInvitationExpired(expiresAt, now)) return
  throw createError({
    statusCode: 410,
    statusMessage: 'invitation_expired',
    message: 'Esta invitación ha caducado. Pide a la organización que te la reenvíe.',
  })
}
