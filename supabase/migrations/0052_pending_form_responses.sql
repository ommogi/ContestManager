-- 0052_pending_form_responses.sql
-- Staging area for inscription form answers that have to survive the round
-- trip through Stripe Checkout (KAN-49).
--
-- Why a table instead of `metadata`:
--   A Checkout Session's `metadata` accepts 50 keys, 40-character keys and
--   500-character *values*. The enrollment flow already spends 13 keys, and a
--   single `textarea` answer passes 500 characters on its own, so Stripe would
--   reject the session outright. Splitting the JSON across several keys was
--   considered and rejected: the cap is still hard, and reassembling chunks in
--   the webhook is fragile.
--
--   So the answers are written here *before* the session is created and only
--   an opaque row id travels in `metadata.form_draft_id`. The webhook resolves
--   it and copies the answers into `participant_form_responses` once the
--   payment is confirmed.
--
-- Rows are disposable drafts: nothing downstream reads them after the webhook
-- has run, and `consumed_at` exists purely so an abandoned checkout is
-- distinguishable from a paid one when auditing or pruning.

CREATE TABLE IF NOT EXISTS public.pending_form_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contest_id UUID NOT NULL REFERENCES public.contests(id) ON DELETE CASCADE,
  -- CASCADE, unlike participant_form_responses.form_schema_id which is
  -- RESTRICT: a draft carries no record worth protecting.
  form_schema_id UUID NOT NULL REFERENCES public.inscription_form_schemas(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  responses_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  consumed_at TIMESTAMPTZ
);

-- Supports pruning abandoned drafts by age.
CREATE INDEX IF NOT EXISTS pending_form_responses_created_at_idx
  ON public.pending_form_responses(created_at)
  WHERE consumed_at IS NULL;

-- Only the server touches this table: the checkout handler writes, the Stripe
-- webhook reads. No end user ever selects from it, so RLS is on with a
-- service_role-only policy and no anon/authenticated policy at all — an
-- authenticated user reaching for someone else's draft id gets nothing back.
ALTER TABLE public.pending_form_responses ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'pending_form_responses'
       AND policyname = 'Service role can manage pending_form_responses'
  ) THEN
    CREATE POLICY "Service role can manage pending_form_responses"
      ON public.pending_form_responses
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

COMMENT ON TABLE public.pending_form_responses IS
  'Inscription form answers parked between checkout creation and the Stripe webhook (KAN-49). Referenced from Checkout Session metadata.form_draft_id.';
