-- 0071_round_repertoire.sql
-- What each participant plays in each round, from the catalogue (KAN-17).
--
-- One row per work, per participant, per round, in playing order. The
-- repertoire can differ between rounds of the same participant, so it hangs off
-- `round_participants`, not `participants`, and cascades with it
-- (organizations → contests → categories → rounds → round_participants → here).
--
-- `work_id` is ON DELETE RESTRICT: that is what turns "delete this work" in the
-- catalogue (KAN-16) into "archive it" once someone plays it.
--
-- ── Lock ────────────────────────────────────────────────────────────────────
-- Editable while the round is `pending`; fixed once it is `active` or `closed`,
-- so the jury never sees a repertoire change mid-performance. The literal rule
-- ("active contests reject participant edits") would forbid any repertoire in
-- round 2, which is created with the contest already active. Agreed with Omar.
--
-- Re-runnable: IF NOT EXISTS / OR REPLACE, policies dropped first.

CREATE TABLE IF NOT EXISTS public.round_participant_works (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_participant_id UUID NOT NULL REFERENCES public.round_participants(id) ON DELETE CASCADE,
  work_id              UUID NOT NULL REFERENCES public.works(id) ON DELETE RESTRICT,
  position             INTEGER NOT NULL CHECK (position > 0),
  -- NULL = the catalogue's indicative length.
  duration_seconds     INTEGER CHECK (duration_seconds IS NULL OR duration_seconds BETWEEN 1 AND 7200),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (round_participant_id, position),
  UNIQUE (round_participant_id, work_id)
);

CREATE INDEX IF NOT EXISTS round_participant_works_work_id_idx
  ON public.round_participant_works(work_id);

COMMENT ON TABLE public.round_participant_works IS
  'Repertoire of a participant in a round (KAN-17): catalogue works in playing '
  'order, with an optional length overriding the catalogue''s. Written only by '
  'set_round_repertoire(), and only while the round is pending.';

-- ────────────────────────────────────────────────────────────────────────────
-- set_round_repertoire: replace a participant's repertoire for a round
-- ────────────────────────────────────────────────────────────────────────────
-- p_items: [{ "work_id": uuid, "duration_seconds": int|null }] in playing order.
--
-- Called from `PUT /api/round-participants/[id]/repertoire` on the admin client
-- after `requireContestOrganizer`; the checks here hold whoever calls it.
CREATE OR REPLACE FUNCTION public.set_round_repertoire(p_rp_id UUID, p_items JSONB)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_status   public.round_status;
  v_org_id   UUID;
  v_count    INTEGER;
BEGIN
  SELECT r.status, c.organization_id
    INTO v_status, v_org_id
    FROM public.round_participants rp
    JOIN public.rounds r       ON r.id = rp.round_id
    JOIN public.categories cat ON cat.id = r.category_id
    JOIN public.contests c     ON c.id = cat.contest_id
   WHERE rp.id = p_rp_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'round_participant_not_found';
  END IF;
  IF v_status <> 'pending' THEN
    RAISE EXCEPTION 'round_locked';
  END IF;

  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'invalid_items';
  END IF;

  -- Only this organisation's catalogue.
  IF EXISTS (
    SELECT 1
      FROM jsonb_to_recordset(p_items) AS i(work_id UUID)
      LEFT JOIN public.works w ON w.id = i.work_id AND w.organization_id = v_org_id
     WHERE w.id IS NULL
  ) THEN
    RAISE EXCEPTION 'work_other_organization';
  END IF;

  -- An archived work can stay where it already is, but not be newly added.
  IF EXISTS (
    SELECT 1
      FROM jsonb_to_recordset(p_items) AS i(work_id UUID)
      JOIN public.works w ON w.id = i.work_id
     WHERE w.archived_at IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM public.round_participant_works x
          WHERE x.round_participant_id = p_rp_id AND x.work_id = i.work_id
       )
  ) THEN
    RAISE EXCEPTION 'work_archived';
  END IF;

  DELETE FROM public.round_participant_works WHERE round_participant_id = p_rp_id;

  BEGIN
    INSERT INTO public.round_participant_works (round_participant_id, work_id, position, duration_seconds)
    SELECT p_rp_id, i.work_id, i.ord::INTEGER, i.duration_seconds
      FROM jsonb_to_recordset(p_items) WITH ORDINALITY AS i(work_id UUID, duration_seconds INTEGER, ord BIGINT);
    GET DIAGNOSTICS v_count = ROW_COUNT;
  EXCEPTION
    WHEN unique_violation THEN
      RAISE EXCEPTION 'duplicate_work';
    WHEN check_violation THEN
      RAISE EXCEPTION 'invalid_duration';
  END;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.set_round_repertoire(UUID, JSONB) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.set_round_repertoire(UUID, JSONB) IS
  'Replaces a participant''s repertoire for a round (KAN-17). Pending rounds only; '
  'works from the contest''s organisation only; archived works cannot be newly added. '
  'Admin client only, behind requireContestOrganizer.';

-- ────────────────────────────────────────────────────────────────────────────
-- RLS: read for the organisation owner and the contest's accepted members
-- (the jury programme, KAN-22, will need it); no write policy — writes go
-- through the RPC above.
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.round_participant_works ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS round_participant_works_read ON public.round_participant_works;
CREATE POLICY round_participant_works_read ON public.round_participant_works
  FOR SELECT TO authenticated
  USING (round_participant_id IN (
    SELECT rp.id
      FROM public.round_participants rp
      JOIN public.rounds r       ON r.id = rp.round_id
      JOIN public.categories cat ON cat.id = r.category_id
      JOIN public.contests c     ON c.id = cat.contest_id
     WHERE c.organization_id IN (SELECT o.id FROM public.organizations o WHERE o.owner_id = (SELECT auth.uid()))
        OR c.id IN (
          SELECT m.contest_id FROM public.contest_members m
           WHERE m.user_id = (SELECT auth.uid()) AND m.invitation_status = 'accepted'
        )
  ));

REVOKE ALL ON public.round_participant_works FROM anon;
