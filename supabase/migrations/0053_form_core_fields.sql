-- 0053_form_core_fields.sql
-- KAN-56 · Core and dynamic inscription fields in a single form model.
--
-- NOT APPLIED TO PRODUCTION. Left in the repo for review first, deliberately:
-- 0033 and 0037 both aborted silently in the past (one used
-- `CREATE POLICY IF NOT EXISTS`, which Postgres does not accept; the other
-- aliased a table and then referenced it by its original name), and each took
-- its whole transaction down with it. Everything below is therefore written to
-- be re-runnable: every CREATE POLICY is preceded by DROP POLICY IF EXISTS,
-- every object uses IF NOT EXISTS or OR REPLACE.
--
-- This migration changes no data and adds no column. It records decisions and
-- adds one guard, because the reconciliation model itself is enforced in
-- TypeScript (`shared/inscription-form-core.ts`) on the write path.
--
-- ── The model (option 1 of KAN-56) ──────────────────────────────────────────
-- Core fields are ordinary entries of `inscription_form_schemas.schema_json`
-- with a reserved id (`core.first_name`, `core.dni`, …) and `isCore: true`.
-- One ordered list, one renderer, one source of order — an organization can
-- drag its own field above a core one, hide `dni`, or make `phone` required.
--
-- Their VALUES still land in the typed `participants` columns, not in
-- `responses_json`. Only presentation is schema-driven. That split is not
-- cosmetic: `enroll_participant` reads `p_birthdate` for the `age_below_min` /
-- `age_above_max` guards and `p_dni` / `p_email` for its per-category
-- duplicate check, and the public page filters categories by age from the same
-- value. A core value hidden inside a JSONB blob would be invisible to all of
-- them.
--
-- ── Irreducible fields ──────────────────────────────────────────────────────
-- `core.first_name`, `core.last_name` and `core.birthdate` can never be
-- hidden, deleted, retyped or made optional. Enforced in three places, because
-- the UI is not a boundary:
--   1. the builder UI hides the controls,
--   2. `validateCoreFields()` rejects the payload in the POST handler and
--      inside `FormSchemaBodySchema`,
--   3. the CHECK constraint added below rejects a row written by any other
--      path, including a direct `service_role` insert.
-- Note why birthdate matters most: `enroll_participant` computes
-- `v_age := date_part('year', age(..., p_birthdate))`. With a NULL birthdate
-- `v_age` is NULL, every `v_age < min_age` comparison evaluates to NULL, and
-- BOTH age guards pass silently. Losing the field does not raise an error — it
-- disables the age rules without telling anyone.

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Decision on participants.metadata — NOT USED (KAN-56)
-- ────────────────────────────────────────────────────────────────────────────
-- The column has existed since 0001 and no code in the repo reads or writes
-- it. Evaluated as a home for form data and rejected:
--
--   * Custom answers already have a versioned home in
--     `participant_form_responses`, keyed by `form_schema_id`. Copying them
--     into an unversioned JSONB column creates a second source of truth that
--     drifts from the first as soon as a schema is republished — precisely the
--     failure KAN-58 exists to work around.
--   * Core values belong in their typed columns, where the SQL guards above
--     can read them and where a NOT NULL / DATE type still means something.
--   * As a denormalized copy "for fast listings" it would need a trigger to
--     stay correct, and the listing queries it would serve are already indexed
--     (`participant_form_responses_participant_id_idx`).
--
-- The column is left in place rather than dropped: dropping it is a separate,
-- riskier migration and it is still a legitimate home for non-form
-- integration data (Stripe session bookkeeping, import provenance). It is
-- documented here as off-limits for inscription form data.
COMMENT ON COLUMN public.participants.metadata IS
  'Free-form integration metadata. NOT a home for inscription form data (KAN-56): '
  'custom answers live in participant_form_responses.responses_json, versioned by '
  'form_schema_id; core values live in the typed participants columns that '
  'enroll_participant''s age and duplicate guards read. Unused as of 0053.';

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Document the core-field convention on the schema column
-- ────────────────────────────────────────────────────────────────────────────
COMMENT ON COLUMN public.inscription_form_schemas.schema_json IS
  'Ordered array of field definitions: [{id, type, label, required, order, hidden, '
  'validation, isCore?}]. Ids prefixed "core." are system fields (KAN-56) whose '
  'values land in participants columns, not in responses_json; core.first_name, '
  'core.last_name and core.birthdate can never be hidden, removed or made optional. '
  'The catalogue and the rules live in shared/inscription-form-core.ts.';

-- ────────────────────────────────────────────────────────────────────────────
-- 3. Database-level guard for the irreducible three
-- ────────────────────────────────────────────────────────────────────────────
-- Mirrors validateCoreFields(). A schema that declares NO core entry is the
-- pre-KAN-56 shape and stays legal — every row already in the table is that
-- shape, and those contests render the default core block plus their custom
-- fields, so nothing is missing. The rule only bites once a schema opts into
-- the core model by declaring at least one `core.` entry.
CREATE OR REPLACE FUNCTION public.form_schema_core_fields_ok(p_schema_json JSONB)
RETURNS BOOLEAN
LANGUAGE sql IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT
    CASE
      WHEN jsonb_typeof(p_schema_json) <> 'array' THEN true
      -- No core entry declared: legacy shape, nothing to enforce.
      WHEN NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(p_schema_json) AS f
         WHERE f.value->>'id' LIKE 'core.%'
      ) THEN true
      ELSE NOT EXISTS (
        SELECT 1
          FROM unnest(ARRAY['core.first_name', 'core.last_name', 'core.birthdate']) AS required_id
         WHERE NOT EXISTS (
           SELECT 1
             FROM jsonb_array_elements(p_schema_json) AS f
            WHERE f.value->>'id' = required_id
              AND COALESCE((f.value->>'hidden')::boolean, false) = false
              AND COALESCE((f.value->>'required')::boolean, false) = true
         )
      )
    END;
$$;

COMMENT ON FUNCTION public.form_schema_core_fields_ok(JSONB) IS
  'True when a schema either declares no core field at all (pre-KAN-56 shape) or '
  'carries core.first_name, core.last_name and core.birthdate as visible and '
  'required. Backs the inscription_form_schemas CHECK constraint.';

ALTER TABLE public.inscription_form_schemas
  DROP CONSTRAINT IF EXISTS inscription_form_schemas_core_fields_ok;

ALTER TABLE public.inscription_form_schemas
  ADD CONSTRAINT inscription_form_schemas_core_fields_ok
  CHECK (public.form_schema_core_fields_ok(schema_json))
  NOT VALID;

-- NOT VALID, then validated separately: the check is skipped for rows already
-- in the table and applies to every INSERT and UPDATE from here on. VALIDATE
-- takes only a SHARE UPDATE EXCLUSIVE lock, so it does not block reads or
-- writes — unlike adding the constraint as valid in one step, which would take
-- ACCESS EXCLUSIVE for the duration of the scan. Every existing row is the
-- legacy shape and passes anyway.
ALTER TABLE public.inscription_form_schemas
  VALIDATE CONSTRAINT inscription_form_schemas_core_fields_ok;
