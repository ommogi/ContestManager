-- 0038_updated_bundle_pricing.sql
-- Descuentos uniformes sobre tickets y activaciones:
--   Starter:    10% off → €90   (era €89)
--   Pro:        20% off → €280  (era €289)
--   Enterprise: 30% off → €1050 (era €1099)

CREATE OR REPLACE FUNCTION public.get_plan_bundles()
RETURNS TABLE (plan TEXT, tickets INT, activations INT, price_cents INT)
LANGUAGE sql IMMUTABLE AS $$
  SELECT 'starter'::TEXT,     50,    1,   9000
  UNION ALL SELECT 'pro',        200,   3,  28000
  UNION ALL SELECT 'enterprise', 1000, 10, 105000;
$$;
