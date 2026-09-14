-- 0054_inscription_uploads.sql
-- KAN-59 · Real file uploads for the `file` field type.
--
-- NOT APPLIED TO PRODUCTION. Left in the repo for review, like 0053.
--
-- Re-runnable by construction. 0037 tried to create its bucket policies with
-- `CREATE POLICY IF NOT EXISTS`, which Postgres does not support: the
-- statement failed, the transaction rolled back, and the `org_logos` bucket it
-- was supposed to create has never existed in any environment — production
-- today holds only `avatars` and `contest-assets`, both public. Every policy
-- below is therefore preceded by DROP POLICY IF EXISTS, and nothing here
-- depends on 0037 having worked.
--
-- ── Design ──────────────────────────────────────────────────────────────────
-- Bucket `inscription-uploads`, PRIVATE. Unlike `avatars` and
-- `contest-assets`, these are scanned identity documents and unpublished
-- scores; there is no CDN-public read path and no anonymous access at all.
-- Organizers reach a file through a short-lived signed URL minted server-side.
--
-- Object key: {contest_id}/{user_id}/{field_id}/{uuid}-{name}
-- Four segments, each one a prefix a policy can authorize against. Segment 2
-- is the UPLOADING USER, not the participant: files are chosen before the
-- participant row exists — the free path creates it inside enroll_participant
-- and the paid path only after Stripe confirms — so there is no participant id
-- to key by at upload time. `inscription_uploads` below records the
-- participant id once there is one, which is also what makes orphan sweeping
-- and delete-on-participant-removal possible.
--
-- Respecting 0020: no broad SELECT policy. 0020 removed the wide read policies
-- from the public buckets because a SELECT policy on storage.objects grants
-- list rights and exposes the file inventory. The SELECT policies here are
-- narrow by construction — a participant sees only objects under their own
-- user prefix, an organizer only objects under their own contest prefix — so
-- listing can never cross a tenant boundary.

-- ────────────────────────────────────────────────────────────────────────────
-- 1. The bucket
-- ────────────────────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('inscription-uploads', 'inscription-uploads', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Upload ledger
-- ────────────────────────────────────────────────────────────────────────────
-- Storage has no foreign keys, so the database cannot cascade an object away
-- when its participant is deleted. This table is the join that makes the
-- lifecycle manageable: who uploaded what, for which contest and field, and
-- whether it was ever attached to a participant.
CREATE TABLE IF NOT EXISTS public.inscription_uploads (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contest_id    UUID NOT NULL REFERENCES public.contests(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- NULL until the inscription completes. ON DELETE SET NULL rather than
  -- CASCADE on purpose: deleting a participant must leave the ledger row
  -- behind so the purge sweep still knows which object to remove. The
  -- trigger below stamps `purge_after` at the same moment.
  participant_id UUID REFERENCES public.participants(id) ON DELETE SET NULL,
  field_id      TEXT NOT NULL,
  path          TEXT NOT NULL UNIQUE,
  file_name     TEXT NOT NULL,
  size_bytes    BIGINT NOT NULL CHECK (size_bytes > 0),
  -- The SNIFFED type, written by the server from the bytes that arrived.
  -- Never the Content-Type the client declared.
  mime_type     TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Set when the inscription completes; NULL means still pending.
  confirmed_at  TIMESTAMPTZ,
  -- When non-NULL and in the past, the object is due for deletion.
  purge_after   TIMESTAMPTZ
);

-- Quota accounting: SUM(size_bytes) per contest, on every upload.
CREATE INDEX IF NOT EXISTS inscription_uploads_contest_idx
  ON public.inscription_uploads(contest_id);

-- "What did this participant attach?" for the organizer's viewer (F8).
CREATE INDEX IF NOT EXISTS inscription_uploads_participant_idx
  ON public.inscription_uploads(participant_id)
  WHERE participant_id IS NOT NULL;

-- The orphan sweep: pending uploads, oldest first. Partial, because confirmed
-- rows are the overwhelming majority and are never scanned by it.
CREATE INDEX IF NOT EXISTS inscription_uploads_pending_idx
  ON public.inscription_uploads(created_at)
  WHERE confirmed_at IS NULL AND purge_after IS NULL;

-- The purge sweep.
CREATE INDEX IF NOT EXISTS inscription_uploads_purge_idx
  ON public.inscription_uploads(purge_after)
  WHERE purge_after IS NOT NULL;

-- Resuming a half-filled form, and the per-field maxFiles count.
CREATE INDEX IF NOT EXISTS inscription_uploads_owner_field_idx
  ON public.inscription_uploads(contest_id, user_id, field_id);

COMMENT ON TABLE public.inscription_uploads IS
  'Ledger of files uploaded for `file` form fields (KAN-59). Storage objects have '
  'no foreign keys, so this table is what lets an abandoned checkout be swept and a '
  'deleted participant''s objects be purged. responses_json holds only references.';

-- ────────────────────────────────────────────────────────────────────────────
-- 3. RLS on the ledger
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.inscription_uploads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "inscription_uploads: owner reads own"     ON public.inscription_uploads;
DROP POLICY IF EXISTS "inscription_uploads: organizers read all" ON public.inscription_uploads;

-- auth.uid() is wrapped in a SELECT so Postgres evaluates it once per query
-- instead of once per row.
CREATE POLICY "inscription_uploads: owner reads own"
  ON public.inscription_uploads FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "inscription_uploads: organizers read all"
  ON public.inscription_uploads FOR SELECT
  TO authenticated
  USING (public.is_contest_member(contest_id));

-- No INSERT/UPDATE/DELETE policy, deliberately, matching the decision taken in
-- 0033 for participant_form_responses: writes go through the server with the
-- service_role client, which validates the bytes, the size and the quota
-- first. A self-insert policy would let a client record a row the server never
-- vetted.

-- ────────────────────────────────────────────────────────────────────────────
-- 4. Storage policies
-- ────────────────────────────────────────────────────────────────────────────
-- storage.objects.name is the key WITHOUT the bucket, so
-- `storage.foldername(name)` yields {contest_id, user_id, field_id} and
-- [1]/[2] are the contest and the owning user.
DROP POLICY IF EXISTS "inscription-uploads: participant inserts own" ON storage.objects;
DROP POLICY IF EXISTS "inscription-uploads: participant reads own"   ON storage.objects;
DROP POLICY IF EXISTS "inscription-uploads: participant deletes own" ON storage.objects;
DROP POLICY IF EXISTS "inscription-uploads: organizers read contest" ON storage.objects;

-- A signed-in user may write only under their own user prefix, and only for a
-- contest whose registration is actually open. The server enforces far more
-- (real MIME, size, maxFiles, quota, that the field exists in the PUBLISHED
-- schema) — this is the floor, not the ceiling.
CREATE POLICY "inscription-uploads: participant inserts own"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'inscription-uploads'
    AND array_length(storage.foldername(name), 1) = 3
    AND (storage.foldername(name))[2] = (SELECT auth.uid())::text
    AND EXISTS (
      SELECT 1 FROM public.contests c
       WHERE c.id::text = (storage.foldername(name))[1]
         AND c.registration_open = true
    )
  );

-- Narrow reads, not a listing policy: the prefix comparison means a user can
-- only ever see their own objects.
CREATE POLICY "inscription-uploads: participant reads own"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'inscription-uploads'
    AND (storage.foldername(name))[2] = (SELECT auth.uid())::text
  );

-- Replacing a wrong attachment before the inscription is submitted.
CREATE POLICY "inscription-uploads: participant deletes own"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'inscription-uploads'
    AND (storage.foldername(name))[2] = (SELECT auth.uid())::text
  );

-- Organizers and contest members read everything under their own contest
-- prefix. is_contest_member() is the SECURITY DEFINER helper used since
-- 0034/0040 and already counts the parent organization's owner.
CREATE POLICY "inscription-uploads: organizers read contest"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'inscription-uploads'
    AND public.is_contest_member(((storage.foldername(name))[1])::uuid)
  );

-- ────────────────────────────────────────────────────────────────────────────
-- 5. Lifecycle: deleting a participant
-- ────────────────────────────────────────────────────────────────────────────
-- participant_form_responses cascades away; the Storage objects do not, and no
-- trigger can reach the object store. The ledger row is therefore stamped for
-- purge and the sweep endpoint removes the object for real.
CREATE OR REPLACE FUNCTION public.mark_inscription_uploads_for_purge()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.inscription_uploads
     SET purge_after = now()
   WHERE participant_id = OLD.id;
  RETURN OLD;
END;
$$;

COMMENT ON FUNCTION public.mark_inscription_uploads_for_purge() IS
  'Stamps a deleted participant''s uploads for purge. The FK is ON DELETE SET NULL '
  'so the ledger row survives the delete and the sweep can still find the object.';

DROP TRIGGER IF EXISTS mark_inscription_uploads_for_purge_trigger ON public.participants;

-- BEFORE DELETE: the FK's ON DELETE SET NULL runs as part of the delete, so an
-- AFTER trigger would find participant_id already NULL and match nothing.
CREATE TRIGGER mark_inscription_uploads_for_purge_trigger
  BEFORE DELETE ON public.participants
  FOR EACH ROW
  EXECUTE FUNCTION public.mark_inscription_uploads_for_purge();

-- ────────────────────────────────────────────────────────────────────────────
-- 6. Lifecycle: abandoned checkout
-- ────────────────────────────────────────────────────────────────────────────
-- A participant may upload, reach Stripe Checkout and never come back. Those
-- objects are attached to nothing. Sweep marks anything still unconfirmed
-- after the TTL, which the purge endpoint then deletes from Storage.
CREATE OR REPLACE FUNCTION public.sweep_orphan_inscription_uploads(p_ttl_hours INTEGER DEFAULT 24)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_marked INTEGER;
BEGIN
  UPDATE public.inscription_uploads
     SET purge_after = now()
   WHERE confirmed_at IS NULL
     AND purge_after IS NULL
     AND created_at < now() - make_interval(hours => p_ttl_hours);
  GET DIAGNOSTICS v_marked = ROW_COUNT;
  RETURN v_marked;
END;
$$;

COMMENT ON FUNCTION public.sweep_orphan_inscription_uploads(INTEGER) IS
  'Marks uploads never attached to a participant (abandoned checkout) as purgeable '
  'after p_ttl_hours. Call from the scheduled purge endpoint, not from a request.';

-- Confirming an inscription: called by the enrolment path (KAN-49) to attach
-- the pending uploads of a user to the participant that was just created.
-- SECURITY DEFINER with a user_id argument rather than auth.uid(): the paid
-- path completes inside the Stripe webhook, where there is no session.
CREATE OR REPLACE FUNCTION public.confirm_inscription_uploads(
  p_contest_id     UUID,
  p_user_id        UUID,
  p_participant_id UUID,
  p_paths          TEXT[]
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_confirmed INTEGER;
BEGIN
  UPDATE public.inscription_uploads
     SET participant_id = p_participant_id,
         confirmed_at   = now(),
         purge_after    = NULL
   WHERE contest_id = p_contest_id
     AND user_id    = p_user_id
     AND confirmed_at IS NULL
     AND path = ANY(p_paths);
  GET DIAGNOSTICS v_confirmed = ROW_COUNT;

  -- Anything this user uploaded for this contest and did NOT reference in the
  -- submitted responses is a discarded attachment (picked, then replaced).
  -- Purge it rather than leaving it pending for the TTL.
  UPDATE public.inscription_uploads
     SET purge_after = now()
   WHERE contest_id = p_contest_id
     AND user_id    = p_user_id
     AND confirmed_at IS NULL
     AND NOT (path = ANY(p_paths));

  RETURN v_confirmed;
END;
$$;

REVOKE ALL ON FUNCTION public.sweep_orphan_inscription_uploads(INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.confirm_inscription_uploads(UUID, UUID, UUID, TEXT[]) FROM PUBLIC, anon, authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 7. Retention
-- ────────────────────────────────────────────────────────────────────────────
-- Policy, recorded here so it is not reinvented: uploads live as long as the
-- contest needs them and are purgeable 365 days after the contest ends. The
-- sweep is deliberately NOT automatic for finished contests — an organization
-- may still be handling an appeal — so ending a contest does not delete
-- anything on its own. Marking a finished contest's uploads for purge is an
-- explicit action.
COMMENT ON COLUMN public.inscription_uploads.purge_after IS
  'Non-NULL and in the past means the Storage object is due for deletion, by the '
  'purge endpoint. Set by the participant-delete trigger, by the orphan sweep, and '
  'for attachments discarded during confirmation. Retention after a contest ends is '
  '365 days and is applied explicitly, never automatically.';
