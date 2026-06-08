-- 0033_link_contest_members_user_id.sql
-- contest_members.user_id was left NULL when org invited a judge by email
-- before that judge had an auth.users row. scores.judge_id stores auth.uid,
-- so the join in the round summary endpoint was failing → judge progress
-- ("M/N", media) showed 0 in the sidebar.
--
-- Fix: backfill + 2 triggers to auto-link going forward.

-- Backfill existing rows.
UPDATE public.contest_members cm
   SET user_id = u.id
  FROM auth.users u
 WHERE cm.user_id IS NULL
   AND cm.email IS NOT NULL
   AND lower(cm.email) = lower(u.email);

-- Trigger 1: BEFORE INSERT/UPDATE on contest_members → fill user_id from email.
CREATE OR REPLACE FUNCTION public.link_contest_member_user_id()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, pg_temp
AS $$
BEGIN
  IF NEW.user_id IS NULL AND NEW.email IS NOT NULL THEN
    SELECT u.id INTO NEW.user_id
      FROM auth.users u
     WHERE lower(u.email) = lower(NEW.email)
     LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS link_member_user_id ON public.contest_members;
CREATE TRIGGER link_member_user_id
  BEFORE INSERT OR UPDATE OF email, user_id ON public.contest_members
  FOR EACH ROW EXECUTE FUNCTION public.link_contest_member_user_id();

-- Trigger 2: AFTER INSERT on auth.users (signup) → backfill any pre-existing
-- contest_members rows that referenced the new user by email.
CREATE OR REPLACE FUNCTION public.backfill_contest_members_for_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, pg_temp
AS $$
BEGIN
  UPDATE public.contest_members
     SET user_id = NEW.id
   WHERE user_id IS NULL
     AND email IS NOT NULL
     AND lower(email) = lower(NEW.email);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS backfill_member_links ON auth.users;
CREATE TRIGGER backfill_member_links
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.backfill_contest_members_for_new_user();
