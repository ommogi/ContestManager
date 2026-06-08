-- 0036_guard_judge_participant_conflict.sql
-- Prevent a user from being both judge and participant in the same contest.
-- Judges are assigned at the contest level (contest_members), so the check
-- applies across all categories.

-- Recreate enroll_participant with judge conflict guard
CREATE OR REPLACE FUNCTION public.enroll_participant(p_token text, p_category_id uuid, p_first_name text, p_last_name text, p_birthdate date, p_dni text, p_country text, p_email text, p_phone text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id UUID := auth.uid();
  v_contest_id UUID; v_org_id UUID; v_reg_open BOOLEAN;
  v_reg_starts TIMESTAMPTZ; v_cat RECORD; v_age INT; v_count BIGINT;
  v_org_tickets INT; v_participant_id UUID; v_dup INT;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'auth_required' USING ERRCODE = '28000'; END IF;
  SELECT id, organization_id, registration_open, starts_at
    INTO v_contest_id, v_org_id, v_reg_open, v_reg_starts
    FROM public.contests WHERE registration_token = p_token LIMIT 1;
  IF v_contest_id IS NULL THEN RAISE EXCEPTION 'contest_not_found'; END IF;
  IF NOT v_reg_open THEN RAISE EXCEPTION 'registration_closed'; END IF;

  -- Block if user is already a judge in this contest
  IF EXISTS (
    SELECT 1 FROM public.contest_members
     WHERE contest_id = v_contest_id
       AND user_id = v_user_id
       AND role = 'judge'
  ) THEN
    RAISE EXCEPTION 'user_is_judge_in_contest';
  END IF;

  SELECT COUNT(*) INTO v_dup FROM public.participants
   WHERE category_id = p_category_id AND status <> 'eliminated'
     AND (
       user_id = v_user_id
       OR (p_dni   IS NOT NULL AND p_dni   <> '' AND lower(dni)   = lower(p_dni))
       OR (p_email IS NOT NULL AND p_email <> '' AND lower(email) = lower(p_email))
     );
  IF v_dup > 0 THEN RAISE EXCEPTION 'already_enrolled_in_category'; END IF;

  SELECT ticket_balance INTO v_org_tickets FROM public.organizations WHERE id = v_org_id;
  IF v_org_tickets IS NULL OR v_org_tickets <= 0 THEN RAISE EXCEPTION 'insufficient_tickets'; END IF;
  SELECT * INTO v_cat FROM public.categories
   WHERE id = p_category_id AND contest_id = v_contest_id;
  IF v_cat IS NULL THEN RAISE EXCEPTION 'category_not_found'; END IF;
  v_age := date_part('year', age(COALESCE(v_reg_starts, now()), p_birthdate::timestamptz))::int;
  IF v_cat.min_age IS NOT NULL AND v_age < v_cat.min_age THEN RAISE EXCEPTION 'age_below_min'; END IF;
  IF v_cat.max_age IS NOT NULL AND v_age > v_cat.max_age THEN RAISE EXCEPTION 'age_above_max'; END IF;
  IF v_cat.max_participants IS NOT NULL THEN
    SELECT COUNT(*)::bigint INTO v_count FROM public.participants
     WHERE category_id = p_category_id AND status <> 'eliminated';
    IF v_count >= v_cat.max_participants THEN RAISE EXCEPTION 'category_full'; END IF;
  END IF;
  INSERT INTO public.participants(
    contest_id, category_id, user_id, name,
    first_name, last_name, birthdate, dni, country, email, phone, status
  ) VALUES (
    v_contest_id, p_category_id, v_user_id,
    TRIM(COALESCE(p_first_name,'') || ' ' || COALESCE(p_last_name,'')),
    p_first_name, p_last_name, p_birthdate, p_dni, p_country,
    p_email, p_phone, 'active'
  ) RETURNING id INTO v_participant_id;
  PERFORM public.consume_ticket(v_org_id, v_participant_id, v_contest_id, 'enrollment');
  RETURN v_participant_id;
END; $function$;

-- Recreate enroll_participant_paid with judge conflict guard
CREATE OR REPLACE FUNCTION public.enroll_participant_paid(p_user_id uuid, p_token text, p_category_id uuid, p_first_name text, p_last_name text, p_birthdate date, p_dni text, p_country text, p_email text, p_phone text, p_session_id text, p_payment_intent text, p_amount_cents integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_contest_id UUID; v_org_id UUID; v_reg_open BOOLEAN; v_reg_starts TIMESTAMPTZ;
  v_cat RECORD; v_age INT; v_count BIGINT;
  v_existing UUID; v_participant_id UUID; v_dup INT;
BEGIN
  SELECT id INTO v_existing FROM public.participants
   WHERE stripe_checkout_session_id = p_session_id LIMIT 1;
  IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;

  SELECT id, organization_id, registration_open, starts_at
    INTO v_contest_id, v_org_id, v_reg_open, v_reg_starts
    FROM public.contests WHERE registration_token = p_token LIMIT 1;
  IF v_contest_id IS NULL THEN RAISE EXCEPTION 'contest_not_found'; END IF;
  IF NOT v_reg_open THEN RAISE EXCEPTION 'registration_closed'; END IF;

  -- Block if user is already a judge in this contest
  IF p_user_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.contest_members
     WHERE contest_id = v_contest_id
       AND user_id = p_user_id
       AND role = 'judge'
  ) THEN
    RAISE EXCEPTION 'user_is_judge_in_contest';
  END IF;

  SELECT COUNT(*) INTO v_dup FROM public.participants
   WHERE category_id = p_category_id AND status <> 'eliminated'
     AND (
       (p_user_id IS NOT NULL AND user_id = p_user_id)
       OR (p_dni   IS NOT NULL AND p_dni   <> '' AND lower(dni)   = lower(p_dni))
       OR (p_email IS NOT NULL AND p_email <> '' AND lower(email) = lower(p_email))
     );
  IF v_dup > 0 THEN RAISE EXCEPTION 'already_enrolled_in_category'; END IF;

  SELECT * INTO v_cat FROM public.categories
   WHERE id = p_category_id AND contest_id = v_contest_id;
  IF v_cat IS NULL THEN RAISE EXCEPTION 'category_not_found'; END IF;

  v_age := date_part('year', age(COALESCE(v_reg_starts, now()), p_birthdate::timestamptz))::int;
  IF v_cat.min_age IS NOT NULL AND v_age < v_cat.min_age THEN RAISE EXCEPTION 'age_below_min'; END IF;
  IF v_cat.max_age IS NOT NULL AND v_age > v_cat.max_age THEN RAISE EXCEPTION 'age_above_max'; END IF;

  IF v_cat.max_participants IS NOT NULL THEN
    SELECT COUNT(*)::bigint INTO v_count FROM public.participants
     WHERE category_id = p_category_id AND status <> 'eliminated';
    IF v_count >= v_cat.max_participants THEN RAISE EXCEPTION 'category_full'; END IF;
  END IF;

  INSERT INTO public.participants(
    contest_id, category_id, user_id, name,
    first_name, last_name, birthdate, dni, country, email, phone, status,
    payment_status, stripe_checkout_session_id, stripe_payment_intent_id, amount_paid_cents
  ) VALUES (
    v_contest_id, p_category_id, p_user_id,
    TRIM(COALESCE(p_first_name,'') || ' ' || COALESCE(p_last_name,'')),
    p_first_name, p_last_name, p_birthdate, p_dni, p_country,
    p_email, p_phone, 'active',
    'paid', p_session_id, p_payment_intent, p_amount_cents
  ) RETURNING id INTO v_participant_id;

  RETURN v_participant_id;
END; $function$;
