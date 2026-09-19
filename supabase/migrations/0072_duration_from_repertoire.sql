-- 0072_duration_from_repertoire.sql
-- A performance lasts what its repertoire lasts (KAN-18).
--
-- The client's decision: the slot is not a fixed 8 minutes, it is exactly the
-- participant's repertoire. So `round_participants.performance_minutes` is now
-- computed from `round_participant_works` (KAN-17) — the sum of each work's
-- length, the participant's override or else the catalogue's, rounded UP to
-- whole minutes (a 7:30 piece needs an 8-minute slot; same rule as
-- secondsToSlotMinutes() in shared/works-catalog.ts).
--
-- ── Manual override ─────────────────────────────────────────────────────────
-- The organisation can still type a value (agreed with Omar). That pins it:
-- `performance_minutes_manual = true`, and recomputing leaves it alone until
-- someone switches back to the computed value. Every existing
-- performance_minutes was typed by hand before today, so the backfill marks
-- them all manual: nothing already entered changes under anyone's feet.
--
-- ── Stale schedules ─────────────────────────────────────────────────────────
-- No state is stored for "the schedule is out of date". A generated slot is
-- stale when its length no longer matches the participant's minutes; the app
-- works that out when it reads (shared/schedule-generator.ts, staleSlots()).
--
-- Re-runnable: IF NOT EXISTS / OR REPLACE; the backfill only touches rows that
-- would otherwise be recomputed.

ALTER TABLE public.round_participants
  ADD COLUMN IF NOT EXISTS performance_minutes_manual BOOLEAN NOT NULL DEFAULT false;

UPDATE public.round_participants
   SET performance_minutes_manual = true
 WHERE performance_minutes IS NOT NULL
   AND performance_minutes_manual = false
   AND NOT EXISTS (
     SELECT 1 FROM public.round_participant_works w WHERE w.round_participant_id = round_participants.id
   );

COMMENT ON COLUMN public.round_participants.performance_minutes_manual IS
  'true = performance_minutes was typed by the organisation and is kept as is; '
  'false = it follows the repertoire (KAN-18). NULL minutes fall back to '
  'contests.performance_default_minutes.';

-- ────────────────────────────────────────────────────────────────────────────
-- recompute_performance_minutes
-- ────────────────────────────────────────────────────────────────────────────
-- Internal: called by the RPCs and the trigger below, never by API roles.
CREATE OR REPLACE FUNCTION public.recompute_performance_minutes(p_rp_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_seconds INTEGER;
BEGIN
  SELECT sum(coalesce(rpw.duration_seconds, w.duration_seconds))
    INTO v_seconds
    FROM public.round_participant_works rpw
    JOIN public.works w ON w.id = rpw.work_id
   WHERE rpw.round_participant_id = p_rp_id;

  UPDATE public.round_participants
     SET performance_minutes = CASE
           WHEN coalesce(v_seconds, 0) > 0 THEN ceil(v_seconds / 60.0)::INTEGER
           ELSE NULL
         END
   WHERE id = p_rp_id
     AND performance_minutes_manual = false;
END;
$$;

REVOKE ALL ON FUNCTION public.recompute_performance_minutes(UUID) FROM PUBLIC, anon, authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- set_round_repertoire (0071) — now recomputes the slot length afterwards
-- ────────────────────────────────────────────────────────────────────────────
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

  IF EXISTS (
    SELECT 1
      FROM jsonb_to_recordset(p_items) AS i(work_id UUID)
      LEFT JOIN public.works w ON w.id = i.work_id AND w.organization_id = v_org_id
     WHERE w.id IS NULL
  ) THEN
    RAISE EXCEPTION 'work_other_organization';
  END IF;

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

  -- KAN-18: the slot follows the repertoire unless it was pinned by hand.
  PERFORM public.recompute_performance_minutes(p_rp_id);

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.set_round_repertoire(UUID, JSONB) FROM PUBLIC, anon, authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- set_round_draw (0066) — carries the manual flag and recomputes the rest
-- ────────────────────────────────────────────────────────────────────────────
-- p_rows: [{ id, draw_number, performance_minutes, performance_minutes_manual? }]
-- A row without the flag keeps the one it has. Rows that are not manual get
-- their minutes from the repertoire afterwards, whatever value was sent.
CREATE OR REPLACE FUNCTION public.set_round_draw(p_round_id UUID, p_rows JSONB)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_status  public.round_status;
  v_foreign INTEGER;
  v_updated INTEGER;
  v_rp      UUID;
BEGIN
  SELECT status INTO v_status FROM public.rounds WHERE id = p_round_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'round_not_found';
  END IF;
  IF v_status = 'closed' THEN
    RAISE EXCEPTION 'round_closed';
  END IF;

  IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'invalid_rows';
  END IF;

  SELECT count(*) INTO v_foreign
    FROM jsonb_to_recordset(p_rows) AS r(id UUID)
    LEFT JOIN public.round_participants rp
           ON rp.id = r.id AND rp.round_id = p_round_id
   WHERE rp.id IS NULL;
  IF v_foreign > 0 THEN
    RAISE EXCEPTION 'foreign_round_participant';
  END IF;

  BEGIN
    UPDATE public.round_participants rp
       SET draw_number                = r.draw_number,
           performance_minutes        = r.performance_minutes,
           performance_minutes_manual = coalesce(r.performance_minutes_manual, rp.performance_minutes_manual)
      FROM jsonb_to_recordset(p_rows)
           AS r(id UUID, draw_number INTEGER, performance_minutes INTEGER, performance_minutes_manual BOOLEAN)
     WHERE rp.id = r.id
       AND rp.round_id = p_round_id;
    GET DIAGNOSTICS v_updated = ROW_COUNT;
  EXCEPTION
    WHEN unique_violation THEN
      RAISE EXCEPTION 'duplicate_draw_number';
    WHEN check_violation THEN
      RAISE EXCEPTION 'invalid_draw_values';
  END;

  FOR v_rp IN
    SELECT rp.id
      FROM jsonb_to_recordset(p_rows) AS r(id UUID)
      JOIN public.round_participants rp ON rp.id = r.id
     WHERE rp.performance_minutes_manual = false
  LOOP
    PERFORM public.recompute_performance_minutes(v_rp);
  END LOOP;

  RETURN v_updated;
END;
$$;

REVOKE ALL ON FUNCTION public.set_round_draw(UUID, JSONB) FROM PUBLIC, anon, authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- A catalogue length that changes moves the slots that depend on it
-- ────────────────────────────────────────────────────────────────────────────
-- Only rounds that have not started: a started round's slots are fixed, like
-- its repertoire (KAN-17 lock).
CREATE OR REPLACE FUNCTION public.works_duration_changed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rp UUID;
BEGIN
  FOR v_rp IN
    SELECT DISTINCT rpw.round_participant_id
      FROM public.round_participant_works rpw
      JOIN public.round_participants rp ON rp.id = rpw.round_participant_id
      JOIN public.rounds r ON r.id = rp.round_id
     WHERE rpw.work_id = NEW.id
       AND rpw.duration_seconds IS NULL
       AND r.status = 'pending'
  LOOP
    PERFORM public.recompute_performance_minutes(v_rp);
  END LOOP;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.works_duration_changed() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS works_duration_changed ON public.works;
CREATE TRIGGER works_duration_changed
  AFTER UPDATE OF duration_seconds ON public.works
  FOR EACH ROW
  WHEN (OLD.duration_seconds IS DISTINCT FROM NEW.duration_seconds)
  EXECUTE FUNCTION public.works_duration_changed();
