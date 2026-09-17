-- 0046_add_missing_indexes.sql
-- Critical indexes for performance and to avoid sequential scans on hot paths.
--
-- PRUNED before applying (2026-09-17). The file declared eleven indexes; four
-- of them already exist in production under a different name, so creating them
-- would have added a second copy of the same btree — write amplification and
-- storage for nothing. Checked by DEFINITION, not by name, which is the whole
-- lesson of this drift:
--
--   contests_registration_token_idx      → contests_registration_token_key
--   participants_payment_intent_idx      → participants_pi_idx
--   contest_members_contest_user_idx     → contest_members_contest_id_user_id_key
--   processed_stripe_events_event_id_idx → processed_stripe_events_pkey
--
-- Worth recording: docs/database.md cited the first two as the evidence that
-- this migration was missing. The NAMES were missing; the capability was not.
-- The inventory compared names where it had to compare definitions.
--
-- `rounds_category_id_idx` is KEPT even though two indexes on rounds(category_id)
-- exist: both are PARTIAL (`WHERE is_final` and `WHERE is_ranking`), so neither
-- serves a general lookup by category_id. A looser check would have pruned it
-- by mistake.

CREATE INDEX IF NOT EXISTS participants_contest_status_idx ON public.participants(contest_id, status) WHERE status <> 'eliminated';
CREATE INDEX IF NOT EXISTS participants_category_status_idx ON public.participants(category_id, status) WHERE status <> 'eliminated';
CREATE INDEX IF NOT EXISTS categories_contest_id_idx ON public.categories(contest_id);
CREATE INDEX IF NOT EXISTS organizations_owner_id_idx ON public.organizations(owner_id);
CREATE INDEX IF NOT EXISTS rounds_category_id_idx ON public.rounds(category_id);
CREATE INDEX IF NOT EXISTS round_participants_round_id_idx ON public.round_participants(round_id);
CREATE INDEX IF NOT EXISTS round_participants_participant_id_idx ON public.round_participants(participant_id);
