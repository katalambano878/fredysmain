CREATE TABLE IF NOT EXISTS public.gallery_preorders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gallery_item_id uuid NOT NULL REFERENCES public.homepage_gallery(id) ON DELETE CASCADE,
  gallery_title text,
  gallery_image_url text,
  customer_name text NOT NULL,
  customer_phone text NOT NULL,
  customer_email text,
  preferred_size text,
  notes text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','contacted','in_production','completed','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gallery_preorders_status ON public.gallery_preorders (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gallery_preorders_gallery_item ON public.gallery_preorders (gallery_item_id);

COMMENT ON TABLE public.gallery_preorders IS 'Customer requests to preorder a design from the gallery showcase.';

ALTER TABLE public.gallery_preorders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on gallery_preorders"
  ON public.gallery_preorders FOR ALL
  USING (true) WITH CHECK (true);
