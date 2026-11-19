-- Register two new Perú job board scrapers: infojobs_pe and trabajando_pe.
-- Both are aggregators with explicit consumer permissions enabled from day one
-- so their rows are active immediately without going through in_review.

begin;

insert into public.opportunity_sources (
  source,
  display_name,
  country_code,
  is_enabled,
  catalog_enabled,
  matching_enabled,
  alerts_enabled,
  seo_enabled,
  web_catalog_allowed,
  search_engine_indexing_allowed,
  google_jobs_distribution_allowed,
  third_party_job_distribution_allowed,
  source_attribution_required,
  registry_certified,
  updated_by
) values
  (
    'infojobs_pe',
    'InfoJobs Perú',
    'PE',
    true, true, true, true, true,
    true, true, true, false, false, false,
    'migration:202610160004'
  ),
  (
    'trabajando_pe',
    'Trabajando.pe',
    'PE',
    true, true, true, true, true,
    true, true, true, false, false, false,
    'migration:202610160004'
  )
on conflict (source) do update set
  is_enabled      = excluded.is_enabled,
  catalog_enabled = excluded.catalog_enabled,
  matching_enabled = excluded.matching_enabled,
  alerts_enabled  = excluded.alerts_enabled,
  seo_enabled     = excluded.seo_enabled,
  updated_at      = clock_timestamp(),
  updated_by      = excluded.updated_by;

-- Queue for universe state evaluation on first scraper run
insert into public.opportunity_universe_dirty_sources (canonical_source, reason)
values
  ('infojobs_pe', 'SOURCE_REGISTERED'),
  ('trabajando_pe', 'SOURCE_REGISTERED')
on conflict (canonical_source) do update
  set queued_at = clock_timestamp(),
      reason    = excluded.reason,
      cursor_id = null;

commit;
