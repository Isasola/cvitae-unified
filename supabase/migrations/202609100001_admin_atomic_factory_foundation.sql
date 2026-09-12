-- Additive safety foundation for the Admin and the incremental opportunity factory.

alter table public.opportunities
  add column if not exists content_fingerprint text,
  add column if not exists semantic_fingerprint text,
  add column if not exists factory_status text not null default 'pending',
  add column if not exists embedding_model text,
  add column if not exists embedding_updated_at timestamptz;

alter table public.recruiter_tokens
  add column if not exists updated_at timestamptz not null default now();

alter table public.opportunities drop constraint if exists opportunities_factory_status_check;
alter table public.opportunities add constraint opportunities_factory_status_check
  check (factory_status in ('pending', 'ready', 'review', 'blocked', 'failed'));

-- Existing vectors were produced by the same Supabase/gte-small model. Mark
-- them as compatible so this migration never starts another full backfill.
update public.opportunities
set embedding_model = 'Supabase/gte-small@1',
    embedding_updated_at = coalesce(updated_at, now()),
    factory_status = 'ready'
where embedding is not null
  and verification_status = 'verified'
  and is_active = true
  and match_eligible = true;

create index if not exists opportunities_factory_pending_idx
  on public.opportunities (updated_at, id)
  where factory_status in ('pending', 'failed') and deleted_at is null;

create table if not exists public.opportunity_factory_snapshots (
  opportunity_id text primary key references public.opportunities(id) on delete cascade,
  content_fingerprint text not null,
  semantic_fingerprint text,
  pipeline_version text not null,
  rules_version text not null,
  status text not null,
  stamps jsonb not null default '{}'::jsonb,
  evidence jsonb not null default '{}'::jsonb,
  embedding_model text,
  embedding_status text not null default 'pending',
  source_updated_at timestamptz,
  checked_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint opportunity_factory_snapshot_status_check
    check (status in ('pending', 'ready', 'review', 'blocked', 'failed')),
  constraint opportunity_factory_embedding_status_check
    check (embedding_status in ('missing', 'pending', 'ready', 'failed', 'not_applicable'))
);

alter table public.opportunity_factory_snapshots enable row level security;
revoke all on table public.opportunity_factory_snapshots from anon, authenticated;
grant all on table public.opportunity_factory_snapshots to service_role;

create table if not exists public.admin_policy_events (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('source', 'scraper')),
  entity_key text not null,
  before_state jsonb not null,
  after_state jsonb not null,
  impacted_rows integer not null default 0,
  actor text not null,
  created_at timestamptz not null default now()
);

alter table public.admin_policy_events enable row level security;
revoke all on table public.admin_policy_events from anon, authenticated;
grant all on table public.admin_policy_events to service_role;

create or replace function public.touch_opportunity_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

drop trigger if exists opportunities_touch_updated_at on public.opportunities;
create trigger opportunities_touch_updated_at
before update on public.opportunities
for each row execute function public.touch_opportunity_updated_at();

create or replace function public.invalidate_opportunity_embedding()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.title is distinct from old.title
    or new.organization is distinct from old.organization
    or new.rubro is distinct from old.rubro
    or new.type is distinct from old.type
    or new.opportunity_type is distinct from old.opportunity_type
    or new.opportunity_kind is distinct from old.opportunity_kind
    or new.tags is distinct from old.tags
    or new.location is distinct from old.location
    or new.country_code is distinct from old.country_code
    or new.eligible_countries is distinct from old.eligible_countries
    or new.description is distinct from old.description
  then
    new.embedding := null;
    new.embedding_model := null;
    new.embedding_updated_at := null;
    new.factory_status := 'pending';
  elsif new.deadline is distinct from old.deadline
    or new.application_url is distinct from old.application_url
    or new.original_source_url is distinct from old.original_source_url
    or new.original_source_verified is distinct from old.original_source_verified
    or new.eligible_regions is distinct from old.eligible_regions
  then
    new.factory_status := 'pending';
  end if;
  return new;
end;
$$;

create or replace function public.admin_review_opportunity_atomic(
  p_id text,
  p_status text,
  p_criteria text[],
  p_note text,
  p_score integer,
  p_features jsonb,
  p_original_source_verified boolean default false,
  p_expected_updated_at timestamptz default null,
  p_actor text default 'admin'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current public.opportunities%rowtype;
  v_verified boolean;
  v_now timestamptz := now();
begin
  if p_status not in ('pending', 'in_review', 'verified', 'rejected', 'quarantined') then
    raise exception 'invalid_review_status';
  end if;
  select * into v_current from public.opportunities where id = p_id for update;
  if not found then raise exception 'opportunity_not_found'; end if;
  if p_expected_updated_at is not null and v_current.updated_at is distinct from p_expected_updated_at then
    raise exception 'stale_opportunity';
  end if;
  if p_status = 'verified'
    and v_current.source_authority <> 'original'
    and not v_current.original_source_verified
    and not p_original_source_verified then
    raise exception 'original_source_required';
  end if;
  v_verified := p_status = 'verified';
  update public.opportunities set
    verification_status = p_status,
    verification_score = greatest(0, least(100, p_score)),
    verification_reasons = to_jsonb(coalesce(p_criteria, array[]::text[])),
    verification_note = nullif(left(trim(coalesce(p_note, '')), 1000), ''),
    reviewed_at = v_now,
    reviewed_by = left(coalesce(nullif(p_actor, ''), 'admin'), 120),
    original_source_verified = original_source_verified or p_original_source_verified,
    is_active = v_verified,
    catalog_eligible = v_verified and coalesce((p_features->>'catalog')::boolean, true),
    match_eligible = v_verified and coalesce((p_features->>'matching')::boolean, true),
    alerts_eligible = v_verified and coalesce((p_features->>'alerts')::boolean, true),
    seo_eligible = v_verified and coalesce((p_features->>'seo')::boolean, true),
    policy_overrides = case when v_verified then coalesce(p_features, '{}'::jsonb) else '{}'::jsonb end
  where id = p_id;

  insert into public.opportunity_review_events
    (opportunity_id, previous_status, new_status, criteria, note, actor)
  values
    (p_id, v_current.verification_status, p_status, to_jsonb(coalesce(p_criteria, array[]::text[])),
     nullif(left(trim(coalesce(p_note, '')), 1000), ''), left(coalesce(nullif(p_actor, ''), 'admin'), 120));

  return jsonb_build_object('ok', true, 'reviewed_at', v_now);
end;
$$;

drop function if exists public.admin_batch_review_opportunities_atomic(text[],text,text,jsonb,text);
create or replace function public.admin_batch_review_opportunities_atomic(
  p_ids text[],
  p_status text,
  p_note text,
  p_features jsonb,
  p_review_snapshot jsonb,
  p_actor text default 'admin_batch'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_requested integer := cardinality(p_ids);
  v_processed integer;
  v_now timestamptz := now();
begin
  if v_requested is null or v_requested = 0 then raise exception 'empty_batch'; end if;
  if p_status not in ('verified', 'rejected', 'quarantined') then raise exception 'invalid_review_status'; end if;
  if jsonb_typeof(p_review_snapshot) <> 'array' then raise exception 'review_snapshot_required'; end if;

  perform 1 from public.opportunities
  where id = any(p_ids) and verification_status in ('pending', 'in_review')
    and deleted_at is null and archived_at is null
  for update;

  if (select count(*) from public.opportunities
      where id = any(p_ids) and verification_status in ('pending', 'in_review')
        and deleted_at is null and archived_at is null) <> v_requested then
    raise exception 'stale_batch';
  end if;
  if exists (
    select 1 from public.opportunities o
    where o.id = any(p_ids) and not exists (
      select 1 from jsonb_array_elements(p_review_snapshot) snapshot
      where snapshot->>'id' = o.id
        and nullif(snapshot->>'record_updated_at', '')::timestamptz = o.updated_at
    )
  ) then
    raise exception 'stale_batch';
  end if;
  if p_status = 'verified' and exists (
    select 1 from public.opportunities o
    where o.id = any(p_ids) and (
      not exists (
        select 1 from jsonb_array_elements(p_review_snapshot) snapshot
        where snapshot->>'id' = o.id and snapshot->>'recommendation' = 'approve'
          and nullif(trim(snapshot->>'rules_version'), '') is not null
      )
      or (
        o.source_authority <> 'original' and not o.original_source_verified
        and not exists (
          select 1 from public.opportunity_sources source_policy
          where source_policy.source = o.source and source_policy.trust_level = 'trusted'
            and source_policy.is_enabled
        )
      )
    )
  ) then
    raise exception 'unsafe_batch';
  end if;

  with locked as materialized (
    select id, verification_status
    from public.opportunities
    where id = any(p_ids)
      and verification_status in ('pending', 'in_review')
      and deleted_at is null
      and archived_at is null
    for update
  ), changed as (
    update public.opportunities o set
      verification_status = p_status,
      verification_note = nullif(left(trim(coalesce(p_note, '')), 1000), ''),
      reviewed_at = v_now,
      reviewed_by = left(coalesce(nullif(p_actor, ''), 'admin_batch'), 120),
      is_active = p_status = 'verified',
      catalog_eligible = p_status = 'verified' and coalesce((p_features->>'catalog')::boolean, false),
      match_eligible = p_status = 'verified' and coalesce((p_features->>'matching')::boolean, false),
      alerts_eligible = p_status = 'verified' and coalesce((p_features->>'alerts')::boolean, false),
      seo_eligible = p_status = 'verified' and coalesce((p_features->>'seo')::boolean, false),
      policy_overrides = case when p_status = 'verified' then coalesce(p_features, '{}'::jsonb) else '{}'::jsonb end
    from locked l where o.id = l.id
    returning o.id, l.verification_status as previous_status
  ), audited as (
    insert into public.opportunity_review_events
      (opportunity_id, previous_status, new_status, criteria, note, actor)
    select id, previous_status, p_status, jsonb_build_array('batch_review'),
      nullif(left(trim(coalesce(p_note, '')), 1000), ''), left(coalesce(nullif(p_actor, ''), 'admin_batch'), 120)
    from changed returning 1
  )
  select count(*) into v_processed from audited;

  if v_processed <> v_requested then raise exception 'stale_batch'; end if;
  return jsonb_build_object('ok', true, 'processed', v_processed, 'reviewed_at', v_now);
end;
$$;

create or replace function public.admin_update_opportunity_atomic(
  p_id text,
  p_changes jsonb,
  p_expected_updated_at timestamptz default null,
  p_actor text default 'admin'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current public.opportunities%rowtype;
  v_material boolean;
begin
  select * into v_current from public.opportunities where id = p_id for update;
  if not found then raise exception 'opportunity_not_found'; end if;
  if p_expected_updated_at is not null and v_current.updated_at is distinct from p_expected_updated_at then
    raise exception 'stale_opportunity';
  end if;
  if p_changes ? 'title' and nullif(trim(p_changes->>'title'), '') is null then
    raise exception 'title_required';
  end if;

  v_material :=
    (p_changes ? 'title' and (p_changes->>'title') is distinct from v_current.title)
    or (p_changes ? 'organization' and nullif(p_changes->>'organization', '') is distinct from v_current.organization)
    or (p_changes ? 'location' and nullif(p_changes->>'location', '') is distinct from v_current.location)
    or (p_changes ? 'country_code' and nullif(upper(p_changes->>'country_code'), '') is distinct from v_current.country_code)
    or (p_changes ? 'opportunity_kind' and nullif(p_changes->>'opportunity_kind', '') is distinct from v_current.opportunity_kind)
    or (p_changes ? 'opportunity_type' and nullif(p_changes->>'opportunity_type', '') is distinct from v_current.opportunity_type)
    or (p_changes ? 'description' and (p_changes->>'description') is distinct from v_current.description)
    or (p_changes ? 'application_url' and (p_changes->>'application_url') is distinct from v_current.application_url)
    or (p_changes ? 'source_authority' and (p_changes->>'source_authority') is distinct from v_current.source_authority)
    or (p_changes ? 'original_source_url' and nullif(p_changes->>'original_source_url', '') is distinct from v_current.original_source_url)
    or (p_changes ? 'original_source_verified' and (p_changes->>'original_source_verified')::boolean is distinct from v_current.original_source_verified);

  update public.opportunities set
    title = case when p_changes ? 'title' then trim(p_changes->>'title') else title end,
    organization = case when p_changes ? 'organization' then nullif(trim(p_changes->>'organization'), '') else organization end,
    location = case when p_changes ? 'location' then nullif(trim(p_changes->>'location'), '') else location end,
    country_code = case when p_changes ? 'country_code' then nullif(upper(trim(p_changes->>'country_code')), '') else country_code end,
    department = case when p_changes ? 'department' then nullif(trim(p_changes->>'department'), '') else department end,
    city = case when p_changes ? 'city' then nullif(trim(p_changes->>'city'), '') else city end,
    type = case when p_changes ? 'type' then nullif(trim(p_changes->>'type'), '') else type end,
    opportunity_kind = case when p_changes ? 'opportunity_kind' then nullif(trim(p_changes->>'opportunity_kind'), '') else opportunity_kind end,
    opportunity_type = case when p_changes ? 'opportunity_type' then nullif(trim(p_changes->>'opportunity_type'), '') else opportunity_type end,
    rubro = case when p_changes ? 'rubro' then nullif(trim(p_changes->>'rubro'), '') else rubro end,
    description = case when p_changes ? 'description' then p_changes->>'description' else description end,
    application_url = case when p_changes ? 'application_url' then trim(p_changes->>'application_url') else application_url end,
    source_authority = case when p_changes ? 'source_authority' then p_changes->>'source_authority' else source_authority end,
    original_source_url = case when p_changes ? 'original_source_url' then nullif(trim(p_changes->>'original_source_url'), '') else original_source_url end,
    original_source_verified = case when p_changes ? 'original_source_verified' then (p_changes->>'original_source_verified')::boolean else original_source_verified end,
    verification_status = case when v_material then 'in_review' else verification_status end,
    verification_note = case when v_material then 'Contenido modificado; requiere una nueva verificacion.' else verification_note end,
    is_active = case when v_material then false else is_active end,
    catalog_eligible = case when v_material then false else catalog_eligible end,
    match_eligible = case when v_material then false else match_eligible end,
    alerts_eligible = case when v_material then false else alerts_eligible end,
    seo_eligible = case when v_material then false else seo_eligible end,
    policy_overrides = case when v_material then '{}'::jsonb else policy_overrides end,
    factory_status = case when v_material then 'pending' else factory_status end
  where id = p_id;

  if v_material then
    insert into public.opportunity_review_events
      (opportunity_id, previous_status, new_status, criteria, note, actor)
    values
      (p_id, v_current.verification_status, 'in_review', jsonb_build_array('content_changed'),
       'Edicion administrativa invalido la verificacion anterior.', left(coalesce(nullif(p_actor, ''), 'admin'), 120));
  end if;
  return jsonb_build_object('ok', true, 'review_invalidated', v_material);
end;
$$;

create or replace function public.admin_update_source_policy_atomic(
  p_source text,
  p_changes jsonb,
  p_expected_updated_at timestamptz default null,
  p_actor text default 'admin'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current public.opportunity_sources%rowtype;
  v_after public.opportunity_sources%rowtype;
  v_impacted integer := 0;
begin
  select * into v_current from public.opportunity_sources where source = p_source for update;
  if not found then raise exception 'source_not_found'; end if;
  if p_expected_updated_at is not null and v_current.updated_at is distinct from p_expected_updated_at then
    raise exception 'stale_source_policy';
  end if;
  if p_changes ? 'source_tier' and p_changes->>'source_tier' not in ('SS', 'S', 'A', 'B') then
    raise exception 'invalid_source_tier';
  end if;

  update public.opportunity_sources set
    display_name = case when p_changes ? 'display_name' then left(trim(p_changes->>'display_name'), 240) else display_name end,
    source_tier = case when p_changes ? 'source_tier' then p_changes->>'source_tier' else source_tier end,
    trust_level = case when p_changes ? 'trust_level' then p_changes->>'trust_level' else trust_level end,
    auto_verify = case when p_changes ? 'auto_verify' then (p_changes->>'auto_verify')::boolean else auto_verify end,
    is_enabled = case when p_changes ? 'is_enabled' then (p_changes->>'is_enabled')::boolean else is_enabled end,
    catalog_enabled = case when p_changes ? 'catalog_enabled' then (p_changes->>'catalog_enabled')::boolean else catalog_enabled end,
    matching_enabled = case when p_changes ? 'matching_enabled' then (p_changes->>'matching_enabled')::boolean else matching_enabled end,
    alerts_enabled = case when p_changes ? 'alerts_enabled' then (p_changes->>'alerts_enabled')::boolean else alerts_enabled end,
    seo_enabled = case when p_changes ? 'seo_enabled' then (p_changes->>'seo_enabled')::boolean else seo_enabled end,
    allowed_country_codes = case when p_changes ? 'allowed_country_codes' then array(select upper(value) from jsonb_array_elements_text(p_changes->'allowed_country_codes')) else allowed_country_codes end,
    allowed_opportunity_types = case when p_changes ? 'allowed_opportunity_types' then array(select value from jsonb_array_elements_text(p_changes->'allowed_opportunity_types')) else allowed_opportunity_types end,
    max_items_per_day = case when p_changes ? 'max_items_per_day' then greatest(1, least(5000, (p_changes->>'max_items_per_day')::integer)) else max_items_per_day end,
    retention_days = case when p_changes ? 'retention_days' then greatest(1, least(365, (p_changes->>'retention_days')::integer)) else retention_days end,
    verification_criteria = case when p_changes ? 'verification_criteria' then p_changes->'verification_criteria' else verification_criteria end,
    notes = case when p_changes ? 'notes' then nullif(left(trim(p_changes->>'notes'), 2000), '') else notes end,
    updated_at = clock_timestamp(),
    updated_by = left(coalesce(nullif(p_actor, ''), 'admin'), 120)
  where source = p_source
  returning * into v_after;

  if p_changes ? 'catalog_enabled' or p_changes ? 'matching_enabled'
    or p_changes ? 'alerts_enabled' or p_changes ? 'seo_enabled' then
    update public.opportunities set
      catalog_eligible = case when p_changes ? 'catalog_enabled' then (p_changes->>'catalog_enabled')::boolean else catalog_eligible end,
      match_eligible = case when p_changes ? 'matching_enabled' then (p_changes->>'matching_enabled')::boolean else match_eligible end,
      alerts_eligible = case when p_changes ? 'alerts_enabled' then (p_changes->>'alerts_enabled')::boolean else alerts_eligible end,
      seo_eligible = case when p_changes ? 'seo_enabled' then (p_changes->>'seo_enabled')::boolean else seo_eligible end
    where source = p_source and verification_status = 'verified' and is_active and deleted_at is null;
    get diagnostics v_impacted = row_count;
  end if;

  insert into public.admin_policy_events(entity_type, entity_key, before_state, after_state, impacted_rows, actor)
  values ('source', p_source, to_jsonb(v_current), to_jsonb(v_after), v_impacted, left(coalesce(nullif(p_actor, ''), 'admin'), 120));

  return jsonb_build_object('ok', true, 'impacted_rows', v_impacted, 'updated_at', v_after.updated_at);
end;
$$;

create or replace function public.opportunity_factory_commit_atomic(
  p_id text,
  p_expected_updated_at timestamptz,
  p_content_fingerprint text,
  p_semantic_fingerprint text,
  p_pipeline_version text,
  p_rules_version text,
  p_status text,
  p_stamps jsonb,
  p_evidence jsonb,
  p_embedding jsonb default null,
  p_embedding_model text default null,
  p_embedding_status text default 'pending',
  p_checked_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current public.opportunities%rowtype;
begin
  if p_status not in ('ready', 'review', 'blocked', 'failed') then
    raise exception 'invalid_factory_status';
  end if;
  if p_embedding_status not in ('missing', 'pending', 'ready', 'failed', 'not_applicable') then
    raise exception 'invalid_embedding_status';
  end if;

  select * into v_current from public.opportunities where id = p_id for update;
  if not found then raise exception 'opportunity_not_found'; end if;
  if v_current.updated_at is distinct from p_expected_updated_at then
    raise sqlstate 'PT409' using message = 'stale_factory_candidate';
  end if;
  if v_current.verification_status not in ('pending', 'in_review', 'verified')
    or v_current.deleted_at is not null or v_current.archived_at is not null then
    raise sqlstate 'PT409' using message = 'factory_candidate_no_longer_eligible';
  end if;

  insert into public.opportunity_factory_snapshots (
    opportunity_id, content_fingerprint, semantic_fingerprint, pipeline_version,
    rules_version, status, stamps, evidence, embedding_model, embedding_status,
    source_updated_at, checked_at, updated_at
  ) values (
    p_id, p_content_fingerprint, p_semantic_fingerprint, p_pipeline_version,
    p_rules_version, p_status, coalesce(p_stamps, '{}'::jsonb),
    coalesce(p_evidence, '{}'::jsonb), p_embedding_model, p_embedding_status,
    p_expected_updated_at, p_checked_at, now()
  )
  on conflict (opportunity_id) do update set
    content_fingerprint = excluded.content_fingerprint,
    semantic_fingerprint = excluded.semantic_fingerprint,
    pipeline_version = excluded.pipeline_version,
    rules_version = excluded.rules_version,
    status = excluded.status,
    stamps = excluded.stamps,
    evidence = excluded.evidence,
    embedding_model = excluded.embedding_model,
    embedding_status = excluded.embedding_status,
    source_updated_at = excluded.source_updated_at,
    checked_at = excluded.checked_at,
    updated_at = now();

  update public.opportunities set
    content_fingerprint = p_content_fingerprint,
    semantic_fingerprint = p_semantic_fingerprint,
    factory_status = p_status,
    embedding = case when p_embedding is not null then
      (jsonb_populate_record(null::public.opportunities, jsonb_build_object('embedding', p_embedding))).embedding
      else embedding end,
    embedding_model = case when p_embedding is not null then p_embedding_model else embedding_model end,
    embedding_updated_at = case when p_embedding is not null then p_checked_at else embedding_updated_at end
  where id = p_id;

  return jsonb_build_object('ok', true, 'factory_status', p_status);
end;
$$;

create or replace function public.admin_update_scraper_control_atomic(
  p_scraper_id text,
  p_changes jsonb,
  p_expected_updated_at timestamptz default null,
  p_actor text default 'admin'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current public.scraper_controls%rowtype;
  v_after public.scraper_controls%rowtype;
begin
  select * into v_current from public.scraper_controls where scraper_id = p_scraper_id for update;
  if not found then raise exception 'scraper_control_not_found'; end if;
  if p_expected_updated_at is not null and v_current.updated_at is distinct from p_expected_updated_at then
    raise exception 'stale_scraper_control';
  end if;

  update public.scraper_controls set
    collection_enabled = case when p_changes ? 'collection_enabled' then (p_changes->>'collection_enabled')::boolean else collection_enabled end,
    max_items_per_run = case when p_changes ? 'max_items_per_run' then greatest(1, least(5000, (p_changes->>'max_items_per_run')::integer)) else max_items_per_run end,
    max_runtime_seconds = case when p_changes ? 'max_runtime_seconds' then greatest(30, least(3600, (p_changes->>'max_runtime_seconds')::integer)) else max_runtime_seconds end,
    consecutive_failures_before_pause = case when p_changes ? 'consecutive_failures_before_pause' then greatest(1, least(20, (p_changes->>'consecutive_failures_before_pause')::integer)) else consecutive_failures_before_pause end,
    auto_pause_on_failure = case when p_changes ? 'auto_pause_on_failure' then (p_changes->>'auto_pause_on_failure')::boolean else auto_pause_on_failure end,
    require_review = case when p_changes ? 'require_review' then (p_changes->>'require_review')::boolean else require_review end,
    allowed_country_codes = case when p_changes ? 'allowed_country_codes' then array(select upper(value) from jsonb_array_elements_text(p_changes->'allowed_country_codes')) else allowed_country_codes end,
    notes = case when p_changes ? 'notes' then nullif(left(trim(p_changes->>'notes'), 2000), '') else notes end,
    paused_reason = case when p_changes ? 'paused_reason' then nullif(left(trim(p_changes->>'paused_reason'), 1000), '') else paused_reason end,
    updated_at = clock_timestamp(),
    updated_by = left(coalesce(nullif(p_actor, ''), 'admin'), 120)
  where scraper_id = p_scraper_id
  returning * into v_after;

  insert into public.admin_policy_events(entity_type, entity_key, before_state, after_state, impacted_rows, actor)
  values ('scraper', p_scraper_id, to_jsonb(v_current), to_jsonb(v_after), 0, left(coalesce(nullif(p_actor, ''), 'admin'), 120));
  return jsonb_build_object('ok', true, 'updated_at', v_after.updated_at);
end;
$$;

create or replace function public.admin_review_recruiter_atomic(
  p_id uuid,
  p_status text,
  p_verification_data jsonb default null,
  p_note text default null,
  p_expected_updated_at timestamptz default null,
  p_actor text default 'admin'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current public.recruiter_tokens%rowtype;
  v_verified boolean;
begin
  if p_status not in ('verified', 'rejected', 'in_review', 'pending') then
    raise exception 'invalid_recruiter_status';
  end if;
  select * into v_current from public.recruiter_tokens where id = p_id for update;
  if not found then raise exception 'recruiter_not_found'; end if;
  if p_expected_updated_at is not null and v_current.updated_at is distinct from p_expected_updated_at then
    raise exception 'stale_recruiter';
  end if;
  v_verified := p_status = 'verified';

  update public.recruiter_tokens set
    verification_status = p_status,
    verification_data = case when p_verification_data is not null then p_verification_data else verification_data end,
    verified_at = case when v_verified then now() else null end,
    verified_by = case when v_verified then left(coalesce(nullif(p_actor, ''), 'admin'), 120) else null end,
    is_active = v_verified,
    updated_at = clock_timestamp()
  where id = p_id;

  insert into public.recruiter_review_events(recruiter_token_id, previous_status, new_status, note, actor)
  values (p_id::text, v_current.verification_status, p_status,
    nullif(left(trim(coalesce(p_note, '')), 1000), ''), left(coalesce(nullif(p_actor, ''), 'admin'), 120));
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.admin_review_opportunity_atomic(text,text,text[],text,integer,jsonb,boolean,timestamptz,text) from public, anon, authenticated;
grant execute on function public.admin_review_opportunity_atomic(text,text,text[],text,integer,jsonb,boolean,timestamptz,text) to service_role;
revoke all on function public.admin_batch_review_opportunities_atomic(text[],text,text,jsonb,jsonb,text) from public, anon, authenticated;
grant execute on function public.admin_batch_review_opportunities_atomic(text[],text,text,jsonb,jsonb,text) to service_role;
revoke all on function public.admin_update_opportunity_atomic(text,jsonb,timestamptz,text) from public, anon, authenticated;
grant execute on function public.admin_update_opportunity_atomic(text,jsonb,timestamptz,text) to service_role;
revoke all on function public.admin_update_source_policy_atomic(text,jsonb,timestamptz,text) from public, anon, authenticated;
grant execute on function public.admin_update_source_policy_atomic(text,jsonb,timestamptz,text) to service_role;
revoke all on function public.opportunity_factory_commit_atomic(text,timestamptz,text,text,text,text,text,jsonb,jsonb,jsonb,text,text,timestamptz) from public, anon, authenticated;
grant execute on function public.opportunity_factory_commit_atomic(text,timestamptz,text,text,text,text,text,jsonb,jsonb,jsonb,text,text,timestamptz) to service_role;
revoke all on function public.admin_update_scraper_control_atomic(text,jsonb,timestamptz,text) from public, anon, authenticated;
grant execute on function public.admin_update_scraper_control_atomic(text,jsonb,timestamptz,text) to service_role;
revoke all on function public.admin_review_recruiter_atomic(uuid,text,jsonb,text,timestamptz,text) from public, anon, authenticated;
grant execute on function public.admin_review_recruiter_atomic(uuid,text,jsonb,text,timestamptz,text) to service_role;

comment on table public.opportunity_factory_snapshots is
  'Private, additive evidence produced by the incremental opportunity factory; never a public distribution authority.';

-- Repair two pre-existing function bodies whose declared column types changed.
-- This is CREATE OR REPLACE only: signatures, ownership and grants are preserved.
do $type_safety$
declare
  v_definition text;
begin
  select pg_get_functiondef('public.accept_application_workspace(uuid,uuid,boolean)'::regprocedure)
    into v_definition;
  v_definition := replace(
    v_definition,
    $needle$OR opportunity.deadline = ''$needle$,
    ''
  );
  execute v_definition;

  select pg_get_functiondef('public.claim_vacancy_review_batch(text,uuid,text)'::regprocedure)
    into v_definition;
  v_definition := replace(
    v_definition,
    $needle$recruiter_token_id = token_record.id::text$needle$,
    $replacement$recruiter_token_id::text = token_record.id::text$replacement$
  );
  execute v_definition;
end;
$type_safety$;
