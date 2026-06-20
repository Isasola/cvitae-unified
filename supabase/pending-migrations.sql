-- ============================================================
-- CVitae — Migraciones pendientes
-- Ejecutar en: Supabase Studio → SQL Editor
-- Todas idempotentes — se puede correr múltiples veces sin error
-- ============================================================

-- 1. Toggle de alertas por email en perfiles B2C
ALTER TABLE public.user_master_profiles
  ADD COLUMN IF NOT EXISTS is_subscribed boolean DEFAULT false;

-- 2. Columnas nuevas en opportunities
ALTER TABLE public.opportunities
  ADD COLUMN IF NOT EXISTS description text;

ALTER TABLE public.opportunities
  ADD COLUMN IF NOT EXISTS recruiter_vacancy_id uuid REFERENCES public.recruiter_vacancies(id) ON DELETE SET NULL;

ALTER TABLE public.opportunities
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'scraper';

ALTER TABLE public.opportunities
  ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

ALTER TABLE public.opportunities
  ADD COLUMN IF NOT EXISTS location text;

ALTER TABLE public.opportunities
  ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}';

-- 3. UNIQUE constraint en application_url (crítico para upserts de scrapers)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'opportunities_application_url_key'
      AND conrelid = 'public.opportunities'::regclass
  ) THEN
    ALTER TABLE public.opportunities
      ADD CONSTRAINT opportunities_application_url_key UNIQUE (application_url);
  END IF;
END$$;

-- 4. Índices de performance (solo si la columna existe)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='opportunities' AND column_name='source') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS opportunities_source_idx ON public.opportunities(source)';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='opportunities' AND column_name='is_active') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS opportunities_is_active_idx ON public.opportunities(is_active)';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='opportunities' AND column_name='rubro') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS opportunities_rubro_idx ON public.opportunities(rubro)';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='opportunities' AND column_name='type') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS opportunities_type_idx ON public.opportunities(type)';
  END IF;
END$$;

-- 5. Tabla para rastrear posts de LinkedIn (evitar repeticiones)
CREATE TABLE IF NOT EXISTS public.linkedin_posts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id text REFERENCES public.opportunities(id) ON DELETE CASCADE,
  linkedin_post_id text,
  created_at  timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS linkedin_posts_opp_idx ON public.linkedin_posts(opportunity_id);

-- 6. Verificación — muestra todas las columnas actuales de opportunities
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'opportunities'
ORDER BY ordinal_position;
