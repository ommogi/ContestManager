-- 0031_contest_durations_and_rp_end_times.sql
-- Default rehearsal/performance duration (minutes) at contest level.
-- Used by the scheduling UI to auto-fill end-time when a start-time is set.
-- End times stored on round_participants alongside the existing start times.
ALTER TABLE public.contests
  ADD COLUMN IF NOT EXISTS rehearsal_default_minutes   INT,
  ADD COLUMN IF NOT EXISTS performance_default_minutes INT;

ALTER TABLE public.round_participants
  ADD COLUMN IF NOT EXISTS rehearsal_end_time   TEXT,
  ADD COLUMN IF NOT EXISTS performance_end_time TEXT;
