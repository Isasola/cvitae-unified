-- Local PostgreSQL integration test for 202609240002.
-- Run only against local Supabase. The transaction is rolled back.
\set ON_ERROR_STOP on
begin;

create or replace function pg_temp.assert(condition boolean, message text)
returns void language plpgsql as $$
begin
  if not coalesce(condition, false) then raise exception 'DIAGNOSTIC_DB_ASSERT: %', message; end if;
end;
$$;

do $$
declare
  v_user uuid;
  v_id uuid;
  v_before integer;
  v_row record;
  v_index boolean;
begin
  select id into v_user from auth.users order by created_at limit 1;
  perform pg_temp.assert(v_user is not null, 'local auth.users fixture is available');

  select count(*) into v_before from public.matching_diagnostic_snapshots;
  insert into public.matching_diagnostic_snapshots(
    user_id, profile_signature, profile_updated_at, run_status, request_mode,
    primary_retrieval_count, semantic_retrieval_count, unique_policy_candidates_count,
    source_allowed_count, professional_evidence_ready_count, professional_fit_known_count,
    eligibility_eligible_count, eligibility_unknown_count, eligibility_ineligible_count,
    match_count, potential_scoreable_count, visible_potential_count, abstain_count,
    deny_count, visible_confirmed_count, coverage_state, top_reason_codes, embedding_readiness
  ) values (
    v_user, 'fixture-signature', timestamptz '2026-09-24 12:00:00+00', 'SUCCESS', 'default',
    300, 120, 42, 40, 35, 30, 5, 25, 0, 2, 7, 3, 18, 1, 2,
    'ELIGIBILITY_UNKNOWN', '{"CANDIDATE_ELIGIBILITY_UNKNOWN":25}'::jsonb, 'READY'
  ) returning id into v_id;

  select * into v_row from public.matching_diagnostic_snapshots where id = v_id;
  perform pg_temp.assert(v_row.run_status = 'SUCCESS', 'success run_status persisted');
  perform pg_temp.assert(v_row.request_mode = 'default', 'request_mode persisted');
  perform pg_temp.assert(v_row.profile_signature = 'fixture-signature', 'profile signature persisted');
  perform pg_temp.assert(v_row.primary_retrieval_count = 300 and v_row.semantic_retrieval_count = 120, 'retrieval counts persisted');
  perform pg_temp.assert(v_row.potential_scoreable_count = 7 and v_row.visible_potential_count = 3, 'scoreable and visible potential stay separate');
  perform pg_temp.assert(v_row.coverage_state = 'ELIGIBILITY_UNKNOWN' and v_row.embedding_readiness = 'READY', 'coverage and embedding persisted');
  perform pg_temp.assert((select count(*) from public.matching_diagnostic_snapshots) = v_before + 1, 'success creates one snapshot');

  insert into public.matching_diagnostic_snapshots(user_id, run_status, coverage_state)
  values (v_user, 'ERROR', 'ERROR');
  perform pg_temp.assert((select count(*) from public.matching_diagnostic_snapshots) = v_before + 2, 'error snapshot persists with defaults');

  begin
    insert into public.matching_diagnostic_snapshots(user_id, run_status, coverage_state)
    values (v_user, 'BROKEN', 'ERROR');
    raise exception 'expected invalid run_status';
  exception when others then
    perform pg_temp.assert(sqlerrm like '%matching_diagnostic_snapshots_run_status_check%', 'invalid run_status is rejected');
  end;
  begin
    insert into public.matching_diagnostic_snapshots(user_id, run_status, request_mode, coverage_state)
    values (v_user, 'SUCCESS', 'interactive', 'HEALTHY');
    raise exception 'expected invalid request_mode';
  exception when others then
    perform pg_temp.assert(sqlerrm like '%matching_diagnostic_snapshots_request_mode_check%', 'invalid request_mode is rejected');
  end;
  begin
    insert into public.matching_diagnostic_snapshots(user_id, run_status, coverage_state)
    values (v_user, 'SUCCESS', 'NOT_A_STATE');
    raise exception 'expected invalid coverage_state';
  exception when others then
    perform pg_temp.assert(sqlerrm like '%matching_diagnostic_snapshots_coverage_state_check%', 'invalid coverage_state is rejected');
  end;
  begin
    insert into public.matching_diagnostic_snapshots(user_id, run_status, coverage_state)
    values ('00000000-0000-4000-8000-000000000099', 'SUCCESS', 'HEALTHY');
    raise exception 'expected invalid user_id';
  exception when others then
    perform pg_temp.assert(sqlerrm like '%matching_diagnostic_snapshots_user_id_fkey%', 'unknown user_id is rejected');
  end;
  perform pg_temp.assert((select count(*) from public.matching_diagnostic_snapshots) = v_before + 2, 'constraint failures leave no partial rows');

  select exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'matching_diagnostic_snapshots' and c.relrowsecurity
  ) into v_index;
  perform pg_temp.assert(v_index, 'RLS is enabled');
  perform pg_temp.assert(not has_table_privilege('anon', 'public.matching_diagnostic_snapshots', 'select'), 'anon has no direct select');
  perform pg_temp.assert(not has_table_privilege('authenticated', 'public.matching_diagnostic_snapshots', 'select'), 'authenticated has no direct select');
  perform pg_temp.assert(has_table_privilege('service_role', 'public.matching_diagnostic_snapshots', 'select,insert,update,delete'), 'service_role has required table privileges');
  perform pg_temp.assert(exists (select 1 from pg_indexes where schemaname='public' and tablename='matching_diagnostic_snapshots' and indexname='matching_diagnostic_snapshots_user_run_idx'), 'user/run index exists');
end;
$$;

rollback;
select 'verify-matching-diagnostic-snapshots-database: PASS' as result;
