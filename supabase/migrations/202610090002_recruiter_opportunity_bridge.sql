-- PROPOSED WRITE / NOT APPLIED. Apply only after 202610090001 and STOP C approval.
-- Schema/future wiring only: historical reconciliation is a SEPARATE operation.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';

-- Capture the installed legacy overload once so a separately authorized schema
-- rollback can restore its exact body without editing historical migrations.
do $capture$
declare v_oid oid; v_definition text; v_signature text:='text,text,text,text,text,text,text,text,text,text[],text';
begin
  if to_regprocedure('public.create_recruiter_vacancy_atomic_before_r2_20261009('||v_signature||')') is null then
    v_oid:=to_regprocedure('public.create_recruiter_vacancy_atomic('||v_signature||')');
    if v_oid is null then raise exception 'missing_baseline_function:create_recruiter_vacancy_atomic'; end if;
    v_definition:=pg_get_functiondef(v_oid);
    if position('CREATE OR REPLACE FUNCTION public.create_recruiter_vacancy_atomic(' in v_definition)<>1 then
      raise exception 'unexpected_function_definition:create_recruiter_vacancy_atomic';
    end if;
    execute replace(v_definition,'CREATE OR REPLACE FUNCTION public.create_recruiter_vacancy_atomic(',
      'CREATE OR REPLACE FUNCTION public.create_recruiter_vacancy_atomic_before_r2_20261009(');
    execute format('alter function public.create_recruiter_vacancy_atomic_before_r2_20261009(%s) owner to %I',
      v_signature,(select pg_get_userbyid(proowner) from pg_proc where oid=v_oid));
    execute format('revoke all on function public.create_recruiter_vacancy_atomic_before_r2_20261009(%s) from public,anon,authenticated',v_signature);
    execute format('grant execute on function public.create_recruiter_vacancy_atomic_before_r2_20261009(%s) to service_role',v_signature);
  end if;
end $capture$;

create table public.recruiter_vacancy_operations (
  recruiter_token_id text not null,
  operation_id text not null check (operation_id ~ '^[A-Za-z0-9._:-]{8,128}$'),
  request jsonb not null,
  vacancy_id uuid not null references public.recruiter_vacancies(id) deferrable initially deferred,
  application_url text not null,
  created_at timestamptz not null default now(),
  primary key(recruiter_token_id,operation_id),
  unique(vacancy_id)
);
alter table public.recruiter_vacancy_operations enable row level security;
revoke all on public.recruiter_vacancy_operations from public,anon,authenticated;
grant select,insert on public.recruiter_vacancy_operations to service_role;

-- Fails instead of silently choosing a mirror if unexpected duplicates exist.
create unique index opportunities_recruiter_vacancy_unique_r2
  on public.opportunities(recruiter_vacancy_id) where recruiter_vacancy_id is not null;

create or replace function public.guard_recruiter_mirror_lifecycle()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_active boolean;
begin
  if new.source='recruiter_b2b' then
    if new.recruiter_vacancy_id is null then raise exception 'recruiter_mirror_requires_vacancy'; end if;
    select is_active into v_active from public.recruiter_vacancies where id=new.recruiter_vacancy_id;
    if not found then raise exception 'recruiter_vacancy_missing'; end if;
    if v_active is not true then new.is_active:=false; end if;
    if tg_op='INSERT' then
      -- Runs after the pre-existing source trust trigger. Publisher verification
      -- does not attest facts, country, salary, eligibility or distribution.
      new.verification_status:='pending'; new.verification_score:=null;
      new.original_source_verified:=false;
    end if;
  end if;
  return new;
end $$;
create trigger zz_recruiter_mirror_lifecycle before insert or update on public.opportunities
  for each row execute function public.guard_recruiter_mirror_lifecycle();

create or replace function public.sync_recruiter_vacancy_mirror(p_vacancy_id uuid,p_origin text)
returns text language plpgsql security definer set search_path='' as $$
declare v public.recruiter_vacancies%rowtype; o public.opportunities%rowtype; v_id text; v_url text;
  v_existing text; v_publisher_verified boolean; v_outcome text; v_identity text; v_event uuid:=gen_random_uuid();
begin
  if p_origin not in ('FUTURE_CREATE','FUTURE_UPDATE','HISTORICAL_RECONCILIATION','CLOSE_RETRY') then raise exception 'invalid_bridge_origin'; end if;
  select * into v from public.recruiter_vacancies where id=p_vacancy_id for update;
  if not found then raise exception 'recruiter_vacancy_missing'; end if;
  if v.recruiter_token_id is null then raise exception 'recruiter_owner_missing'; end if;
  select is_active and verification_status='verified' into v_publisher_verified from public.recruiter_tokens where id::text=v.recruiter_token_id::text;
  if not found then raise exception 'recruiter_owner_missing'; end if;
  if nullif(trim(v.slug),'') is null or v.slug !~ '^[A-Za-z0-9-]{3,80}$' then raise exception 'invalid_historical_slug'; end if;
  select id,application_url into v_existing,v_url from public.opportunities where recruiter_vacancy_id=v.id for update;
  if v_existing is not null and exists(select 1 from public.opportunities where id=v_existing and source<>'recruiter_b2b') then
    raise exception 'mirror_source_conflict';
  end if;
  if p_origin='HISTORICAL_RECONCILIATION' and v_existing is not null then
    raise exception 'historical_preexisting_mirror:%',v_existing;
  end if;
  if v_url is null then select application_url into v_url from public.recruiter_vacancy_operations where vacancy_id=v.id; end if;
  v_url:=coalesce(v_url,'https://cvitae.lat/vacante/'||v.slug);
  v_id:=coalesce(v_existing,'recruiter-'||v.id::text);
  v_outcome:=case when v_existing is null then 'INSERTED' else 'UPDATED' end;
  -- One producer maps declared facts. No countries/eligibility, salary numbers,
  -- source observation, verification, or publication permissions are inferred.
  insert into public.opportunities as current (
    id,recruiter_vacancy_id,source,title,organization,description,requirements,value,
    location,type,application_url,slug,is_active,country_code,
    source_authority,original_source_url,original_source_verified,
    opportunity_kind,opportunity_type,verification_status,verification_score,verification_reasons
  ) values (
    v_id,v.id,'recruiter_b2b',v.title,v.company,v.description,
    case when nullif(trim(v.requirements),'') is null then null else jsonb_build_array(jsonb_build_object('text',v.requirements)) end,
    nullif(trim(v.salary_range),''),v.location,v.modality,v_url,'b2b-'||lower(v.slug),v.is_active,null,
    'original',v_url,false,'empleo','job','pending',null,
    jsonb_build_array('PUBLISHER_DECLARED_FIELDS','FACTUAL_VERIFICATION_PENDING')
  ) on conflict (recruiter_vacancy_id) where recruiter_vacancy_id is not null do update set
    title=excluded.title,organization=excluded.organization,description=excluded.description,
    requirements=excluded.requirements,value=excluded.value,location=excluded.location,type=excluded.type,
    slug=excluded.slug,is_active=excluded.is_active,application_url=excluded.application_url,
    verification_status=case when (current.title,current.organization,current.description,current.requirements,current.value,current.location,current.type)
      is distinct from (excluded.title,excluded.organization,excluded.description,excluded.requirements,excluded.value,excluded.location,excluded.type)
      then 'pending' else current.verification_status end,
    updated_at=now()
  where (current.title,current.organization,current.description,current.requirements,current.value,current.location,current.type,current.slug,current.is_active,current.application_url)
    is distinct from (excluded.title,excluded.organization,excluded.description,excluded.requirements,excluded.value,excluded.location,excluded.type,excluded.slug,excluded.is_active,excluded.application_url)
  returning * into o;
  if not found then
    -- No-op must not reset human factual review, charge, emit another event,
    -- change lifecycle, or fabricate a new observation.
    perform public.refresh_opportunity_universe(v_id,false);
    return v_id;
  end if;
  v_identity:=encode(extensions.digest(convert_to('recruiter_b2b:'||v.id::text,'UTF8'),'sha256'),'hex');
  insert into public.opportunity_ingestion_events (
    event_key,opportunity_id,emitted_source,canonical_source,producer_id,adapter_id,normalizer_version,
    normalized_fields,run_id,outcome,trace_state,trace_contract_version,identity_factual,trace_reason,reason,identity_sha256,evidence
  ) values (
    'recruiter-bridge:'||v_event::text,v_id,'recruiter_b2b','recruiter_b2b','recruiter-vacancy-rpc',
    'recruiter-vacancy-declared-fields','recruiter-bridge:v1',
    array['title','organization','description','requirements','value','location','type','slug','is_active','application_url'],
    'recruiter-bridge:'||v_event::text,v_outcome,'TRACED','v2',true,'EXACT_RECRUITER_VACANCY_ID',p_origin,v_identity,
    jsonb_build_object('origin',p_origin,'vacancy_id',v.id,'publisher_identity_verified',coalesce(v_publisher_verified,false),
      'field_evidence','PUBLISHER_DECLARED_NOT_INDEPENDENTLY_VERIFIED',
      'requirements_source','recruiter_vacancies.requirements',
      'value_semantics','COMPENSATION_TEXT','value_source','recruiter_vacancies.salary_range',
      'work_arrangement_source','recruiter_vacancies.modality','country_evidence','NOT_PROVIDED',
      'historical_created_by_reconciliation',p_origin='HISTORICAL_RECONCILIATION' and v_outcome='INSERTED',
      'observation','NOT_PERFORMED','distribution','INDEPENDENT_CANONICAL_GATES')
  );
  -- Existing opportunity after-write trigger is the Universe authority.
  if not exists(select 1 from public.opportunity_universe_state where opportunity_id=v_id) then
    raise exception 'universe_refresh_missing';
  end if;
  return v_id;
end $$;

create or replace function public.recruiter_vacancy_bridge_after_write()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='UPDATE' then
    if old.recruiter_token_id is distinct from new.recruiter_token_id or old.slug is distinct from new.slug then
      raise exception 'vacancy_identity_immutable';
    end if;
    if old.is_active=false and new.is_active=true then raise exception 'closed_vacancy_requires_new_operation'; end if;
  end if;
  perform public.sync_recruiter_vacancy_mirror(new.id,case when tg_op='INSERT' then 'FUTURE_CREATE' else 'FUTURE_UPDATE' end);
  return new;
end $$;
create trigger recruiter_vacancy_bridge_after_write after insert or update of
  title,company,description,requirements,salary_range,location,modality,slug,is_active,recruiter_token_id
  on public.recruiter_vacancies for each row execute function public.recruiter_vacancy_bridge_after_write();

create or replace function public.create_recruiter_vacancy_atomic(
  p_recruiter_token_id text,p_title text,p_description text,p_requirements text,p_location text,
  p_modality text,p_salary_range text,p_slug text,p_rubro text,p_tags text[],p_application_url text,p_operation_id text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_token public.recruiter_tokens%rowtype; v_vacancy public.recruiter_vacancies%rowtype;
  v_typed public.recruiter_vacancies%rowtype; v_operation public.recruiter_vacancy_operations%rowtype;
  v_request jsonb; v_id uuid; v_mirror text; v_slug text; v_application_url text;
begin
  if p_operation_id is null or p_operation_id !~ '^[A-Za-z0-9._:-]{8,128}$' then raise exception 'operation_id_required'; end if;
  if nullif(trim(p_title),'') is null or nullif(trim(p_description),'') is null or nullif(trim(p_requirements),'') is null
    or nullif(trim(p_location),'') is null or nullif(trim(p_modality),'') is null then raise exception 'required_vacancy_fields_missing'; end if;
  v_slug:=lower(trim(p_slug));
  v_application_url:=trim(p_application_url);
  if v_slug is null or v_slug !~ '^[a-z0-9-]{3,80}$' then raise exception 'invalid_vacancy_slug'; end if;
  if v_application_url is null or v_application_url !~ '^https://[A-Za-z0-9.-]+(:[0-9]+)?/vacante/[A-Za-z0-9-]+$'
    or lower(right(v_application_url,length(trim(p_slug))+1))<>'/'||v_slug then raise exception 'invalid_vacancy_url'; end if;
  -- R1 generated uppercase random suffixes. Canonicalize the matching path
  -- suffix with the slug so the compatibility overload survives the rollout.
  v_application_url:=left(v_application_url,length(v_application_url)-length(trim(p_slug)))||v_slug;
  select * into v_token from public.recruiter_tokens where id::text=p_recruiter_token_id
    and is_active=true and verification_status='verified' for share;
  if not found then raise exception 'invalid_recruiter'; end if;
  if nullif(trim(v_token.company_name),'') is null then raise exception 'verified_company_name_missing'; end if;
  -- Serializes identical keys, including transactions whose response was lost.
  perform pg_advisory_xact_lock(hashtextextended('recruiter-create:'||v_token.id::text||':'||p_operation_id,0));
  v_request:=jsonb_build_object('title',trim(p_title),'description',trim(p_description),'requirements',trim(p_requirements),
    'location',trim(p_location),'modality',trim(p_modality),'salary_range',nullif(trim(p_salary_range),''),
    'rubro',nullif(trim(p_rubro),''),'tags',coalesce(p_tags,'{}'::text[]),
    'slug',v_slug,'application_url',v_application_url);
  select * into v_operation from public.recruiter_vacancy_operations where recruiter_token_id=v_token.id::text and operation_id=p_operation_id;
  if found then
    if v_operation.request<>v_request then raise exception 'operation_conflict'; end if;
    select * into v_vacancy from public.recruiter_vacancies where id=v_operation.vacancy_id;
    select id into v_mirror from public.opportunities where recruiter_vacancy_id=v_operation.vacancy_id;
    if v_vacancy.id is null or v_mirror is null then raise exception 'publication_pair_missing'; end if;
    return jsonb_build_object('success',true,'id',v_vacancy.id,'opportunity_id',v_mirror,'slug',v_vacancy.slug,
      'url',v_operation.application_url,'idempotent',true,'is_active',v_vacancy.is_active);
  end if;
  v_id:=gen_random_uuid();
  insert into public.recruiter_vacancy_operations(recruiter_token_id,operation_id,request,vacancy_id,application_url)
    values(v_token.id::text,p_operation_id,v_request,v_id,v_application_url);
  v_typed:=jsonb_populate_record(null::public.recruiter_vacancies,jsonb_build_object('recruiter_token_id',v_token.id::text));
  -- The AFTER trigger creates the mirror and lineage in THIS transaction.
  insert into public.recruiter_vacancies(id,title,description,requirements,location,modality,salary_range,company,slug,recruiter_token_id,is_active)
    values(v_id,trim(p_title),trim(p_description),trim(p_requirements),trim(p_location),trim(p_modality),nullif(trim(p_salary_range),''),
      trim(v_token.company_name),v_slug,v_typed.recruiter_token_id,true) returning * into v_vacancy;
  select id into v_mirror from public.opportunities where recruiter_vacancy_id=v_id;
  if v_mirror is null then raise exception 'OPPORTUNITY_MIRROR_INSERT_FAILED'; end if;
  -- Optional categorization is preserved without inventing factual tags.
  update public.opportunities set rubro=nullif(trim(p_rubro),''),tags=coalesce(p_tags,'{}'::text[]) where id=v_mirror;
  return jsonb_build_object('success',true,'id',v_id,'opportunity_id',v_mirror,'slug',v_vacancy.slug,'url',v_application_url,'idempotent',false);
end $$;

-- Transitional compatibility for the installed 11-argument client. It cannot
-- bypass validation or ownership: the exact normalized request is fingerprinted
-- and delegated to the authoritative 12-argument RPC. A later, separately
-- authorized cutover removes this compatibility after all callers use operation_id.
create or replace function public.create_recruiter_vacancy_atomic(
  p_recruiter_token_id text,p_title text,p_description text,p_requirements text,p_location text,p_modality text,
  p_salary_range text,p_slug text,p_rubro text,p_tags text[],p_application_url text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_operation_id text; v_result jsonb; v_slug text; v_application_url text;
begin
  v_slug:=lower(trim(p_slug));
  v_application_url:=case when p_application_url is null or nullif(trim(p_slug),'') is null then trim(p_application_url)
    else left(trim(p_application_url),greatest(length(trim(p_application_url))-length(trim(p_slug)),0))||v_slug end;
  v_operation_id:='legacy:'||encode(extensions.digest(convert_to(jsonb_build_object(
    'recruiter_token_id',p_recruiter_token_id,'title',trim(p_title),'description',trim(p_description),
    'requirements',trim(p_requirements),'location',trim(p_location),'modality',trim(p_modality),
    'salary_range',nullif(trim(p_salary_range),''),'slug',v_slug,
    'rubro',nullif(trim(p_rubro),''),'tags',coalesce(p_tags,'{}'::text[]),
    'application_url',v_application_url)::text,'UTF8'),'sha256'),'hex');
  v_result:=public.create_recruiter_vacancy_atomic(
    p_recruiter_token_id,p_title,p_description,p_requirements,p_location,p_modality,
    p_salary_range,v_slug,p_rubro,p_tags,v_application_url,v_operation_id);
  return v_result||jsonb_build_object('compatibility_mode','LEGACY_REQUEST_FINGERPRINT');
end $$;

create or replace function public.close_recruiter_vacancy_atomic(p_recruiter_token_id text,p_vacancy_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v public.recruiter_vacancies%rowtype; v_id text; v_already_closed boolean;
begin
  perform 1 from public.recruiter_tokens where id::text=p_recruiter_token_id and is_active=true and verification_status='verified' for share;
  if not found then raise exception 'invalid_recruiter'; end if;
  select * into v from public.recruiter_vacancies where id=p_vacancy_id and recruiter_token_id::text=p_recruiter_token_id for update;
  if not found then raise exception 'vacancy_not_owned'; end if;
  v_already_closed:=v.is_active=false;
  if not v_already_closed then update public.recruiter_vacancies set is_active=false where id=v.id; end if;
  v_id:=public.sync_recruiter_vacancy_mirror(v.id,'CLOSE_RETRY');
  if exists(select 1 from public.opportunities where id=v_id and is_active is distinct from false) then raise exception 'close_mirror_mismatch'; end if;
  if not exists(select 1 from public.opportunity_universe_state where opportunity_id=v_id) or exists(
    select 1 from public.opportunity_universe_state where opportunity_id=v_id
      and ('READY' in (catalog_state,final_matching_state,alerts_state,seo_state))) then raise exception 'close_universe_mismatch'; end if;
  return jsonb_build_object('ok',true,'id',v.id,'opportunity_id',v_id,'is_active',false,'idempotent',v_already_closed);
end $$;

create or replace function public.reconcile_recruiter_vacancies_r2(
  p_expected_count integer,p_expected_digest text,p_expected_reconcilable integer,p_expected_pending integer,
  p_expected_existing_mirrors integer
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_count integer; v_digest text; v record; v_reconciled integer:=0; v_pending integer:=0;
  v_existing_mirrors integer; v_opportunity_id text;
  v_pending_rows jsonb:='[]'::jsonb; v_pending_by_reason jsonb;
begin
  -- Explicit operator transaction only. No scheduler calls this function.
  lock table public.recruiter_vacancies in share row exclusive mode;
  lock table public.opportunities in share row exclusive mode;
  -- RECRUITER_VACANCY_V1 is schema-stable: unrelated future columns do not
  -- invalidate the operator preview or silently enter the reconciliation scope.
  select count(*),md5(coalesce(string_agg(jsonb_build_array(
    r.id::text,r.title,r.description,r.requirements,r.location,r.modality,r.salary_range,
    r.company,r.slug,r.recruiter_token_id::text,r.is_active,r.created_at
  )::text,'|' order by r.id),'')) into v_count,v_digest from public.recruiter_vacancies r;
  select count(*)::integer into v_existing_mirrors
  from public.opportunities o where exists(
    select 1 from public.recruiter_vacancies r where r.id=o.recruiter_vacancy_id);
  if p_expected_count is null or p_expected_digest is null or p_expected_reconcilable is null or p_expected_pending is null
    or p_expected_existing_mirrors is null
    or v_count<>p_expected_count or v_digest<>p_expected_digest then
    raise exception 'historical_preview_changed';
  end if;
  if p_expected_existing_mirrors<>0 or v_existing_mirrors<>p_expected_existing_mirrors then
    raise exception 'historical_existing_mirrors_detected:expected=%,actual=%',p_expected_existing_mirrors,v_existing_mirrors;
  end if;
  for v in
    with facts as (
      select r.id,r.slug,t.id owner_id,t.is_active owner_active,t.verification_status,
        (select count(*) from public.opportunities o where o.recruiter_vacancy_id=r.id) mirror_count,
        (select count(*) from public.opportunities o where o.recruiter_vacancy_id=r.id and o.source<>'recruiter_b2b') mirror_source_conflicts,
        (select count(*) from public.opportunities o where o.slug='b2b-'||lower(r.slug) and o.recruiter_vacancy_id is distinct from r.id) expected_slug_collisions,
        (select count(*) from public.opportunities o where o.application_url='https://cvitae.lat/vacante/'||r.slug and o.recruiter_vacancy_id is distinct from r.id) application_url_collisions,
        nullif(trim(r.title),'') is null or nullif(trim(r.description),'') is null
          or nullif(trim(r.requirements),'') is null or nullif(trim(r.location),'') is null
          or nullif(trim(r.modality),'') is null quality_missing
      from public.recruiter_vacancies r
      left join public.recruiter_tokens t on t.id::text=r.recruiter_token_id::text
    )
    select id,case
      when owner_id is null then 'OWNER_MISSING'
      when not coalesce(owner_active,false) then 'PUBLISHER_INACTIVE'
      when verification_status is distinct from 'verified' then 'PUBLISHER_IDENTITY_NOT_VERIFIED'
      when slug is null or slug !~ '^[A-Za-z0-9-]{3,80}$' then 'INVALID_SLUG'
      when mirror_count>1 then 'DUPLICATE_MIRROR'
      when mirror_source_conflicts>0 then 'MIRROR_SOURCE_CONFLICT'
      when mirror_count>0 then 'PREEXISTING_MIRROR'
      when expected_slug_collisions>0 then 'EXPECTED_SLUG_COLLISION'
      when application_url_collisions>0 then 'APPLICATION_URL_COLLISION'
      when quality_missing then 'QUALITY_MISSING'
      else 'INVENTORY_RECONCILABLE'
    end inventory_gate from facts order by id
  loop
    if v.inventory_gate='INVENTORY_RECONCILABLE' then
      v_opportunity_id:=public.sync_recruiter_vacancy_mirror(v.id,'HISTORICAL_RECONCILIATION');
      if not exists(
        select 1 from public.opportunity_ingestion_events e
        where e.opportunity_id=v_opportunity_id and e.adapter_id='recruiter-vacancy-declared-fields'
          and e.reason='HISTORICAL_RECONCILIATION' and e.outcome='INSERTED'
          and e.evidence->>'historical_created_by_reconciliation'='true'
      ) then raise exception 'historical_insert_lineage_missing:%',v_opportunity_id; end if;
      v_reconciled:=v_reconciled+1;
    else
      v_pending:=v_pending+1;
      v_pending_rows:=v_pending_rows||jsonb_build_array(jsonb_build_object('id',v.id,'reason',v.inventory_gate));
    end if;
  end loop;
  if v_reconciled<>p_expected_reconcilable or v_pending<>p_expected_pending or v_reconciled+v_pending<>v_count then
    raise exception 'historical_accounting_changed:reconcilable=%,pending=%,total=%',v_reconciled,v_pending,v_count;
  end if;
  select coalesce(jsonb_object_agg(reason,n),'{}'::jsonb) into v_pending_by_reason
  from (select value->>'reason' reason,count(*) n from jsonb_array_elements(v_pending_rows) group by value->>'reason') q;
  return jsonb_build_object('total',v_count,'reconciled',v_reconciled,'pending',v_pending,
    'created',v_reconciled,'existing_mirrors_before',v_existing_mirrors,
    'accounted',v_reconciled+v_pending,'row_digest_contract','RECRUITER_VACANCY_V1',
    'pending_by_reason',v_pending_by_reason,'pending_rows',v_pending_rows,'publication_authorized',false);
end $$;

revoke all on function public.guard_recruiter_mirror_lifecycle() from public,anon,authenticated;
revoke all on function public.sync_recruiter_vacancy_mirror(uuid,text) from public,anon,authenticated;
revoke all on function public.recruiter_vacancy_bridge_after_write() from public,anon,authenticated;
revoke all on function public.create_recruiter_vacancy_atomic(text,text,text,text,text,text,text,text,text,text[],text,text) from public,anon,authenticated;
revoke all on function public.create_recruiter_vacancy_atomic(text,text,text,text,text,text,text,text,text,text[],text) from public,anon,authenticated;
revoke all on function public.close_recruiter_vacancy_atomic(text,uuid) from public,anon,authenticated;
revoke all on function public.reconcile_recruiter_vacancies_r2(integer,text,integer,integer,integer) from public,anon,authenticated;
grant execute on function public.sync_recruiter_vacancy_mirror(uuid,text) to service_role;
grant execute on function public.create_recruiter_vacancy_atomic(text,text,text,text,text,text,text,text,text,text[],text,text) to service_role;
grant execute on function public.create_recruiter_vacancy_atomic(text,text,text,text,text,text,text,text,text,text[],text) to service_role;
grant execute on function public.close_recruiter_vacancy_atomic(text,uuid) to service_role;
grant execute on function public.reconcile_recruiter_vacancies_r2(integer,text,integer,integer,integer) to service_role;
commit;
