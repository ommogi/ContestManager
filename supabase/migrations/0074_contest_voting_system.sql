-- 0074_contest_voting_system.sql
-- How the jury scores a contest (KAN-23).
--
-- Numeric is a mark per performance; binary is pass / no pass, with nothing in
-- between. The choice belongs to the contest, not to each round: the jury
-- should not be handed one interface in the semifinal and another in the final.
--
-- `rounds.scoring_type` (enum since 0001) keeps being what the scoring screens
-- read. A round of a binary contest is created with 'vote'; of a numeric one,
-- with 'numeric'. That mapping lives in shared/voting.ts.
--
-- The default leaves every existing contest numeric without touching a row,
-- which is what the ticket asks for.
--
-- Re-runnable: IF NOT EXISTS, and the constraint is added only when absent.

ALTER TABLE public.contests
  ADD COLUMN IF NOT EXISTS voting_system TEXT NOT NULL DEFAULT 'numeric';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.contests'::regclass
       AND conname  = 'contests_voting_system_supported'
  ) THEN
    ALTER TABLE public.contests
      ADD CONSTRAINT contests_voting_system_supported
      CHECK (voting_system IN ('numeric', 'binary'));
  END IF;
END;
$$;

COMMENT ON COLUMN public.contests.voting_system IS
  'How the jury scores this contest (KAN-23): ''numeric'' (a mark) or '
  '''binary'' (pass / no pass). New rounds take their scoring_type from it. '
  'Locked once any score exists: changing it would reinterpret votes already cast.';
