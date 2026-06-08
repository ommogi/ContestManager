-- 0035_fix_recursion_and_org_owner_member.sql
-- Two related fixes:
--
-- (1) is_contest_member() did not consider org owners as implicit members. Same
--     gap that 0032 fixed for is_contest_organizer(). Extend identically.
--
-- (2) rounds policies suffered the same self-reference recursion that the
--     scores policy had (cf. 0034) — `id IN (SELECT r.id FROM rounds r ...)`
--     inside policies on the same `rounds` table. Rewrite as direct EXISTS
--     joining only categories.

CREATE OR REPLACE FUNCTION public.is_contest_member(c_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM contest_members
    WHERE contest_id = c_id AND user_id = auth.uid()
  ) THEN RETURN TRUE; END IF;
  IF EXISTS (
    SELECT 1
      FROM contests c
      JOIN organizations o ON o.id = c.organization_id
     WHERE c.id = c_id AND o.owner_id = auth.uid()
  ) THEN RETURN TRUE; END IF;
  RETURN FALSE;
END;
$$;

DROP POLICY IF EXISTS "Rounds viewable by members" ON public.rounds;
DROP POLICY IF EXISTS "Rounds editable by organizer" ON public.rounds;

CREATE POLICY "Rounds viewable by members"
  ON public.rounds FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.categories c
      WHERE c.id = rounds.category_id
        AND public.is_contest_member(c.contest_id)
    )
  );

CREATE POLICY "Rounds editable by organizer"
  ON public.rounds FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.categories c
      WHERE c.id = rounds.category_id
        AND public.is_contest_organizer(c.contest_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.categories c
      WHERE c.id = rounds.category_id
        AND public.is_contest_organizer(c.contest_id)
    )
  );
