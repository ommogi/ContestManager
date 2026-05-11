-- 0030_drop_categories_tier.sql
-- Drop unused `tier` column from categories. Replaced by an editable
-- short description and the existing min_age/max_age fields in the UI.
ALTER TABLE public.categories DROP COLUMN IF EXISTS tier;
