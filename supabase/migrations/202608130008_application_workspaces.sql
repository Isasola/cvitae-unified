-- Private B2C application workspaces. Preparing an application never submits it
-- and never overwrites a CV. Acceptance creates one immutable adapted version.

create table if not exists public.application_workspaces (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  opportunity_id text not null,
  source_version_id uuid not null references public.generated_cvs(id) on delete cascade,
  source_content_hash text not null,
  evidence_hash text not null,
  opportunity_fingerprint text not null,
  status text not null default 'draft',
  opportunity_snapshot jsonb not null default '{}'::jsonb,
  application_url_snapshot text not null,
  requirement_analysis jsonb not null default '[]'::jsonb,
  fit_summary jsonb not null default '{}'::jsonb,
  tailored_cv_markdown text not null,
  cover_message text not null,
  evidence_snapshot jsonb not null default '[]'::jsonb,
  checklist jsonb not null default '[]'::jsonb,
  checklist_progress jsonb not null default '{}'::jsonb,
  safety_checks jsonb not null default '{}'::jsonb,
  analysis_model text not null,
  prepared_version_id uuid references public.generated_cvs(id) on delete set null,
  accepted_at timestamptz,
  opened_at timestamptz,
  submitted_self_reported_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (
    user_id, opportunity_id, source_version_id, source_content_hash,
    evidence_hash, opportunity_fingerprint
  ),
  check (source_content_hash ~ '^[a-f0-9]{64}$'),
  check (evidence_hash ~ '^[a-f0-9]{64}$'),
  check (opportunity_fingerprint ~ '^[a-f0-9]{64}$'),
  check (status in ('draft', 'ready', 'opened', 'submitted', 'archived')),
  check (char_length(tailored_cv_markdown) between 40 and 100000),
  check (char_length(cover_message) between 20 and 12000),
  check (application_url_snapshot ~ '^https?://'),
  check (jsonb_typeof(requirement_analysis) = 'array'),
  check (jsonb_typeof(fit_summary) = 'object'),
  check (jsonb_typeof(evidence_snapshot) = 'array'),
  check (jsonb_typeof(checklist) = 'array'),
  check (jsonb_typeof(checklist_progress) = 'object'),
  check (jsonb_typeof(safety_checks) = 'object')
);

create index if not exists application_workspaces_user_created_idx
  on public.application_workspaces (user_id, created_at desc);
create index if not exists application_workspaces_user_status_idx
  on public.application_workspaces (user_id, status, updated_at desc);

alter table public.application_workspaces enable row level security;
revoke all on table public.application_workspaces from anon, authenticated;
grant all on table public.application_workspaces to service_role;

create or replace function public.protect_application_workspace_content()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.user_id is distinct from old.user_id
     or new.opportunity_id is distinct from old.opportunity_id
     or new.source_version_id is distinct from old.source_version_id
     or new.source_content_hash is distinct from old.source_content_hash
     or new.evidence_hash is distinct from old.evidence_hash
     or new.opportunity_fingerprint is distinct from old.opportunity_fingerprint
     or new.opportunity_snapshot is distinct from old.opportunity_snapshot
     or new.application_url_snapshot is distinct from old.application_url_snapshot
     or new.requirement_analysis is distinct from old.requirement_analysis
     or new.fit_summary is distinct from old.fit_summary
     or new.tailored_cv_markdown is distinct from old.tailored_cv_markdown
     or new.cover_message is distinct from old.cover_message
     or new.evidence_snapshot is distinct from old.evidence_snapshot
     or new.checklist is distinct from old.checklist
     or new.safety_checks is distinct from old.safety_checks
     or new.analysis_model is distinct from old.analysis_model
     or new.created_at is distinct from old.created_at then
    raise exception 'application workspace content is immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists application_workspace_content_immutable on public.application_workspaces;
create trigger application_workspace_content_immutable
  before update on public.application_workspaces
  for each row execute function public.protect_application_workspace_content();

create or replace function public.accept_application_workspace(
  p_user_id uuid,
  p_workspace_id uuid,
  p_attested boolean
) returns table(workspace_id uuid, prepared_version_id uuid, status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  workspace public.application_workspaces%rowtype;
  source_version public.generated_cvs%rowtype;
  created_version public.generated_cvs%rowtype;
begin
  if p_user_id is null or p_workspace_id is null or p_attested is not true then
    raise exception 'explicit attestation is required';
  end if;

  select application.* into workspace
  from public.application_workspaces as application
  where application.id = p_workspace_id and application.user_id = p_user_id
  for update;
  if not found then raise exception 'application workspace not found'; end if;

  if workspace.prepared_version_id is not null then
    return query select workspace.id, workspace.prepared_version_id, workspace.status;
    return;
  end if;
  if workspace.status <> 'draft' then raise exception 'application workspace is not available'; end if;
  if coalesce((workspace.safety_checks->>'passed')::boolean, false) is not true then
    raise exception 'application workspace did not pass safety checks';
  end if;

  select generated.* into source_version
  from public.generated_cvs as generated
  where generated.id = workspace.source_version_id and generated.user_id = p_user_id;
  if not found or source_version.content_hash <> workspace.source_content_hash then
    raise exception 'source CV changed or is unavailable';
  end if;
  if not exists (
    select 1 from public.opportunities as opportunity
    where opportunity.id = workspace.opportunity_id
      and opportunity.is_active = true
      and opportunity.verification_status = 'verified'
      and opportunity.catalog_eligible = true
      and opportunity.deleted_at is null
      and opportunity.archived_at is null
      and (opportunity.deadline is null or opportunity.deadline >= now())
      and opportunity.application_url = workspace.application_url_snapshot
      and opportunity.title = workspace.opportunity_snapshot->>'title'
      and opportunity.organization is not distinct from nullif(workspace.opportunity_snapshot->>'organization', '')
      and opportunity.updated_at = (workspace.opportunity_snapshot->>'updated_at')::timestamptz
  ) then
    raise exception 'opportunity is no longer available or changed';
  end if;

  select * into created_version
  from public.create_cv_version(
    p_user_id,
    workspace.opportunity_id,
    workspace.tailored_cv_markdown,
    'Postulación · ' || left(coalesce(workspace.opportunity_snapshot->>'title', 'Oportunidad'), 130),
    'adapted',
    workspace.source_version_id,
    workspace.evidence_snapshot,
    workspace.opportunity_snapshot,
    true
  );

  update public.application_workspaces as application
  set status = 'ready', prepared_version_id = created_version.id,
      accepted_at = now(), updated_at = now()
  where application.id = workspace.id;

  return query select workspace.id, created_version.id, 'ready'::text;
end;
$$;

create or replace function public.advance_application_workspace(
  p_user_id uuid,
  p_workspace_id uuid,
  p_action text
) returns table(workspace_id uuid, status text, opened_at timestamptz, submitted_self_reported_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  workspace public.application_workspaces%rowtype;
begin
  select application.* into workspace
  from public.application_workspaces as application
  where application.id = p_workspace_id and application.user_id = p_user_id
  for update;
  if not found then raise exception 'application workspace not found'; end if;

  if p_action = 'opened' then
    if workspace.status not in ('ready', 'opened', 'submitted') then raise exception 'application is not ready'; end if;
    update public.application_workspaces as application
    set status = case when application.status = 'ready' then 'opened' else application.status end,
        opened_at = coalesce(application.opened_at, now()), updated_at = now()
    where application.id = workspace.id;
  elsif p_action = 'submitted' then
    if workspace.status not in ('ready', 'opened', 'submitted') then raise exception 'application is not ready'; end if;
    update public.application_workspaces as application
    set status = 'submitted', opened_at = coalesce(application.opened_at, now()),
        submitted_self_reported_at = coalesce(application.submitted_self_reported_at, now()), updated_at = now()
    where application.id = workspace.id;
  elsif p_action = 'archived' then
    update public.application_workspaces as application
    set status = 'archived', archived_at = coalesce(application.archived_at, now()), updated_at = now()
    where application.id = workspace.id;
  else
    raise exception 'invalid application action';
  end if;

  return query
  select application.id, application.status, application.opened_at, application.submitted_self_reported_at
  from public.application_workspaces as application where application.id = workspace.id;
end;
$$;

create or replace function public.update_application_checklist(
  p_user_id uuid,
  p_workspace_id uuid,
  p_progress jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  workspace public.application_workspaces%rowtype;
  allowed_ids text[];
  supplied_key text;
begin
  if jsonb_typeof(coalesce(p_progress, '{}'::jsonb)) <> 'object'
     or octet_length(coalesce(p_progress, '{}'::jsonb)::text) > 10000 then
    raise exception 'invalid checklist progress';
  end if;
  select application.* into workspace
  from public.application_workspaces as application
  where application.id = p_workspace_id and application.user_id = p_user_id
  for update;
  if not found then raise exception 'application workspace not found'; end if;

  select coalesce(array_agg(item->>'id'), '{}'::text[]) into allowed_ids
  from jsonb_array_elements(workspace.checklist) as item;
  for supplied_key in select jsonb_object_keys(coalesce(p_progress, '{}'::jsonb)) loop
    if not supplied_key = any(allowed_ids)
       or jsonb_typeof(p_progress->supplied_key) <> 'boolean' then
      raise exception 'invalid checklist item';
    end if;
  end loop;

  update public.application_workspaces as application
  set checklist_progress = p_progress, updated_at = now()
  where application.id = workspace.id;
  return p_progress;
end;
$$;

revoke all on function public.accept_application_workspace(uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function public.advance_application_workspace(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.update_application_checklist(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.accept_application_workspace(uuid, uuid, boolean) to service_role;
grant execute on function public.advance_application_workspace(uuid, uuid, text) to service_role;
grant execute on function public.update_application_checklist(uuid, uuid, jsonb) to service_role;

create or replace function public.delete_b2c_user_data(
  p_user_id uuid,
  p_email text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_profiles integer := 0;
  deleted_cvs integer := 0;
  deleted_evidence integer := 0;
  deleted_ats_assessments integer := 0;
  deleted_rewrite_proposals integer := 0;
  deleted_application_workspaces integer := 0;
  normalized_email text := lower(trim(coalesce(p_email, '')));
begin
  if p_user_id is null then raise exception 'user id is required'; end if;

  delete from public.application_workspaces where user_id = p_user_id;
  get diagnostics deleted_application_workspaces = row_count;
  delete from public.cv_rewrite_proposals where user_id = p_user_id;
  get diagnostics deleted_rewrite_proposals = row_count;
  delete from public.cv_ats_assessments where user_id = p_user_id;
  get diagnostics deleted_ats_assessments = row_count;
  delete from public.generated_cvs where user_id = p_user_id;
  get diagnostics deleted_cvs = row_count;
  delete from public.cv_evidence_items where user_id = p_user_id;
  get diagnostics deleted_evidence = row_count;
  delete from public.user_master_profiles where user_id = p_user_id;
  get diagnostics deleted_profiles = row_count;

  if normalized_email <> '' then
    delete from public.beta_waitlist where lower(email) = normalized_email;
    delete from public.newsletter_subscribers where lower(email) = normalized_email;
  end if;

  return jsonb_build_object(
    'deleted_profiles', deleted_profiles,
    'deleted_generated_cvs', deleted_cvs,
    'deleted_evidence', deleted_evidence,
    'deleted_ats_assessments', deleted_ats_assessments,
    'deleted_rewrite_proposals', deleted_rewrite_proposals,
    'deleted_application_workspaces', deleted_application_workspaces
  );
end;
$$;

revoke all on function public.delete_b2c_user_data(uuid, text) from public, anon, authenticated;
grant execute on function public.delete_b2c_user_data(uuid, text) to service_role;

comment on table public.application_workspaces is
  'Private B2C preparation records. Opened/submitted states are user actions; CVitae does not claim external delivery.';
