-- Add Paraguay Concursa as a closed source without replacing existing policy.
-- The first insertion is deliberately fail-closed; later changes remain owned
-- by admin_update_source_policy_atomic and the individual scraper control.
do $migration$
declare
  v_source public.opportunity_sources%rowtype;
  v_definition text;
  v_updated text;
begin
  insert into public.opportunity_sources (
    source, display_name, country_code, trust_level, auto_verify,
    is_enabled, catalog_enabled, matching_enabled, alerts_enabled, seo_enabled,
    verification_criteria, notes, updated_at, updated_by
  ) values (
    'paraguayconcursa_mef', 'Paraguay Concursa MEF', 'PY', 'review', false,
    false, false, false, false, false,
    '[]'::jsonb,
    'Registered closed; source and consumer permissions require separate review.',
    clock_timestamp(), 'migration'
  )
  on conflict (source) do nothing;

  select * into v_source
  from public.opportunity_sources
  where source = 'paraguayconcursa_mef'
  for update;
  if not found then
    raise exception 'paraguayconcursa_source_bootstrap_failed';
  end if;

  -- Use the existing administrative authority to create the audit event. If a
  -- pre-existing row is already active and has no closed event, do not silently
  -- disable it: abort and require an explicit operator decision.
  if not exists (
    select 1
    from public.admin_policy_events e
    where e.entity_type = 'source'
      and lower(e.entity_key) = 'paraguayconcursa_mef'
      and e.after_state->'explicit_consumer_switches' @> '{"source":false,"catalog":false,"matching":false,"alerts":false,"seo":false}'::jsonb
  ) then
    if v_source.is_enabled is distinct from false
      or v_source.catalog_enabled is distinct from false
      or v_source.matching_enabled is distinct from false
      or v_source.alerts_enabled is distinct from false
      or v_source.seo_enabled is distinct from false then
      raise exception 'paraguayconcursa_existing_policy_requires_admin_review';
    end if;

    perform public.admin_update_source_policy_atomic(
      'paraguayconcursa_mef',
      jsonb_build_object(
        'is_enabled', false,
        'catalog_enabled', false,
        'matching_enabled', false,
        'alerts_enabled', false,
        'seo_enabled', false
      ),
      v_source.updated_at,
      'migration:202610140001'
    );
  end if;

  if not exists (
    select 1
    from public.admin_policy_events e
    where e.entity_type = 'source'
      and lower(e.entity_key) = 'paraguayconcursa_mef'
      and e.after_state->'explicit_consumer_switches' @> '{"source":false,"catalog":false,"matching":false,"alerts":false,"seo":false}'::jsonb
  ) then
    raise exception 'paraguayconcursa_closed_source_policy_event_required';
  end if;

  select pg_get_functiondef('public.canonical_opportunity_source_policy(text)'::regprocedure)
    into v_definition;
  if v_definition is null then
    raise exception 'canonical_source_policy_function_missing';
  end if;
  if position(quote_literal('paraguayconcursa_mef') in v_definition) = 0 then
    v_updated := replace(
      v_definition,
      quote_literal('oya') || ',' || quote_literal('personal'),
      quote_literal('oya') || ',' || quote_literal('paraguayconcursa_mef') || ',' || quote_literal('personal')
    );
    if v_updated = v_definition then
      raise exception 'canonical_source_policy_insertion_anchor_missing';
    end if;
    execute v_updated;
  end if;

  -- Create the collector control only when absent. Reapplying this migration
  -- must preserve a later, explicitly managed collection decision.
  insert into public.scraper_controls (
    scraper_id, scraper_name, script_path, collection_enabled,
    max_items_per_run, max_runtime_seconds, consecutive_failures_before_pause,
    auto_pause_on_failure, require_review, allowed_country_codes,
    paused_reason, updated_at, updated_by
  ) values (
    'paraguayconcursa_mef_scraper', 'Paraguay Concursa MEF',
    'scrapers/paraguayconcursa_mef_scraper.py', false,
    20, 900, 2, true, true, array['PY']::text[],
    'Awaiting explicit source activation after live field and access review.',
    clock_timestamp(), 'migration'
  )
  on conflict (scraper_id) do nothing;
end;
$migration$;
