-- 0063_revoke_rpc_execute.sql
-- Take the billing RPCs off the public internet.
--
-- Numbered 0063 because 0062 is taken: `0062_schedule_upload_purge`, which
-- schedules the upload purge with pg_cron (KAN-69), was applied to production
-- on 2026-09-18 12:47 and merged in PR #26 while this work was in progress.
-- Caught by reading the catalogue rather than a stale directory listing — the
-- number would otherwise have collided.
--
-- ── What was open ───────────────────────────────────────────────────────────
-- Supabase's own linter found what three hand-rolled sweeps had not: 34
-- SECURITY DEFINER functions were executable by the `anon` role, i.e. by anyone
-- on the internet holding the publishable key, via POST /rest/v1/rpc/<name>.
--
-- Confirmed in the catalogue rather than taken on trust —
-- has_function_privilege('anon', oid, 'EXECUTE') was true — and then proved
-- live: an anonymous POST to /rest/v1/rpc/credit_tickets with a non-existent
-- organization answered `org_not_found`. That is the function's own guard,
-- reached after the permission check. With a real organization id it would have
-- credited tickets. And a real id is trivial to obtain: the policy "Contests are
-- viewable by public if not draft" exposes contests.organization_id.
--
-- The exposed set included credit_tickets, credit_bundle, credit_activations,
-- consume_ticket, consume_activation, refund_ticket, bulk_enroll_csv,
-- enroll_participant, get_judge_pool and get_contest_members_with_avatar.
--
-- ── Why revoking is safe ────────────────────────────────────────────────────
-- There is not one `.rpc(` call in app/. All 31 live in server/ and go through
-- serverSupabaseAdmin(), i.e. service_role, which ignores grants entirely. These
-- privileges had no consumer; they were attack surface and nothing else.
--
-- Newer migrations already do this — confirm_inscription_uploads,
-- rotate_contest_member_invitation and sweep_rate_limit_buckets carry their own
-- REVOKE and were already closed. The pattern existed; it was never applied
-- backwards.
--
-- ── The two that must keep EXECUTE ──────────────────────────────────────────
-- A function called inside an RLS policy is evaluated with the querying role's
-- privileges, so revoking it would deny every query the policy guards.
--
--   is_contest_member      — used by 15 policies
--   is_contest_organizer   — used by 12
--
-- They are deliberately absent below. Revoking them would have broken reads
-- across most of the app, which is worse than the hole being closed.
--
-- Trigger functions are unaffected: Postgres checks EXECUTE when the trigger is
-- created, not when it fires. The cron job added by 0062 is unaffected too — it
-- runs as its own owner, not as anon.
--
-- The list below was generated from pg_proc at the time of writing, not typed
-- from memory: doing it by hand is how 0032 lost `refund_ticket`.

REVOKE EXECUTE ON FUNCTION public.backfill_contest_members_for_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bulk_enroll_csv(uuid,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.confirm_inscription_uploads(uuid,uuid,uuid,text[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.consume_activation(uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.consume_ticket(uuid,uuid,uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.credit_activations(uuid,integer,integer,text,text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.credit_bundle(uuid,text,text,text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.credit_tickets(uuid,integer,integer,text,text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enroll_participant(text,uuid,text,text,date,text,text,text,text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enroll_participant_paid(uuid,text,uuid,text,text,date,text,text,text,text,text,text,integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_categories_for_token(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_contest_by_token(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_contest_members_with_avatar(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_inscription_form_schema(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_judge_pool(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_public_categories_by_slug(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_public_contest_by_slug(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.grant_signup_bonus() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.invoke_inscription_upload_purge() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.link_contest_member_user_id() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_inscription_uploads_for_purge() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_contest_started() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_judge_assigned() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_judge_pool_invited() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_org_participant_added() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_org_participant_removed() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_participant_added() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_qualified() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_ranking_published() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_schedule_assigned() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rate_limit_hit(text,integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refund_ticket(uuid,uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rotate_contest_member_invitation(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rotate_judge_pool_invitation(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_judge_invitation_token() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_judge_pool_invitation_expiry() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sweep_orphan_inscription_uploads(integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sweep_rate_limit_buckets() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_judge_pool_invitation_responded_at() FROM PUBLIC, anon, authenticated;

-- ── Also, what the linter caught and my own sweep did not ───────────────────
-- Yesterday's sweep filtered on `prosecdef`, so it only ever looked at SECURITY
-- DEFINER functions. "41 of 41 correct" was true of that set and of no wider
-- one. The linter checks every function and flags five more with a mutable
-- search_path. They are SECURITY INVOKER, so they run with the caller's rights
-- and the exposure is far smaller — but one of them,
-- block_round_start_if_contest_not_active, I applied myself in 0041 two days ago
-- without one.
ALTER FUNCTION public.get_plan_bundles()                              SET search_path = public, pg_temp;
ALTER FUNCTION public._participants_backfill_name()                   SET search_path = public, pg_temp;
ALTER FUNCTION public.validate_form_response(jsonb, jsonb)            SET search_path = public, pg_temp;
ALTER FUNCTION public.update_inscription_form_schema_updated_at()     SET search_path = public, pg_temp;
ALTER FUNCTION public.block_round_start_if_contest_not_active()       SET search_path = public, pg_temp;
