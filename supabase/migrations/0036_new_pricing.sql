-- 0033_new_pricing.sql
-- Actualización de precios:
--   Tickets sueltos: 1€ (antes 3€)
--   Activaciones sueltas: 50€ (antes 100€)
--   Starter: 89€ (antes 195€)
--   Pro: 289€ (antes 460€)
--   Enterprise: 1099€ (antes 1200€)

CREATE OR REPLACE FUNCTION public.get_plan_bundles()
RETURNS TABLE (
  plan         TEXT,
  tickets      INT,
  activations  INT,
  price_cents  INT
) LANGUAGE sql IMMUTABLE AS $$
  SELECT 'starter'::TEXT,    50,  1,  8900
  UNION ALL SELECT 'pro',       200, 3,  28900
  UNION ALL SELECT 'enterprise',1000,10, 109900;
$$;
