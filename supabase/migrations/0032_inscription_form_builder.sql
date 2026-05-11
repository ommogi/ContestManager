-- 0032_inscription_form_builder.sql
-- Custom form builder for organization-specific inscription fields

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
CREATE OR REPLACE FUNCTION public.get_inscription_form_schema(p_contest_id UUID)
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT schema_json
    FROM public.inscription_form_schemas
   WHERE contest_id = p_contest_id
     AND is_published = true
   ORDER BY version DESC
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
BEGIN
  -- Iterate through schema fields
  FOR field_record IN SELECT * FROM jsonb_array_elements(p_schema_json) AS f
  LOOP
    field_id := field_record.value->>'id';
    field_type := field_record.value->>'type';
    is_required := COALESCE((field_record.value->>'required')::boolean, false);
    min_length := (field_record.value->>'minLength')::integer;
    max_length := (field_record.value->>'maxLength')::integer;
    min_value := (field_record.value->>'minValue')::numeric;
    max_value := (field_record.value->>'maxValue')::numeric;
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
      IF options IS NOT NULL AND NOT options ?| ARRAY[response_value#>>'{}'] THEN
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

-- Form schemas: organizers can manage, anyone can read published
CREATE POLICY "Anyone can read published form schemas"
  ON public.inscription_form_schemas FOR SELECT
  USING (is_published = true);

CREATE POLICY "Organizers can manage form schemas"
  ON public.inscription_form_schemas FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.contest_members cm
      JOIN public.contests c ON c.id = contest_members.contest_id
      WHERE cm.contest_id = contest_members.contest_id
        AND cm.user_id = auth.uid()
        AND cm.role IN ('organizer', 'judge')
    )
  );

-- Form responses: users can read their own, organizers can read all
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
      SELECT 1 FROM public.contest_members cm
      JOIN public.participants p ON p.contest_id = cm.contest_id
      WHERE p.id = participant_form_responses.participant_id
        AND cm.user_id = auth.uid()
        AND cm.role IN ('organizer', 'judge')
    )
  );

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

CREATE TRIGGER update_inscription_form_schema_updated_at_trigger
  BEFORE UPDATE ON public.inscription_form_schemas
  FOR EACH ROW
  EXECUTE FUNCTION public.update_inscription_form_schema_updated_at();

COMMENT ON TABLE public.inscription_form_schemas IS 'Custom form schemas for contest inscriptions';
COMMENT ON TABLE public.participant_form_responses IS 'Participant responses to custom form fields';
COMMENT ON COLUMN public.inscription_form_schemas.schema_json IS 'Array of field definitions: [{id, type, label, required, options, validation}]';
COMMENT ON COLUMN public.participant_form_responses.responses_json IS 'Key-value pairs: {fieldId: value}';
