-- REPAIRED (KAN-61). This migration never applied: it used
-- `CREATE POLICY IF NOT EXISTS`, which Postgres does not accept, and the
-- statement took its whole transaction down with it. Production shows the
-- damage — `organizations.logo_url` exists but `onboarding_done` and the
-- `org_logos` bucket do not, so the file stopped partway and no one noticed.
-- Every policy below is now DROP-then-CREATE, which is re-runnable.
-- What production is still missing is applied by 0055.

-- 0033_onboarding_org_fields.sql
-- Add contact fields to organizations for onboarding
-- Add storage bucket for organization logos

-- ────────────────────────────────────────────────────────────
-- 1. Add contact fields to organizations table
-- ────────────────────────────────────────────────────────────

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS contact_phone TEXT,
  ADD COLUMN IF NOT EXISTS contact_country TEXT;

-- ────────────────────────────────────────────────────────────
-- 2. Create storage bucket for organization logos
-- ────────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public)
VALUES ('org_logos', 'org_logos', true)
ON CONFLICT (id) DO NOTHING;

-- ────────────────────────────────────────────────────────────
-- 3. Storage policies for org_logos bucket
-- ────────────────────────────────────────────────────────────

-- Allow authenticated users to upload to org_logos
DROP POLICY IF EXISTS "org_logos: authenticated upload" ON storage.objects;
CREATE POLICY "org_logos: authenticated upload"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'org_logos');

-- Allow public read (for displaying logos)
DROP POLICY IF EXISTS "org_logos: public read" ON storage.objects;
CREATE POLICY "org_logos: public read"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'org_logos');

-- Allow org owners to update/delete their own logos
DROP POLICY IF EXISTS "org_logos: owner update/delete" ON storage.objects;
CREATE POLICY "org_logos: owner update/delete"
  ON storage.objects FOR ALL
  TO authenticated
  USING (
    bucket_id = 'org_logos' AND
    EXISTS (
      SELECT 1 FROM public.organizations o
      WHERE o.owner_id = auth.uid()
      AND storage.objects.name LIKE CONCAT(o.id, '%')
    )
  )
  WITH CHECK (
    bucket_id = 'org_logos' AND
    EXISTS (
      SELECT 1 FROM public.organizations o
      WHERE o.owner_id = auth.uid()
      AND storage.objects.name LIKE CONCAT(o.id, '%')
    )
  );
