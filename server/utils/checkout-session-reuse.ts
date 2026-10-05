// server/utils/checkout-session-reuse.ts
// Deciding whether an open Checkout Session found for this user can still be
// handed back, or has to be thrown away.
//
// ── Why a decision and not an inline condition ──────────────────────────────
// KAN-77 made the reuse branch actually work. It left one shape untouched:
// when the branch FINDS a session and declines it, it just falls through and
// creates another — and the declined one stays open and payable. Two payable
// URLs for one inscription is exactly what KAN-77 exists to prevent, because
// paying both captures money the database then refuses to enrol (KAN-78).
//
// So "decline" has to mean "expire", and that only reads clearly if the reason
// for declining is a value rather than a boolean buried in an `if`. The reason
// is also what the log needs to be worth reading.
//
// Lives in `server/utils` rather than in the route because `vitest.config.ts`
// only collects `server/**/*.test.ts`: anything inside `server/api/**` is
// outside the gate. Same reason KAN-70, KAN-77 and KAN-78 each ended up here.

/** Why a found session cannot be reused. */
export type DiscardReason =
  /**
   * The contest's fee changed after the session was opened, so it would charge
   * the old price. It cannot simply be re-priced: `line_items` is updatable but
   * `payment_intent_data` is not, so `application_fee_amount` would stay
   * computed from the old amount — the participant would pay the new price and
   * the platform would take a commission based on the old one.
   */
  | 'stale_amount'
  /**
   * Opened before the organizer published the form, so it carries no
   * `form_draft_id` and paying it would confirm an inscription with no answers
   * to store. This case predates KAN-79; what is new is that it now expires the
   * session instead of leaving it payable.
   */
  | 'no_draft'
  /** No usable URL to hand back. Defensive: a listed open session should have one. */
  | 'no_url'

export type ReuseDecision =
  | { reuse: true }
  | { reuse: false, reason: DiscardReason }

export interface ReuseInput {
  /** `amount_total` from the found session, in cents. */
  amountTotal: number | null | undefined
  url: string | null | undefined
  /** `metadata.form_draft_id` from the found session. */
  formDraftId: string | null | undefined
  /** Whether this contest has a published form, i.e. answers to carry. */
  hasSubmission: boolean
  /** `contests.entry_fee_cents` as it stands right now. */
  currentFeeCents: number
}

/**
 * Money first. If the amount is wrong the session is unusable whatever else is
 * true of it, and reporting a different reason would hide the one that costs
 * someone money.
 *
 * An absent `amount_total` is treated as a mismatch rather than a match: a
 * session whose price cannot be read must never be reused on the assumption
 * that it is probably fine.
 */
export function decideSessionReuse(input: ReuseInput): ReuseDecision {
  if (!input.url) return { reuse: false, reason: 'no_url' }

  if (typeof input.amountTotal !== 'number' || input.amountTotal !== input.currentFeeCents) {
    return { reuse: false, reason: 'stale_amount' }
  }

  if (input.hasSubmission && !input.formDraftId) {
    return { reuse: false, reason: 'no_draft' }
  }

  return { reuse: true }
}
