// server/utils/enrollment-metadata.ts
// The Checkout Session `metadata` that carries a paid inscription across Stripe.
//
// ── Why this is a util and not an object literal in the handler ─────────────
// It used to be written in one place, at session creation. Since the reused
// session now has its metadata refreshed too, it is written in two — and two
// copies of a 13-key contract drift. `metadata` is the ONLY channel by which
// these values reach `handleEnrollment`, so a key that exists on one path and
// not the other is a value silently lost at payment time.
//
// It lives here rather than inside `server/api/**` because `vitest.config.ts`
// only collects `server/**/*.test.ts`: a route handler is outside the gate.
// Same reason KAN-70 gave, and the one `stripe-webhook.ts` documents.

/** What the webhook needs to enroll the participant once the payment lands. */
export interface EnrollmentMetadataInput {
  organizationId: string
  contestId: string
  token: string
  userId: string
  categoryId: string
  firstName: string
  lastName: string
  birthdate: string
  /** Null when the contest's published form hides this core field (KAN-70). */
  dni: string | null
  country: string | null
  email: string
  phone: string | null
  /** Pointer into `pending_form_responses`; null when no form is published. */
  formDraftId: string | null
}

export type EnrollmentMetadata = Record<string, string>

/**
 * `create` omits `form_draft_id` when there is no draft, so a contest without a
 * published form keeps the same 13 keys it has always had.
 *
 * `refresh` always emits it, as `''` when there is no draft. Stripe MERGES a
 * metadata update key by key, so an omitted key is left untouched — a session
 * opened while a form was published would keep pointing at a draft that no
 * longer applies. An empty value is the documented way to unset a key, and it
 * was confirmed against the API: the key is gone from the object afterwards.
 */
export type EnrollmentMetadataMode = 'create' | 'refresh'

/**
 * A hidden core field leaves as `''`, never as the absent key: the webhook
 * reads `m.dni || null`, so an empty string is what turns into a SQL NULL for
 * `enroll_participant_paid`. That is the mechanism KAN-65 and KAN-70 rely on.
 */
export function buildEnrollmentMetadata(
  input: EnrollmentMetadataInput,
  mode: EnrollmentMetadataMode = 'create',
): EnrollmentMetadata {
  const base: EnrollmentMetadata = {
    type: 'enrollment',
    organization_id: input.organizationId,
    contest_id: input.contestId,
    token: input.token,
    user_id: input.userId,
    category_id: input.categoryId,
    first_name: input.firstName,
    last_name: input.lastName,
    birthdate: input.birthdate,
    dni: input.dni ?? '',
    country: input.country ?? '',
    email: input.email,
    phone: input.phone ?? '',
  }

  if (mode === 'refresh') return { ...base, form_draft_id: input.formDraftId ?? '' }
  return input.formDraftId ? { ...base, form_draft_id: input.formDraftId } : base
}
