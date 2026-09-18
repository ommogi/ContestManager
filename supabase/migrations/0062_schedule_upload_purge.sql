-- 0062_schedule_upload_purge.sql
-- Schedule the inscription-upload purge and record what each run did (KAN-69).
--
-- ── The gap ─────────────────────────────────────────────────────────────────
-- Three paths stamp `inscription_uploads.purge_after` (the participant-delete
-- trigger, `sweep_orphan_inscription_uploads`, `confirm_inscription_uploads`),
-- and only `POST /api/maintenance/purge-inscription-uploads` actually deletes
-- the objects. Nothing ever called it, so `purge_after` was stamped and never
-- acted on.
--
-- ── Why pg_cron + pg_net and not Vercel Cron ────────────────────────────────
-- Vercel Cron sends GET and cannot set custom headers (it sends
-- `Authorization: Bearer $CRON_SECRET`), which would have meant a second verb
-- and a second auth path on the endpoint. pg_net can POST with the
-- `x-maintenance-secret` header the endpoint already expects, so the endpoint's
-- gate is untouched.
--
-- ── Secrets live in Vault, never in this file ───────────────────────────────
-- Two Vault secrets drive the job, and they are created by hand in each
-- environment because a migration is committed to the repo:
--
--   select vault.create_secret('<same value as MAINTENANCE_SECRET>', 'maintenance_secret');
--   select vault.create_secret('https://<production host>', 'maintenance_base_url');
--
-- Until both exist the job does nothing and says so in `maintenance_runs`. It
-- never calls out without the secret: the endpoint would reject it anyway, and
-- an unset secret must not look like a successful run.
--
-- Re-runnable: IF NOT EXISTS / CREATE OR REPLACE throughout, and
-- `cron.schedule` upserts by job name.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Trace: one row per run
-- ────────────────────────────────────────────────────────────────────────────
-- Written by the endpoint (how many swept, how many deleted) and by the
-- scheduler function when it could not even make the call (missing secret).
-- pg_net's own `net._http_response` would also show the answer, but it keeps
-- rows for six hours only — too short to notice that the purge stopped working.
CREATE TABLE IF NOT EXISTS public.maintenance_runs (
  id        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job       TEXT        NOT NULL,
  swept     INTEGER     NOT NULL DEFAULT 0,
  deleted   INTEGER     NOT NULL DEFAULT 0,
  has_more  BOOLEAN     NOT NULL DEFAULT false,
  error     TEXT,
  ran_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_maintenance_runs_job_ran_at
  ON public.maintenance_runs(job, ran_at DESC);

-- Operational data, not tenant data: RLS on and no policy, so only the service
-- role (the endpoint) and the table owner (the scheduler function) touch it.
ALTER TABLE public.maintenance_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.maintenance_runs FROM anon, authenticated;

COMMENT ON TABLE public.maintenance_runs IS
  'One row per scheduled maintenance run (KAN-69): what it swept and deleted, or '
  'why it did not run. Kept 90 days. Service role only.';

-- ────────────────────────────────────────────────────────────────────────────
-- 2. The call
-- ────────────────────────────────────────────────────────────────────────────
-- SECURITY DEFINER so the cron job (run as the job owner) can read Vault's
-- decrypted view without granting that to anyone else. Not callable by API
-- roles: it would let a caller trigger outbound requests at will.
CREATE OR REPLACE FUNCTION public.invoke_inscription_upload_purge()
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_base_url   TEXT;
  v_secret     TEXT;
  v_request_id BIGINT;
BEGIN
  -- Retention for the trace itself, piggybacking on a job that already runs.
  DELETE FROM public.maintenance_runs
   WHERE ran_at < now() - interval '90 days';

  SELECT decrypted_secret INTO v_base_url
    FROM vault.decrypted_secrets WHERE name = 'maintenance_base_url';
  SELECT decrypted_secret INTO v_secret
    FROM vault.decrypted_secrets WHERE name = 'maintenance_secret';

  IF coalesce(v_base_url, '') = '' OR coalesce(v_secret, '') = '' THEN
    INSERT INTO public.maintenance_runs (job, error)
    VALUES ('purge-inscription-uploads', 'vault_secrets_missing');
    RETURN NULL;
  END IF;

  -- Asynchronous: pg_net queues the request and returns its id. The endpoint
  -- writes the outcome row itself once it has done the work.
  SELECT net.http_post(
    url                  := rtrim(v_base_url, '/') || '/api/maintenance/purge-inscription-uploads',
    body                 := '{}'::jsonb,
    headers              := jsonb_build_object(
                              'Content-Type', 'application/json',
                              'x-maintenance-secret', v_secret
                            ),
    timeout_milliseconds := 30000
  ) INTO v_request_id;

  RETURN v_request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.invoke_inscription_upload_purge() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.invoke_inscription_upload_purge() IS
  'POSTs to /api/maintenance/purge-inscription-uploads with the Vault secret. '
  'Run by pg_cron every 15 minutes (KAN-69). Records vault_secrets_missing '
  'instead of calling when either Vault secret is absent.';

-- ────────────────────────────────────────────────────────────────────────────
-- 3. The schedule
-- ────────────────────────────────────────────────────────────────────────────
-- Every 15 minutes. A run deletes at most 200 objects (PURGE_BATCH_SIZE), so a
-- backlog drains at 800/hour; the bucket is empty today and uploads are a few
-- per inscription, so that is ample headroom.
SELECT cron.schedule(
  'purge-inscription-uploads',
  '*/15 * * * *',
  $$SELECT public.invoke_inscription_upload_purge()$$
);
