-- 0061_pin_search_path_security_definer.sql
-- Pin `search_path` on the sixteen SECURITY DEFINER functions that lacked it.
--
-- ── Why half a setting is no protection ─────────────────────────────────────
-- A SECURITY DEFINER function runs with its owner's rights, so whatever its body
-- resolves must not be something a caller can substitute. Rule 7 of
-- docs/database.md exists for that; these sixteen escaped it in two ways.
--
-- Two had no `search_path` at all. The other fourteen had `SET search_path =
-- public`, which looks fine and is not: when `pg_temp` is NOT listed, Postgres
-- searches it FIRST — ahead of `public` and `pg_catalog`. Naming it explicitly
-- at the end is what pushes it last and closes the substitution.
--
-- The concrete case, and the reason this is not a style fix:
-- `notify_judge_pool_invited()` had no search_path and inserts into an
-- UNQUALIFIED `notifications`. A `pg_temp.notifications` created by anyone able
-- to trigger a judge-pool invitation would have captured that INSERT, executed
-- as the function owner.
--
-- Among the fourteen sit every money path: consume_ticket, credit_tickets,
-- credit_bundle, consume_activation, refund_ticket, enroll_participant_paid and
-- bulk_enroll_csv.
--
-- ── ALTER FUNCTION, deliberately, and never CREATE OR REPLACE ───────────────
-- `ALTER FUNCTION … SET` changes the configuration and nothing else. Rewriting
-- these with CREATE OR REPLACE from the repo's own files would overwrite the
-- DEPLOYED body with the repo's, and in this project those differ:
-- `get_contest_by_token` is the documented case — the repo file filters
-- `status IN ('active','finished')` and production does not — and it is in this
-- very list. A migration that says it is about search_path must not quietly
-- change behaviour on the way through.
--
-- For the fourteen, `public` is preserved and `pg_temp` appended, so resolution
-- order for `public` is untouched and the behavioural risk is nil.

-- ── No search_path at all ───────────────────────────────────────────────────
ALTER FUNCTION public.notify_judge_pool_invited()                      SET search_path = public, pg_temp;
ALTER FUNCTION public.update_judge_pool_invitation_responded_at()      SET search_path = public, pg_temp;

-- ── Had `public`, missing `pg_temp` ─────────────────────────────────────────
ALTER FUNCTION public.bulk_enroll_csv(uuid, jsonb)                     SET search_path = public, pg_temp;
ALTER FUNCTION public.consume_activation(uuid, uuid)                   SET search_path = public, pg_temp;
ALTER FUNCTION public.consume_ticket(uuid, uuid, uuid, text)           SET search_path = public, pg_temp;
ALTER FUNCTION public.credit_bundle(uuid, text, text, text)            SET search_path = public, pg_temp;
ALTER FUNCTION public.credit_tickets(uuid, integer, integer, text, text) SET search_path = public, pg_temp;
ALTER FUNCTION public.enroll_participant(text, uuid, text, text, date, text, text, text, text)
                                                                       SET search_path = public, pg_temp;
ALTER FUNCTION public.enroll_participant_paid(uuid, text, uuid, text, text, date, text, text, text, text, text, text, integer)
                                                                       SET search_path = public, pg_temp;
ALTER FUNCTION public.get_categories_for_token(text)                   SET search_path = public, pg_temp;
ALTER FUNCTION public.get_contest_by_token(text)                       SET search_path = public, pg_temp;
ALTER FUNCTION public.get_public_categories_by_slug(text)              SET search_path = public, pg_temp;
ALTER FUNCTION public.get_public_contest_by_slug(text)                 SET search_path = public, pg_temp;
ALTER FUNCTION public.grant_signup_bonus()                             SET search_path = public, pg_temp;
ALTER FUNCTION public.handle_new_user()                                SET search_path = public, pg_temp;
ALTER FUNCTION public.refund_ticket(uuid, uuid, uuid)                  SET search_path = public, pg_temp;

-- Re-runnable: ALTER … SET is idempotent, and the twenty-five functions that
-- already carried `public, pg_temp` are deliberately not listed.
