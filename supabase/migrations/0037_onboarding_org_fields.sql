-- REPAIRED (KAN-61). This migration never applied: it used
-- `CREATE POLICY IF NOT EXISTS`, which Postgres does not accept, and the
-- statement took its whole transaction down with it. Production shows the
-- damage — `organizations.logo_url` exists but `onboarding_done` and the
-- `org_logos` bucket do not, so the file stopped partway and no one noticed.
-- Every policy below is now DROP-then-CREATE, which is re-runnable.
-- What production is still missing is applied by 0055.

-- 0037_onboarding_org_fields.sql
-- Add contact fields to organizations for onboarding
-- Add storage bucket for organization logos
--
-- ⚠️ KNOWN MISMATCH, left as-is on purpose (2026-09-17). The owner policy below
-- matches objects whose name starts with the organization id, but the app
-- uploads to `onboarding/<timestamp>-<random>.<ext>` — no org prefix — so it
-- can never match. It is harmless today because every upload writes a fresh
-- random path, making it an INSERT (covered by the policy above) and never an
-- UPDATE. Fixing it properly means deciding a path convention and changing
-- FileUpload.vue, which is a separate piece of work, not a migration repair.
-- The consequence meanwhile: nothing ever deletes a replaced logo.

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

-- NO public SELECT policy here, deliberately (repaired 2026-09-17).
--
-- 0020_storage_no_listing.sql dropped the broad SELECT policies on public
-- buckets and said why: "Public buckets serve object URLs directly via the CDN;
-- a SELECT policy on storage.objects only grants list-objects rights, exposing
-- file inventories." This file was written before that decision and carried the
-- policy it retired, so applying it as-is would have reintroduced the problem
-- for a new bucket.
--
-- Nothing breaks without it: the bucket is public and the app reads logos with
-- `getPublicUrl()` (app/components/ui/file-upload/FileUpload.vue:91), which the
-- CDN serves without consulting these policies. No code lists the bucket.
-- The DROP stays so the policy disappears anywhere it was already created.
DROP POLICY IF EXISTS "org_logos: public read" ON storage.objects;

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
