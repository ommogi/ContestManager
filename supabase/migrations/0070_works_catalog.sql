-- 0070_works_catalog.sql
-- Catalogue of works per organisation (KAN-16).
--
-- The Fundació Maria Canals asked for the works to be entered by the
-- organisation, never typed freely by participants: otherwise "Rachmaninov",
-- "Rajmáninov" and "S. Rachmaninoff" end up side by side in the same printed
-- programme. So composers are their own table, written once, and each work
-- points at one.
--
-- ── Matching names without accents, without an extension ───────────────────
-- Neither `unaccent` nor `pg_trgm` is installed in production, and installing
-- extensions is not this migration's business. `catalog_key()` is a small
-- IMMUTABLE function (lowercase, common Latin accents folded, punctuation to
-- spaces, spaces collapsed) so it can back a generated column and a unique
-- index. `shared/works-catalog.ts` has the same function in TypeScript; the
-- two must stay identical.
--
-- ── Deleting ────────────────────────────────────────────────────────────────
-- A work in use cannot be deleted, only archived. "In use" will be the
-- repertoire of KAN-17, which will reference `works` with ON DELETE RESTRICT;
-- the API tries the delete and archives instead when a foreign key refuses
-- it. `works.composer_id` is RESTRICT for the same reason: a composer with
-- works is archived, not deleted.
--
-- Re-runnable: CREATE … IF NOT EXISTS / OR REPLACE, policies dropped first.

CREATE OR REPLACE FUNCTION public.catalog_key(p_value TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT btrim(regexp_replace(
    translate(
      lower(coalesce(p_value, '')),
      'áàâäãåāąéèêëēěęíìîïīóòôöõøōőúùûüūůűñńňçčćýÿšśžźżłŀľřŕďťğ',
      'aaaaaaaaeeeeeeeiiiiioooooooouuuuuuunnncccyysszzzlllrrdtg'
    ),
    '[^a-z0-9]+', ' ', 'g'
  ))
$$;

COMMENT ON FUNCTION public.catalog_key(TEXT) IS
  'Accent- and case-insensitive key for catalogue names (KAN-16). Mirrored by '
  'composerKey() in shared/works-catalog.ts; keep both identical.';

-- ────────────────────────────────────────────────────────────────────────────
-- composers
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.composers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name            TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200),
  name_key        TEXT GENERATED ALWAYS AS (public.catalog_key(name)) STORED,
  archived_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- "Rachmaninov" and "rachmáninov" are the same composer; the database says so.
CREATE UNIQUE INDEX IF NOT EXISTS composers_org_name_key_unique
  ON public.composers(organization_id, name_key);

DROP TRIGGER IF EXISTS handle_composers_updated_at ON public.composers;
CREATE TRIGGER handle_composers_updated_at
  BEFORE UPDATE ON public.composers
  FOR EACH ROW EXECUTE PROCEDURE handle_updated_at();

COMMENT ON TABLE public.composers IS
  'Composers of an organisation''s catalogue (KAN-16), each spelt once. '
  'name_key makes spellings that differ only in accents or case collide.';

-- ────────────────────────────────────────────────────────────────────────────
-- works
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.works (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  composer_id      UUID NOT NULL REFERENCES public.composers(id) ON DELETE RESTRICT,
  title            TEXT NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 300),
  title_key        TEXT GENERATED ALWAYS AS (public.catalog_key(title)) STORED,
  catalog_ref      TEXT CHECK (catalog_ref IS NULL OR length(catalog_ref) <= 60),
  -- Indicative length; a participant's repertoire (KAN-17) may override it.
  duration_seconds INTEGER CHECK (duration_seconds IS NULL OR duration_seconds BETWEEN 1 AND 7200),
  archived_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS works_composer_title_key_unique
  ON public.works(composer_id, title_key);
CREATE INDEX IF NOT EXISTS works_organization_id_idx ON public.works(organization_id);
CREATE INDEX IF NOT EXISTS works_composer_id_idx ON public.works(composer_id);

DROP TRIGGER IF EXISTS handle_works_updated_at ON public.works;
CREATE TRIGGER handle_works_updated_at
  BEFORE UPDATE ON public.works
  FOR EACH ROW EXECUTE PROCEDURE handle_updated_at();

COMMENT ON TABLE public.works IS
  'Catalogue of works of an organisation (KAN-16), entered by the organisation. '
  'Archived instead of deleted once in use.';

-- A work must belong to the same organisation as its composer. A plain FK
-- cannot say that, so a trigger does.
CREATE OR REPLACE FUNCTION public.works_same_org_as_composer()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.composers c
     WHERE c.id = NEW.composer_id AND c.organization_id = NEW.organization_id
  ) THEN
    RAISE EXCEPTION 'composer_other_organization';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS works_same_org_as_composer ON public.works;
CREATE TRIGGER works_same_org_as_composer
  BEFORE INSERT OR UPDATE OF composer_id, organization_id ON public.works
  FOR EACH ROW EXECUTE FUNCTION public.works_same_org_as_composer();

-- ────────────────────────────────────────────────────────────────────────────
-- RLS
-- ────────────────────────────────────────────────────────────────────────────
-- The API goes through the admin client behind requireOrgOwner; these are the
-- second line. The owner manages their catalogue; accepted organisers of any
-- of the organisation's contests may read it, which the repertoire editor
-- (KAN-17) will need. `(select auth.uid())` as in 0064, evaluated once.
ALTER TABLE public.composers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.works ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS composers_owner_all ON public.composers;
CREATE POLICY composers_owner_all ON public.composers
  FOR ALL TO authenticated
  USING (organization_id IN (SELECT o.id FROM public.organizations o WHERE o.owner_id = (SELECT auth.uid())))
  WITH CHECK (organization_id IN (SELECT o.id FROM public.organizations o WHERE o.owner_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS composers_organizer_read ON public.composers;
CREATE POLICY composers_organizer_read ON public.composers
  FOR SELECT TO authenticated
  USING (organization_id IN (
    SELECT c.organization_id
      FROM public.contests c
      JOIN public.contest_members m ON m.contest_id = c.id
     WHERE m.user_id = (SELECT auth.uid())
       AND m.role = 'organizer'
       AND m.invitation_status = 'accepted'
  ));

DROP POLICY IF EXISTS works_owner_all ON public.works;
CREATE POLICY works_owner_all ON public.works
  FOR ALL TO authenticated
  USING (organization_id IN (SELECT o.id FROM public.organizations o WHERE o.owner_id = (SELECT auth.uid())))
  WITH CHECK (organization_id IN (SELECT o.id FROM public.organizations o WHERE o.owner_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS works_organizer_read ON public.works;
CREATE POLICY works_organizer_read ON public.works
  FOR SELECT TO authenticated
  USING (organization_id IN (
    SELECT c.organization_id
      FROM public.contests c
      JOIN public.contest_members m ON m.contest_id = c.id
     WHERE m.user_id = (SELECT auth.uid())
       AND m.role = 'organizer'
       AND m.invitation_status = 'accepted'
  ));

REVOKE ALL ON public.composers, public.works FROM anon;
