\set ON_ERROR_STOP on

begin;

insert into public.opportunity_sources (
  source, display_name, trust_level, auto_verify, is_enabled,
  catalog_enabled, matching_enabled, alerts_enabled, seo_enabled
) values (
  'cvitae_atomic_fixture', 'CVitae atomic fixture', 'review', false, true,
  true, true, true, true
) on conflict (source) do update set updated_at = now();

insert into public.opportunities (
  id, title, organization, description, application_url, source,
  source_authority, original_source_verified, verification_status, is_active,
  catalog_eligible, match_eligible, alerts_eligible, seo_eligible
) values (
  'cvitae-atomic-fixture', 'Backend Engineer', 'CVitae Fixture',
  repeat('Evidence based opportunity description. ', 5),
  'https://fixture.example.org/cvitae-atomic', 'cvitae_atomic_fixture',
  'original', true, 'in_review', false, false, false, false, false
);

insert into public.opportunities (
  id, title, description, application_url, source, source_authority,
  original_source_verified, verification_status, is_active
) values
  ('cvitae-batch-fixture', 'Batch fixture', repeat('Valid evidence. ', 10),
   'https://fixture.example.org/cvitae-batch', 'cvitae_atomic_fixture', 'original', true, 'in_review', false),
  ('cvitae-stale-batch-fixture', 'Stale batch fixture', repeat('Valid evidence. ', 10),
   'https://fixture.example.org/cvitae-stale-batch', 'cvitae_atomic_fixture', 'original', true, 'in_review', false);

insert into public.scraper_controls (
  scraper_id, scraper_name, script_path, collection_enabled, require_review
) values (
  'cvitae_atomic_fixture', 'CVitae atomic fixture', 'scrapers/fixture.py', false, true
);

insert into public.recruiter_tokens (
  id, email, company_name, access_token, verification_status, is_active
) values (
  '00000000-0000-4000-8000-000000000099', 'atomic-fixture@example.org',
  'CVitae Fixture', 'atomic-fixture-token', 'in_review', false
);

do $test$
declare
  v_updated timestamptz;
  v_old_updated timestamptz;
  v_result jsonb;
  v_vector jsonb;
begin
  select updated_at into v_old_updated
  from public.opportunities where id = 'cvitae-atomic-fixture';

  v_result := public.admin_review_opportunity_atomic(
    'cvitae-atomic-fixture', 'verified', array['fixture'], 'Atomic approval',
    95, '{"catalog":true,"matching":true,"alerts":false,"seo":false}'::jsonb,
    true, v_old_updated, 'test'
  );
  if coalesce((v_result->>'ok')::boolean, false) is not true then
    raise exception 'atomic review did not return ok';
  end if;
  if not exists (
    select 1 from public.opportunities
    where id = 'cvitae-atomic-fixture' and verification_status = 'verified'
      and is_active and catalog_eligible and match_eligible
      and not alerts_eligible and not seo_eligible
  ) then
    raise exception 'atomic review flags were not committed';
  end if;
  if (select count(*) from public.opportunity_review_events where opportunity_id = 'cvitae-atomic-fixture') <> 1 then
    raise exception 'atomic review audit was not committed exactly once';
  end if;

  select updated_at into v_updated
  from public.opportunities where id = 'cvitae-batch-fixture';
  v_result := public.admin_batch_review_opportunities_atomic(
    array['cvitae-batch-fixture'], 'verified', 'Atomic batch approval',
    '{"catalog":true,"matching":true,"alerts":false,"seo":false}'::jsonb,
    jsonb_build_array(jsonb_build_object(
      'id', 'cvitae-batch-fixture', 'record_updated_at', v_updated,
      'recommendation', 'approve', 'rules_version', 'fixture-rules'
    )), 'test'
  );
  if (v_result->>'processed')::integer <> 1 or not exists (
    select 1 from public.opportunities
    where id = 'cvitae-batch-fixture' and verification_status = 'verified' and match_eligible
  ) then
    raise exception 'atomic batch approval failed';
  end if;

  select updated_at into v_old_updated
  from public.opportunities where id = 'cvitae-stale-batch-fixture';
  update public.opportunities set description = description || ' changed'
  where id = 'cvitae-stale-batch-fixture';
  begin
    perform public.admin_batch_review_opportunities_atomic(
      array['cvitae-stale-batch-fixture'], 'verified', 'Stale batch approval',
      '{"catalog":true,"matching":true,"alerts":false,"seo":false}'::jsonb,
      jsonb_build_array(jsonb_build_object(
        'id', 'cvitae-stale-batch-fixture', 'record_updated_at', v_old_updated,
        'recommendation', 'approve', 'rules_version', 'fixture-rules'
      )), 'test'
    );
    raise exception 'stale batch mutation was accepted';
  exception when others then
    if sqlerrm = 'stale batch mutation was accepted' then raise; end if;
  end;
  if (select verification_status from public.opportunities where id = 'cvitae-stale-batch-fixture') <> 'in_review' then
    raise exception 'stale batch changed the record';
  end if;

  begin
    perform public.admin_review_opportunity_atomic(
      'cvitae-atomic-fixture', 'rejected', array['fixture'], 'Stale mutation',
      10, '{"catalog":false,"matching":false,"alerts":false,"seo":false}'::jsonb,
      true, v_old_updated, 'test'
    );
    raise exception 'stale review mutation was accepted';
  exception when others then
    if sqlerrm = 'stale review mutation was accepted' then raise; end if;
  end;

  select updated_at into v_updated
  from public.opportunity_sources where source = 'cvitae_atomic_fixture';
  v_result := public.admin_update_source_policy_atomic(
    'cvitae_atomic_fixture', '{"matching_enabled":false,"source_tier":"B"}'::jsonb,
    v_updated, 'test'
  );
  if (v_result->>'impacted_rows')::integer <> 2 then
    raise exception 'source policy impact count is wrong';
  end if;
  if not exists (
    select 1 from public.opportunities
    where id = 'cvitae-atomic-fixture' and match_eligible = false
  ) then
    raise exception 'source policy was not propagated';
  end if;
  if not exists (
    select 1 from public.admin_policy_events
    where entity_key = 'cvitae_atomic_fixture' and impacted_rows = 2
  ) then
    raise exception 'source policy audit was not written';
  end if;

  select updated_at into v_updated
  from public.opportunities where id = 'cvitae-atomic-fixture';
  select jsonb_agg(0.01::numeric) into v_vector from generate_series(1, 384);
  v_result := public.opportunity_factory_commit_atomic(
    'cvitae-atomic-fixture', v_updated, repeat('a', 64), repeat('b', 64),
    'fixture-pipeline', 'fixture-rules', 'ready',
    '{"identity":"pass"}'::jsonb, '{"fixture":true}'::jsonb,
    v_vector, 'Supabase/gte-small@1', 'ready', now()
  );
  if coalesce((v_result->>'ok')::boolean, false) is not true then
    raise exception 'factory commit did not return ok';
  end if;
  if not exists (
    select 1 from public.opportunities
    where id = 'cvitae-atomic-fixture' and factory_status = 'ready'
      and embedding_model = 'Supabase/gte-small@1' and embedding is not null
  ) then
    raise exception 'factory opportunity state was not committed';
  end if;
  if not exists (
    select 1 from public.opportunity_factory_snapshots
    where opportunity_id = 'cvitae-atomic-fixture' and embedding_status = 'ready'
  ) then
    raise exception 'factory snapshot was not committed';
  end if;

  select updated_at into v_updated
  from public.scraper_controls where scraper_id = 'cvitae_atomic_fixture';
  v_result := public.admin_update_scraper_control_atomic(
    'cvitae_atomic_fixture', '{"collection_enabled":true,"max_items_per_run":25}'::jsonb,
    v_updated, 'test'
  );
  if not exists (
    select 1 from public.scraper_controls
    where scraper_id = 'cvitae_atomic_fixture' and collection_enabled and max_items_per_run = 25
  ) or not exists (
    select 1 from public.admin_policy_events
    where entity_type = 'scraper' and entity_key = 'cvitae_atomic_fixture'
  ) then
    raise exception 'scraper control and audit were not committed atomically';
  end if;

  select updated_at into v_updated
  from public.recruiter_tokens where id = '00000000-0000-4000-8000-000000000099';
  v_result := public.admin_review_recruiter_atomic(
    '00000000-0000-4000-8000-000000000099', 'verified', '{"fixture":true}'::jsonb,
    'Atomic recruiter approval', v_updated, 'test'
  );
  if not exists (
    select 1 from public.recruiter_tokens
    where id = '00000000-0000-4000-8000-000000000099' and verification_status = 'verified' and is_active
  ) or not exists (
    select 1 from public.recruiter_review_events
    where recruiter_token_id = '00000000-0000-4000-8000-000000000099' and new_status = 'verified'
  ) then
    raise exception 'recruiter review and audit were not committed atomically';
  end if;

  raise notice 'PASS admin atomic and factory transaction checks';
end;
$test$;

rollback;
