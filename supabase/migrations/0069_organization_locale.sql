-- 0069_organization_locale.sql
-- Language of an organisation's documents (KAN-19).
--
-- The printable documents (rehearsal sheet, public programme, jury programme)
-- are handed to participants, audience and jury, and a Catalan organisation
-- such as the Fundació Maria Canals needs them in Catalan. 'es' by default so
-- every existing organisation keeps what it has today.
--
-- No RLS change: the owner's existing UPDATE policy on `organizations` covers
-- the new column.
--
-- Re-runnable: IF NOT EXISTS, and the constraint is added only when absent.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS locale TEXT NOT NULL DEFAULT 'es';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.organizations'::regclass
       AND conname  = 'organizations_locale_supported'
  ) THEN
    ALTER TABLE public.organizations
      ADD CONSTRAINT organizations_locale_supported
      CHECK (locale IN ('es', 'ca'));
  END IF;
END;
$$;

COMMENT ON COLUMN public.organizations.locale IS
  'Language of the organisation''s generated documents (KAN-19): ''es'' or ''ca''.';
