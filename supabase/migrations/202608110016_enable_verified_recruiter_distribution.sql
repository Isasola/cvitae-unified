-- Vacancies created by an approved recruiter are first-party CVitae records.
-- The server verifies recruiter ownership before inserting them.
UPDATE public.opportunity_sources
SET trust_level = 'trusted',
    catalog_enabled = true,
    matching_enabled = true,
    alerts_enabled = true,
    seo_enabled = true,
    allowed_country_codes = ARRAY['PY'],
    allowed_opportunity_types = ARRAY['job'],
    updated_by = 'migration',
    updated_at = now()
WHERE source = 'recruiter_b2b';

UPDATE public.opportunities
SET catalog_eligible = true,
    match_eligible = true,
    alerts_eligible = true,
    seo_eligible = true,
    updated_at = now()
WHERE source = 'recruiter_b2b'
  AND verification_status = 'verified'
  AND is_active = true
  AND deleted_at IS NULL
  AND archived_at IS NULL;
