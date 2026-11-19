-- READ ONLY / run after the bounded C4 reconciliation reports done=true.
-- Membership, processing identity, cumulative outcomes and policy digests are
-- checked against the immutable ID snapshot, never against a rebuilt date/source query.
begin transaction read only;
set local statement_timeout='120s';
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true) operator_role_context;

select * from public.private_matching_c4_reconciliation_runs
where run_key='C4_20261011';

select bucket_key,canonical_source,identity_state,identity_reason,status,
  total_rows,processed_rows,total_rows-processed_rows pending_rows,changed_rows,
  cursor_id,attempts,recovery_count,last_batch_id,last_error
from public.private_matching_c4_reconciliation_sources
order by identity_state,canonical_source,bucket_key;

with counts as (
  select (select total_members from public.private_matching_c4_reconciliation_runs
      where run_key='C4_20261011') run_total,
    (select count(*) from public.private_matching_c4_reconciliation_members
      where run_key='C4_20261011') member_rows,
    (select count(distinct opportunity_id) from public.private_matching_c4_reconciliation_members
      where run_key='C4_20261011') unique_members,
    (select coalesce(sum(total_rows),0) from public.private_matching_c4_reconciliation_sources
      where run_key='C4_20261011') source_total,
    (select count(*) from public.private_matching_c4_reconciliation_members
      where run_key='C4_20261011' and processing_state='COMPLETE') processed_members,
    (select count(*) from public.private_matching_c4_reconciliation_members
      where run_key='C4_20261011' and processing_state<>'COMPLETE') pending_members
)
select *,run_total=member_rows and member_rows=unique_members and unique_members=source_total
    and run_total=processed_members+pending_members denominator_identity_pass
from counts;

select identity_state,identity_reason,snapshot_normalized_source,
  snapshot_canonical_source,count(*) members
from public.private_matching_c4_reconciliation_members
where identity_state<>'RESOLVED'
group by identity_state,identity_reason,snapshot_normalized_source,snapshot_canonical_source
order by identity_state,identity_reason,snapshot_normalized_source;

select status,count(*) batches,
  count(*) filter(where selected_count<>cardinality(selected_ids)) selected_array_mismatches,
  count(*) filter(where attempted_count<>cardinality(attempted_ids)) attempted_array_mismatches,
  count(*) filter(where selected_count<>(select count(distinct selected_id)
      from unnest(selected_ids) as selected(selected_id))
    or attempted_count<>(select count(distinct attempted_id)
      from unnest(attempted_ids) as attempted(attempted_id))
    or not (attempted_ids<@selected_ids)) duplicate_or_foreign_attempt_mismatches,
  count(*) filter(where status='COMPLETE' and
    (selected_count<>attempted_count or attempted_count<>succeeded_count
      or not (attempted_ids<@selected_ids and selected_ids<@attempted_ids))) complete_identity_mismatches,
  count(*) filter(where status='FAILED' and (end_cursor is not null or succeeded_count<>0)) failed_cursor_or_counter_mismatches
from public.private_matching_c4_reconciliation_batches group by status order by status;

select count(*) complete_members,
  count(*) filter(where completion_count<>1 or attempt_count<>1) completion_identity_mismatches,
  count(*) filter(where u.opportunity_id is null) missing_derived_states,
  count(*) filter(where u.opportunity_id is not null and
    (m.after_lifecycle_state is distinct from u.lifecycle_state
      or m.after_final_matching_state is distinct from u.final_matching_state)) persisted_result_mismatches,
  count(*) filter(where m.after_final_matching_state='READY' and
    (m.after_lifecycle_state<>'ACTIVE_VALID'
      or u.source_matching_state='DENIED'
      or u.source_matching_operational_state='DENIED'
      or u.source_operational_state in ('DISABLED','CONFLICT'))) private_matching_gate_violations,
  count(*) filter(where (m.before_catalog_state<>'READY' and m.after_catalog_state='READY')
    or (m.before_alerts_state<>'READY' and m.after_alerts_state='READY')
    or (m.before_seo_state<>'READY' and m.after_seo_state='READY')) public_consumer_promotions
from public.private_matching_c4_reconciliation_members m
left join public.opportunity_universe_state u on u.opportunity_id=m.opportunity_id
where m.processing_state='COMPLETE';

with expected as (
  select bucket_key,'ROUTING'::text outcome_kind,
    case when after_final_matching_state='READY' then 'ADMITTED' else 'EXCLUDED' end outcome_key,count(*)::bigint member_count
  from public.private_matching_c4_reconciliation_members where processing_state='COMPLETE'
  group by bucket_key,case when after_final_matching_state='READY' then 'ADMITTED' else 'EXCLUDED' end
  union all
  select bucket_key,'FINAL_STATE',after_final_matching_state,count(*)::bigint
  from public.private_matching_c4_reconciliation_members where processing_state='COMPLETE'
  group by bucket_key,after_final_matching_state
  union all
  select bucket_key,'FIRST_FAILURE',after_first_failure,count(*)::bigint
  from public.private_matching_c4_reconciliation_members where processing_state='COMPLETE'
  group by bucket_key,after_first_failure
  union all
  select bucket_key,'SOURCE_DRIFT',coalesce(snapshot_canonical_source,'<none>')||'->'||
    coalesce(current_canonical_source,'<none>'),count(*)::bigint
  from public.private_matching_c4_reconciliation_members
  where processing_state='COMPLETE' and source_identity_drift
  group by bucket_key,coalesce(snapshot_canonical_source,'<none>')||'->'||coalesce(current_canonical_source,'<none>')
), differences as (
  (select * from expected except select * from public.private_matching_c4_reconciliation_outcomes)
  union all
  (select * from public.private_matching_c4_reconciliation_outcomes except select * from expected)
)
select (select count(*) from differences) cumulative_histogram_mismatches,
  (select coalesce(jsonb_agg(to_jsonb(e) order by bucket_key,outcome_kind,outcome_key),'[]'::jsonb)
    from expected e) expected_histogram,
  (select coalesce(jsonb_agg(to_jsonb(a) order by bucket_key,outcome_kind,outcome_key),'[]'::jsonb)
    from public.private_matching_c4_reconciliation_outcomes a) recorded_histogram;

with current_digests as (
  select public.private_matching_c4_contract_digests() d
), baseline as (
  select * from public.private_matching_c4_reconciliation_runs where run_key='C4_20261011'
)
select d->>'permission_global_digest' current_global_permission_digest,
  baseline.permission_global_digest snapshot_global_permission_digest,
  d->>'permission_global_digest'=baseline.permission_global_digest
    and (d->>'permission_global_rows')::bigint=baseline.permission_global_rows global_permissions_unchanged,
  d->>'permission_recruiter_digest' current_recruiter_permission_digest,
  baseline.permission_recruiter_digest snapshot_recruiter_permission_digest,
  d->>'permission_recruiter_digest'=baseline.permission_recruiter_digest
    and (d->>'permission_recruiter_rows')::bigint=baseline.permission_recruiter_rows recruiter_permissions_unchanged,
  d->>'source_policy_digest'=baseline.source_policy_digest
    and (d->>'source_policy_rows')::bigint=baseline.source_policy_rows source_policy_unchanged,
  'c6dcc71299db2237f17d455729d238a7' legacy_recruiter_reference_digest,
  'REFERENCE_ONLY_DIFFERENT_HISTORICAL_ALGORITHM_NOT_COMPARABLE' legacy_digest_rule
from current_digests cross join baseline;

select count(*) recruiter_vacancies,count(o.id) mirrors,
  count(*) filter(where r.recruiter_token_id is null or t.id is null) owner_missing,
  count(*) filter(where o.id is not null and r.is_active and u.lifecycle_state='ACTIVE_VALID') open_active_mirrors,
  count(*) filter(where o.id is not null and not r.is_active and u.lifecycle_state='INACTIVE_VALID') closed_inactive_mirrors,
  count(*) filter(where o.id is not null and (u.catalog_state='READY' or u.seo_state='READY' or u.alerts_state='READY')) public_consumers_ready,
  count(*)=8 and count(o.id)=5
    and count(*) filter(where r.recruiter_token_id is null or t.id is null)=3 historical_8_5_3_preserved,
  count(*) filter(where o.id is not null and r.is_active and u.lifecycle_state='ACTIVE_VALID')=3
    and count(*) filter(where o.id is not null and not r.is_active and u.lifecycle_state='INACTIVE_VALID')=2 lifecycle_3_2_preserved
from public.recruiter_vacancies r
left join public.recruiter_tokens t on t.id::text=r.recruiter_token_id::text
left join public.opportunities o on o.recruiter_vacancy_id=r.id and o.source='recruiter_b2b'
left join public.opportunity_universe_state u on u.opportunity_id=o.id;

select has_table_privilege('anon','public.opportunity_final_matching_universe','SELECT') anon_view_select,
  has_table_privilege('authenticated','public.opportunity_final_matching_universe','SELECT') authenticated_view_select,
  has_function_privilege('anon','public.match_opportunities(public.vector,double precision,integer)','EXECUTE') anon_rpc_execute,
  has_function_privilege('authenticated','public.match_opportunities(public.vector,double precision,integer)','EXECUTE') authenticated_rpc_execute;

-- One consolidated decision for SQL Editor. Identity review and any FAILED
-- source remain explicit STOPs; neither is hidden by processed-row totals.
with run as (
  select * from public.private_matching_c4_reconciliation_runs where run_key='C4_20261011'
), denominator as (
  select count(*) members,count(distinct opportunity_id) unique_members,
    count(*) filter(where processing_state='COMPLETE') processed,
    count(*) filter(where processing_state<>'COMPLETE') pending
  from public.private_matching_c4_reconciliation_members where run_key='C4_20261011'
), source_counts as (
  select coalesce(sum(total_rows),0) source_total,
    count(*) filter(where status='FAILED') failed_sources,
    count(*) filter(where status in ('PENDING','RUNNING')) runnable_sources
  from public.private_matching_c4_reconciliation_sources where run_key='C4_20261011'
), batch_errors as (
  select count(*) filter(where selected_count<>cardinality(selected_ids)
      or attempted_count<>cardinality(attempted_ids)
      or selected_count<>(select count(distinct selected_id)
        from unnest(selected_ids) as selected(selected_id))
      or attempted_count<>(select count(distinct attempted_id)
        from unnest(attempted_ids) as attempted(attempted_id))
      or not (attempted_ids<@selected_ids)
      or (status='COMPLETE' and (selected_count<>attempted_count or attempted_count<>succeeded_count
        or not (attempted_ids<@selected_ids and selected_ids<@attempted_ids)))
      or (status='FAILED' and (end_cursor is not null or succeeded_count<>0))) failures
  from public.private_matching_c4_reconciliation_batches
), member_errors as (
  select count(*) filter(where m.processing_state='COMPLETE' and
      (m.completion_count<>1 or m.attempt_count<>1 or u.opportunity_id is null
        or m.after_lifecycle_state is distinct from u.lifecycle_state
        or m.after_final_matching_state is distinct from u.final_matching_state
        or (m.after_final_matching_state='READY' and (m.after_lifecycle_state<>'ACTIVE_VALID'
          or u.source_matching_state='DENIED' or u.source_matching_operational_state='DENIED'
          or u.source_operational_state in ('DISABLED','CONFLICT')))
        or (m.before_catalog_state<>'READY' and m.after_catalog_state='READY')
        or (m.before_alerts_state<>'READY' and m.after_alerts_state='READY')
        or (m.before_seo_state<>'READY' and m.after_seo_state='READY'))) failures
  from public.private_matching_c4_reconciliation_members m
  left join public.opportunity_universe_state u on u.opportunity_id=m.opportunity_id
), expected_outcomes as (
  select bucket_key,'ROUTING'::text outcome_kind,
    case when after_final_matching_state='READY' then 'ADMITTED' else 'EXCLUDED' end outcome_key,count(*)::bigint member_count
  from public.private_matching_c4_reconciliation_members where processing_state='COMPLETE'
  group by bucket_key,case when after_final_matching_state='READY' then 'ADMITTED' else 'EXCLUDED' end
  union all
  select bucket_key,'FINAL_STATE',after_final_matching_state,count(*)::bigint
  from public.private_matching_c4_reconciliation_members where processing_state='COMPLETE'
  group by bucket_key,after_final_matching_state
  union all
  select bucket_key,'FIRST_FAILURE',after_first_failure,count(*)::bigint
  from public.private_matching_c4_reconciliation_members where processing_state='COMPLETE'
  group by bucket_key,after_first_failure
  union all
  select bucket_key,'SOURCE_DRIFT',coalesce(snapshot_canonical_source,'<none>')||'->'||
    coalesce(current_canonical_source,'<none>'),count(*)::bigint
  from public.private_matching_c4_reconciliation_members
  where processing_state='COMPLETE' and source_identity_drift
  group by bucket_key,coalesce(snapshot_canonical_source,'<none>')||'->'||coalesce(current_canonical_source,'<none>')
), outcome_errors as (
  select count(*) failures from (
    (select * from expected_outcomes except select * from public.private_matching_c4_reconciliation_outcomes)
    union all
    (select * from public.private_matching_c4_reconciliation_outcomes except select * from expected_outcomes)
  ) differences
), historical as (
  select count(*) vacancies,count(o.id) mirrors,
    count(*) filter(where r.recruiter_token_id is null or t.id is null) owner_missing,
    count(*) filter(where o.id is not null and r.is_active and u.lifecycle_state='ACTIVE_VALID') open_active,
    count(*) filter(where o.id is not null and not r.is_active and u.lifecycle_state='INACTIVE_VALID') closed_inactive,
    count(*) filter(where o.id is not null and (u.catalog_state='READY' or u.seo_state='READY' or u.alerts_state='READY')) public_ready,
    (select count(*) from (select recruiter_vacancy_id from public.opportunities
      where recruiter_vacancy_id is not null group by recruiter_vacancy_id having count(*)>1) d) duplicate_mirrors
  from public.recruiter_vacancies r
  left join public.recruiter_tokens t on t.id::text=r.recruiter_token_id::text
  left join public.opportunities o on o.recruiter_vacancy_id=r.id and o.source='recruiter_b2b'
  left join public.opportunity_universe_state u on u.opportunity_id=o.id
), current_digests as (
  select public.private_matching_c4_contract_digests() d
), checks as (
  select run.status,run.identity_review_members,denominator.*,source_counts.*,
    batch_errors.failures batch_failures,member_errors.failures member_failures,
    outcome_errors.failures outcome_failures,historical.*,
    (current_digests.d->>'permission_global_digest'=run.permission_global_digest
      and (current_digests.d->>'permission_global_rows')::bigint=run.permission_global_rows) global_digest_ok,
    (current_digests.d->>'permission_recruiter_digest'=run.permission_recruiter_digest
      and (current_digests.d->>'permission_recruiter_rows')::bigint=run.permission_recruiter_rows) recruiter_digest_ok,
    (current_digests.d->>'source_policy_digest'=run.source_policy_digest
      and (current_digests.d->>'source_policy_rows')::bigint=run.source_policy_rows) policy_digest_ok
  from run cross join denominator cross join source_counts cross join batch_errors
    cross join member_errors cross join outcome_errors cross join historical cross join current_digests
)
select case when status='COMPLETE' and identity_review_members=0 and members=unique_members
    and members=source_total and members=processed+pending and pending=0
    and failed_sources=0 and runnable_sources=0 and batch_failures=0 and member_failures=0 and outcome_failures=0
    and global_digest_ok and recruiter_digest_ok and policy_digest_ok
    and vacancies=8 and mirrors=5 and owner_missing=3 and open_active=3 and closed_inactive=2
    and public_ready=0 and duplicate_mirrors=0
    and not has_table_privilege('anon','public.opportunity_final_matching_universe','SELECT')
    and not has_table_privilege('authenticated','public.opportunity_final_matching_universe','SELECT')
    and not has_function_privilege('anon','public.match_opportunities(public.vector,double precision,integer)','EXECUTE')
    and not has_function_privilege('authenticated','public.match_opportunities(public.vector,double precision,integer)','EXECUTE')
  then 'PASS' else 'STOP' end final_result,
  to_jsonb(checks) evidence
from checks;

rollback;
