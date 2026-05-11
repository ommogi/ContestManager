-- 0034_join_rpc_add_settings.sql
-- Update public RPCs to return settings (for rules/reglamento) and payment fields

-- 1. get_contest_by_token — used by /join/[token]
CREATE OR REPLACE FUNCTION public.get_contest_by_token(p_token TEXT)
RETURNS TABLE (
  id UUID,
  slug TEXT,
  name TEXT,
  description TEXT,
  cover_image_url TEXT,
  type TEXT,
  status TEXT,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  registration_open BOOLEAN,
  entry_fee_cents INTEGER,
  org_charges_enabled BOOLEAN,
  settings JSONB
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id, c.slug, c.name, c.description, c.cover_image_url,
         c.type::text, c.status::text,
         c.starts_at, c.ends_at, c.registration_open,
         COALESCE(c.entry_fee_cents, 0),
         COALESCE(o.stripe_charges_enabled, false),
         c.settings
    FROM public.contests c
    JOIN public.organizations o ON o.id = c.organization_id
   WHERE c.registration_token = p_token
   LIMIT 1;
$$;

-- 2. get_public_contest_by_slug — used by /c/[slug]
CREATE OR REPLACE FUNCTION public.get_public_contest_by_slug(p_slug TEXT)
RETURNS TABLE (
  id UUID, slug TEXT, name TEXT, description TEXT, cover_image_url TEXT,
  type TEXT, status TEXT, starts_at TIMESTAMPTZ, ends_at TIMESTAMPTZ,
  registration_open BOOLEAN, registration_token TEXT,
  entry_fee_cents INTEGER, org_name TEXT, org_slug TEXT,
  org_charges_enabled BOOLEAN, settings JSONB
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id, c.slug, c.name, c.description, c.cover_image_url,
         c.type::text, c.status::text,
         c.starts_at, c.ends_at, c.registration_open, c.registration_token,
         COALESCE(c.entry_fee_cents, 0),
         o.name, o.slug,
         COALESCE(o.stripe_charges_enabled, false),
         c.settings
    FROM public.contests c
    JOIN public.organizations o ON o.id = c.organization_id
   WHERE c.slug = p_slug
     AND c.status IN ('active','finished')
   LIMIT 1;
$$;
