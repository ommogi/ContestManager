-- 0065_round_session_window.sql
-- The time window of a round's session and the call offset of a contest
-- (KAN-12). Inputs for the schedule generator (KAN-13).
--
-- ── Where each one lives ────────────────────────────────────────────────────
-- The call offset ("be here 120 minutes before you play") is one rule for the
-- whole contest, so it sits on `contests`. The window is per ROUND: a contest
-- runs over several days and rounds do not share a timetable, so a single
-- contest-wide window could not describe it.
--
-- ── DATE / TIME, not TEXT ───────────────────────────────────────────────────
-- CLAUDE.md keeps `rehearsal_time` / `performance_time` as TEXT datetime-local
-- strings, and those are untouched: contests that do not use the generator keep
-- editing them by hand exactly as before. These new columns are typed so the
-- database itself can refuse a window that ends before it starts.
--
-- Everything is nullable: an unset window or offset means "not using the
-- generator", which is every contest today.
--
-- Re-runnable: IF NOT EXISTS, and constraints added only when absent.

ALTER TABLE public.contests
  ADD COLUMN IF NOT EXISTS call_offset_minutes INTEGER;

ALTER TABLE public.rounds
  ADD COLUMN IF NOT EXISTS session_date  DATE,
  ADD COLUMN IF NOT EXISTS session_start TIME,
  ADD COLUMN IF NOT EXISTS session_end   TIME;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.contests'::regclass
       AND conname  = 'contests_call_offset_minutes_range'
  ) THEN
    ALTER TABLE public.contests
      ADD CONSTRAINT contests_call_offset_minutes_range
      CHECK (call_offset_minutes IS NULL OR call_offset_minutes BETWEEN 0 AND 720);
  END IF;

  -- Only compared when both ends are set: saving the start before the end is a
  -- normal way to fill the form.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.rounds'::regclass
       AND conname  = 'rounds_session_window_order'
  ) THEN
    ALTER TABLE public.rounds
      ADD CONSTRAINT rounds_session_window_order
      CHECK (session_start IS NULL OR session_end IS NULL OR session_end > session_start);
  END IF;
END;
$$;

COMMENT ON COLUMN public.contests.call_offset_minutes IS
  'Minutes before their performance that a participant is called (KAN-12). One '
  'value for the whole contest. NULL = the contest does not use call times.';

COMMENT ON COLUMN public.rounds.session_date IS
  'Day the round is held (KAN-12). With session_start/session_end, the window '
  'the schedule generator fills. NULL = not using the generator.';

COMMENT ON COLUMN public.rounds.session_start IS
  'Start of the round''s session window (KAN-12). Local time, no zone.';

COMMENT ON COLUMN public.rounds.session_end IS
  'End of the round''s session window (KAN-12). Must be after session_start. '
  'Sessions past midnight are not supported.';
