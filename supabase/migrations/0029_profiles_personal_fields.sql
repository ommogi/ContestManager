-- 0029_profiles_personal_fields.sql
-- Store reusable personal data on the user profile so the inscription form
-- can pre-fill these fields by default.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS first_name TEXT,
  ADD COLUMN IF NOT EXISTS last_name  TEXT,
  ADD COLUMN IF NOT EXISTS dni        TEXT,
  ADD COLUMN IF NOT EXISTS country    TEXT,
  ADD COLUMN IF NOT EXISTS phone      TEXT,
  ADD COLUMN IF NOT EXISTS birthdate  DATE;
