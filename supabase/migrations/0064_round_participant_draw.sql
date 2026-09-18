-- 0064_round_participant_draw.sql
-- Draw number and performance length per participant and round (KAN-11).
--
-- ── Why not reuse `order` ───────────────────────────────────────────────────
-- `round_participants."order"` is filled automatically with 1..N in whatever
-- order participants were added or promoted. It is never empty, so it cannot
-- say "not drawn yet", and the schedule generator (KAN-13) must refuse to run
-- until a real draw exists. `order` stays as it is; `draw_number` is the
-- organisation's decision and is NULL until they make it.
--
-- ── Why the constraint is DEFERRABLE ────────────────────────────────────────
-- A plain UNIQUE is checked row by row, so swapping 3 and 5 between two
-- participants fails halfway through even when the end state is valid.
-- DEFERRABLE INITIALLY IMMEDIATE checks at the end of each statement instead,
-- which is what lets `set_round_draw` apply a whole draw in one UPDATE. NULLs
-- never collide, so any number of participants can be undrawn.
--
-- Re-runnable: IF NOT EXISTS / CREATE OR REPLACE, and the constraint is added
-- only when absent.

ALTER TABLE public.round_participants
  ADD COLUMN IF NOT EXISTS draw_number INTEGER,
  ADD COLUMN IF NOT EXISTS performance_minutes INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.round_participants'::regclass
       AND conname  = 'round_participants_draw_number_positive'
  ) THEN
    ALTER TABLE public.round_participants
      ADD CONSTRAINT round_participants_draw_number_positive
      CHECK (draw_number IS NULL OR draw_number > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.round_participants'::regclass
       AND conname  = 'round_participants_performance_minutes_range'
  ) THEN
    ALTER TABLE public.round_participants
      ADD CONSTRAINT round_participants_performance_minutes_range
      CHECK (performance_minutes IS NULL OR performance_minutes BETWEEN 1 AND 240);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.round_participants'::regclass
       AND conname  = 'round_participants_round_draw_unique'
  ) THEN
    ALTER TABLE public.round_participants
      ADD CONSTRAINT round_participants_round_draw_unique
      UNIQUE (round_id, draw_number)
      DEFERRABLE INITIALLY IMMEDIATE;
  END IF;
END;
$$;

COMMENT ON COLUMN public.round_participants.draw_number IS
  'Position drawn for this round (KAN-11). NULL = not drawn yet; the schedule '
  'generator refuses to run while any participant of the round lacks one. '
  'Unique per round. Distinct from "order", which is insertion order.';

COMMENT ON COLUMN public.round_participants.performance_minutes IS
  'Length of this participant''s performance in this round, in minutes (KAN-11). '
  'NULL falls back to contests.performance_default_minutes.';

-- ────────────────────────────────────────────────────────────────────────────
-- set_round_draw: apply a whole draw in one statement
-- ────────────────────────────────────────────────────────────────────────────
-- p_rows: [{ "id": uuid, "draw_number": int|null, "performance_minutes": int|null }]
--
-- Called from `PUT /api/rounds/[id]/draw` on the admin client AFTER the
-- endpoint's org owner/member gate, which is why it is not callable by API
-- roles. The checks here are the ones that must hold whoever calls it.
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

  -- Every row must belong to this round. Otherwise a caller gated on one
  -- contest could renumber another contest's round by passing its ids.
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
       SET draw_number         = r.draw_number,
           performance_minutes = r.performance_minutes
      FROM jsonb_to_recordset(p_rows)
           AS r(id UUID, draw_number INTEGER, performance_minutes INTEGER)
     WHERE rp.id = r.id
       AND rp.round_id = p_round_id;
    GET DIAGNOSTICS v_updated = ROW_COUNT;
  EXCEPTION
    WHEN unique_violation THEN
      RAISE EXCEPTION 'duplicate_draw_number';
    WHEN check_violation THEN
      RAISE EXCEPTION 'invalid_draw_values';
  END;

  RETURN v_updated;
END;
$$;

REVOKE ALL ON FUNCTION public.set_round_draw(UUID, JSONB) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.set_round_draw(UUID, JSONB) IS
  'Sets draw_number and performance_minutes for rows of one round in a single '
  'statement, so numbers can be swapped (KAN-11). Rejects closed rounds and ids '
  'from other rounds. Admin client only, behind requireOrgOwnerOrMember.';
