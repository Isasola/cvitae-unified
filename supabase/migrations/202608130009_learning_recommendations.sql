-- Private, persistent learning plans derived from corroborated opportunity gaps.

create table if not exists public.learning_recommendations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  profile_signature text not null,
  skill text not null,
  normalized_skill text not null,
  priority integer not null,
  status text not null default 'suggested',
  title text not null,
  provider_key text not null,
  provider_label text not null,
  resource_url text not null,
  learning_focus text not null,
  why text not null,
  level text not null,
  language text not null default 'Español preferido',
  source_snapshot jsonb not null default '[]'::jsonb,
  analysis_model text not null,
  fallback boolean not null default false,
  started_at timestamptz,
  completed_at timestamptz,
  dismissed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, profile_signature, normalized_skill),
  check (profile_signature ~ '^[a-f0-9]{64}$'),
  check (char_length(skill) between 1 and 100),
  check (char_length(normalized_skill) between 1 and 100),
  check (priority between 1 and 6),
  check (status in ('suggested', 'in_progress', 'completed', 'dismissed', 'stale')),
  check (provider_key in ('google_skills', 'microsoft_learn', 'aws_skill_builder', 'coursera', 'edx', 'youtube')),
  check (resource_url ~ '^https://'),
  check (level in ('Inicial', 'Intermedio', 'Avanzado')),
  check (jsonb_typeof(source_snapshot) = 'array')
);

create index if not exists learning_recommendations_user_status_idx
  on public.learning_recommendations (user_id, status, priority, created_at desc);

alter table public.learning_recommendations enable row level security;
revoke all on table public.learning_recommendations from anon, authenticated;
grant all on table public.learning_recommendations to service_role;

create or replace function public.protect_learning_recommendation_content()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.user_id is distinct from old.user_id
     or new.profile_signature is distinct from old.profile_signature
     or new.skill is distinct from old.skill
     or new.normalized_skill is distinct from old.normalized_skill
     or new.priority is distinct from old.priority
     or new.title is distinct from old.title
     or new.provider_key is distinct from old.provider_key
     or new.provider_label is distinct from old.provider_label
     or new.resource_url is distinct from old.resource_url
     or new.learning_focus is distinct from old.learning_focus
     or new.why is distinct from old.why
     or new.level is distinct from old.level
     or new.language is distinct from old.language
     or new.source_snapshot is distinct from old.source_snapshot
     or new.analysis_model is distinct from old.analysis_model
     or new.fallback is distinct from old.fallback
     or new.created_at is distinct from old.created_at then
    raise exception 'learning recommendation content is immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists learning_recommendation_content_immutable on public.learning_recommendations;
create trigger learning_recommendation_content_immutable
  before update on public.learning_recommendations
  for each row execute function public.protect_learning_recommendation_content();

create or replace function public.update_learning_recommendation_status(
  p_user_id uuid,
  p_recommendation_id uuid,
  p_status text
) returns setof public.learning_recommendations
language plpgsql
security definer
set search_path = public
as $$
declare
  recommendation public.learning_recommendations%rowtype;
begin
  if p_status not in ('suggested', 'in_progress', 'completed', 'dismissed') then
    raise exception 'invalid learning status';
  end if;

  select learning.* into recommendation
  from public.learning_recommendations as learning
  where learning.id = p_recommendation_id and learning.user_id = p_user_id
  for update;
  if not found then raise exception 'learning recommendation not found'; end if;
  if recommendation.status = 'stale' then raise exception 'stale learning recommendation cannot be changed'; end if;

  update public.learning_recommendations as learning
  set status = p_status,
      started_at = case when p_status = 'in_progress' then coalesce(learning.started_at, now()) else learning.started_at end,
      completed_at = case when p_status = 'completed' then coalesce(learning.completed_at, now()) when learning.status = 'completed' and p_status <> 'completed' then null else learning.completed_at end,
      dismissed_at = case when p_status = 'dismissed' then coalesce(learning.dismissed_at, now()) when learning.status = 'dismissed' and p_status <> 'dismissed' then null else learning.dismissed_at end,
      updated_at = now()
  where learning.id = recommendation.id
  returning * into recommendation;

  return next recommendation;
end;
$$;

revoke all on function public.update_learning_recommendation_status(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.update_learning_recommendation_status(uuid, uuid, text) to service_role;

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
  deleted_learning_recommendations integer := 0;
  normalized_email text := lower(trim(coalesce(p_email, '')));
begin
  if p_user_id is null then raise exception 'user id is required'; end if;

  delete from public.learning_recommendations where user_id = p_user_id;
  get diagnostics deleted_learning_recommendations = row_count;
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
    'deleted_application_workspaces', deleted_application_workspaces,
    'deleted_learning_recommendations', deleted_learning_recommendations
  );
end;
$$;

revoke all on function public.delete_b2c_user_data(uuid, text) from public, anon, authenticated;
grant execute on function public.delete_b2c_user_data(uuid, text) to service_role;

comment on table public.learning_recommendations is
  'Private learning plan. Every recommendation is tied to active verified opportunities and a server-built trusted provider URL.';
