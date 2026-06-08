-- 0048_judge_invitations.sql
-- Judge invitation flow with accept/reject:
--   * Add invitation_status / invitation_token / invited_at / responded_at to contest_members.
--   * Backfill existing rows as 'accepted' (no email is re-sent for them).
--   * BEFORE INSERT trigger generates a random token for new judge invitations.
--   * Update notify_judge_assigned to emit type='judge_invitation' with the token in payload.
--   * Update is_contest_member() so judges with status != 'accepted' don't get contest access.

-- ─── Enum ────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE contest_member_invitation_status AS ENUM ('pending','accepted','rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── Columns ─────────────────────────────────────────────────────────────────
ALTER TABLE public.contest_members
  ADD COLUMN IF NOT EXISTS invitation_status contest_member_invitation_status NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS invitation_token  TEXT,
  ADD COLUMN IF NOT EXISTS invited_at        TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS responded_at      TIMESTAMPTZ;

DO $$ BEGIN
  ALTER TABLE public.contest_members ADD CONSTRAINT contest_members_invitation_token_key UNIQUE (invitation_token);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS contest_members_invitation_token_idx
  ON public.contest_members(invitation_token)
  WHERE invitation_token IS NOT NULL;

-- ─── Backfill: pre-existing rows are considered already accepted ─────────────
UPDATE public.contest_members
   SET invitation_status = 'accepted',
       responded_at      = COALESCE(responded_at, created_at)
 WHERE invitation_status = 'pending';

-- ─── Trigger: generate token + force 'pending' for new judge invitations ─────
CREATE OR REPLACE FUNCTION public.set_judge_invitation_token()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.role = 'judge' AND NEW.invitation_token IS NULL THEN
    NEW.invitation_token  := encode(gen_random_bytes(16), 'hex');
    NEW.invitation_status := 'pending';
    NEW.invited_at        := COALESCE(NEW.invited_at, now());
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_set_judge_invitation_token ON public.contest_members;
CREATE TRIGGER trg_set_judge_invitation_token
  BEFORE INSERT ON public.contest_members
  FOR EACH ROW EXECUTE FUNCTION public.set_judge_invitation_token();

-- ─── Update notify_judge_assigned to use the invitation flow ────────────────
CREATE OR REPLACE FUNCTION public.notify_judge_assigned()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_contest_name  TEXT;
  v_contest_slug  TEXT;
  v_judge_user_id UUID;
BEGIN
  IF NEW.role <> 'judge' THEN RETURN NEW; END IF;

  IF NEW.user_id IS NOT NULL THEN
    v_judge_user_id := NEW.user_id;
  ELSIF NEW.email IS NOT NULL THEN
    SELECT id INTO v_judge_user_id FROM auth.users WHERE email = NEW.email LIMIT 1;
  END IF;

  IF v_judge_user_id IS NULL THEN RETURN NEW; END IF;

  SELECT name, slug INTO v_contest_name, v_contest_slug FROM contests WHERE id = NEW.contest_id;

  INSERT INTO public.notifications (user_id, type, title, body, payload)
  VALUES (
    v_judge_user_id,
    'judge_invitation',
    'Invitación como jurado',
    'Has sido invitado como jurado en "' || COALESCE(v_contest_name, '') || '". Acepta o rechaza la invitación.',
    jsonb_build_object(
      'contest_id',       NEW.contest_id,
      'contest_name',     v_contest_name,
      'contest_slug',     v_contest_slug,
      'invitation_token', NEW.invitation_token,
      'member_id',        NEW.id
    )
  );
  RETURN NEW;
END
$$;

-- ─── Update is_contest_member to filter pending/rejected judges ──────────────
CREATE OR REPLACE FUNCTION public.is_contest_member(c_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM contest_members
    WHERE contest_id = c_id
      AND user_id    = auth.uid()
      AND (role <> 'judge' OR invitation_status = 'accepted')
  ) THEN RETURN TRUE; END IF;

  IF EXISTS (
    SELECT 1
      FROM contests c
      JOIN organizations o ON o.id = c.organization_id
     WHERE c.id = c_id AND o.owner_id = auth.uid()
  ) THEN RETURN TRUE; END IF;

  RETURN FALSE;
END
$$;
