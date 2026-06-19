-- ============================================================
-- CVitae — Agregar columnas de análisis a vacancy_applications
-- Ejecutar en: Supabase Studio → SQL Editor
-- ============================================================

ALTER TABLE public.vacancy_applications
  ADD COLUMN IF NOT EXISTS fit_score      integer,
  ADD COLUMN IF NOT EXISTS recommendation text,
  ADD COLUMN IF NOT EXISTS ai_summary     text,
  ADD COLUMN IF NOT EXISTS strengths      jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS key_matches    jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS key_gaps       jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS analyzed_at    timestamptz;

CREATE INDEX IF NOT EXISTS vacancy_applications_fit_score_idx
  ON public.vacancy_applications(fit_score DESC NULLS LAST);
