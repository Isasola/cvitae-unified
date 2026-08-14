-- Traceable CV rewrite proposals. A proposal never changes the active CV until
-- the user explicitly accepts it and a new immutable version is created.

alter table public.generated_cvs
  drop constraint if exists generated_cvs_generation_kind_check;
alter table public.generated_cvs
  add constraint generated_cvs_generation_kind_check
  check (generation_kind in ('legacy', 'base', 'adapted', 'manual', 'restored', 'rewritten'));

create or replace function public.create_cv_version(
  p_user_id uuid,
  p_vacancy_id text,
  p_cv_markdown text,
  p_label text,
  p_generation_kind text,
  p_parent_version_id uuid default null,
  p_evidence_snapshot jsonb default '[]'::jsonb,
  p_vacancy_snapshot jsonb default '{}'::jsonb,
  p_user_attested boolean default false
) returns setof public.generated_cvs
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  next_version integer;
  created public.generated_cvs%rowtype;
  normalized_vacancy text := left(coalesce(nullif(trim(p_vacancy_id), ''), 'base_cv'), 200);
begin
  if p_user_id is null then raise exception 'user id is required'; end if;
  if p_cv_markdown is null or char_length(trim(p_cv_markdown)) < 40 or char_length(p_cv_markdown) > 100000 then
    raise exception 'invalid cv content';
  end if;
  if p_generation_kind not in ('base', 'adapted', 'manual', 'restored', 'rewritten') then
    raise exception 'invalid generation kind';
  end if;
  if jsonb_typeof(coalesce(p_evidence_snapshot, '[]'::jsonb)) <> 'array' then
    raise exception 'evidence snapshot must be an array';
  end if;
  if p_parent_version_id is not null and not exists (
    select 1 from public.generated_cvs
    where id = p_parent_version_id and user_id = p_user_id
  ) then
    raise exception 'invalid parent version';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || normalized_vacancy, 0));
  select coalesce(max(version_number), 0) + 1 into next_version
  from public.generated_cvs
  where user_id = p_user_id and vacancy_id = normalized_vacancy;

  insert into public.generated_cvs (
    user_id, vacancy_id, version_number, parent_version_id, cv_markdown,
    label, generation_kind, evidence_snapshot, vacancy_snapshot,
    content_hash, user_attested, created_at, updated_at
  ) values (
    p_user_id, normalized_vacancy, next_version, p_parent_version_id, p_cv_markdown,
    left(coalesce(nullif(trim(p_label), ''), 'Versión del CV'), 160), p_generation_kind,
    coalesce(p_evidence_snapshot, '[]'::jsonb), coalesce(p_vacancy_snapshot, '{}'::jsonb),
    encode(digest(p_cv_markdown, 'sha256'), 'hex'), p_user_attested, now(), now()
  ) returning * into created;

  return next created;
end;
$$;

revoke all on function public.create_cv_version(uuid, text, text, text, text, uuid, jsonb, jsonb, boolean)
  from public, anon, authenticated;
grant execute on function public.create_cv_version(uuid, text, text, text, text, uuid, jsonb, jsonb, boolean)
  to service_role;

create table if not exists public.cv_rewrite_proposals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  source_version_id uuid not null references public.generated_cvs(id) on delete cascade,
  source_content_hash text not null,
  evidence_hash text not null,
  objective text not null,
  status text not null default 'draft',
  proposal_markdown text not null,
  changes jsonb not null default '[]'::jsonb,
  evidence_snapshot jsonb not null default '[]'::jsonb,
  diagnostic_snapshot jsonb not null default '{}'::jsonb,
  safety_checks jsonb not null default '{}'::jsonb,
  analysis_model text not null,
  accepted_version_id uuid references public.generated_cvs(id) on delete set null,
  accepted_at timestamptz,
  discarded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (source_content_hash ~ '^[a-f0-9]{64}$'),
  check (evidence_hash ~ '^[a-f0-9]{64}$'),
  check (objective in ('ats_clarity', 'concise', 'impact_clarity')),
  check (status in ('draft', 'accepted', 'discarded')),
  check (char_length(proposal_markdown) between 40 and 100000),
  check (jsonb_typeof(changes) = 'array'),
  check (jsonb_typeof(evidence_snapshot) = 'array'),
  check (jsonb_typeof(diagnostic_snapshot) = 'object'),
  check (jsonb_typeof(safety_checks) = 'object'),
  unique (user_id, source_version_id, source_content_hash, evidence_hash, objective)
);

create index if not exists cv_rewrite_proposals_user_created_idx
  on public.cv_rewrite_proposals (user_id, created_at desc);
create index if not exists cv_rewrite_proposals_user_status_idx
  on public.cv_rewrite_proposals (user_id, status, updated_at desc);

alter table public.cv_rewrite_proposals enable row level security;
revoke all on table public.cv_rewrite_proposals from anon, authenticated;
grant all on table public.cv_rewrite_proposals to service_role;

create or replace function public.protect_cv_rewrite_proposal_content()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.user_id <> old.user_id
     or new.source_version_id <> old.source_version_id
     or new.source_content_hash <> old.source_content_hash
     or new.evidence_hash <> old.evidence_hash
     or new.objective <> old.objective
     or new.proposal_markdown <> old.proposal_markdown
     or new.changes <> old.changes
     or new.evidence_snapshot <> old.evidence_snapshot
     or new.diagnostic_snapshot <> old.diagnostic_snapshot
     or new.safety_checks <> old.safety_checks
     or new.analysis_model <> old.analysis_model
     or new.created_at <> old.created_at then
    raise exception 'rewrite proposal content is immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists cv_rewrite_proposal_content_immutable on public.cv_rewrite_proposals;
create trigger cv_rewrite_proposal_content_immutable
  before update on public.cv_rewrite_proposals
  for each row execute function public.protect_cv_rewrite_proposal_content();

create or replace function public.accept_cv_rewrite_proposal(
  p_user_id uuid,
  p_proposal_id uuid,
  p_attested boolean
) returns table(proposal_id uuid, version_id uuid, version_number integer, status text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  proposal public.cv_rewrite_proposals%rowtype;
  source_version public.generated_cvs%rowtype;
  created_version public.generated_cvs%rowtype;
begin
  if p_user_id is null then raise exception 'user id is required'; end if;
  if p_attested is not true then raise exception 'user attestation is required'; end if;

  select * into proposal
  from public.cv_rewrite_proposals
  where id = p_proposal_id and user_id = p_user_id
  for update;
  if not found then raise exception 'rewrite proposal not found'; end if;

  if proposal.status = 'accepted' then
    select * into created_version from public.generated_cvs where id = proposal.accepted_version_id;
    return query select proposal.id, created_version.id, created_version.version_number, proposal.status;
    return;
  end if;
  if proposal.status <> 'draft' then raise exception 'rewrite proposal is not available'; end if;

  select * into source_version
  from public.generated_cvs
  where id = proposal.source_version_id and user_id = p_user_id;
  if not found then raise exception 'source version not found'; end if;
  if source_version.content_hash <> proposal.source_content_hash then
    raise exception 'source version content changed';
  end if;
  if coalesce((proposal.safety_checks->>'passed')::boolean, false) is not true then
    raise exception 'rewrite proposal did not pass safety checks';
  end if;

  select * into created_version
  from public.create_cv_version(
    p_user_id,
    source_version.vacancy_id,
    proposal.proposal_markdown,
    left('Reescritura confirmada · ' || source_version.label, 160),
    'rewritten',
    source_version.id,
    proposal.evidence_snapshot,
    source_version.vacancy_snapshot,
    true
  );

  update public.cv_rewrite_proposals
  set status = 'accepted', accepted_version_id = created_version.id,
      accepted_at = now(), updated_at = now()
  where id = proposal.id;

  return query select proposal.id, created_version.id, created_version.version_number, 'accepted'::text;
end;
$$;

create or replace function public.discard_cv_rewrite_proposal(
  p_user_id uuid,
  p_proposal_id uuid
) returns table(proposal_id uuid, status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  discarded public.cv_rewrite_proposals%rowtype;
begin
  update public.cv_rewrite_proposals as rewrite
  set status = 'discarded', discarded_at = now(), updated_at = now()
  where rewrite.id = p_proposal_id and rewrite.user_id = p_user_id and rewrite.status = 'draft'
  returning rewrite.* into discarded;
  if not found then raise exception 'rewrite proposal not available'; end if;
  return query select discarded.id, discarded.status;
end;
$$;

revoke all on function public.accept_cv_rewrite_proposal(uuid, uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.accept_cv_rewrite_proposal(uuid, uuid, boolean)
  to service_role;
revoke all on function public.discard_cv_rewrite_proposal(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.discard_cv_rewrite_proposal(uuid, uuid)
  to service_role;

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
  normalized_email text := lower(trim(coalesce(p_email, '')));
begin
  if p_user_id is null then raise exception 'user id is required'; end if;

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
    'deleted_rewrite_proposals', deleted_rewrite_proposals
  );
end;
$$;

revoke all on function public.delete_b2c_user_data(uuid, text)
  from public, anon, authenticated;
grant execute on function public.delete_b2c_user_data(uuid, text)
  to service_role;

comment on table public.cv_rewrite_proposals is
  'Immutable, evidence-grounded rewrite proposals. Acceptance creates a new CV version; drafts never overwrite source content.';
