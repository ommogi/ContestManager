-- Block activating a round if the parent contest is not active.
-- This acts as a final defense even if the API layer is bypassed.

CREATE OR REPLACE FUNCTION public.block_round_start_if_contest_not_active()
RETURNS TRIGGER AS $$
DECLARE
  v_contest_status public.contest_status;
BEGIN
  -- Only enforce when the round is being activated (status -> 'active')
  IF NEW.status = 'active' THEN
    SELECT c.status INTO v_contest_status
    FROM public.contests c
    JOIN public.categories cat ON cat.contest_id = c.id
    WHERE cat.id = NEW.category_id;

    IF v_contest_status IS DISTINCT FROM 'active' THEN
      RAISE EXCEPTION 'contest_not_active' USING
        MESSAGE = 'El concurso debe estar activo para iniciar una ronda',
        HINT    = 'Activa el concurso antes de iniciar la ronda.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_block_round_start_if_contest_not_active ON public.rounds;
CREATE TRIGGER trg_block_round_start_if_contest_not_active
  BEFORE INSERT OR UPDATE ON public.rounds
  FOR EACH ROW
  EXECUTE FUNCTION public.block_round_start_if_contest_not_active();
