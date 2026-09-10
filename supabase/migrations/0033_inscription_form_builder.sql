-- 0033_inscription_form_builder.sql
-- Custom form builder for organization-specific inscription fields
--
-- This migration never applied: the original RLS policy referenced an aliased
-- table by its original name, which Postgres rejects at parse time, and the
-- whole transaction rolled back with it. Fixed here rather than in a follow-up
-- migration because no environment has ever run it.

-- ─────────────────────────────────────────────
-- 1. inscription_form_schemas: Store form schema per contest
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.inscription_form_schemas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contest_id UUID NOT NULL REFERENCES public.contests(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  is_published BOOLEAN NOT NULL DEFAULT false,
  schema_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ,
  UNIQUE(contest_id, version)
);

CREATE INDEX IF NOT EXISTS inscription_form_schemas_contest_id_idx
  ON public.inscription_form_schemas(contest_id);

CREATE INDEX IF NOT EXISTS inscription_form_schemas_published_idx
  ON public.inscription_form_schemas(contest_id, is_published)
  WHERE is_published = true;

-- ─────────────────────────────────────────────
-- 2. participant_form_responses: Store submitted form data
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.participant_form_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id UUID NOT NULL REFERENCES public.participants(id) ON DELETE CASCADE,
  form_schema_id UUID NOT NULL REFERENCES public.inscription_form_schemas(id) ON DELETE RESTRICT,
  responses_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(participant_id, form_schema_id)
);

CREATE INDEX IF NOT EXISTS participant_form_responses_participant_id_idx
  ON public.participant_form_responses(participant_id);

CREATE INDEX IF NOT EXISTS participant_form_responses_schema_id_idx
  ON public.participant_form_responses(form_schema_id);

-- ─────────────────────────────────────────────
-- 3. Helper function to get published form schema
-- ─────────────────────────────────────────────
-- Returns the id and version alongside the schema: participant_form_responses
-- requires form_schema_id, so a caller that only gets schema_json cannot record
-- which version a participant actually answered.
DROP FUNCTION IF EXISTS public.get_inscription_form_schema(UUID);

CREATE FUNCTION public.get_inscription_form_schema(p_contest_id UUID)
RETURNS TABLE (
  id UUID,
  version INTEGER,
  published_at TIMESTAMPTZ,
  schema_json JSONB
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT s.id, s.version, s.published_at, s.schema_json
    FROM public.inscription_form_schemas s
   WHERE s.contest_id = p_contest_id
     AND s.is_published = true
   ORDER BY s.version DESC
   LIMIT 1;
$$;

-- ─────────────────────────────────────────────
-- 4. Helper function to validate form responses
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.validate_form_response(
  p_schema_json JSONB,
  p_responses_json JSONB
)
RETURNS TABLE (
  field_id TEXT,
  is_valid BOOLEAN,
  error_message TEXT
)
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  field_record RECORD;
  response_value JSONB;
  field_type TEXT;
  is_required BOOLEAN;
  min_length INTEGER;
  max_length INTEGER;
  min_value NUMERIC;
  max_value NUMERIC;
  options JSONB;
  validation JSONB;
BEGIN
  -- Iterate through schema fields
  FOR field_record IN SELECT * FROM jsonb_array_elements(p_schema_json) AS f
  LOOP
    field_id := field_record.value->>'id';
    field_type := field_record.value->>'type';
    is_required := COALESCE((field_record.value->>'required')::boolean, false);
    -- Validation rules are nested under `validation`, matching the FormField
    -- contract the builder emits. Reading them from the field root always
    -- yielded NULL, which silently disabled every rule below.
    validation := COALESCE(field_record.value->'validation', '{}'::jsonb);
    min_length := (validation->>'minLength')::integer;
    max_length := (validation->>'maxLength')::integer;
    min_value := (validation->>'minValue')::numeric;
    max_value := (validation->>'maxValue')::numeric;
    options := field_record.value->'options';
    
    response_value := p_responses_json->field_id;
    
    -- Check required
    IF is_required AND (response_value IS NULL OR response_value = '""' OR response_value = '[]') THEN
      field_id := field_record.value->>'id';
      is_valid := false;
      error_message := 'Campo requerido';
      RETURN NEXT;
      CONTINUE;
    END IF;
    
    -- Skip further validation if optional and empty
    IF response_value IS NULL OR response_value = '""' THEN
      field_id := field_record.value->>'id';
      is_valid := true;
      error_message := NULL;
      RETURN NEXT;
      CONTINUE;
    END IF;
    
    -- Type-specific validation
    IF field_type = 'text' OR field_type = 'textarea' OR field_type = 'email' THEN
      IF min_length IS NOT NULL AND length(response_value#>>'{}') < min_length THEN
        field_id := field_record.value->>'id';
        is_valid := false;
        error_message := format('Mínimo %s caracteres', min_length);
        RETURN NEXT;
        CONTINUE;
      END IF;
      IF max_length IS NOT NULL AND length(response_value#>>'{}') > max_length THEN
        field_id := field_record.value->>'id';
        is_valid := false;
        error_message := format('Máximo %s caracteres', max_length);
        RETURN NEXT;
        CONTINUE;
      END IF;
    END IF;
    
    IF field_type = 'number' THEN
      IF min_value IS NOT NULL AND (response_value#>>'{}')::numeric < min_value THEN
        field_id := field_record.value->>'id';
        is_valid := false;
        error_message := format('Valor mínimo: %s', min_value);
        RETURN NEXT;
        CONTINUE;
      END IF;
      IF max_value IS NOT NULL AND (response_value#>>'{}')::numeric > max_value THEN
        field_id := field_record.value->>'id';
        is_valid := false;
        error_message := format('Valor máximo: %s', max_value);
        RETURN NEXT;
        CONTINUE;
      END IF;
    END IF;
    
    IF field_type = 'select' OR field_type = 'radio' THEN
      -- Options are {value,label} objects. The `?|` operator only matches string
      -- elements of a JSON array, so it never matched and rejected every answer.
      -- Compare against each option's `value`, falling back to the element itself
      -- when the array holds plain strings.
      IF options IS NOT NULL
         AND jsonb_typeof(options) = 'array'
         AND NOT EXISTS (
           SELECT 1
             FROM jsonb_array_elements(options) AS opt
            WHERE COALESCE(opt.value->>'value', opt.value#>>'{}') = response_value#>>'{}'
         ) THEN
        field_id := field_record.value->>'id';
        is_valid := false;
        error_message := 'Opción no válida';
        RETURN NEXT;
        CONTINUE;
      END IF;
    END IF;
    
    -- All validations passed
    field_id := field_record.value->>'id';
    is_valid := true;
    error_message := NULL;
    RETURN NEXT;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_inscription_form_schema(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_form_response(JSONB, JSONB) TO authenticated;

-- ─────────────────────────────────────────────
-- 5. RLS Policies
-- ─────────────────────────────────────────────
ALTER TABLE public.inscription_form_schemas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.participant_form_responses ENABLE ROW LEVEL SECURITY;

-- Policies are dropped first so the migration stays re-runnable.
DROP POLICY IF EXISTS "Anyone can read published form schemas" ON public.inscription_form_schemas;
DROP POLICY IF EXISTS "Organizers can manage form schemas"     ON public.inscription_form_schemas;
DROP POLICY IF EXISTS "Users can read own form responses"      ON public.participant_form_responses;
DROP POLICY IF EXISTS "Organizers can read all form responses" ON public.participant_form_responses;

-- Form schemas: anyone can read a published one (the public inscription page
-- needs it without a session), organizers of THAT contest can manage it.
CREATE POLICY "Anyone can read published form schemas"
  ON public.inscription_form_schemas FOR SELECT
  USING (is_published = true);

-- The previous version aliased contest_members as `cm` and then referenced
-- `contest_members.contest_id`, which Postgres rejects — and it never compared
-- against inscription_form_schemas.contest_id, so any organizer of any contest
-- would have been able to manage every other contest's schema. Scoped here via
-- is_contest_organizer(), the same SECURITY DEFINER helper used since 0034/0040,
-- which already counts the parent organization's owner as an organizer.
-- Narrower than before on purpose: judges no longer edit the inscription form.
CREATE POLICY "Organizers can manage form schemas"
  ON public.inscription_form_schemas FOR ALL
  USING (public.is_contest_organizer(contest_id))
  WITH CHECK (public.is_contest_organizer(contest_id));

-- Form responses: participants read their own; organizers and judges of the
-- contest read all of them. is_contest_member() covers org owners too, which the
-- previous contest_members-only check missed — the same gap migration 0040 fixed
-- elsewhere.
CREATE POLICY "Users can read own form responses"
  ON public.participant_form_responses FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.participants p
      WHERE p.id = participant_form_responses.participant_id
        AND p.user_id = auth.uid()
    )
  );

CREATE POLICY "Organizers can read all form responses"
  ON public.participant_form_responses FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.participants p
      WHERE p.id = participant_form_responses.participant_id
        AND public.is_contest_member(p.contest_id)
    )
  );

-- NOTE: there is deliberately no INSERT/UPDATE policy on
-- participant_form_responses. Writes go through the server with the service_role
-- client, which bypasses RLS. Granting a self-insert policy is a separate
-- decision and belongs with KAN-49, which implements persistence.

-- ─────────────────────────────────────────────
-- 6. Trigger to auto-update updated_at
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_inscription_form_schema_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_inscription_form_schema_updated_at_trigger
  ON public.inscription_form_schemas;

CREATE TRIGGER update_inscription_form_schema_updated_at_trigger
  BEFORE UPDATE ON public.inscription_form_schemas
  FOR EACH ROW
  EXECUTE FUNCTION public.update_inscription_form_schema_updated_at();

COMMENT ON TABLE public.inscription_form_schemas IS 'Custom form schemas for contest inscriptions';
COMMENT ON TABLE public.participant_form_responses IS 'Participant responses to custom form fields';
COMMENT ON COLUMN public.inscription_form_schemas.schema_json IS 'Array of field definitions: [{id, type, label, required, options, validation}]';
COMMENT ON COLUMN public.participant_form_responses.responses_json IS 'Key-value pairs: {fieldId: value}';
