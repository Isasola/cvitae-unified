-- Register FuentePy as a new opportunity source.
-- Original ATS platform (ats.fuentepy.com) — Supabase-backed public API, Paraguay-only.
-- source_authority = original (companies publish directly on FuentePy's own ATS).

INSERT INTO public.opportunity_sources (
  source, display_name, country_code,
  is_enabled, catalog_enabled, matching_enabled, alerts_enabled, seo_enabled,
  web_catalog_allowed, search_engine_indexing_allowed,
  google_jobs_distribution_allowed, third_party_job_distribution_allowed,
  source_attribution_required, registry_certified, updated_by
) VALUES (
  'fuentepy', 'FuentePy', 'PY',
  true, true, true, true, true,
  true, true, true, false,
  false, false, 'migration:202611170002'
)
ON CONFLICT (source) DO UPDATE SET
  is_enabled        = true,
  catalog_enabled   = true,
  matching_enabled  = true,
  updated_at        = clock_timestamp(),
  updated_by        = excluded.updated_by;

INSERT INTO public.opportunity_universe_dirty_sources (canonical_source, reason)
VALUES ('fuentepy', 'SOURCE_REGISTERED')
ON CONFLICT (canonical_source) DO UPDATE
  SET queued_at = clock_timestamp(),
      reason    = excluded.reason,
      cursor_id = null;
