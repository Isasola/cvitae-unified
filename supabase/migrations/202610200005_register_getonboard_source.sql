-- Register Get on Board as a new opportunity source.
-- Public API (no auth), LATAM coverage, official docs at api-doc.getonbrd.com.
-- source_authority = aggregator (companies post on the platform; not the employer's own system).

INSERT INTO public.opportunity_sources (
  source, display_name, country_code,
  is_enabled, catalog_enabled, matching_enabled, alerts_enabled, seo_enabled,
  web_catalog_allowed, search_engine_indexing_allowed,
  google_jobs_distribution_allowed, third_party_job_distribution_allowed,
  source_attribution_required, registry_certified, updated_by
) VALUES (
  'getonboard', 'Get on Board', NULL,
  true, true, true, true, true,
  true, true, true, false,
  false, false, 'migration:202610200005'
)
ON CONFLICT (source) DO UPDATE SET
  is_enabled        = true,
  catalog_enabled   = true,
  matching_enabled  = true,
  updated_at        = clock_timestamp(),
  updated_by        = excluded.updated_by;

INSERT INTO public.opportunity_universe_dirty_sources (canonical_source, reason)
VALUES ('getonboard', 'SOURCE_REGISTERED')
ON CONFLICT (canonical_source) DO UPDATE
  SET queued_at = clock_timestamp(),
      reason    = excluded.reason,
      cursor_id = null;
