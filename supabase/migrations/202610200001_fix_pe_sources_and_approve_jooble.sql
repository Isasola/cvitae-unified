-- Fix jooble_pe source policy (registered after bulk-enable migration 202610150001
-- so it retained default matching_enabled=false, catalog_enabled=false, country_code=null).
-- Also registers missing PE portals for future scraper runs.

begin;

-- 1. Fix jooble_pe — bring it to the same state as the other PE sources.
update public.opportunity_sources
set
  country_code      = 'PE',
  matching_enabled  = true,
  catalog_enabled   = true,
  alerts_enabled    = true,
  seo_enabled       = true,
  web_catalog_allowed                    = true,
  search_engine_indexing_allowed         = true,
  google_jobs_distribution_allowed       = true,
  updated_at        = clock_timestamp(),
  updated_by        = 'migration:202610200001'
where source = 'jooble_pe';

-- 2. Register PE portals not yet in opportunity_sources.
--    aptitus_pe and infojobs_pe are intentionally excluded (dead URLs, disabled in scrapers.yml).
insert into public.opportunity_sources (
  source, display_name, country_code,
  is_enabled, catalog_enabled, matching_enabled, alerts_enabled, seo_enabled,
  web_catalog_allowed, search_engine_indexing_allowed,
  google_jobs_distribution_allowed, third_party_job_distribution_allowed,
  source_attribution_required, registry_certified, updated_by
) values
  ('computrabajo_pe', 'Computrabajo Perú',   'PE', true, true, true, true, true, true, true, true, false, false, false, 'migration:202610200001'),
  ('bumeran_pe',      'Bumeran Perú',         'PE', true, true, true, true, true, true, true, true, false, false, false, 'migration:202610200001'),
  ('laborum_pe',      'Laborum Perú',         'PE', true, true, true, true, true, true, true, true, false, false, false, 'migration:202610200001'),
  ('indeed_pe',       'Indeed Perú',          'PE', true, true, true, true, true, true, true, false, false, false, false, 'migration:202610200001')
on conflict (source) do update set
  country_code      = excluded.country_code,
  is_enabled        = excluded.is_enabled,
  catalog_enabled   = excluded.catalog_enabled,
  matching_enabled  = excluded.matching_enabled,
  alerts_enabled    = excluded.alerts_enabled,
  seo_enabled       = excluded.seo_enabled,
  updated_at        = clock_timestamp(),
  updated_by        = excluded.updated_by;

-- 3. Auto-approve jooble_pe in_review opportunities (same logic as 202610150001).
--    The trigger will re-evaluate match_eligible/catalog_eligible via the updated source policy.
update public.opportunities o
set
  verification_status      = 'verified',
  is_active                = true,
  original_source_verified = true
from public.opportunity_sources os
where o.source = os.source
  and o.source = 'jooble_pe'
  and o.verification_status = 'in_review'
  and os.is_enabled = true
  and os.catalog_enabled = true
  and o.title is not null
  and trim(o.title) != ''
  and o.application_url is not null
  and trim(o.application_url) != '';

-- 4. Queue all PE sources for universe re-evaluation on next cron cycle.
insert into public.opportunity_universe_dirty_sources (canonical_source, reason)
values
  ('jooble_pe',       'SOURCE_POLICY_UPDATE'),
  ('computrabajo_pe', 'SOURCE_REGISTERED'),
  ('bumeran_pe',      'SOURCE_REGISTERED'),
  ('laborum_pe',      'SOURCE_REGISTERED'),
  ('indeed_pe',       'SOURCE_REGISTERED')
on conflict (canonical_source) do update
  set queued_at = clock_timestamp(),
      reason    = excluded.reason,
      cursor_id = null;

commit;
