-- 0057_invitation_expiry.sql
-- KAN-40 · Invitation tokens stop being valid after a while.
--
-- NOT APPLIED TO PRODUCTION. Read the backfill note below before applying: it
-- expires one real pending invitation, which means it has to be resent.
--
-- The gap: an invitation nobody answers stays `pending` forever and its token
-- stays valid forever with it. A token leaked through a forwarded email, a
-- browser history, a proxy log or an old backup is worth the same two years
-- later.
--
-- What already limits the damage, and stays untouched: invitations are matched
-- by email (403 on mismatch) and only accepted while `pending` (409 otherwise).
-- This adds the missing time bound, it does not replace either.
--
-- ── Scope: the two invitation tokens, not the inscription link ──────────────
-- `contests.registration_token` deliberately gets no expiry. It is not an
-- invitation: it is the contest's public inscription link, and what actually
-- bounds it is `contests.registration_open`, checked by the enroll, checkout
-- and upload handlers. Adding a second, independent deadline that can
-- contradict that flag is worse than one condition that means what it says.
--
-- CORRECTION (verified against production 2026-09-15). An earlier version of
-- this comment also claimed `get_contest_by_token` filters
-- `status IN ('active','finished')`. It does not. That clause exists in
-- `0039_add_rules_column.sql` in this repo, but the **deployed** function is
-- just `WHERE c.registration_token = p_token LIMIT 1` — no status filter at
-- all. Confirmed by hitting the public schema endpoint for a contest in
-- `draft`: it answers 200 with the published form, not 404.
--
-- So a token keeps resolving for a draft or finished contest, and only
-- `registration_open` stops an enrolment. Low severity — the token is the
-- capability and a form schema is not a secret — but the claim was false, and
-- it was made by reading a migration file instead of the deployed function,
-- which is the exact mistake `docs/database.md` exists to prevent.

-- ────────────────────────────────────────────────────────────────────────────
-- 1. The column
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.contest_members
  ADD COLUMN IF NOT EXISTS invitation_expires_at TIMESTAMPTZ;

ALTER TABLE public.judge_pool_invitations
  ADD COLUMN IF NOT EXISTS invitation_expires_at TIMESTAMPTZ;

COMMENT ON COLUMN public.contest_members.invitation_expires_at IS
  'When the invitation token stops being accepted (KAN-40). NULL means no '
  'expiry, which only pre-KAN-40 rows that were already answered carry.';

COMMENT ON COLUMN public.judge_pool_invitations.invitation_expires_at IS
  'When the invitation token stops being accepted (KAN-40). NULL means no expiry.';

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Issued together with the token
-- ────────────────────────────────────────────────────────────────────────────
-- 14 days: long enough that a judge who reads mail weekly is not locked out by
-- a holiday, short enough that a leaked link is not useful a season later.
-- Resending issues a new token and a new window, so the cost of being wrong
-- here is one click, not a lost invitation.
--
-- The value lives in the database rather than in the handlers because the
-- token itself is set by a trigger (0049): splitting the two would let a row
-- get a token with no expiry through any path that does not go through the
-- API.
CREATE OR REPLACE FUNCTION public.invitation_default_expiry()
RETURNS TIMESTAMPTZ
LANGUAGE sql IMMUTABLE
SET search_path = public, pg_temp
AS $$ SELECT now() + INTERVAL '14 days' $$;

COMMENT ON FUNCTION public.invitation_default_expiry() IS
  'Default validity window for an invitation token (KAN-40). Change here and '
  'every issuing path follows, including the trigger and the resend endpoints.';

CREATE OR REPLACE FUNCTION public.set_judge_invitation_token()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.role = 'judge' AND NEW.invitation_token IS NULL THEN
    NEW.invitation_token  := encode(extensions.gen_random_bytes(16), 'hex');
    NEW.invitation_status := 'pending';
    NEW.invited_at        := COALESCE(NEW.invited_at, now());
    -- KAN-40: the window is stamped with the token, never separately.
    NEW.invitation_expires_at := COALESCE(NEW.invitation_expires_at, public.invitation_default_expiry());
  END IF;
  RETURN NEW;
END
$$;

-- Judge-pool invitations carry a NOT NULL token created by the handler rather
-- than a trigger, so they get their own BEFORE INSERT default.
CREATE OR REPLACE FUNCTION public.set_judge_pool_invitation_expiry()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.invitation_expires_at IS NULL THEN
    NEW.invitation_expires_at := public.invitation_default_expiry();
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS set_judge_pool_invitation_expiry_trigger ON public.judge_pool_invitations;

CREATE TRIGGER set_judge_pool_invitation_expiry_trigger
  BEFORE INSERT ON public.judge_pool_invitations
  FOR EACH ROW
  EXECUTE FUNCTION public.set_judge_pool_invitation_expiry();

-- ────────────────────────────────────────────────────────────────────────────
-- 3. Backfill
-- ────────────────────────────────────────────────────────────────────────────
-- Only rows still `pending` get a window: an answered invitation is already
-- unusable through the `invitation_status` check, and stamping it would be
-- noise that suggests a control the row does not need.
--
-- The window counts from when the invitation was sent, not from now, because
-- backdating is the honest reading: the token has been in the wild since then.
--
-- ⚠️ Effect on production. CORRECTED on 2026-09-17: the note that used to sit
-- here said the one pending invitation was "already past" its fourteen days and
-- that applying this would expire it. The arithmetic was simply wrong —
-- 2026-09-05 + 14 days is 2026-09-19 — and the claim was repeated downstream,
-- into KAN-40 and two plans, by people (me included) who read it instead of
-- subtracting.
--
-- Measured again on 2026-09-17: `contest_members` holds one pending invitation,
-- sent 2026-09-05, so the backfill gives it an expiry of 2026-09-19 — still in
-- the future. `judge_pool_invitations` has no pending rows.
--
-- What is real is a deadline: applied BEFORE 2026-09-19 the invitation keeps
-- the rest of its window; applied on or after, it is born expired and has to be
-- resent. Applied 2026-09-17, inside the window.
UPDATE public.contest_members
   SET invitation_expires_at = COALESCE(invited_at, created_at) + INTERVAL '14 days'
 WHERE invitation_token IS NOT NULL
   AND invitation_status = 'pending'
   AND invitation_expires_at IS NULL;

UPDATE public.judge_pool_invitations
   SET invitation_expires_at = COALESCE(invited_at, created_at) + INTERVAL '14 days'
 WHERE invitation_status = 'pending'
   AND invitation_expires_at IS NULL;

-- ────────────────────────────────────────────────────────────────────────────
-- 4. Lookups
-- ────────────────────────────────────────────────────────────────────────────
-- The handlers fetch the row by token and then decide, rather than filtering
-- the expiry in SQL: an expired invitation has to be distinguishable from one
-- that never existed, and a WHERE clause would collapse both into 404.
CREATE INDEX IF NOT EXISTS contest_members_invitation_expires_idx
  ON public.contest_members(invitation_expires_at)
  WHERE invitation_status = 'pending';

CREATE INDEX IF NOT EXISTS judge_pool_invitations_expires_idx
  ON public.judge_pool_invitations(invitation_expires_at)
  WHERE invitation_status = 'pending';

-- ────────────────────────────────────────────────────────────────────────────
-- 5. Rotation on resend
-- ────────────────────────────────────────────────────────────────────────────
-- Neither resend endpoint regenerated the token: both re-sent the same link.
-- That makes resending useless against the case this issue is about — a leaked
-- link stays valid, and the organizer has no way to kill it.
--
-- In the database rather than in the handlers so `gen_random_bytes` stays the
-- one place a token's format is decided, matching what the insert trigger does.
-- Both are called by the server with service_role, after its own ownership gate.
CREATE OR REPLACE FUNCTION public.rotate_contest_member_invitation(p_member_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_token TEXT;
BEGIN
  UPDATE public.contest_members
     SET invitation_token      = encode(extensions.gen_random_bytes(16), 'hex'),
         invitation_expires_at = public.invitation_default_expiry(),
         invited_at            = now()
   WHERE id = p_member_id
     AND invitation_status = 'pending'
   RETURNING invitation_token INTO v_token;

  -- NULL tells the caller the row was not pending, so it can answer 409
  -- instead of mailing a link for an invitation that was already settled.
  RETURN v_token;
END;
$$;

CREATE OR REPLACE FUNCTION public.rotate_judge_pool_invitation(p_invitation_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_token TEXT;
BEGIN
  UPDATE public.judge_pool_invitations
     SET invitation_token      = encode(extensions.gen_random_bytes(16), 'hex'),
         invitation_expires_at = public.invitation_default_expiry(),
         invited_at            = now()
   WHERE id = p_invitation_id
     AND invitation_status = 'pending'
   RETURNING invitation_token INTO v_token;

  RETURN v_token;
END;
$$;

COMMENT ON FUNCTION public.rotate_contest_member_invitation(UUID) IS
  'Issues a fresh token and window for a pending invitation, invalidating the '
  'previous link (KAN-40). Returns NULL when the row is not pending.';

REVOKE ALL ON FUNCTION public.rotate_contest_member_invitation(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rotate_judge_pool_invitation(UUID)     FROM PUBLIC, anon, authenticated;
