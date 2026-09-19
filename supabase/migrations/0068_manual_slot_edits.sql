-- 0068_manual_slot_edits.sql
-- Mark performance slots adjusted by hand after generation (KAN-15).
--
-- Something always changes on the day. The organisation edits one slot from
-- the "Actuaciones" dialog; that edit is stamped here so that regenerating the
-- round (KAN-13) can say, before overwriting it, whose hand-made change will
-- be lost. NULL = as generated, or never scheduled.
--
-- `apply_round_schedule` is redefined to clear the stamp: after a regeneration
-- nothing on the round is a manual edit any more. The rest of its body is the
-- same as in 0067.
--
-- Re-runnable: IF NOT EXISTS / CREATE OR REPLACE.

ALTER TABLE public.round_participants
  ADD COLUMN IF NOT EXISTS schedule_edited_at TIMESTAMPTZ;

COMMENT ON COLUMN public.round_participants.schedule_edited_at IS
  'When performance_time was last changed by hand (KAN-15). Cleared when the '
  'schedule generator rewrites the round. NULL = as generated or never scheduled.';

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
         performance_end_time = r.performance_end_time,
         schedule_edited_at   = NULL
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
  'statement (KAN-13) and clears schedule_edited_at (KAN-15). Rejects closed rounds '
  'and ids from other rounds. Admin client only, behind requireOrgOwnerOrMember.';
