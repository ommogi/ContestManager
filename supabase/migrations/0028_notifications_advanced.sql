-- 0028_notifications_advanced.sql
-- REPAIRED before applying (2026-09-17). The four trigger functions below were
-- SECURITY DEFINER with no `SET search_path`, which rule 5 of docs/database.md
-- forbids for exactly one reason: a SECURITY DEFINER function runs with the
-- owner's rights, so an unpinned search_path lets anyone who can create objects
-- in a schema on that path shadow a name the body resolves and have it executed
-- as the owner. They now pin `public, pg_temp`, matching 0038 and 0040.
--
-- Nothing else changed. Verified against production before applying: the
-- `notifications` table exists, its columns cover the INSERT
-- (user_id, type, title, body, payload), and there is NO CHECK constraint on
-- `notifications.type` that would reject the new values — which is the trap
-- 0032 had and this one does not.

-- 0028_notifications_advanced.sql
-- In-app notification triggers for: schedule assigned, promoted/not_promoted,
-- contest started, ranking published.

-- ─── 1. Schedule assigned (performance_time or rehearsal_time first set) ─────
CREATE OR REPLACE FUNCTION public.notify_schedule_assigned()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_user_id      UUID;
  v_round_name   TEXT;
  v_contest_name TEXT;
  v_contest_slug TEXT;
  v_type         TEXT;
  v_title        TEXT;
  v_body         TEXT;
  v_time_val     TEXT;
BEGIN
  IF NEW.performance_time IS NOT NULL AND OLD.performance_time IS NULL THEN
    v_type     := 'performance_assigned';
    v_time_val := NEW.performance_time;
    v_title    := 'Actuación programada';
  ELSIF NEW.rehearsal_time IS NOT NULL AND OLD.rehearsal_time IS NULL THEN
    v_type     := 'rehearsal_assigned';
    v_time_val := NEW.rehearsal_time;
    v_title    := 'Ensayo programado';
  ELSE
    RETURN NEW;
  END IF;

  SELECT p.user_id INTO v_user_id
    FROM participants p WHERE p.id = NEW.participant_id;
  IF v_user_id IS NULL THEN RETURN NEW; END IF;

  SELECT r.name, c.name, c.slug
    INTO v_round_name, v_contest_name, v_contest_slug
    FROM rounds r
    JOIN categories cat ON cat.id = r.category_id
    JOIN contests c     ON c.id   = cat.contest_id
   WHERE r.id = NEW.round_id;

  IF v_type = 'performance_assigned' THEN
    v_body := 'Tu actuación en "' || COALESCE(v_round_name,'') || '" ('
           || COALESCE(v_contest_name,'') || ') ha sido programada para las '
           || v_time_val || '.';
  ELSE
    v_body := 'Tu ensayo en "' || COALESCE(v_round_name,'') || '" ('
           || COALESCE(v_contest_name,'') || ') ha sido programado para las '
           || v_time_val || '.';
  END IF;

  INSERT INTO public.notifications (user_id, type, title, body, payload)
  VALUES (
    v_user_id, v_type, v_title, v_body,
    jsonb_build_object(
      'round_id',              NEW.round_id,
      'round_name',            v_round_name,
      'contest_name',          v_contest_name,
      'contest_slug',          v_contest_slug,
      'performance_time',      NEW.performance_time,
      'rehearsal_time',        NEW.rehearsal_time,
      'rehearsal_room',        NEW.rehearsal_room,
      'rehearsal_accompanist', NEW.rehearsal_accompanist
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_schedule_assigned ON public.round_participants;
CREATE TRIGGER trg_notify_schedule_assigned
  AFTER UPDATE ON public.round_participants
  FOR EACH ROW EXECUTE FUNCTION public.notify_schedule_assigned();

-- ─── 2. Promoted / Not promoted (is_qualified changes) ────────────────────────
CREATE OR REPLACE FUNCTION public.notify_qualified()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_user_id      UUID;
  v_round_name   TEXT;
  v_contest_name TEXT;
  v_contest_slug TEXT;
  v_is_final     BOOLEAN;
BEGIN
  IF NEW.is_qualified IS NOT DISTINCT FROM OLD.is_qualified THEN RETURN NEW; END IF;
  IF NEW.is_qualified IS NULL THEN RETURN NEW; END IF;

  SELECT p.user_id INTO v_user_id
    FROM participants p WHERE p.id = NEW.participant_id;
  IF v_user_id IS NULL THEN RETURN NEW; END IF;

  SELECT r.name, r.is_final, c.name, c.slug
    INTO v_round_name, v_is_final, v_contest_name, v_contest_slug
    FROM rounds r
    JOIN categories cat ON cat.id = r.category_id
    JOIN contests c     ON c.id   = cat.contest_id
   WHERE r.id = NEW.round_id;

  IF NEW.is_qualified THEN
    INSERT INTO public.notifications (user_id, type, title, body, payload)
    VALUES (
      v_user_id, 'promoted',
      '¡Has pasado a la siguiente ronda!',
      'Has sido clasificado en "' || COALESCE(v_round_name,'') || '" del concurso "'
        || COALESCE(v_contest_name,'') || '".',
      jsonb_build_object(
        'round_id',    NEW.round_id,
        'round_name',  v_round_name,
        'contest_name',v_contest_name,
        'contest_slug',v_contest_slug,
        'is_final',    v_is_final
      )
    );
  ELSE
    INSERT INTO public.notifications (user_id, type, title, body, payload)
    VALUES (
      v_user_id, 'not_promoted',
      'No has pasado a la siguiente ronda',
      'No has sido clasificado en "' || COALESCE(v_round_name,'') || '" del concurso "'
        || COALESCE(v_contest_name,'') || '".',
      jsonb_build_object(
        'round_id',    NEW.round_id,
        'round_name',  v_round_name,
        'contest_name',v_contest_name,
        'contest_slug',v_contest_slug
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_qualified ON public.round_participants;
CREATE TRIGGER trg_notify_qualified
  AFTER UPDATE ON public.round_participants
  FOR EACH ROW EXECUTE FUNCTION public.notify_qualified();

-- ─── 3. Contest started (status → 'active') ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_contest_started()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.status = 'active' AND OLD.status <> 'active' THEN
    INSERT INTO public.notifications (user_id, type, title, body, payload)
    SELECT DISTINCT p.user_id,
           'contest_started',
           '¡El concurso ha comenzado!',
           'El concurso "' || NEW.name || '" ya está activo. ¡Mucha suerte!',
           jsonb_build_object(
             'contest_id',   NEW.id,
             'contest_name', NEW.name,
             'contest_slug', NEW.slug
           )
      FROM participants p
     WHERE p.contest_id = NEW.id
       AND p.user_id IS NOT NULL
       AND p.status = 'active';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_contest_started ON public.contests;
CREATE TRIGGER trg_notify_contest_started
  AFTER UPDATE ON public.contests
  FOR EACH ROW EXECUTE FUNCTION public.notify_contest_started();

-- ─── 4. Ranking published (is_published → true on a is_ranking round) ─────────
CREATE OR REPLACE FUNCTION public.notify_ranking_published()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_contest_name  TEXT;
  v_contest_slug  TEXT;
  v_category_name TEXT;
BEGIN
  IF NEW.is_published AND NOT OLD.is_published AND NEW.is_ranking THEN
    SELECT c.name, c.slug, cat.name
      INTO v_contest_name, v_contest_slug, v_category_name
      FROM categories cat
      JOIN contests c ON c.id = cat.contest_id
     WHERE cat.id = NEW.category_id;

    INSERT INTO public.notifications (user_id, type, title, body, payload)
    SELECT DISTINCT p.user_id,
           'ranking_published',
           'Clasificación publicada',
           'La clasificación de "' || COALESCE(v_category_name,'') || '" en "'
             || COALESCE(v_contest_name,'') || '" ya está disponible.',
           jsonb_build_object(
             'round_id',     NEW.id,
             'contest_name', v_contest_name,
             'contest_slug', v_contest_slug,
             'category_name',v_category_name
           )
      FROM participants p
     WHERE p.category_id = NEW.category_id
       AND p.user_id IS NOT NULL
       AND p.status = 'active';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_ranking_published ON public.rounds;
CREATE TRIGGER trg_notify_ranking_published
  AFTER UPDATE ON public.rounds
  FOR EACH ROW EXECUTE FUNCTION public.notify_ranking_published();
