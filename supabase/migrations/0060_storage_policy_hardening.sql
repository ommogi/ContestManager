-- 0060_storage_policy_hardening.sql
-- Two buckets whose policies do not say what they mean.
--
-- Found on 2026-09-18 by checking the remaining buckets the same way 0059
-- checked org_logos: read the policy predicate, not the policy name.

-- ════════════════════════════════════════════════════════════════════════════
-- 1. contest-assets — anyone could overwrite anything
-- ════════════════════════════════════════════════════════════════════════════
-- The three policies were, in full:
--
--   INSERT  WITH CHECK (bucket_id = 'contest-assets')
--   UPDATE  USING      (bucket_id = 'contest-assets')
--   DELETE  USING      (bucket_id = 'contest-assets')
--
-- All to `authenticated`, none constraining the path, on a PUBLIC bucket with
-- no size limit and no mime restriction. Any signed-up user could upload
-- anything, and — the part that matters — overwrite or delete ANY object in the
-- bucket, including the shared brand assets:
--
--   logo.png          layouts/default.vue, pages/index.vue, auth/login.vue,
--                     auth/reset-password.vue, and both email templates
--                     (server/utils/email.ts:230 and :533)
--   default-cover.png ContestCard.vue and the two contest detail pages
--
-- So any account could have replaced the logo embedded in every outgoing email
-- and on the login screen, or deleted another organization's cover. This bucket
-- predates the current work; 0020_storage_no_listing.sql already touched it and
-- looked only at the read side.
--
-- ── The path convention has to change for a policy to be possible ───────────
-- Covers were written to `covers/<contest_id>-<timestamp>.<ext>`: flat, with
-- the contest id inside the FILE name, so `storage.foldername(name)` is just
-- {covers} for every one of them and no policy can tell one contest from
-- another. They now go to `covers/<contest_id>/<uuid>.<ext>`, which puts the
-- contest in the second segment where a predicate can read it.
--
-- Verified before writing this: the bucket holds exactly two objects,
-- `logo.png` and `default-cover.png`. There are no covers under the old
-- convention, so nothing needs migrating.

UPDATE storage.buckets
   SET file_size_limit    = 5242880,  -- 5 MB; a cover is a hero image, and the
                                      -- existing default-cover.png is 4.7 MB
       allowed_mime_types = ARRAY['image/png','image/jpeg','image/webp']
 WHERE id = 'contest-assets';

-- `is_contest_organizer(uuid)` already exists and is SECURITY DEFINER; it is
-- what the rest of the schema uses to answer "does this person run this
-- contest". Reusing it keeps one definition of that question.
DROP POLICY IF EXISTS "contest_assets_auth_upload" ON storage.objects;
DROP POLICY IF EXISTS "contest_assets_auth_update" ON storage.objects;
DROP POLICY IF EXISTS "contest_assets_auth_delete" ON storage.objects;

DROP POLICY IF EXISTS "contest_assets: organizer writes own cover" ON storage.objects;
CREATE POLICY "contest_assets: organizer writes own cover"
  ON storage.objects FOR ALL
  TO authenticated
  USING (
    bucket_id = 'contest-assets'
    AND (storage.foldername(name))[1] = 'covers'
    AND public.is_contest_organizer(((storage.foldername(name))[2])::uuid)
  )
  WITH CHECK (
    bucket_id = 'contest-assets'
    AND (storage.foldername(name))[1] = 'covers'
    AND public.is_contest_organizer(((storage.foldername(name))[2])::uuid)
  );

-- Note what this deliberately leaves uncovered: the brand assets at the bucket
-- root. `storage.foldername('logo.png')` is empty, so the predicate is false
-- and no client can write them. They are managed with the service key. Reading
-- is unaffected — the bucket is public and the CDN does not consult policies,
-- which is also why there is still no SELECT policy here (0020).

-- ════════════════════════════════════════════════════════════════════════════
-- 2. inscription-uploads — say what the design actually is
-- ════════════════════════════════════════════════════════════════════════════
-- Its INSERT policy carried a typo that made it deny everything:
--
--   EXISTS (SELECT 1 FROM contests c
--            WHERE c.id::text = (storage.foldername(c.name))[1] ...)
--                                                   ^^^^^^
-- `storage.foldername(c.name)` splits the CONTEST's name, not the object's, so
-- the EXISTS never matched. Nothing broke, because the server writes with the
-- service role and bypasses RLS — the policy was dead and accidentally aligned
-- with the intended design.
--
-- That accident is a trap. Someone fixing the typo would believe they were
-- restoring client uploads, and would instead open a path that skips
-- `validateUpload` — magic-byte sniffing, maxSizeMB, maxFiles — and that writes
-- objects with NO row in `inscription_uploads`: orphans that cannot be swept,
-- by construction. CLAUDE.md states that every object has a ledger row; this
-- makes the policy agree.
--
-- The DELETE policy did work, and let a participant delete an object directly,
-- bypassing upload.delete.ts (KAN-67) which removes the object AND its ledger
-- row together. A direct delete leaves a live row pointing at nothing.
--
-- Both are withdrawn. Writes and deletes go through the server, which is the
-- only place that can keep bytes and ledger in step. The two SELECT policies
-- stay: reading is scoped correctly already.
DROP POLICY IF EXISTS "inscription-uploads: participant inserts own" ON storage.objects;
DROP POLICY IF EXISTS "inscription-uploads: participant deletes own" ON storage.objects;
