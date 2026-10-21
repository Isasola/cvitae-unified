-- Fix frigorificos_py source policy: registered as is_enabled=true but with
-- matching_enabled=false and catalog_enabled=false, leaving its 2 opportunities
-- stuck in in_review. Same pattern as jooble_pe (202610200001).

begin;

update public.opportunity_sources
set
  country_code      = 'PY',
  matching_enabled  = true,
  catalog_enabled   = true,
  alerts_enabled    = true,
  seo_enabled       = true,
  updated_at        = clock_timestamp(),
  updated_by        = 'migration:202610200002'
where source = 'frigorificos_py';

-- Auto-approve in_review opportunities from frigorificos_py.
update public.opportunities o
set
  verification_status      = 'verified',
  is_active                = true,
  original_source_verified = true
from public.opportunity_sources os
where o.source = os.source
  and o.source = 'frigorificos_py'
  and o.verification_status = 'in_review'
  and os.is_enabled = true
  and os.catalog_enabled = true
  and o.title is not null
  and trim(o.title) != ''
  and o.application_url is not null
  and trim(o.application_url) != '';

insert into public.opportunity_universe_dirty_sources (canonical_source, reason)
values ('frigorificos_py', 'SOURCE_POLICY_UPDATE')
on conflict (canonical_source) do update
  set queued_at = clock_timestamp(),
      reason    = excluded.reason,
      cursor_id = null;

commit;
