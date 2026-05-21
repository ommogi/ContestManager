-- 0049_fix_judge_invitation_token_gen.sql
-- Fix: set_judge_invitation_token() failed with
--   "function gen_random_bytes(integer) does not exist"
-- because the trigger has SET search_path = public, pg_temp, which excludes
-- the `extensions` schema where pgcrypto lives. Call the function with its
-- schema-qualified name.

CREATE OR REPLACE FUNCTION public.set_judge_invitation_token()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.role = 'judge' AND NEW.invitation_token IS NULL THEN
    NEW.invitation_token  := encode(extensions.gen_random_bytes(16), 'hex');
    NEW.invitation_status := 'pending';
    NEW.invited_at        := COALESCE(NEW.invited_at, now());
  END IF;
  RETURN NEW;
END
$$;
