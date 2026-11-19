-- Append-only CV versions and explicit user evidence review.

create table if not exists public.cv_evidence_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  profile_id uuid references public.user_master_profiles(id) on delete cascade,
  fingerprint text not null,
  category text not null,
  claim text not null,
  context text,
  source_kind text not null,
  source_label text,
  status text not null default 'pending',
  confirmed_value text,
  active boolean not null default true,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, fingerprint),
  check (fingerprint ~ '^[a-f0-9]{64}$'),
  check (category in ('identity', 'title', 'summary', 'skill', 'course', 'experience', 'achievement', 'education', 'language', 'contact', 'other')),
  check (source_kind in ('profile', 'uploaded_cv', 'manual')),
  check (status in ('pending', 'confirmed', 'rejected')),
  check (char_length(claim) between 1 and 2000),
  check (confirmed_value is null or char_length(confirmed_value) between 1 and 2000)
);

create index if not exists cv_evidence_user_status_idx
  on public.cv_evidence_items (user_id, active, status, updated_at desc);

alter table public.cv_evidence_items enable row level security;
revoke all on table public.cv_evidence_items from anon, authenticated;
grant all on table public.cv_evidence_items to service_role;

alter table public.generated_cvs
  add column if not exists version_number integer,
  add column if not exists parent_version_id uuid references public.generated_cvs(id) on delete set null,
  add column if not exists label text,
  add column if not exists generation_kind text,
  add column if not exists evidence_snapshot jsonb not null default '[]'::jsonb,
  add column if not exists vacancy_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists content_hash text,
  add column if not exists user_attested boolean not null default false;

with numbered as (
  select id,
         row_number() over (partition by user_id, vacancy_id order by created_at, id)::integer as number
  from public.generated_cvs
  where version_number is null
)
update public.generated_cvs as generated
set version_number = numbered.number,
    label = coalesce(generated.label, 'Versión migrada'),
    generation_kind = coalesce(generated.generation_kind, 'legacy'),
    content_hash = coalesce(generated.content_hash, encode(extensions.digest(generated.cv_markdown, 'sha256'), 'hex'))
from numbered
where generated.id = numbered.id;

alter table public.generated_cvs
  alter column version_number set not null,
  alter column label set default 'Versión del CV',
  alter column label set not null,
  alter column generation_kind set default 'base',
  alter column generation_kind set not null,
  alter column content_hash set not null;

alter table public.generated_cvs
  drop constraint if exists generated_cvs_user_id_vacancy_id_key;
alter table public.generated_cvs
  drop constraint if exists generated_cvs_generation_kind_check;
alter table public.generated_cvs
  add constraint generated_cvs_generation_kind_check
  check (generation_kind in ('legacy', 'base', 'adapted', 'manual', 'restored'));
alter table public.generated_cvs
  drop constraint if exists generated_cvs_version_positive_check;
alter table public.generated_cvs
  add constraint generated_cvs_version_positive_check check (version_number > 0);

create unique index if not exists generated_cvs_user_vacancy_version_uidx
  on public.generated_cvs (user_id, vacancy_id, version_number);
create index if not exists generated_cvs_user_created_idx
  on public.generated_cvs (user_id, created_at desc);

create or replace function public.prevent_cv_version_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'CV versions are immutable; create a new version instead';
end;
$$;

drop trigger if exists generated_cvs_immutable_update on public.generated_cvs;
create trigger generated_cvs_immutable_update
  before update on public.generated_cvs
  for each row execute function public.prevent_cv_version_update();

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
  if p_generation_kind not in ('base', 'adapted', 'manual', 'restored') then
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
  normalized_email text := lower(trim(coalesce(p_email, '')));
begin
  if p_user_id is null then raise exception 'user id is required'; end if;

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
    'deleted_evidence', deleted_evidence
  );
end;
$$;

revoke all on function public.delete_b2c_user_data(uuid, text)
  from public, anon, authenticated;
grant execute on function public.delete_b2c_user_data(uuid, text)
  to service_role;

comment on table public.cv_evidence_items is
  'Claims available to CV generation; only confirmed active items may enter a generated CV.';
comment on table public.generated_cvs is
  'Append-only CV history. Editing or restoring creates a new version instead of overwriting.';
