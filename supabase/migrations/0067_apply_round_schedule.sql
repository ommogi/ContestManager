-- 0067_apply_round_schedule.sql
-- Write a generated schedule to a round in one statement (KAN-13).
--
-- The plan is computed on the server (`shared/schedule-generator.ts`) from
-- what the database holds; this only writes it. One UPDATE, so a round is
-- never left half-scheduled if something fails partway.
--
-- Writes the existing TEXT datetime-local columns `performance_time` and
-- `performance_end_time`, the same ones the manual "Actuaciones" editor uses.
-- The call time is NOT stored: it is performance_time minus
-- contests.call_offset_minutes, computed when read, so changing the offset
-- never leaves stale copies behind.
--
-- `notify_schedule_assigned` still fires as it does for a manual edit: a
-- participant is told the first time their performance_time is set, and not
-- again on regeneration.
--
-- p_rows: [{ "id": uuid, "performance_time": text, "performance_end_time": text }]

CREATE OR REPLACE FUNCTION public.apply_round_schedule(p_round_id UUID, p_rows JSONB)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_status  public.round_status;
  v_foreign INTEGER;
  v_updated INTEGER;
BEGIN
  SELECT status INTO v_status FROM public.rounds WHERE id = p_round_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'round_not_found';
  END IF;
  -- Closed rounds reject edits (CLAUDE.md schema lock).
  IF v_status = 'closed' THEN
    RAISE EXCEPTION 'round_closed';
  END IF;

  IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'invalid_rows';
  END IF;

  -- Every row must belong to this round, so a caller gated on one contest
  -- cannot reschedule another contest's round by passing its ids.
  SELECT count(*) INTO v_foreign
    FROM jsonb_to_recordset(p_rows) AS r(id UUID)
    LEFT JOIN public.round_participants rp
           ON rp.id = r.id AND rp.round_id = p_round_id
   WHERE rp.id IS NULL;
  IF v_foreign > 0 THEN
    RAISE EXCEPTION 'foreign_round_participant';
  END IF;

  UPDATE public.round_participants rp
     SET performance_time     = r.performance_time,
         performance_end_time = r.performance_end_time
    FROM jsonb_to_recordset(p_rows)
         AS r(id UUID, performance_time TEXT, performance_end_time TEXT)
   WHERE rp.id = r.id
     AND rp.round_id = p_round_id;
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  RETURN v_updated;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_round_schedule(UUID, JSONB) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.apply_round_schedule(UUID, JSONB) IS
  'Writes performance_time/performance_end_time for rows of one round in a single '
  'statement (KAN-13 schedule generator). Rejects closed rounds and ids from other '
  'rounds. Admin client only, behind requireOrgOwnerOrMember.';
