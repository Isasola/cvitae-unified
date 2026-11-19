ALTER TABLE public.opportunities
  ADD COLUMN IF NOT EXISTS slug text;

UPDATE public.opportunities
SET slug = id
WHERE slug IS NULL OR btrim(slug) = '';

CREATE UNIQUE INDEX IF NOT EXISTS opportunities_slug_key
  ON public.opportunities(slug);
