-- Additive consumer-policy alignment. LOCAL ONLY; do not apply without release approval.
-- First-party SEO admission now respects only evidence-backed DENIED rows in the
-- existing permission ledger. UNKNOWN and repository/default denies stay advisory.
-- Rollback SQL and the exact preflight are in docs/release/operator/.
begin;

-- Reuse the existing permission trigger and dirty-source queue. Permission
-- writes coalesce to one canonical source; they do not inspect opportunity
-- inventory or recalculate rows. The existing bounded C09/C20 cursor consumes
-- the queued source independently of the consumer dimension that changed.
create or replace function public.opportunity_permission_refresh_universe()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if tg_op='INSERT' or (old.permission_state,old.reason,old.provenance,old.evidence_type,old.evidence_reference) is distinct from
      (new.permission_state,new.reason,new.provenance,new.evidence_type,new.evidence_reference) then
    insert into public.opportunity_universe_dirty_sources(canonical_source,reason)
    values(new.canonical_source,'SOURCE_PERMISSION_CHANGED')
    on conflict(canonical_source) do update
      set queued_at=clock_timestamp(),reason=excluded.reason,cursor_id=null;
  end if;
  return new;
end $$;

do $$
declare
  v_consumer text;
  v_permission record;
begin
  foreach v_consumer in array array['catalog','matching','alerts','seo_index'] loop
    select * into v_permission from public.opportunity_source_consumer_permissions
      where canonical_source='weworkremotely' and consumer=v_consumer;
    if not found then
      insert into public.opportunity_source_consumer_permissions
        (canonical_source,consumer,permission_state,reason,provenance,evidence_type,evidence_reference,verified_at,notes)
      values
        ('weworkremotely',v_consumer,'DENIED','JOB_SEARCH_SERVICE_USE_PROHIBITED',
         'https://weworkremotely.com/api-terms-and-guidelines','OFFICIAL_API_TERMS',
         'https://weworkremotely.com/api-terms-and-guidelines',date '2026-10-14',
         'Release-owned explicit first-party restriction; migration=202610140002_explicit_seo_permission_universe');
    elsif not (
      v_permission.permission_state='DENIED'
      and v_permission.evidence_type='OFFICIAL_API_TERMS'
      and v_permission.provenance='https://weworkremotely.com/api-terms-and-guidelines'
      and v_permission.evidence_reference='https://weworkremotely.com/api-terms-and-guidelines'
    ) then
      raise exception 'Existing WWR % permission differs from reviewed official terms; inspect before release',v_consumer;
    end if;
  end loop;
end $$;

create or replace function public.source_consumer_explicitly_denied(p_canonical_source text,p_consumer text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.opportunity_source_consumer_permissions cp
    where cp.canonical_source=lower(trim(p_canonical_source))
      and cp.consumer=p_consumer
      and cp.permission_state='DENIED'
      and cp.evidence_type like 'OFFICIAL_%'
      and nullif(trim(cp.provenance),'') is not null
      and nullif(trim(cp.evidence_reference),'') is not null
  )
$$;
revoke all on function public.source_consumer_explicitly_denied(text,text) from public;
grant execute on function public.source_consumer_explicitly_denied(text,text) to anon, authenticated, service_role;

create or replace function public.source_seo_explicitly_denied(p_canonical_source text)
returns boolean language sql stable security definer set search_path=pg_catalog,public
as $$ select public.source_consumer_explicitly_denied(p_canonical_source,'seo_index') $$;
revoke all on function public.source_seo_explicitly_denied(text) from public;
grant execute on function public.source_seo_explicitly_denied(text) to anon, authenticated, service_role;

create or replace function public.source_seo_row_readiness_reason(
  p_title text, p_slug text, p_description text, p_organization text
) returns text
language plpgsql immutable
set search_path = pg_catalog, public
as $$
declare
  v_title text := regexp_replace(lower(trim(coalesce(p_title,''))), '\s+', ' ', 'g');
  v_description text := regexp_replace(lower(trim(coalesce(p_description,''))), '\s+', ' ', 'g');
  v_unique_factual_tokens integer;
begin
  if v_title='' then return 'MISSING_TITLE'; end if;
  if v_title ~ '^(breadcrumb(\s+[0-9]+)?|vacantes?|empleos?|jobs?|oportunidades?|inicio|home|ver m[aá]s|read more|detalle)$' then return 'GENERIC_OR_NAVIGATION_TITLE'; end if;
  if nullif(trim(coalesce(p_slug,'')),'') is null then return 'MISSING_CANONICAL_IDENTITY'; end if;
  if v_description in (v_title, v_title || '.') then return 'DESCRIPTION_REPEATS_TITLE'; end if;
  select count(distinct token)::integer into v_unique_factual_tokens
  from regexp_split_to_table(v_description, '[^[:alnum:]]+') as words(token)
  where length(token)>=3;
  if length(v_description)<100 or coalesce(v_unique_factual_tokens,0)<12 then return 'DESCRIPTION_WITHOUT_FACTUAL_CONTENT'; end if;
  if nullif(trim(coalesce(p_organization,'')),'') is null then return 'MISSING_ORGANIZATION'; end if;
  return 'SEO_ROW_READY';
end $$;
revoke all on function public.source_seo_row_readiness_reason(text,text,text,text) from public;
grant execute on function public.source_seo_row_readiness_reason(text,text,text,text) to anon, authenticated, service_role;

create or replace function public.enforce_explicit_consumer_denials()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_canonical text;
  v_quality_marker jsonb;
  v_quality_reason text;
  v_denials jsonb := '{}'::jsonb;
  v_consumer_marker jsonb;
  v_permission jsonb;
begin
  select coalesce(a.canonical_source,lower(trim(o.source))) into v_canonical
  from public.opportunities o
  left join public.opportunity_source_identity_aliases a on a.emitted_source=lower(trim(o.source))
  where o.id::text=new.opportunity_id;

  if new.lifecycle_state='ACTIVE_VALID' then
    select public.source_seo_row_readiness_reason(o.title,o.slug,o.description,o.organization)
      into v_quality_reason
    from public.opportunities o where o.id::text=new.opportunity_id;
    if v_quality_reason is not null and v_quality_reason<>'SEO_ROW_READY' then
      v_quality_marker := new.provenance->'seo_content_quality_reconciliation';
      if tg_op='UPDATE' then v_quality_marker := coalesce(v_quality_marker,old.provenance->'seo_content_quality_reconciliation'); end if;
      if v_quality_marker is null then
        v_quality_marker := jsonb_build_object('migration','202610140002_explicit_seo_permission_universe',
          'prior_state_capture',case when tg_op='UPDATE' then 'PRE_UPDATE_ROW' else 'NO_PREEXISTING_ROW' end,
          'prior_seo_row_state',case when tg_op='UPDATE' then old.seo_row_state else new.seo_row_state end,
          'prior_seo_row_reason',case when tg_op='UPDATE' then old.seo_row_reason else new.seo_row_reason end,
          'prior_seo_state',case when tg_op='UPDATE' then old.seo_state else new.seo_state end,
          'prior_seo_effective_reason',case when tg_op='UPDATE' then old.seo_effective_reason else new.seo_effective_reason end);
      end if;
      new.provenance := jsonb_set(coalesce(new.provenance,'{}'::jsonb),'{seo_content_quality_reconciliation}',v_quality_marker,true);
      new.seo_row_state := 'NOT_READY';
      new.seo_row_reason := v_quality_reason;
      new.seo_state := 'NOT_READY';
      new.seo_effective_reason := v_quality_reason;
    else
      new.provenance := coalesce(new.provenance,'{}'::jsonb) - 'seo_content_quality_reconciliation';
    end if;
  end if;

  if v_canonical is null then return new; end if;
  if public.source_consumer_explicitly_denied(v_canonical,'catalog') then
    select jsonb_build_object('state',permission_state,'reason',reason,'evidence_type',evidence_type,'provenance',provenance,'evidence_reference',evidence_reference,'verified_at',verified_at)
      into v_permission from public.opportunity_source_consumer_permissions where canonical_source=v_canonical and consumer='catalog';
    v_denials := v_denials || jsonb_build_object('catalog',v_permission);
    if new.catalog_state='READY' then new.catalog_state:='NOT_READY'; end if;
  end if;
  if public.source_consumer_explicitly_denied(v_canonical,'matching') then
    select jsonb_build_object('state',permission_state,'reason',reason,'evidence_type',evidence_type,'provenance',provenance,'evidence_reference',evidence_reference,'verified_at',verified_at)
      into v_permission from public.opportunity_source_consumer_permissions where canonical_source=v_canonical and consumer='matching';
    v_denials := v_denials || jsonb_build_object('matching',v_permission);
    new.source_matching_state:='DENIED';
    new.source_matching_reason:=coalesce(v_permission->>'reason','SOURCE_MATCH_DENIED');
    new.source_matching_provenance:=coalesce(v_permission->>'provenance','');
    if new.final_matching_state='READY' or new.final_matching_state='UNKNOWN' then new.final_matching_state:='NOT_READY'; end if;
  end if;
  if public.source_consumer_explicitly_denied(v_canonical,'alerts') then
    select jsonb_build_object('state',permission_state,'reason',reason,'evidence_type',evidence_type,'provenance',provenance,'evidence_reference',evidence_reference,'verified_at',verified_at)
      into v_permission from public.opportunity_source_consumer_permissions where canonical_source=v_canonical and consumer='alerts';
    v_denials := v_denials || jsonb_build_object('alerts',v_permission);
    if new.alerts_state='READY' or new.alerts_state='UNKNOWN' then new.alerts_state:='NOT_READY'; end if;
  end if;
  if public.source_consumer_explicitly_denied(v_canonical,'seo_index') then
    select jsonb_build_object('state',permission_state,'reason',reason,'evidence_type',evidence_type,'provenance',provenance,'evidence_reference',evidence_reference,'verified_at',verified_at)
      into v_permission from public.opportunity_source_consumer_permissions where canonical_source=v_canonical and consumer='seo_index';
    v_denials := v_denials || jsonb_build_object('seo',v_permission);
    if new.seo_row_state='READY' and new.seo_state='READY' then
      new.seo_state := 'NOT_READY';
      new.seo_effective_reason := coalesce(v_permission->>'reason','SOURCE_SEO_PERMISSION_DENIED');
    end if;
  end if;
  if v_denials <> '{}'::jsonb then
    v_consumer_marker := new.provenance->'explicit_consumer_permission_reconciliation';
    if tg_op='UPDATE' then v_consumer_marker := coalesce(v_consumer_marker,old.provenance->'explicit_consumer_permission_reconciliation'); end if;
    if v_consumer_marker is null then
      v_consumer_marker := jsonb_build_object('migration','202610140002_explicit_seo_permission_universe',
        'prior_state_capture',case when tg_op='UPDATE' then 'PRE_UPDATE_ROW' else 'NO_PREEXISTING_ROW' end,
        'prior_catalog_state',case when tg_op='UPDATE' then old.catalog_state else null end,
        'prior_source_matching_state',case when tg_op='UPDATE' then old.source_matching_state else null end,
        'prior_source_matching_reason',case when tg_op='UPDATE' then old.source_matching_reason else null end,
        'prior_source_matching_provenance',case when tg_op='UPDATE' then old.source_matching_provenance else null end,
        'prior_final_matching_state',case when tg_op='UPDATE' then old.final_matching_state else null end,
        'prior_alerts_state',case when tg_op='UPDATE' then old.alerts_state else null end,
        'prior_seo_state',case when tg_op='UPDATE' then old.seo_state else null end,
        'prior_seo_effective_reason',case when tg_op='UPDATE' then old.seo_effective_reason else null end);
    end if;
    new.provenance := jsonb_set(coalesce(new.provenance,'{}'::jsonb),'{explicit_consumer_permission_reconciliation}',v_consumer_marker,true);
    new.provenance := jsonb_set(new.provenance,'{explicit_consumer_denials}',v_denials,true);
  end if;
  return new;
end $$;

drop trigger if exists opportunity_universe_explicit_consumer_denials on public.opportunity_universe_state;
create trigger opportunity_universe_explicit_consumer_denials
before insert or update on public.opportunity_universe_state
for each row execute function public.enforce_explicit_consumer_denials();

do $migration$
declare opportunity_columns text;
begin
  if (select atttypid from pg_attribute where attrelid='public.opportunities'::regclass and attname='id' and not attisdropped) <> 'text'::regtype then
    raise exception 'SEO read path expects the existing opportunities.id text contract';
  end if;
  select string_agg(case when attname='id' then 'u.opportunity_id as id'
    else format('o.%I',attname) end, ', ' order by attnum)
  into opportunity_columns
  from pg_attribute
  where attrelid='public.opportunities'::regclass and attnum>0 and not attisdropped;
  execute format($view$
create or replace view public.opportunity_seo_universe
with (security_invoker=true) as
with effective_policies as materialized (
  select distinct public.canonical_opportunity_source_policy(s.source) policy
  from public.opportunity_sources s
)
select %s, u.lifecycle_state as universe_lifecycle_state,
  u.seo_state as universe_seo_state
from public.opportunity_universe_state u
join lateral (
  select candidate.*
  from public.opportunities candidate
  where candidate.id = u.opportunity_id
    and public.opportunity_deadline_state(candidate.deadline) in ('OPEN','UNKNOWN')
    and public.source_seo_row_readiness_reason(candidate.title,candidate.slug,candidate.description,candidate.organization)='SEO_ROW_READY'
  limit 1
) o on o.id = u.opportunity_id
left join public.opportunity_source_identity_aliases a
  on a.emitted_source=lower(trim(o.source))
join lateral (
  select p.policy
  from effective_policies p
  where p.policy->>'canonical_source'=coalesce(a.canonical_source,lower(trim(o.source)))
    and p.policy->>'is_enabled'='true'
    and p.policy->>'seo_enabled' is distinct from 'false'
    and not public.source_seo_explicitly_denied(coalesce(a.canonical_source,lower(trim(o.source))))
  limit all
) p on true
where u.seo_state='READY'
order by u.opportunity_id
$view$, opportunity_columns);
end $migration$;

-- Reconcile only the affected persisted SEO dimension. The provenance markers
-- are diagnostic; they are not instructions to restore stale consumer states.
-- The rollback artifact refuses to reverse while any explicit restrictions or
-- migration-managed rows exist, because revoking those decisions needs a
-- separate authorization and re-evaluation through the canonical reducers.
update public.opportunity_universe_state u
set seo_row_state='NOT_READY',
    seo_row_reason=public.source_seo_row_readiness_reason(o.title,o.slug,o.description,o.organization),
    seo_state='NOT_READY',
    seo_effective_reason=public.source_seo_row_readiness_reason(o.title,o.slug,o.description,o.organization)
from public.opportunities o
where u.opportunity_id=o.id::text
  and u.lifecycle_state='ACTIVE_VALID'
  and (u.seo_row_state='READY' or u.seo_row_reason='THIN_CONTENT')
  and public.source_seo_row_readiness_reason(o.title,o.slug,o.description,o.organization)<>'SEO_ROW_READY';

update public.opportunity_universe_state u
set seo_state='NOT_READY', seo_effective_reason='SOURCE_SEO_PERMISSION_DENIED'
from public.opportunities o
left join public.opportunity_source_identity_aliases a on a.emitted_source=lower(trim(o.source))
where u.opportunity_id=o.id::text
  and coalesce(a.canonical_source,lower(trim(o.source)))='weworkremotely'
  and u.seo_state='READY'
  and u.seo_row_state='READY';

with explicit_denials as (
  select canonical_source,
    bool_or(consumer='catalog') as catalog_denied,
    bool_or(consumer='matching') as matching_denied,
    bool_or(consumer='alerts') as alerts_denied,
    bool_or(consumer='seo_index') as seo_denied,
    max(reason) filter (where consumer='matching') as matching_reason,
    max(provenance) filter (where consumer='matching') as matching_provenance,
    max(reason) filter (where consumer='seo_index') as seo_reason
  from public.opportunity_source_consumer_permissions
  where permission_state='DENIED' and evidence_type like 'OFFICIAL_%'
    and nullif(trim(provenance),'') is not null and nullif(trim(evidence_reference),'') is not null
  group by canonical_source
)
update public.opportunity_universe_state u
set catalog_state=case when d.catalog_denied and u.catalog_state in ('READY','UNKNOWN') then 'NOT_READY' else u.catalog_state end,
    source_matching_state=case when d.matching_denied then 'DENIED' else u.source_matching_state end,
    source_matching_reason=case when d.matching_denied then coalesce(d.matching_reason,'SOURCE_MATCH_DENIED') else u.source_matching_reason end,
    source_matching_provenance=case when d.matching_denied then coalesce(d.matching_provenance,'') else u.source_matching_provenance end,
    final_matching_state=case when d.matching_denied and u.final_matching_state in ('READY','UNKNOWN') then 'NOT_READY' else u.final_matching_state end,
    alerts_state=case when d.alerts_denied and u.alerts_state in ('READY','UNKNOWN') then 'NOT_READY' else u.alerts_state end,
    seo_state=case when d.seo_denied and u.seo_row_state='READY' and u.seo_state in ('READY','UNKNOWN') then 'NOT_READY' else u.seo_state end,
    seo_effective_reason=case when d.seo_denied and u.seo_row_state='READY' and u.seo_state in ('READY','UNKNOWN') then coalesce(d.seo_reason,'SOURCE_SEO_PERMISSION_DENIED') else u.seo_effective_reason end
from public.opportunities o
left join public.opportunity_source_identity_aliases a on a.emitted_source=lower(trim(o.source))
join explicit_denials d on d.canonical_source=coalesce(a.canonical_source,lower(trim(o.source)))
where u.opportunity_id=o.id::text
  and ((d.catalog_denied and u.catalog_state in ('READY','UNKNOWN'))
    or (d.matching_denied and (u.source_matching_state<>'DENIED' or u.final_matching_state in ('READY','UNKNOWN')))
    or (d.alerts_denied and u.alerts_state in ('READY','UNKNOWN'))
    or (d.seo_denied and u.seo_row_state='READY' and u.seo_state in ('READY','UNKNOWN')));

commit;
