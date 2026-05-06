-- Per-variant cost-of-production overrides.
--
-- Adds a JSONB column on product_cost_of_production that stores optional
-- per-variant cost overrides without changing the existing per-product
-- defaults (fabric_cost / other_cost / labour_cost). Variants that do
-- not appear in this object simply inherit the product-level defaults.
--
-- Shape:
--   {
--     "<color>|||<size>": {
--       "fabric_cost": 70,    -- numeric, optional
--       "other_cost":  12,    -- numeric, optional
--       "labour_cost": 35     -- numeric, optional
--     },
--     ...
--   }
-- Keys mirror the variant key the admin form already uses.

ALTER TABLE public.product_cost_of_production
  ADD COLUMN IF NOT EXISTS per_variant_costs jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.product_cost_of_production.per_variant_costs IS
  'Optional per-variant cost overrides keyed by "<color>|||<size>". Each entry may set fabric_cost, other_cost, labour_cost. Missing keys inherit the product-level defaults.';
