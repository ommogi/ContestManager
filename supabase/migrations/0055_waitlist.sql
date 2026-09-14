-- 0055_waitlist.sql
-- KAN-61 · Brings `public.waitlist` into the repo.
--
-- The table has existed in production since 2026-05-18, created by a migration
-- recorded as `create_waitlist_table` (20260518135556) that was never committed
-- here. Reconstructed from the live schema, so this file is a no-op against
-- production and the difference it closes is for a fresh environment: without
-- it, building this project from the repo produces a database the deployed one
-- does not match.
--
-- Written IF NOT EXISTS throughout for exactly that reason — it must be safe to
-- run against the database that already has the table.

CREATE TABLE IF NOT EXISTS public.waitlist (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  email        TEXT NOT NULL UNIQUE,
  organization TEXT,
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- RLS is on and there is deliberately **no policy**, which is how production
-- has it: with RLS enabled and no policy, `anon` and `authenticated` can
-- neither read nor write, and only `service_role` — which bypasses RLS — gets
-- through. Signups therefore have to come through a server handler that can
-- validate them, never straight from a browser.
--
-- Noted rather than changed: adding an INSERT policy for `anon` would let
-- anyone write rows directly, and the email UNIQUE constraint would turn into
-- an enumeration oracle for who has already signed up.
ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.waitlist IS
  'Landing-page signups. Reached only through the server (service_role): RLS is '
  'enabled with no policy on purpose. Added to the repo by 0055 (KAN-61) after '
  'living in production untracked since 2026-05-18.';
