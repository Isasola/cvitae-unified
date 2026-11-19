-- PROPOSED WRITE / NOT APPLIED.
-- Adds idempotent vacancy updates and an honest, persisted SEO Plus request.
-- No payment, entitlement, catalog/SEO permission, indexing or distribution is
-- granted by this migration.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';

create table if not exists public.recruiter_vacancy_mutation_operations (
  recruiter_token_id text not null,
  operation_id text not null check(operation_id~'^[A-Za-z0-9._:-]{8,128}$'),
  vacancy_id uuid not null references public.recruiter_vacancies(id) on delete cascade,
  action text not null check(action in ('UPDATE')),
  request jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key(recruiter_token_id,operation_id)
);
alter table public.recruiter_vacancy_mutation_operations enable row level security;
revoke all on public.recruiter_vacancy_mutation_operations from public,anon,authenticated;
grant select,insert on public.recruiter_vacancy_mutation_operations to service_role;

create or replace function public.update_recruiter_vacancy_atomic(
  p_recruiter_token_id text,p_vacancy_id uuid,p_operation_id text,
  p_title text,p_description text,p_requirements text,p_location text,
  p_modality text,p_salary_range text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v public.recruiter_vacancies%rowtype; v_operation public.recruiter_vacancy_mutation_operations%rowtype;
  v_request jsonb; v_result jsonb; v_mirror public.opportunities%rowtype;
begin
  if p_operation_id is null or p_operation_id!~'^[A-Za-z0-9._:-]{8,128}$' then raise exception 'operation_id_required'; end if;
  if nullif(trim(p_title),'') is null or nullif(trim(p_description),'') is null
    or nullif(trim(p_requirements),'') is null or nullif(trim(p_location),'') is null
    or nullif(trim(p_modality),'') is null then raise exception 'required_vacancy_fields_missing'; end if;
  perform 1 from public.recruiter_tokens where id::text=p_recruiter_token_id
    and is_active=true and verification_status='verified' for share;
  if not found then raise exception 'invalid_recruiter'; end if;
  perform pg_advisory_xact_lock(hashtextextended('recruiter-update:'||p_recruiter_token_id||':'||p_operation_id,0));
  v_request:=jsonb_build_object('vacancy_id',p_vacancy_id,'title',trim(p_title),'description',trim(p_description),
    'requirements',trim(p_requirements),'location',trim(p_location),'modality',trim(p_modality),
    'salary_range',nullif(trim(p_salary_range),''));
  select * into v_operation from public.recruiter_vacancy_mutation_operations
    where recruiter_token_id=p_recruiter_token_id and operation_id=p_operation_id;
  if found then
    if v_operation.action<>'UPDATE' or v_operation.request<>v_request then raise exception 'operation_conflict'; end if;
    return v_operation.result||jsonb_build_object('idempotent',true);
  end if;
  select * into v from public.recruiter_vacancies where id=p_vacancy_id
    and recruiter_token_id::text=p_recruiter_token_id for update;
  if not found then raise exception 'vacancy_not_owned'; end if;
  if v.is_active is not true then raise exception 'closed_vacancy_immutable'; end if;
  update public.recruiter_vacancies set title=trim(p_title),description=trim(p_description),
    requirements=trim(p_requirements),location=trim(p_location),modality=trim(p_modality),
    salary_range=nullif(trim(p_salary_range),'') where id=v.id;
  select * into v_mirror from public.opportunities where recruiter_vacancy_id=v.id;
  if not found or (v_mirror.title,v_mirror.description,public.opportunity_requirements_text(v_mirror.requirements),
      v_mirror.location,v_mirror.type,v_mirror.value,v_mirror.is_active)
    is distinct from (trim(p_title),trim(p_description),trim(p_requirements),trim(p_location),trim(p_modality),
      nullif(trim(p_salary_range),''),true) then raise exception 'update_mirror_mismatch'; end if;
  v_result:=jsonb_build_object('ok',true,'id',v.id,'opportunity_id',v_mirror.id,
    'slug',v.slug,'is_active',true,'idempotent',false);
  insert into public.recruiter_vacancy_mutation_operations(
    recruiter_token_id,operation_id,vacancy_id,action,request,result)
  values(p_recruiter_token_id,p_operation_id,v.id,'UPDATE',v_request,v_result);
  return v_result;
end $$;

create table if not exists public.recruiter_seo_plus_requests (
  vacancy_id uuid primary key references public.recruiter_vacancies(id) on delete cascade,
  recruiter_token_id text not null,
  request_status text not null check(request_status in ('REQUESTED','PENDING_CONTRACT','ACTIVE','WITHDRAWN','EXPIRED')),
  entitlement_status text not null check(entitlement_status in ('NOT_CONTRACTED','ACTIVE','EXPIRED')),
  authorization_status text not null check(authorization_status in ('CONSENT_RECORDED','WITHDRAWN')),
  delivery_status text not null check(delivery_status in ('NOT_EVALUATED','SEO_READY','PUBLISHED','BLOCKED_QUALITY','WITHDRAWN','EXPIRED')),
  public_indexing_consent boolean not null,
  consent_scope jsonb not null,
  contract_version text not null,
  requested_by_actor_type text not null check(requested_by_actor_type='RECRUITER_TOKEN'),
  requested_by_actor_id text not null,
  consented_at timestamptz not null,
  withdrawn_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(requested_by_actor_id=recruiter_token_id),
  check((authorization_status='CONSENT_RECORDED' and public_indexing_consent=true)
    or (authorization_status='WITHDRAWN' and public_indexing_consent=false))
);
create index if not exists recruiter_seo_plus_token_idx
  on public.recruiter_seo_plus_requests(recruiter_token_id,updated_at desc);
alter table public.recruiter_seo_plus_requests enable row level security;
revoke all on public.recruiter_seo_plus_requests from public,anon,authenticated;
grant select,insert,update on public.recruiter_seo_plus_requests to service_role;

create table if not exists public.recruiter_seo_plus_events (
  recruiter_token_id text not null,
  operation_id text not null check(operation_id~'^[A-Za-z0-9._:-]{8,128}$'),
  vacancy_id uuid not null references public.recruiter_vacancies(id) on delete cascade,
  event_type text not null check(event_type in ('REQUESTED','WITHDRAWN','VACANCY_CLOSED')),
  contract_version text,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key(recruiter_token_id,operation_id)
);
alter table public.recruiter_seo_plus_events enable row level security;
revoke all on public.recruiter_seo_plus_events from public,anon,authenticated;
grant select,insert on public.recruiter_seo_plus_events to service_role;

create or replace function public.request_recruiter_seo_plus(
  p_recruiter_token_id text,p_vacancy_id uuid,p_operation_id text,
  p_public_indexing_consent boolean,p_contract_version text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v public.recruiter_vacancies%rowtype; r public.recruiter_seo_plus_requests%rowtype; e public.recruiter_seo_plus_events%rowtype;
  v_version constant text:='seo-plus-publication-v1-2026-10-11';
begin
  if p_operation_id is null or p_operation_id!~'^[A-Za-z0-9._:-]{8,128}$' then raise exception 'operation_id_required'; end if;
  if p_public_indexing_consent is not true then raise exception 'explicit_public_indexing_consent_required'; end if;
  if p_contract_version is distinct from v_version then raise exception 'contract_version_mismatch'; end if;
  perform 1 from public.recruiter_tokens where id::text=p_recruiter_token_id
    and is_active=true and verification_status='verified' for share;
  if not found then raise exception 'invalid_recruiter'; end if;
  perform pg_advisory_xact_lock(hashtextextended('seo-plus:'||p_recruiter_token_id||':'||p_operation_id,0));
  select * into e from public.recruiter_seo_plus_events
    where recruiter_token_id=p_recruiter_token_id and operation_id=p_operation_id;
  if found then
    if e.vacancy_id<>p_vacancy_id or e.event_type<>'REQUESTED' then raise exception 'operation_conflict'; end if;
    select * into r from public.recruiter_seo_plus_requests where vacancy_id=p_vacancy_id;
    return jsonb_build_object('ok',true,'idempotent',true,'request',to_jsonb(r),'charged',false,'distribution_changed',false);
  end if;
  select * into v from public.recruiter_vacancies where id=p_vacancy_id
    and recruiter_token_id::text=p_recruiter_token_id for update;
  if not found then raise exception 'vacancy_not_owned'; end if;
  if v.is_active is not true then raise exception 'vacancy_closed'; end if;
  insert into public.recruiter_seo_plus_requests as current(
    vacancy_id,recruiter_token_id,request_status,entitlement_status,authorization_status,delivery_status,
    public_indexing_consent,consent_scope,contract_version,requested_by_actor_type,requested_by_actor_id,
    consented_at,withdrawn_at,updated_at)
  values(v.id,p_recruiter_token_id,'REQUESTED','NOT_CONTRACTED','CONSENT_RECORDED','NOT_EVALUATED',true,
    jsonb_build_object('public_page_preparation',true,'search_engine_indexing',true,'jobposting_conditional',true,
      'google_jobs_not_guaranteed',true,'third_party_distribution_not_included',true),
    v_version,'RECRUITER_TOKEN',p_recruiter_token_id,now(),null,now())
  on conflict(vacancy_id) do update set
    recruiter_token_id=excluded.recruiter_token_id,
    request_status=case when current.request_status='ACTIVE' then current.request_status else 'REQUESTED' end,
    entitlement_status=current.entitlement_status,
    delivery_status=case when current.request_status='ACTIVE' then current.delivery_status else 'NOT_EVALUATED' end,
    authorization_status='CONSENT_RECORDED',public_indexing_consent=true,
    consent_scope=excluded.consent_scope,contract_version=excluded.contract_version,
    requested_by_actor_type='RECRUITER_TOKEN',requested_by_actor_id=excluded.requested_by_actor_id,
    consented_at=excluded.consented_at,withdrawn_at=null,updated_at=now()
  returning * into r;
  insert into public.recruiter_seo_plus_events(
    recruiter_token_id,operation_id,vacancy_id,event_type,contract_version,evidence)
  values(p_recruiter_token_id,p_operation_id,v.id,'REQUESTED',v_version,
    jsonb_build_object('explicit_consent',true,'actor_type','RECRUITER_TOKEN','charged',false,
      'entitlement_granted',false,'distribution_changed',false));
  return jsonb_build_object('ok',true,'idempotent',false,'request',to_jsonb(r),'charged',false,'distribution_changed',false);
end $$;

create or replace function public.withdraw_recruiter_seo_plus(
  p_recruiter_token_id text,p_vacancy_id uuid,p_operation_id text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.recruiter_seo_plus_requests%rowtype; e public.recruiter_seo_plus_events%rowtype;
begin
  if p_operation_id is null or p_operation_id!~'^[A-Za-z0-9._:-]{8,128}$' then raise exception 'operation_id_required'; end if;
  perform 1 from public.recruiter_tokens where id::text=p_recruiter_token_id
    and is_active=true and verification_status='verified' for share;
  if not found then raise exception 'invalid_recruiter'; end if;
  perform 1 from public.recruiter_vacancies where id=p_vacancy_id and recruiter_token_id::text=p_recruiter_token_id for update;
  if not found then raise exception 'vacancy_not_owned'; end if;
  perform pg_advisory_xact_lock(hashtextextended('seo-plus:'||p_recruiter_token_id||':'||p_operation_id,0));
  select * into e from public.recruiter_seo_plus_events where recruiter_token_id=p_recruiter_token_id and operation_id=p_operation_id;
  if found then
    if e.vacancy_id<>p_vacancy_id or e.event_type<>'WITHDRAWN' then raise exception 'operation_conflict'; end if;
    select * into r from public.recruiter_seo_plus_requests where vacancy_id=p_vacancy_id;
    return jsonb_build_object('ok',true,'idempotent',true,'request',to_jsonb(r),'distribution_changed',false);
  end if;
  update public.recruiter_seo_plus_requests set request_status='WITHDRAWN',authorization_status='WITHDRAWN',
    delivery_status='WITHDRAWN',public_indexing_consent=false,withdrawn_at=now(),updated_at=now()
    where vacancy_id=p_vacancy_id and recruiter_token_id=p_recruiter_token_id returning * into r;
  if not found then raise exception 'seo_plus_request_missing'; end if;
  insert into public.recruiter_seo_plus_events(recruiter_token_id,operation_id,vacancy_id,event_type,evidence)
    values(p_recruiter_token_id,p_operation_id,p_vacancy_id,'WITHDRAWN',
      jsonb_build_object('actor_type','RECRUITER_TOKEN','distribution_changed',false));
  return jsonb_build_object('ok',true,'idempotent',false,'request',to_jsonb(r),'distribution_changed',false);
end $$;

create or replace function public.recruiter_seo_plus_after_close()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if old.is_active is distinct from false and new.is_active=false then
    update public.recruiter_seo_plus_requests set request_status='WITHDRAWN',authorization_status='WITHDRAWN',
      delivery_status='WITHDRAWN',public_indexing_consent=false,withdrawn_at=coalesce(withdrawn_at,now()),updated_at=now()
      where vacancy_id=new.id and request_status<>'WITHDRAWN';
    if found then
      insert into public.recruiter_seo_plus_events(recruiter_token_id,operation_id,vacancy_id,event_type,evidence)
      values(new.recruiter_token_id::text,'close:'||new.id::text,new.id,'VACANCY_CLOSED',
        jsonb_build_object('automatic_scope','SEO_PLUS_ONLY','distribution_changed',false)) on conflict do nothing;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists recruiter_seo_plus_after_close on public.recruiter_vacancies;
create trigger recruiter_seo_plus_after_close after update of is_active on public.recruiter_vacancies
  for each row execute function public.recruiter_seo_plus_after_close();

revoke all on function public.update_recruiter_vacancy_atomic(text,uuid,text,text,text,text,text,text,text) from public,anon,authenticated;
revoke all on function public.request_recruiter_seo_plus(text,uuid,text,boolean,text) from public,anon,authenticated;
revoke all on function public.withdraw_recruiter_seo_plus(text,uuid,text) from public,anon,authenticated;
revoke all on function public.recruiter_seo_plus_after_close() from public,anon,authenticated;
grant execute on function public.update_recruiter_vacancy_atomic(text,uuid,text,text,text,text,text,text,text) to service_role;
grant execute on function public.request_recruiter_seo_plus(text,uuid,text,boolean,text) to service_role;
grant execute on function public.withdraw_recruiter_seo_plus(text,uuid,text) to service_role;
commit;
