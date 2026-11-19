-- Trust pipeline: retain every candidate opportunity, but expose and match only
-- records that passed an explicit or source-level verification decision.
ALTER TABLE public.opportunities
  ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS verification_score integer,
  ADD COLUMN IF NOT EXISTS verification_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS verification_note text,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_by text,
  ADD COLUMN IF NOT EXISTS country_code text,
  ADD COLUMN IF NOT EXISTS department text,
  ADD COLUMN IF NOT EXISTS city text;

ALTER TABLE public.opportunities DROP CONSTRAINT IF EXISTS opportunities_verification_status_check;
ALTER TABLE public.opportunities ADD CONSTRAINT opportunities_verification_status_check
  CHECK (verification_status IN ('pending', 'in_review', 'verified', 'rejected', 'quarantined'));
ALTER TABLE public.opportunities DROP CONSTRAINT IF EXISTS opportunities_verification_score_check;
ALTER TABLE public.opportunities ADD CONSTRAINT opportunities_verification_score_check
  CHECK (verification_score IS NULL OR verification_score BETWEEN 0 AND 100);

CREATE TABLE IF NOT EXISTS public.opportunity_sources (
  source text PRIMARY KEY,
  display_name text NOT NULL,
  country_code text,
  trust_level text NOT NULL DEFAULT 'review',
  auto_verify boolean NOT NULL DEFAULT false,
  is_enabled boolean NOT NULL DEFAULT true,
  verification_criteria jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT opportunity_sources_trust_level_check CHECK (trust_level IN ('trusted', 'review', 'blocked'))
);

INSERT INTO public.opportunity_sources
  (source, display_name, country_code, trust_level, auto_verify, verification_criteria, notes)
VALUES
  ('computrabajo', 'Computrabajo Paraguay', 'PY', 'trusted', true,
   '["URL válida de la fuente", "ubicación compatible con Paraguay", "título y empresa normalizados", "deduplicación por URL"]'::jsonb,
   'Fuente paraguaya activa; resultados extranjeros se ponen en cuarentena.'),
  ('recruiter_b2b', 'Empresa en CVitae', 'PY', 'review', false,
   '["empresa verificada", "descripción y requisitos completos", "ubicación declarada", "canal de postulación válido"]'::jsonb,
   'Se aprueba automáticamente sólo cuando el token pertenece a una empresa verificada.'),
  ('candidate_custom', 'Vacante aportada por candidato', null, 'review', false,
   '["fuente original comprobable", "vacante vigente", "organización identificable"]'::jsonb,
   'Nunca participa del matching antes de revisión.')
ON CONFLICT (source) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  country_code = EXCLUDED.country_code,
  trust_level = EXCLUDED.trust_level,
  auto_verify = EXCLUDED.auto_verify,
  verification_criteria = EXCLUDED.verification_criteria,
  notes = EXCLUDED.notes,
  updated_at = now();

CREATE OR REPLACE FUNCTION public.apply_opportunity_source_trust()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE source_policy public.opportunity_sources%ROWTYPE;
BEGIN
  SELECT * INTO source_policy FROM public.opportunity_sources WHERE source = NEW.source;
  IF FOUND THEN
    NEW.country_code := coalesce(NEW.country_code, source_policy.country_code);
    IF NEW.verification_status = 'pending' AND source_policy.auto_verify AND source_policy.is_enabled THEN
      NEW.verification_status := 'verified';
      NEW.verification_score := coalesce(NEW.verification_score, 85);
      NEW.verification_reasons := coalesce(nullif(NEW.verification_reasons, '[]'::jsonb), source_policy.verification_criteria);
      NEW.reviewed_at := coalesce(NEW.reviewed_at, now());
      NEW.reviewed_by := coalesce(NEW.reviewed_by, 'source_policy:' || NEW.source);
    ELSIF source_policy.trust_level = 'blocked' OR NOT source_policy.is_enabled THEN
      NEW.verification_status := 'quarantined';
      NEW.is_active := false;
    ELSE
      NEW.is_active := false;
    END IF;
  ELSIF NEW.verification_status <> 'verified' THEN
    NEW.is_active := false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS opportunity_source_trust_before_insert ON public.opportunities;
CREATE TRIGGER opportunity_source_trust_before_insert
  BEFORE INSERT ON public.opportunities
  FOR EACH ROW EXECUTE FUNCTION public.apply_opportunity_source_trust();

CREATE TABLE IF NOT EXISTS public.opportunity_review_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id text NOT NULL REFERENCES public.opportunities(id) ON DELETE CASCADE,
  previous_status text,
  new_status text NOT NULL,
  criteria jsonb NOT NULL DEFAULT '[]'::jsonb,
  note text,
  actor text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.opportunity_review_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.opportunity_review_events FROM anon, authenticated;
GRANT ALL ON TABLE public.opportunity_review_events TO service_role;

ALTER TABLE public.recruiter_tokens
  ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS verification_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS verified_by text;
ALTER TABLE public.recruiter_tokens DROP CONSTRAINT IF EXISTS recruiter_tokens_verification_status_check;
ALTER TABLE public.recruiter_tokens ADD CONSTRAINT recruiter_tokens_verification_status_check
  CHECK (verification_status IN ('pending', 'in_review', 'verified', 'rejected'));

ALTER TABLE public.recruiter_leads
  ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS verification_data jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.recruiter_leads DROP CONSTRAINT IF EXISTS recruiter_leads_verification_status_check;
ALTER TABLE public.recruiter_leads ADD CONSTRAINT recruiter_leads_verification_status_check
  CHECK (verification_status IN ('pending', 'in_review', 'verified', 'rejected'));

-- Existing Computrabajo records passed the source audit performed on 2026-08-11.
UPDATE public.opportunities
SET verification_status = CASE WHEN is_active THEN 'verified' ELSE 'quarantined' END,
    verification_score = CASE WHEN is_active THEN 85 ELSE 20 END,
    verification_reasons = CASE WHEN is_active
      THEN '["fuente paraguaya auditada", "URL deduplicada", "ubicación filtrada"]'::jsonb
      ELSE '["registro inactivo o fuera del alcance geográfico"]'::jsonb END,
    reviewed_at = now(),
    reviewed_by = 'migration:source_audit_20260811',
    country_code = 'PY'
WHERE source = 'computrabajo';

-- Initial Paraguay geography normalization. Raw location is retained whenever it
-- contains more information than the canonical city/department fields.
UPDATE public.opportunities
SET location = trim(split_part(location, ',', 1))
WHERE country_code = 'PY'
  AND lower(trim(split_part(location, ',', 1))) = lower(trim(split_part(location, ',', 2)))
  AND trim(split_part(location, ',', 1)) <> '';

UPDATE public.opportunities
SET city = nullif(trim(split_part(location, ',', 1)), ''),
    department = CASE
      WHEN lower(trim(split_part(location, ',', 1))) = 'asunción' THEN 'Capital'
      WHEN lower(trim(split_part(location, ',', 1))) IN ('san lorenzo','luque','capiatá','fernando de la mora','mariano roque alonso','limpio','lambaré') THEN 'Central'
      WHEN lower(trim(split_part(location, ',', 1))) IN ('ciudad del este','hernandarias','presidente franco','minga guazú') THEN 'Alto Paraná'
      WHEN lower(trim(split_part(location, ',', 1))) = 'encarnación' THEN 'Itapúa'
      WHEN lower(trim(split_part(location, ',', 1))) = 'caaguazú' THEN 'Caaguazú'
      ELSE nullif(trim(split_part(location, ',', 2)), '')
    END
WHERE country_code = 'PY';

UPDATE public.opportunities
SET verification_status = 'pending', is_active = false
WHERE source <> 'computrabajo' AND verification_status = 'pending';

CREATE INDEX IF NOT EXISTS opportunities_moderation_queue_idx
  ON public.opportunities (verification_status, created_at DESC);
CREATE INDEX IF NOT EXISTS opportunities_match_eligible_idx
  ON public.opportunities (created_at DESC)
  WHERE is_active = true AND verification_status = 'verified';
CREATE INDEX IF NOT EXISTS opportunities_geo_verified_idx
  ON public.opportunities (country_code, department, city)
  WHERE is_active = true AND verification_status = 'verified';
