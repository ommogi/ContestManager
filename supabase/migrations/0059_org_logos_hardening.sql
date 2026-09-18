-- 0059_org_logos_hardening.sql
-- Close the org_logos bucket that 0037 opened.
--
-- ── What was wrong ──────────────────────────────────────────────────────────
-- 0037 was applied on 2026-09-17 and created `org_logos` as a PUBLIC bucket
-- with this INSERT policy:
--
--   TO authenticated WITH CHECK (bucket_id = 'org_logos')
--
-- No path constraint, and the bucket carried no `file_size_limit` and no
-- `allowed_mime_types`. Any signed-up user could therefore write a file of any
-- type and any size anywhere in a bucket served publicly — an open file host,
-- reachable the moment the bucket existed. The `avatars` bucket in the same
-- project already showed the right shape: 2 MB and four image types.
--
-- The second policy, meant to let an owner manage their own logo, matched
-- objects whose name starts with the ORGANIZATION id:
--
--   name LIKE concat(o.id, '%')  with o.owner_id = auth.uid()
--
-- It could never match. The logo is uploaded during onboarding — see
-- app/pages/onboarding/index.vue — which is *before* the organization row
-- exists, so the uploader has no organization id to namespace by and the
-- component wrote to `onboarding/<timestamp>-<random>`. Policy and path
-- convention were designed at different times and never met. The consequence:
-- nobody could delete anything, so every replaced logo leaked.
--
-- ── The convention this settles on ──────────────────────────────────────────
-- Namespace by the UPLOADER, not by the organization: `<auth.uid()>/<uuid>.<ext>`.
-- `auth.uid()` exists during onboarding, which is the whole problem with the
-- organization id, and it is what an RLS policy can check without a subquery.
-- The organization keeps storing the resulting public URL in `logo_url`.

-- ────────────────────────────────────────────────────────────────────────────
-- 1. The bucket's own limits
-- ────────────────────────────────────────────────────────────────────────────
-- Matching `avatars`, which is the decision this project already made. SVG is
-- deliberately absent from both: an SVG is a document that can carry script,
-- and these objects are served from a public URL.
UPDATE storage.buckets
   SET file_size_limit  = 2097152,  -- 2 MB, same as avatars
       allowed_mime_types = ARRAY['image/png','image/jpeg','image/webp','image/gif']
 WHERE id = 'org_logos';

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Writes stay inside the uploader's own folder
-- ────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "org_logos: authenticated upload" ON storage.objects;
CREATE POLICY "org_logos: authenticated upload"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'org_logos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Replaces the organization-prefixed policy that could never match.
DROP POLICY IF EXISTS "org_logos: owner update/delete" ON storage.objects;
DROP POLICY IF EXISTS "org_logos: uploader update/delete" ON storage.objects;
CREATE POLICY "org_logos: uploader update/delete"
  ON storage.objects FOR ALL
  TO authenticated
  USING (
    bucket_id = 'org_logos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'org_logos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- No SELECT policy, still: 0020_storage_no_listing.sql retired those on public
-- buckets because they only grant list-objects rights on something the CDN
-- already serves. Reading a logo needs no policy.
DROP POLICY IF EXISTS "org_logos: public read" ON storage.objects;
