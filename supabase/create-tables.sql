-- ============================================================
-- CVitae — Crear tabla recruiter_vacancies
-- Ejecutar PRIMERO este script antes de seed-vacantes.sql
-- Supabase Studio → SQL Editor
-- ============================================================

-- NOTE: This table already exists in production with these column names:
-- company (not company_name), recruiter_token_id (not token_id)
-- Only run if table does NOT exist yet.
CREATE TABLE IF NOT EXISTS public.recruiter_vacancies (
  id                  uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title               text NOT NULL,
  description         text NOT NULL,
  requirements        text NOT NULL,
  location            text NOT NULL,
  modality            text NOT NULL DEFAULT 'Presencial',
  salary_range        text,
  company             text NOT NULL,
  slug                text NOT NULL UNIQUE,
  recruiter_token_id  uuid REFERENCES public.recruiter_tokens(id) ON DELETE SET NULL,
  is_active           boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- Índice para búsqueda por slug (usado en VacantePage)
CREATE INDEX IF NOT EXISTS recruiter_vacancies_slug_idx ON public.recruiter_vacancies(slug);

-- Índice para filtrar vacantes de un reclutador
CREATE INDEX IF NOT EXISTS recruiter_vacancies_token_idx ON public.recruiter_vacancies(recruiter_token_id);

-- RLS: habilitar (las vacantes activas son públicas, las privadas solo del token owner)
ALTER TABLE public.recruiter_vacancies ENABLE ROW LEVEL SECURITY;

-- Política: lectura pública de vacantes activas
CREATE POLICY "vacancies_public_read"
  ON public.recruiter_vacancies
  FOR SELECT
  USING (is_active = true);

-- Política: service role puede hacer todo (para las funciones serverless)
CREATE POLICY "vacancies_service_all"
  ON public.recruiter_vacancies
  USING (true)
  WITH CHECK (true);
