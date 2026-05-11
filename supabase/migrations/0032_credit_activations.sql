-- 0032_credit_activations.sql
-- À la carte activation top-up. Called from Stripe webhook on
-- successful checkout sessions whose metadata.type = 'activations'.

-- Allow 'purchase_activations' as billing reason
ALTER TABLE public.billing_transactions DROP CONSTRAINT billing_transactions_reason_check;
ALTER TABLE public.billing_transactions ADD CONSTRAINT billing_transactions_reason_check
  CHECK (reason = ANY (ARRAY[
    'purchase_bundle',
    'purchase_tickets',
    'purchase_activations',
    'signup_bonus',
    'enrollment',
    'csv_import',
    'manual_add',
    'contest_activation',
    'admin_adjust'
  ]));

CREATE OR REPLACE FUNCTION public.credit_activations(
  p_org_id            UUID,
  p_quantity          INT,
  p_price_cents       INT,
  p_stripe_session_id TEXT,
  p_stripe_event_id   TEXT
) RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_new_balance INT;
BEGIN
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'invalid_quantity';
  END IF;

  -- Idempotency
  IF EXISTS (SELECT 1 FROM public.billing_transactions WHERE stripe_event_id = p_stripe_event_id) THEN
    SELECT activation_balance INTO v_new_balance FROM public.organizations WHERE id = p_org_id;
    RETURN v_new_balance;
  END IF;

  UPDATE public.organizations
     SET activation_balance = activation_balance + p_quantity
   WHERE id = p_org_id
   RETURNING activation_balance INTO v_new_balance;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'org_not_found';
  END IF;

  INSERT INTO public.billing_transactions
    (organization_id, entity, delta, reason, plan, amount_cents, stripe_session_id, stripe_event_id, balance_after)
  VALUES
    (p_org_id, 'activation', p_quantity, 'purchase_activations', NULL, p_price_cents, p_stripe_session_id, p_stripe_event_id, v_new_balance);

  RETURN v_new_balance;
END;
$$;
