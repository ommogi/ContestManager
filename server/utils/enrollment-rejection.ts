// server/utils/enrollment-rejection.ts
// Telling a business-rule refusal apart from a failure worth retrying.
//
// ── Why this matters ────────────────────────────────────────────────────────
// `enroll_participant_paid` raises eight named exceptions. Every one of them
// means the same thing: Stripe captured the money and the database refused the
// enrolment. Until now `handleEnrollment` threw for all of them, so the route
// answered 500, released the idempotency claim, and Stripe redelivered — for
// days, failing identically every time, because nothing about the event will
// ever change.
//
// Retrying only helps when the next attempt could succeed. None of these can:
// the RPC evaluated the rule against the same row and the same metadata, and
// will evaluate it the same way tomorrow.
//
// What it does NOT mean is that the problem is handled. The charge is real and
// the participant is not enrolled, so the outcome is recorded loudly and
// deliberately — acknowledging the event stops the noise, it does not make the
// money reappear.

/**
 * The exceptions `enroll_participant_paid` raises, verified against the
 * deployed function rather than the repo file.
 *
 * `category_full` and `registration_closed` are the two that could in principle
 * resolve themselves inside Stripe's retry window — a place frees up, an
 * organizer reopens. They are still terminal on purpose: quietly enrolling
 * someone three days later because a slot opened is surprising, and the
 * decision at payment time was already taken and recorded.
 */
export const TERMINAL_ENROLLMENT_REJECTIONS = [
  'contest_not_found',
  'registration_closed',
  'user_is_judge_in_contest',
  'already_enrolled_in_category',
  'category_not_found',
  'age_below_min',
  'age_above_max',
  'category_full',
] as const

export type EnrollmentRejection = (typeof TERMINAL_ENROLLMENT_REJECTIONS)[number]

/**
 * The rejection named in a Postgres error message, or null when the failure is
 * something else — a timeout, a broken connection, a constraint nobody planned
 * for. Those still throw, because a redelivery might genuinely fix them.
 *
 * Matched as a whole word so that a future `already_enrolled_in_category_v2`,
 * or a message that merely quotes one of these names, cannot be mistaken for
 * the rejection itself.
 */
export function terminalRejectionIn(message: string | null | undefined): EnrollmentRejection | null {
  if (!message) return null

  for (const reason of TERMINAL_ENROLLMENT_REJECTIONS) {
    if (new RegExp(`(^|[^a-z_])${reason}([^a-z_]|$)`).test(message)) return reason
  }

  return null
}

/**
 * What a human needs to find the money and decide what to do with it.
 *
 * Every field comes from the Stripe object or the session metadata, so the line
 * is enough on its own: the payment intent locates the charge in Stripe, and
 * the rest says whose enrolment it was meant to be.
 */
export function describeOrphanedCharge(input: {
  reason: EnrollmentRejection
  sessionId: string
  paymentIntent: string | null
  amountCents: number
  userId?: string
  categoryId?: string
  email?: string
}): string {
  return (
    '[stripe-webhook] PAID BUT NOT ENROLLED — the payment succeeded and the ' +
    `database refused the enrolment (${input.reason}). Needs a manual refund ` +
    'or a manual enrolment; Stripe will not retry this event again. ' +
    `session=${input.sessionId} payment_intent=${input.paymentIntent ?? 'none'} ` +
    `amount_cents=${input.amountCents} user=${input.userId ?? 'unknown'} ` +
    `category=${input.categoryId ?? 'unknown'} email=${input.email ?? 'unknown'}`
  )
}
