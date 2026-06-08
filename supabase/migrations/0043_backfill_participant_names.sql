-- 0037_backfill_participant_names.sql
-- Fill empty participant names from first_name + last_name.
-- Also add a trigger so name is always regenerated on update.

-- 1. Backfill existing rows where name is null/empty but first/last exist
UPDATE public.participants
SET name = TRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, ''))
WHERE (name IS NULL OR name = '')
  AND (first_name IS NOT NULL OR last_name IS NOT NULL);

-- 2. Trigger: regenerate name on insert/update when first_name or last_name change
CREATE OR REPLACE FUNCTION public._participants_backfill_name()
RETURNS TRIGGER LANGUAGE plpgsql AS $fn$
BEGIN
  IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN
    IF NEW.first_name IS DISTINCT FROM OLD.first_name
       OR NEW.last_name IS DISTINCT FROM OLD.last_name
       OR NEW.name IS NULL OR NEW.name = '' THEN
      NEW.name := TRIM(COALESCE(NEW.first_name, '') || ' ' || COALESCE(NEW.last_name, ''));
      IF NEW.name = '' THEN NEW.name := NULL; END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS _participants_backfill_name ON public.participants;
CREATE TRIGGER _participants_backfill_name
  BEFORE INSERT OR UPDATE ON public.participants
  FOR EACH ROW EXECUTE FUNCTION public._participants_backfill_name();
