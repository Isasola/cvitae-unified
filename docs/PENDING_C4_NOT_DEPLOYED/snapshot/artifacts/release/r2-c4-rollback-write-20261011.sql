-- PROPOSED COMPENSATING WRITE / DO NOT RUN WITHOUT EXPLICIT AUTHORIZATION.
-- Safe only before any real C4 mutation/SEO Plus request. If any operational
-- row exists, this script raises and the required path is a forward repair.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';

do $preconditions$
declare v_match_oid oid;
begin
  if to_regprocedure('public.opportunity_universe_decision_before_c4_20261011(jsonb,jsonb,jsonb,jsonb)') is null
    or to_regprocedure('public.match_opportunities_before_c4_20261011(public.vector,double precision,integer)') is null then
    raise exception 'c4_backup_missing';
  end if;
  if (select count(*) from public.recruiter_vacancy_mutation_operations)<>0
    or (select count(*) from public.recruiter_seo_plus_requests)<>0
    or (select count(*) from public.recruiter_seo_plus_events)<>0 then
    raise exception 'c4_operational_rows_exist_forward_repair_required';
  end if;
  if to_regclass('public.private_matching_c4_reconciliation_runs') is not null
    and (select count(*) from public.private_matching_c4_reconciliation_runs)<>0 then
    raise exception 'c4_matching_reconciliation_started_forward_repair_required';
  end if;
  v_match_oid:=to_regprocedure('public.match_opportunities(public.vector,double precision,integer)');
  if v_match_oid is null or not has_function_privilege('service_role',v_match_oid,'EXECUTE')
    or has_function_privilege('anon',v_match_oid,'EXECUTE')
    or has_function_privilege('authenticated',v_match_oid,'EXECUTE') then
    raise exception 'c4_rollback_requires_hardened_match_acl';
  end if;
end $preconditions$;

drop trigger if exists recruiter_seo_plus_after_close on public.recruiter_vacancies;
drop function if exists public.recruiter_seo_plus_after_close();
drop function if exists public.withdraw_recruiter_seo_plus(text,uuid,text);
drop function if exists public.request_recruiter_seo_plus(text,uuid,text,boolean,text);
drop function if exists public.update_recruiter_vacancy_atomic(text,uuid,text,text,text,text,text,text,text);
drop table public.recruiter_seo_plus_events;
drop table public.recruiter_seo_plus_requests;
drop table public.recruiter_vacancy_mutation_operations;
drop function public.reconcile_private_matching_c4_batch(integer);
drop function public.resume_private_matching_c4_failed_source(text,integer,text);
drop function public.prepare_private_matching_c4_reconciliation();
drop function public.private_matching_c4_contract_digests();
drop function public.private_matching_c4_source_identity(text);
drop table public.private_matching_c4_reconciliation_outcomes;
drop table public.private_matching_c4_reconciliation_batches;
drop table public.private_matching_c4_reconciliation_members;
drop table public.private_matching_c4_reconciliation_sources;
drop table public.private_matching_c4_reconciliation_runs;

do $restore$
declare v_definition text; v_match_oid oid; v_match_owner oid;
begin
  v_definition:=pg_get_functiondef('public.opportunity_universe_decision_before_c4_20261011(jsonb,jsonb,jsonb,jsonb)'::regprocedure);
  execute replace(v_definition,'CREATE OR REPLACE FUNCTION public.opportunity_universe_decision_before_c4_20261011(',
    'CREATE OR REPLACE FUNCTION public.opportunity_universe_decision(');
  v_match_oid:=to_regprocedure('public.match_opportunities(public.vector,double precision,integer)');
  select proowner into strict v_match_owner from pg_proc where oid=v_match_oid;
  v_definition:=pg_get_functiondef('public.match_opportunities_before_c4_20261011(public.vector,double precision,integer)'::regprocedure);
  execute replace(v_definition,'CREATE OR REPLACE FUNCTION public.match_opportunities_before_c4_20261011(',
    'CREATE OR REPLACE FUNCTION public.match_opportunities(');
  if to_regprocedure('public.match_opportunities(public.vector,double precision,integer)')<>v_match_oid
    or (select proowner from pg_proc where oid=v_match_oid)<>v_match_owner
    or not has_function_privilege('service_role',v_match_oid,'EXECUTE')
    or has_function_privilege('anon',v_match_oid,'EXECUTE')
    or has_function_privilege('authenticated',v_match_oid,'EXECUTE') then
    raise exception 'c4_rollback_match_identity_or_hardened_acl_changed';
  end if;
end $restore$;

do $restore_derived_universe$
declare v_id text;
begin
  for v_id in
    select o.id from public.opportunities o
    where lower(trim(o.source))='recruiter_b2b' and o.recruiter_vacancy_id is not null
    order by o.id
  loop
    perform public.refresh_opportunity_universe(v_id,false);
  end loop;
end $restore_derived_universe$;

-- Restore the immediately pre-C4 canonical view. It deliberately retains the
-- duplicated raw switches that C4 removes; this is rollback, not remediation.
create or replace view public.opportunity_final_matching_universe with (security_invoker=true) as
with effective_policies as materialized (
  select distinct public.canonical_opportunity_source_policy(s.source) policy
  from public.opportunity_sources s
)
select o.*,u.lifecycle_state as universe_lifecycle_state,
  u.matching_row_state as universe_matching_row_state,
  u.source_matching_state as universe_source_matching_state,
  u.final_matching_state as universe_final_matching_state,
  u.alerts_state as universe_alerts_state
from public.opportunities o
left join public.opportunity_source_identity_aliases a on a.emitted_source=lower(trim(o.source))
join effective_policies p on p.policy->>'canonical_source'=coalesce(a.canonical_source,lower(trim(o.source)))
join public.opportunity_universe_state u on u.opportunity_id=o.id::text
where u.final_matching_state='READY'
  and public.opportunity_deadline_state(o.deadline) in ('OPEN','UNKNOWN')
  and p.policy->>'is_enabled'='true' and p.policy->>'matching_enabled'='true';

-- CREATE OR REPLACE retained the installed reducer ACL. Do not replace it with
-- an assumed role list during compensation.
drop function public.opportunity_universe_decision_before_c4_20261011(jsonb,jsonb,jsonb,jsonb);
drop function public.match_opportunities_before_c4_20261011(public.vector,double precision,integer);
commit;
