-- LATAM Geo Intelligence Model
-- Adds three classification columns + deterministic backfill from existing fields + source rules.
-- NO changes to verified records' eligibility flags (match_eligible, seo_eligible, catalog_eligible).
-- Pure additive migration — safe to re-run (uses IF NOT EXISTS / DO NOTHING patterns).

-- 1. Add columns
ALTER TABLE public.opportunities
  ADD COLUMN IF NOT EXISTS remote_scope      TEXT,
  ADD COLUMN IF NOT EXISTS geo_confidence    TEXT,
  ADD COLUMN IF NOT EXISTS geo_evidence      TEXT;

-- 2. Add CHECK constraints (non-blocking — only on new writes)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_remote_scope' AND conrelid = 'public.opportunities'::regclass
  ) THEN
    ALTER TABLE public.opportunities
      ADD CONSTRAINT chk_remote_scope CHECK (
        remote_scope IS NULL OR remote_scope IN (
          'WORLDWIDE','LATAM','REGIONAL','COUNTRY_SPECIFIC','ONSITE','HYBRID','UNKNOWN'
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_geo_confidence' AND conrelid = 'public.opportunities'::regclass
  ) THEN
    ALTER TABLE public.opportunities
      ADD CONSTRAINT chk_geo_confidence CHECK (
        geo_confidence IS NULL OR geo_confidence IN ('CONFIRMED','LIKELY','UNKNOWN')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_geo_evidence' AND conrelid = 'public.opportunities'::regclass
  ) THEN
    ALTER TABLE public.opportunities
      ADD CONSTRAINT chk_geo_evidence CHECK (
        geo_evidence IS NULL OR geo_evidence IN (
          'explicit_country','explicit_country_list','explicit_latam','explicit_worldwide',
          'location_restrictions_api','application_requirement','source_structured_metadata',
          'description_text','source_level_default','location_text_parsed','unknown'
        )
      );
  END IF;
END $$;

-- 3. Backfill: onsite_country from location text for known sources
-- UNJobs location field contains country name in Spanish/Portuguese
UPDATE public.opportunities
SET onsite_country = CASE
    WHEN lower(trim(location)) IN ('brasil','brazil')                          THEN 'BR'
    WHEN lower(trim(location)) IN ('perú','peru')                              THEN 'PE'
    WHEN lower(trim(location)) IN ('colombia')                                 THEN 'CO'
    WHEN lower(trim(location)) IN ('méxico','mexico')                         THEN 'MX'
    WHEN lower(trim(location)) IN ('argentina')                               THEN 'AR'
    WHEN lower(trim(location)) IN ('bolivia')                                  THEN 'BO'
    WHEN lower(trim(location)) IN ('chile')                                    THEN 'CL'
    WHEN lower(trim(location)) IN ('paraguay')                                 THEN 'PY'
    WHEN lower(trim(location)) IN ('ecuador')                                  THEN 'EC'
    WHEN lower(trim(location)) IN ('uruguay')                                  THEN 'UY'
    WHEN lower(trim(location)) IN ('venezuela')                                THEN 'VE'
    WHEN lower(trim(location)) IN ('panamá','panama')                          THEN 'PA'
    WHEN lower(trim(location)) IN ('costa rica')                               THEN 'CR'
    WHEN lower(trim(location)) IN ('guatemala')                                THEN 'GT'
    WHEN lower(trim(location)) IN ('el salvador')                              THEN 'SV'
    WHEN lower(trim(location)) IN ('honduras')                                 THEN 'HN'
    WHEN lower(trim(location)) IN ('nicaragua')                                THEN 'NI'
    WHEN lower(trim(location)) IN ('república dominicana','dominican republic') THEN 'DO'
    ELSE onsite_country
  END
WHERE source = 'unjobs'
  AND onsite_country IS NULL
  AND deleted_at IS NULL;

-- For UNJobs: also set country_code where still missing
UPDATE public.opportunities
SET country_code = onsite_country
WHERE source = 'unjobs'
  AND onsite_country IS NOT NULL
  AND (country_code IS NULL OR country_code = '')
  AND deleted_at IS NULL;

-- Arbeitnow: set onsite_country from location text for European cities
UPDATE public.opportunities
SET onsite_country = CASE
    WHEN lower(location) LIKE '%berlin%' OR lower(location) LIKE '%hamburg%'
      OR lower(location) LIKE '%munich%' OR lower(location) LIKE '%münchen%'
      OR lower(location) LIKE '%frankfurt%' OR lower(location) LIKE '%cologne%'
      OR lower(location) LIKE '%mannheim%' OR lower(location) LIKE '%gilching%'
      OR lower(location) LIKE '%germany%' OR lower(location) LIKE '%german%'    THEN 'DE'
    WHEN lower(location) LIKE '%london%' OR lower(location) LIKE '%edinburgh%'
      OR lower(location) LIKE '%manchester%' OR lower(location) LIKE '%uk%'     THEN 'GB'
    WHEN lower(location) LIKE '%paris%' OR lower(location) LIKE '%france%'      THEN 'FR'
    WHEN lower(location) LIKE '%amsterdam%' OR lower(location) LIKE '%netherlands%' THEN 'NL'
    ELSE onsite_country
  END
WHERE source = 'arbeitnow'
  AND onsite_country IS NULL
  AND deleted_at IS NULL;

-- 4. Classify remote=true for known remote-first sources (backfill existing NULL records)
UPDATE public.opportunities
SET remote = true
WHERE source IN ('himalayas','weworkremotely','jobicy','remotive')
  AND remote IS NULL
  AND deleted_at IS NULL;

-- 5. Backfill remote_scope, geo_confidence, geo_evidence
-- Priority order:
--   a) Explicit structured data: onsite_country, eligible_countries[], eligible_regions[]
--   b) Source + remote boolean
--   c) Source-level defaults
UPDATE public.opportunities SET
  remote_scope = CASE
    -- Confirmed onsite
    WHEN onsite_country IS NOT NULL THEN 'ONSITE'
    -- Explicit worldwide from eligible_countries
    WHEN eligible_countries IS NOT NULL AND array_length(eligible_countries, 1) > 5 THEN 'WORLDWIDE'
    -- Explicit LATAM from eligible_regions
    WHEN eligible_regions IS NOT NULL AND EXISTS (
      SELECT 1 FROM unnest(eligible_regions) r
      WHERE lower(r) IN ('latam','latin america','latin-america','latin_america','americas','south america')
    ) THEN 'LATAM'
    -- Known remote-first global boards
    WHEN source IN ('himalayas','weworkremotely','jobicy','remotive') AND remote = true THEN 'WORLDWIDE'
    -- Arbeitnow: EU-regional remote
    WHEN source = 'arbeitnow' AND remote = true THEN 'REGIONAL'
    WHEN source = 'arbeitnow' THEN 'REGIONAL'
    -- Known LATAM scholarship/program sources
    WHEN source IN ('oas_scholarships','coimbra_group','erasmus_mundus','santander_open_academy',
                    'one_young_world_scholarships','fundacion_carolina') THEN 'LATAM'
    -- Paraguay-only official sources
    WHEN source IN ('computrabajo','clasipar','mitic_opportunities','snj_paraguay',
                    'mic_portal_emprendedor','ucom_job_board','cird_competitions_tenders') THEN 'COUNTRY_SPECIFIC'
    -- EU Delegation: per eligible_countries data
    WHEN source = 'eu_delegation_paraguay' AND eligible_countries IS NOT NULL
      AND array_length(eligible_countries, 1) > 0 THEN 'COUNTRY_SPECIFIC'
    WHEN source = 'eu_delegation_paraguay' THEN 'COUNTRY_SPECIFIC'
    -- UNJobs: onsite in the specific country
    WHEN source = 'unjobs' THEN 'ONSITE'
    -- International dev orgs: likely LATAM but not confirmed
    WHEN source IN ('opportunitydesk','oyaop','impactpool') THEN 'UNKNOWN'
    ELSE 'UNKNOWN'
  END,
  geo_confidence = CASE
    WHEN onsite_country IS NOT NULL AND onsite_country = country_code THEN 'CONFIRMED'
    WHEN onsite_country IS NOT NULL THEN 'CONFIRMED'
    WHEN eligible_countries IS NOT NULL AND array_length(eligible_countries, 1) > 0 THEN 'CONFIRMED'
    WHEN eligible_regions IS NOT NULL AND array_length(eligible_regions, 1) > 0 THEN 'CONFIRMED'
    WHEN source IN ('himalayas','weworkremotely','jobicy','remotive','arbeitnow') THEN 'LIKELY'
    WHEN source IN ('oas_scholarships','coimbra_group','erasmus_mundus','santander_open_academy',
                    'one_young_world_scholarships','fundacion_carolina') THEN 'LIKELY'
    WHEN source IN ('computrabajo','clasipar','mitic_opportunities','snj_paraguay',
                    'mic_portal_emprendedor','ucom_job_board','cird_competitions_tenders',
                    'eu_delegation_paraguay','unjobs') THEN 'CONFIRMED'
    ELSE 'UNKNOWN'
  END,
  geo_evidence = CASE
    WHEN eligible_countries IS NOT NULL AND array_length(eligible_countries, 1) > 0 THEN 'explicit_country_list'
    WHEN eligible_regions IS NOT NULL AND array_length(eligible_regions, 1) > 0 THEN 'explicit_latam'
    WHEN onsite_country IS NOT NULL AND source = 'unjobs' THEN 'location_text_parsed'
    WHEN onsite_country IS NOT NULL AND source = 'arbeitnow' THEN 'location_text_parsed'
    WHEN onsite_country IS NOT NULL THEN 'explicit_country'
    WHEN country_code IS NOT NULL AND country_code != '' THEN 'explicit_country'
    WHEN source IN ('himalayas','weworkremotely','jobicy','remotive','arbeitnow') THEN 'source_level_default'
    WHEN source IN ('oas_scholarships','coimbra_group','erasmus_mundus','santander_open_academy',
                    'one_young_world_scholarships','fundacion_carolina') THEN 'source_level_default'
    WHEN source IN ('computrabajo','clasipar','mitic_opportunities','snj_paraguay',
                    'mic_portal_emprendedor','ucom_job_board','cird_competitions_tenders',
                    'eu_delegation_paraguay','unjobs') THEN 'source_structured_metadata'
    ELSE 'unknown'
  END
WHERE remote_scope IS NULL
  AND deleted_at IS NULL;

-- 6. Add indexes for geo filtering queries
CREATE INDEX IF NOT EXISTS idx_opportunities_remote_scope ON public.opportunities (remote_scope)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_opportunities_geo_confidence ON public.opportunities (geo_confidence)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_opportunities_onsite_country ON public.opportunities (onsite_country)
  WHERE deleted_at IS NULL AND onsite_country IS NOT NULL;
