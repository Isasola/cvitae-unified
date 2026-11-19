-- Two control planes: execution policy for collectors and distribution policy
-- for the opportunities they produce.
CREATE TABLE IF NOT EXISTS public.scraper_controls (
  scraper_id text PRIMARY KEY,
  scraper_name text NOT NULL,
  script_path text NOT NULL,
  collection_enabled boolean NOT NULL DEFAULT false,
  max_items_per_run integer NOT NULL DEFAULT 250,
  max_runtime_seconds integer NOT NULL DEFAULT 600,
  consecutive_failures_before_pause integer NOT NULL DEFAULT 3,
  auto_pause_on_failure boolean NOT NULL DEFAULT true,
  require_review boolean NOT NULL DEFAULT true,
  allowed_country_codes text[] NOT NULL DEFAULT ARRAY['PY']::text[],
  notes text,
  paused_reason text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);

INSERT INTO public.scraper_controls (scraper_id, scraper_name, script_path)
SELECT DISTINCT ON (scraper_id) scraper_id, scraper_name, script_path
FROM public.scraper_runs
WHERE scraper_id IS NOT NULL AND script_path IS NOT NULL
ORDER BY scraper_id, started_at DESC
ON CONFLICT (scraper_id) DO UPDATE SET
  scraper_name = EXCLUDED.scraper_name,
  script_path = EXCLUDED.script_path;

INSERT INTO public.scraper_controls
  (scraper_id, scraper_name, script_path, collection_enabled, max_items_per_run, max_runtime_seconds, require_review, allowed_country_codes, notes, updated_by)
VALUES
  ('computrabajo_scraper', 'Computrabajo Paraguay', 'scrapers/computrabajo_scraper.py', true, 800, 1200, false, ARRAY['PY'], 'Fuente auditada el 2026-08-11.', 'migration')
ON CONFLICT (scraper_id) DO UPDATE SET
  collection_enabled = true,
  max_items_per_run = 800,
  max_runtime_seconds = 1200,
  require_review = false,
  allowed_country_codes = ARRAY['PY'],
  notes = EXCLUDED.notes,
  updated_at = now(),
  updated_by = 'migration';

ALTER TABLE public.opportunity_sources
  ADD COLUMN IF NOT EXISTS catalog_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS matching_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS alerts_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS seo_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS allowed_country_codes text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS allowed_opportunity_types text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS max_items_per_day integer NOT NULL DEFAULT 250,
  ADD COLUMN IF NOT EXISTS retention_days integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_by text;

UPDATE public.opportunity_sources
SET catalog_enabled = true,
    matching_enabled = true,
    alerts_enabled = true,
    seo_enabled = true,
    allowed_country_codes = ARRAY['PY'],
    updated_by = 'migration'
WHERE source = 'computrabajo';

INSERT INTO public.opportunity_sources (source, display_name, trust_level, auto_verify, is_enabled, notes)
SELECT DISTINCT source, initcap(replace(source, '_', ' ')), 'review', false, true,
       'Registrada automáticamente desde oportunidades existentes.'
FROM public.opportunities
WHERE source IS NOT NULL AND trim(source) <> ''
ON CONFLICT (source) DO NOTHING;

ALTER TABLE public.opportunities
  ADD COLUMN IF NOT EXISTS catalog_eligible boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS match_eligible boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS alerts_eligible boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS seo_eligible boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS policy_overrides jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deletion_reason text;

UPDATE public.opportunities
SET catalog_eligible = true,
    match_eligible = true,
    alerts_eligible = true,
    seo_eligible = true
WHERE verification_status = 'verified' AND is_active = true AND deleted_at IS NULL;

CREATE OR REPLACE FUNCTION public.apply_opportunity_source_trust()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE source_policy public.opportunity_sources%ROWTYPE;
BEGIN
  INSERT INTO public.opportunity_sources (source, display_name, trust_level, auto_verify, is_enabled, notes)
  VALUES (coalesce(nullif(trim(NEW.source), ''), 'unknown'), initcap(replace(coalesce(nullif(trim(NEW.source), ''), 'unknown'), '_', ' ')), 'review', false, true, 'Fuente detectada automáticamente; requiere configuración.')
  ON CONFLICT (source) DO NOTHING;
  NEW.source := coalesce(nullif(trim(NEW.source), ''), 'unknown');
  SELECT * INTO source_policy FROM public.opportunity_sources WHERE source = NEW.source;
  NEW.country_code := coalesce(NEW.country_code, source_policy.country_code);

  IF source_policy.trust_level = 'blocked' OR NOT source_policy.is_enabled THEN
    NEW.verification_status := 'quarantined';
    NEW.is_active := false;
  ELSIF NEW.verification_status = 'pending' AND source_policy.auto_verify THEN
    NEW.verification_status := 'verified';
    NEW.verification_score := coalesce(NEW.verification_score, 85);
    NEW.verification_reasons := coalesce(nullif(NEW.verification_reasons, '[]'::jsonb), source_policy.verification_criteria);
    NEW.reviewed_at := coalesce(NEW.reviewed_at, now());
    NEW.reviewed_by := coalesce(NEW.reviewed_by, 'source_policy:' || NEW.source);
    NEW.is_active := true;
  ELSIF NEW.verification_status <> 'verified' THEN
    NEW.is_active := false;
  END IF;

  NEW.catalog_eligible := NEW.is_active AND NEW.verification_status = 'verified' AND source_policy.catalog_enabled;
  NEW.match_eligible := NEW.is_active AND NEW.verification_status = 'verified' AND source_policy.matching_enabled;
  NEW.alerts_eligible := NEW.is_active AND NEW.verification_status = 'verified' AND source_policy.alerts_enabled;
  NEW.seo_eligible := NEW.is_active AND NEW.verification_status = 'verified' AND source_policy.seo_enabled;
  RETURN NEW;
END;
$$;

CREATE INDEX IF NOT EXISTS opportunities_catalog_idx ON public.opportunities (updated_at DESC)
  WHERE catalog_eligible = true AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS opportunities_matching_idx ON public.opportunities (updated_at DESC)
  WHERE match_eligible = true AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS opportunities_review_source_idx ON public.opportunities (source, verification_status, created_at DESC)
  WHERE deleted_at IS NULL;

ALTER TABLE public.scraper_controls ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.scraper_controls FROM anon, authenticated;
GRANT ALL ON TABLE public.scraper_controls TO service_role;
REVOKE ALL ON TABLE public.opportunity_sources FROM anon, authenticated;
GRANT ALL ON TABLE public.opportunity_sources TO service_role;
