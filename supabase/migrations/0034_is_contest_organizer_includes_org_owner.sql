-- 0032_is_contest_organizer_includes_org_owner.sql
-- Extend is_contest_organizer() so an organization owner counts as organizer
-- for ALL their contests without needing a contest_members row.
-- Affects every RLS policy + helper that calls is_contest_organizer(),
-- including scores SELECT (Realtime delivers nothing without it).
CREATE OR REPLACE FUNCTION public.is_contest_organizer(c_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM contest_members
    WHERE contest_id = c_id
      AND user_id = auth.uid()
      AND role = 'organizer'
  ) THEN RETURN TRUE; END IF;

  IF EXISTS (
    SELECT 1
      FROM contests c
      JOIN organizations o ON o.id = c.organization_id
     WHERE c.id = c_id
       AND o.owner_id = auth.uid()
  ) THEN RETURN TRUE; END IF;

  RETURN FALSE;
END;
$$;
