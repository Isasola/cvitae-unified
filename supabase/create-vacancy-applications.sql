-- ============================================================
-- CVitae — Tabla de postulantes por vacante
-- Ejecutar en: Supabase Studio → SQL Editor
-- Requiere: recruiter_vacancies ya creada
-- ============================================================

CREATE TABLE IF NOT EXISTS public.vacancy_applications (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  vacancy_id    uuid REFERENCES public.recruiter_vacancies(id) ON DELETE CASCADE,
  vacancy_slug  text NOT NULL,
  name          text NOT NULL,
  email         text NOT NULL,
  cv_text       text,
  cv_file_name  text,
  cover_letter  text,
  ats_score     integer,
  applied_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vacancy_applications_vacancy_id_idx ON public.vacancy_applications(vacancy_id);
CREATE INDEX IF NOT EXISTS vacancy_applications_email_idx      ON public.vacancy_applications(email);

ALTER TABLE public.vacancy_applications ENABLE ROW LEVEL SECURITY;

-- Service role (funciones serverless) puede hacer todo
CREATE POLICY "applications_service_all"
  ON public.vacancy_applications
  FOR ALL
  USING (true)
  WITH CHECK (true);
