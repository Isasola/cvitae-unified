-- ============================================================
-- CVitae — Migraciones pendientes
-- Ejecutar en: Supabase Studio → SQL Editor
-- Todas idempotentes (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS)
-- ============================================================

-- 1. Toggle de alertas por email en perfiles B2C
ALTER TABLE public.user_master_profiles
  ADD COLUMN IF NOT EXISTS is_subscribed boolean DEFAULT false;

-- 2. Columna description en opportunities (para guardar vacantes B2B y externas)
ALTER TABLE public.opportunities
  ADD COLUMN IF NOT EXISTS description text;

-- 3. Vincular oportunidades creadas desde el panel B2B
ALTER TABLE public.opportunities
  ADD COLUMN IF NOT EXISTS recruiter_vacancy_id uuid REFERENCES public.recruiter_vacancies(id) ON DELETE SET NULL;

-- 4. Origen de la oportunidad (scraper | recruiter_b2b | imported_b2c)
ALTER TABLE public.opportunities
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'scraper';

-- 5. UNIQUE constraint en application_url para que los scrapers hagan upsert correcto
--    (sin esto el ?on_conflict=application_url ignora duplicados en vez de actualizarlos)
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

-- 6. Índices de performance para búsquedas frecuentes
CREATE INDEX IF NOT EXISTS opportunities_source_idx      ON public.opportunities(source);
CREATE INDEX IF NOT EXISTS opportunities_is_active_idx   ON public.opportunities(is_active);
CREATE INDEX IF NOT EXISTS opportunities_rubro_idx       ON public.opportunities(rubro);
CREATE INDEX IF NOT EXISTS opportunities_type_idx        ON public.opportunities(type);

-- Verificación final
SELECT
  column_name,
  data_type,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'opportunities'
ORDER BY ordinal_position;
