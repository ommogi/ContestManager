-- 0040_add_missing_indexes.sql
-- Critical indexes for performance and to avoid sequential scans on hot paths.

CREATE INDEX IF NOT EXISTS contests_registration_token_idx ON public.contests(registration_token);
CREATE INDEX IF NOT EXISTS participants_payment_intent_idx ON public.participants(stripe_payment_intent_id);
CREATE INDEX IF NOT EXISTS participants_contest_status_idx ON public.participants(contest_id, status) WHERE status <> 'eliminated';
CREATE INDEX IF NOT EXISTS participants_category_status_idx ON public.participants(category_id, status) WHERE status <> 'eliminated';
CREATE INDEX IF NOT EXISTS categories_contest_id_idx ON public.categories(contest_id);
CREATE INDEX IF NOT EXISTS organizations_owner_id_idx ON public.organizations(owner_id);
CREATE INDEX IF NOT EXISTS contest_members_contest_user_idx ON public.contest_members(contest_id, user_id);
CREATE INDEX IF NOT EXISTS rounds_category_id_idx ON public.rounds(category_id);
CREATE INDEX IF NOT EXISTS round_participants_round_id_idx ON public.round_participants(round_id);
CREATE INDEX IF NOT EXISTS round_participants_participant_id_idx ON public.round_participants(participant_id);
CREATE INDEX IF NOT EXISTS processed_stripe_events_event_id_idx ON public.processed_stripe_events(stripe_event_id);
