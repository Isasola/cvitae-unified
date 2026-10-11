-- WRITE SCHEMA ROLLBACK / NOT AUTHORIZED BY DEFAULT.
-- Only for rollback BEFORE any accepted future R2 publication. Historical mirror
-- data must first be compensated with r2-b2b-compensate-write-20261009.sql.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
do $guard$
begin
  if exists(select 1 from public.recruiter_vacancy_operations) then
    raise exception 'future_r2_operations_exist_use_forward_fix';
  end if;
  if exists(select 1 from public.opportunities where source='recruiter_b2b') then
    raise exception 'recruiter_mirrors_remain_compensate_first';
  end if;
end $guard$;
drop trigger if exists recruiter_vacancy_bridge_after_write on public.recruiter_vacancies;
drop trigger if exists zz_recruiter_mirror_lifecycle on public.opportunities;
drop function if exists public.recruiter_vacancy_bridge_after_write();
drop function if exists public.guard_recruiter_mirror_lifecycle();
drop function if exists public.reconcile_recruiter_vacancies_r2(integer,text,integer,integer);
drop function if exists public.close_recruiter_vacancy_atomic(text,uuid);
drop function if exists public.create_recruiter_vacancy_atomic(text,text,text,text,text,text,text,text,text,text[],text,text);
drop function if exists public.sync_recruiter_vacancy_mirror(uuid,text);
drop index if exists public.opportunities_recruiter_vacancy_unique_r2;
drop table public.recruiter_vacancy_operations;
do $restore$
declare v_definition text;
begin
  select pg_get_functiondef('public.create_recruiter_vacancy_atomic_before_r2_20261009(text,text,text,text,text,text,text,text,text,text[],text)'::regprocedure)
    into v_definition;
  execute replace(v_definition,'CREATE OR REPLACE FUNCTION public.create_recruiter_vacancy_atomic_before_r2_20261009(',
    'CREATE OR REPLACE FUNCTION public.create_recruiter_vacancy_atomic(');
end $restore$;
do $restore$
declare v_name text; v_signature text; v_definition text;
begin
  foreach v_name in array array['canonical_opportunity_source_policy','opportunity_universe_decision','get_opportunity_universe_row'] loop
    v_signature:=case when v_name='opportunity_universe_decision' then 'jsonb,jsonb,jsonb,jsonb' else 'text' end;
    select pg_get_functiondef(to_regprocedure('public.'||v_name||'_before_r2_20261009('||v_signature||')')) into v_definition;
    if v_definition is null then raise exception 'missing_r2_backup:%',v_name; end if;
    execute replace(v_definition,'CREATE OR REPLACE FUNCTION public.'||v_name||'_before_r2_20261009(',
      'CREATE OR REPLACE FUNCTION public.'||v_name||'(');
  end loop;
end $restore$;
drop function public.controlled_opportunity_permission(jsonb,text);
drop function public.controlled_opportunity_producer(text);
commit;
