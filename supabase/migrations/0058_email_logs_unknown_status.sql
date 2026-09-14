-- 0058_email_logs_unknown_status.sql
-- KAN-63 · Retire the `sent` rows that were never sent.
--
-- NOT APPLIED TO PRODUCTION.
--
-- Until the fix in this same branch, `sendWithLog` ignored the `error` that
-- `resend.emails.send` resolves with — the SDK only *rejects* on transport
-- failures — so every API-level rejection was written as `sent`. Unverified
-- sender domain, invalid recipient, rate limit, revoked key: all recorded as
-- delivered.
--
-- Measured on 2026-09-14: 21 rows in `email_logs`, all `sent`, **16 with a NULL
-- `provider_message_id`**, and not one `failed`. A successful send always
-- returns a provider id, so those sixteen never left Resend. They span
-- 2026-05-14 to 2026-09-08 and cover enrolment confirmations, judge invitations
-- and schedule notices.
--
-- ── Why `unknown` and not `failed` ─────────────────────────────────────────
-- The missing id proves Resend did not accept the message. It does not prove
-- the recipient never heard about it — someone may have been told by other
-- means, and a couple of these are old enough that it no longer matters.
-- Writing `failed` would replace one confident claim with another. `unknown`
-- withdraws the false one and asserts nothing new, which is all the data
-- actually supports.
--
-- `email_logs.status` carries no CHECK constraint (verified: the table's only
-- constraint is its primary key), so the new value needs no schema change.

-- The cutoff is what keeps this from ever touching a row written after the fix:
-- from here on a NULL provider id means `failed`, recorded deliberately, and
-- that row must keep saying so.
UPDATE public.email_logs
   SET status = 'unknown',
       error  = COALESCE(
         error,
         'Reclassified by 0058 (KAN-63): recorded as sent before the Resend '
         || 'error was checked, with no provider id, so delivery was never confirmed.'
       )
 WHERE status = 'sent'
   AND provider_message_id IS NULL
   AND created_at < '2026-09-15'::timestamptz;

COMMENT ON COLUMN public.email_logs.status IS
  'pending | sent | failed | unknown. `unknown` is historical only: rows written '
  'before KAN-63 that claimed `sent` with no provider id, where delivery was '
  'never confirmed either way. Nothing should write it going forward — a send '
  'Resend rejects is `failed`.';
