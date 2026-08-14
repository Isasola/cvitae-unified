-- Private, operational feedback inbox for B2C, B2B and public access failures.

create table if not exists public.product_feedback (
  id uuid primary key default gen_random_uuid(),
  reference_code text not null unique,
  audience text not null,
  category text not null,
  severity text not null,
  status text not null default 'new',
  feature text not null,
  message text not null,
  expected_result text,
  page_path text not null,
  user_id uuid,
  recruiter_token_id uuid references public.recruiter_tokens(id) on delete set null,
  contact_email text,
  context jsonb not null default '{}'::jsonb,
  admin_note text,
  assigned_to text,
  triaged_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  retention_until timestamptz not null default (now() + interval '365 days'),
  check (reference_code ~ '^CV-[0-9]{8}-[A-F0-9]{8}$'),
  check (audience in ('b2c', 'b2b', 'public')),
  check (category in ('bug', 'data', 'usability', 'suggestion')),
  check (severity in ('blocking', 'major', 'minor', 'suggestion')),
  check (status in ('new', 'triaged', 'in_progress', 'resolved', 'closed')),
  check (char_length(feature) between 1 and 80),
  check (char_length(message) between 20 and 3000),
  check (expected_result is null or char_length(expected_result) <= 1500),
  check (page_path ~ '^/' and char_length(page_path) <= 500),
  check (contact_email is null or char_length(contact_email) <= 320),
  check (jsonb_typeof(context) = 'object')
);

create index if not exists product_feedback_status_created_idx
  on public.product_feedback (status, created_at desc);
create index if not exists product_feedback_audience_created_idx
  on public.product_feedback (audience, created_at desc);
create index if not exists product_feedback_user_idx
  on public.product_feedback (user_id, created_at desc) where user_id is not null;

create table if not exists public.product_feedback_events (
  id bigint generated always as identity primary key,
  feedback_id uuid not null references public.product_feedback(id) on delete cascade,
  previous_status text,
  new_status text not null,
  note text,
  actor text not null,
  created_at timestamptz not null default now(),
  check (new_status in ('new', 'triaged', 'in_progress', 'resolved', 'closed'))
);

alter table public.product_feedback enable row level security;
alter table public.product_feedback_events enable row level security;
revoke all on table public.product_feedback from anon, authenticated;
revoke all on table public.product_feedback_events from anon, authenticated;
grant all on table public.product_feedback to service_role;
grant all on table public.product_feedback_events to service_role;

create or replace function public.update_product_feedback(
  p_feedback_id uuid,
  p_status text,
  p_note text default null,
  p_assigned_to text default null,
  p_actor text default 'admin'
) returns setof public.product_feedback
language plpgsql
security definer
set search_path = public
as $$
declare
  report public.product_feedback%rowtype;
  previous_status text;
begin
  if p_status not in ('new', 'triaged', 'in_progress', 'resolved', 'closed') then
    raise exception 'invalid feedback status';
  end if;

  select * into report from public.product_feedback where id = p_feedback_id for update;
  if not found then raise exception 'feedback not found'; end if;
  previous_status := report.status;

  update public.product_feedback
  set status = p_status,
      admin_note = nullif(trim(coalesce(p_note, '')), ''),
      assigned_to = nullif(trim(coalesce(p_assigned_to, '')), ''),
      triaged_at = case when p_status in ('triaged', 'in_progress', 'resolved', 'closed') then coalesce(triaged_at, now()) else null end,
      resolved_at = case when p_status in ('resolved', 'closed') then coalesce(resolved_at, now()) else null end,
      updated_at = now()
  where id = p_feedback_id
  returning * into report;

  insert into public.product_feedback_events (feedback_id, previous_status, new_status, note, actor)
  values (p_feedback_id, previous_status, p_status, nullif(trim(coalesce(p_note, '')), ''), left(coalesce(nullif(trim(p_actor), ''), 'admin'), 120));

  return next report;
end;
$$;

revoke all on function public.update_product_feedback(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.update_product_feedback(uuid, text, text, text, text) to service_role;

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
  deleted_product_feedback integer := 0;
  normalized_email text := lower(trim(coalesce(p_email, '')));
begin
  if p_user_id is null then raise exception 'user id is required'; end if;

  delete from public.product_feedback where user_id = p_user_id;
  get diagnostics deleted_product_feedback = row_count;
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
    'deleted_learning_recommendations', deleted_learning_recommendations,
    'deleted_product_feedback', deleted_product_feedback
  );
end;
$$;

revoke all on function public.delete_b2c_user_data(uuid, text) from public, anon, authenticated;
grant execute on function public.delete_b2c_user_data(uuid, text) to service_role;

comment on table public.product_feedback is
  'Service-only operational inbox. Context is allowlisted and must never contain CV text, application content or credentials.';
