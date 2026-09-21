-- 0073_org_notification_prefs.sql
-- E-mail alerts to the organisation, and what it wants to receive
-- (KAN-29, KAN-30).
--
-- The Fundació Maria Canals asked to hear about any interaction a participant
-- has with them, without having to look. Which of those moments they actually
-- want is still open with the client (KAN-34), so all five are implemented and
-- the organisation switches off what it does not want.
--
-- ── Preferences as "only what is off" ───────────────────────────────────────
-- `notification_prefs` stores an event only when it is disabled. A new event
-- type is therefore live for everybody without a backfill, which is what
-- "por defecto, todos los avisos activos" means in practice.
--
-- ── One e-mail per event ────────────────────────────────────────────────────
-- Stripe retries its webhook, so the same enrolment can be processed twice.
-- `email_logs.dedupe_key` is unique where it is set: the second attempt loses
-- the insert and never sends. The audit trail stays in the table that already
-- records every message.
--
-- Re-runnable: IF NOT EXISTS, constraint added only when absent.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS notification_email TEXT,
  ADD COLUMN IF NOT EXISTS notification_prefs JSONB NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.organizations'::regclass
       AND conname  = 'organizations_notification_email_format'
  ) THEN
    ALTER TABLE public.organizations
      ADD CONSTRAINT organizations_notification_email_format
      CHECK (
        notification_email IS NULL
        OR (length(notification_email) <= 320 AND notification_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')
      );
  END IF;
END;
$$;

COMMENT ON COLUMN public.organizations.notification_email IS
  'Where the organisation''s alerts go (KAN-30). NULL = the owner''s address.';

COMMENT ON COLUMN public.organizations.notification_prefs IS
  'Only the alerts that are switched OFF, as {"event": false} (KAN-30). An '
  'event missing from the map is active, so new event types need no backfill.';

ALTER TABLE public.email_logs
  ADD COLUMN IF NOT EXISTS dedupe_key TEXT;

-- Partial: every e-mail that is not deduplicated keeps NULL, and NULLs do not
-- collide with each other.
CREATE UNIQUE INDEX IF NOT EXISTS email_logs_dedupe_key_unique
  ON public.email_logs(dedupe_key)
  WHERE dedupe_key IS NOT NULL;

COMMENT ON COLUMN public.email_logs.dedupe_key IS
  'Identifies the event an e-mail belongs to (KAN-29), e.g. '
  '"enrollment_created:<participant id>". Unique where set: a retried webhook '
  'loses the insert and sends nothing.';
