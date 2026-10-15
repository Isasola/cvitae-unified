-- Enable catalog+matching+alerts for all registered sources except:
-- B2B internal tools (candidate_custom, recruiter_b2b, oyaop) and
-- weworkremotely (explicitly denied by 202610140002).
-- Sources already enabled remain unchanged (on conflict do update only changes consumers).

begin;

-- Enable consumer dimensions for legitimate registered sources
update public.opportunity_sources
set
  catalog_enabled  = true,
  matching_enabled = true,
  alerts_enabled   = true,
  seo_enabled      = true,
  updated_at       = clock_timestamp(),
  updated_by       = 'migration:202610150001'
where is_enabled = true
  and source not in ('weworkremotely', 'candidate_custom', 'recruiter_b2b', 'oyaop');

-- Queue all just-enabled sources so the maintenance cron re-evaluates their
-- opportunity_universe_state rows in the next hourly cycle.
insert into public.opportunity_universe_dirty_sources (canonical_source, reason)
select distinct
  coalesce(a.canonical_source, lower(trim(os.source))),
  'SOURCE_POLICY_BULK_ENABLE'
from public.opportunity_sources os
left join public.opportunity_source_identity_aliases a on a.emitted_source = lower(trim(os.source))
where os.is_enabled = true
  and os.source not in ('weworkremotely', 'candidate_custom', 'recruiter_b2b', 'oyaop')
on conflict (canonical_source) do update
  set queued_at = clock_timestamp(),
      reason    = excluded.reason,
      cursor_id = null;

-- Approve all in_review rows that have original_source_verified=true.
-- These rows were blocked only because the scraper previously omitted the flag.
-- Rows from explicitly denied sources are excluded — the permission trigger will
-- re-block them in opportunity_universe_state if they ever reach ACTIVE_VALID.
update public.opportunities
set
  verification_status = 'verified',
  is_active           = true,
  original_source_verified = true
where verification_status = 'in_review'
  and original_source_verified = true
  and source not in ('weworkremotely', 'candidate_custom', 'recruiter_b2b', 'oyaop');

-- Approve in_review rows from sources the operator has registered as enabled,
-- even if original_source_verified was false (legacy rows pre-flag).
-- Gate: source must be is_enabled=true + catalog/matching now enabled by this migration.
update public.opportunities o
set
  verification_status      = 'verified',
  is_active                = true,
  original_source_verified = true
from public.opportunity_sources os
where o.source = os.source
  and o.verification_status = 'in_review'
  and os.is_enabled = true
  and os.catalog_enabled = true   -- just set above
  and o.source not in ('weworkremotely', 'candidate_custom', 'recruiter_b2b', 'oyaop')
  and o.title is not null
  and trim(o.title) != ''
  and o.application_url is not null
  and trim(o.application_url) != '';

commit;
