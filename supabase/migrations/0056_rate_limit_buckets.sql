-- 0056_rate_limit_buckets.sql
-- KAN-37 · Shared rate-limit counters.
--
-- NOT APPLIED TO PRODUCTION. Applying it changes nothing on its own: the
-- middleware keeps counting in memory until `RATE_LIMIT_STORE=postgres` is set.
-- That order is deliberate — the table can exist and be watched before it is
-- put in the request path.
--
-- Why this exists: counters in a process `Map` are not a limit when the process
-- is not the only one. On Vercel it is worse than the "N instances, N × the
-- limit" framing — functions are ephemeral and every cold start begins with an
-- empty map, so the 20/min guarding `/api/auth/**` against brute force is close
-- to no limit at all.
--
-- Scope: only the abuse-facing buckets (auth, public, financial) go through
-- here. The general 120/min stays in memory. The bucket key is `client:path`,
-- so routing everything through Postgres would add a write to every call the
-- app shell makes on each page load, for almost no gain on a limit of 120.

CREATE TABLE IF NOT EXISTS public.rate_limit_buckets (
  -- `user:<uuid>:/api/path` or `ip:<addr>:/api/path`, built by the middleware.
  key      TEXT PRIMARY KEY,
  count    INTEGER NOT NULL DEFAULT 0,
  reset_at TIMESTAMPTZ NOT NULL
);

-- Supports the sweep below. Partial would not help: every row is a candidate
-- once its window closes.
CREATE INDEX IF NOT EXISTS rate_limit_buckets_reset_at_idx
  ON public.rate_limit_buckets(reset_at);

-- Server-only, like processed_stripe_events: RLS on, no policy at all, so
-- `anon` and `authenticated` get nothing and only `service_role` — which
-- bypasses RLS — reaches it. A client able to read this table could see which
-- keys are close to their limit; one able to write it could reset its own.
ALTER TABLE public.rate_limit_buckets ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.rate_limit_buckets IS
  'Shared rate-limit counters (KAN-37). Written only through rate_limit_hit() by '
  'the server. Rows are disposable: sweep_rate_limit_buckets() deletes closed '
  'windows and losing the table costs nothing but a reset.';

-- ────────────────────────────────────────────────────────────────────────────
-- The atomic increment
-- ────────────────────────────────────────────────────────────────────────────
-- Everything happens in one statement on purpose. Reading the row and writing
-- it back from the server would let two simultaneous requests read the same
-- value and both pass — the exact race a shared store exists to close.
--
-- `ON CONFLICT DO UPDATE` also handles the window rolling over: when the stored
-- `reset_at` is in the past the row is reset to 1 rather than incremented, so
-- there is no separate expiry pass in the hot path.
CREATE OR REPLACE FUNCTION public.rate_limit_hit(
  p_key       TEXT,
  p_window_ms INTEGER
)
RETURNS TABLE (count INTEGER, reset_at TIMESTAMPTZ)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  INSERT INTO public.rate_limit_buckets AS b (key, count, reset_at)
  VALUES (p_key, 1, now() + make_interval(secs => p_window_ms / 1000.0))
  ON CONFLICT (key) DO UPDATE
     SET count    = CASE WHEN b.reset_at < now() THEN 1 ELSE b.count + 1 END,
         reset_at = CASE WHEN b.reset_at < now()
                         THEN now() + make_interval(secs => p_window_ms / 1000.0)
                         ELSE b.reset_at END
  RETURNING b.count, b.reset_at;
$$;

COMMENT ON FUNCTION public.rate_limit_hit(TEXT, INTEGER) IS
  'Atomically counts one request against a bucket and returns the running count '
  'and window end. Resets the row when its window has closed, so no separate '
  'expiry pass is needed on the request path.';

-- ────────────────────────────────────────────────────────────────────────────
-- Housekeeping
-- ────────────────────────────────────────────────────────────────────────────
-- Closed windows are dead weight. Nothing reads them — rate_limit_hit() resets
-- a stale row rather than trusting it — so deleting them is safe at any moment.
-- Call from the scheduled maintenance endpoint, never from a request.
CREATE OR REPLACE FUNCTION public.sweep_rate_limit_buckets()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM public.rate_limit_buckets WHERE reset_at < now();
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.rate_limit_hit(TEXT, INTEGER)    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sweep_rate_limit_buckets()       FROM PUBLIC, anon, authenticated;
