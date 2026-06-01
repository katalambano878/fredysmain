-- Product gender / target audience.
--
-- Adds a `gender` column to products so each item can be tagged as for
-- boys (male), girls (female), or unisex. Existing rows default to
-- 'unisex' so nothing is mis-categorised. A CHECK constraint keeps the
-- values controlled and queryable for storefront/admin filtering.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS gender text NOT NULL DEFAULT 'unisex';

ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_gender_check;

ALTER TABLE public.products
  ADD CONSTRAINT products_gender_check
  CHECK (gender IN ('male', 'female', 'unisex'));

CREATE INDEX IF NOT EXISTS idx_products_gender ON public.products (gender);

COMMENT ON COLUMN public.products.gender IS
  'Target audience for the product: male (boys), female (girls) or unisex. Used for admin and storefront filtering.';
