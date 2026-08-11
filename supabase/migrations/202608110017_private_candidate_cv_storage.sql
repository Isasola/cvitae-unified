ALTER TABLE public.vacancy_applications
  ADD COLUMN IF NOT EXISTS cv_storage_path text,
  ADD COLUMN IF NOT EXISTS cv_parse_status text NOT NULL DEFAULT 'missing';

UPDATE public.vacancy_applications
SET cv_parse_status = 'missing'
WHERE cv_parse_status NOT IN ('parsed', 'manual_review', 'missing');

ALTER TABLE public.vacancy_applications
  DROP CONSTRAINT IF EXISTS vacancy_applications_cv_parse_status_check;

ALTER TABLE public.vacancy_applications
  ADD CONSTRAINT vacancy_applications_cv_parse_status_check
  CHECK (cv_parse_status IN ('parsed', 'manual_review', 'missing'));

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('candidate-cvs', 'candidate-cvs', false, 4194304, ARRAY['application/pdf'])
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 4194304,
  allowed_mime_types = ARRAY['application/pdf'];

-- Access is exclusively through service-role functions after recruiter ownership checks.
DROP POLICY IF EXISTS "candidate_cvs_public_read" ON storage.objects;
