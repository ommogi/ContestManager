-- 0028_participants_payment_status_partial_refund.sql
-- Allow 'partial_refund' as a valid payment_status. Refund endpoints + Stripe
-- webhook write this value when only a portion of the charge is refunded.
ALTER TABLE public.participants DROP CONSTRAINT participants_payment_status_check;
ALTER TABLE public.participants ADD CONSTRAINT participants_payment_status_check
  CHECK (payment_status = ANY (ARRAY['free','pending','paid','refunded','partial_refund']));
