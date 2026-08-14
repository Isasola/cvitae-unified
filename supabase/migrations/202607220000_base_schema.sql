-- Reproducible base schema for CVitae.
-- The first production tables predated versioned migrations; later migrations
-- assume these relations already exist. Keep this file structural and safe for
-- fresh local/staging databases.

create extension if not exists pgcrypto with schema extensions;
create extension if not exists vector with schema extensions;

create table if not exists public.content_hub (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  slug text not null unique,
  cuerpo text,
  categoria text,
  ubicacion text,
  tipo text not null default 'blog',
  imagen_url text,
  metadata jsonb not null default '{}'::jsonb,
  fecha_vencimiento timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_master_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique,
  email text unique,
  full_name text,
  professional_title text,
  summary text,
  profile_data jsonb not null default '{}'::jsonb,
  is_subscribed boolean not null default false,
  is_test boolean not null default false,
  embedding extensions.vector(384),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.recruiter_tokens (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  company_name text,
  access_token text not null unique,
  token_balance integer not null default 0 check (token_balance >= 0),
  plan_type text not null default 'starter',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.recruiter_leads (
  id uuid primary key default gen_random_uuid(),
  name text,
  email text not null unique,
  company_name text not null,
  source text not null default 'landing_b2b',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.recruiter_vacancies (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null,
  requirements text not null,
  location text not null,
  modality text not null default 'Presencial',
  salary_range text,
  company text not null,
  slug text not null unique,
  recruiter_token_id uuid references public.recruiter_tokens(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.vacancy_applications (
  id uuid primary key default gen_random_uuid(),
  vacancy_id uuid not null references public.recruiter_vacancies(id) on delete cascade,
  vacancy_slug text not null,
  name text not null,
  email text not null,
  cv_text text,
  cv_file_name text,
  cover_letter text,
  ats_score integer check (ats_score is null or ats_score between 0 and 100),
  fit_score integer check (fit_score is null or fit_score between 0 and 100),
  recommendation text,
  ai_summary text,
  strengths jsonb not null default '[]'::jsonb,
  key_matches jsonb not null default '[]'::jsonb,
  key_gaps jsonb not null default '[]'::jsonb,
  analyzed_at timestamptz,
  recruiter_action text,
  recruiter_notes text,
  applied_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.recruiter_analyses (
  id uuid primary key default gen_random_uuid(),
  token_id uuid not null references public.recruiter_tokens(id) on delete cascade,
  candidate_name text,
  file_name text,
  ats_score integer check (ats_score is null or ats_score between 0 and 100),
  strengths jsonb not null default '[]'::jsonb,
  critical_improvements jsonb not null default '[]'::jsonb,
  vacancy_label text,
  raw_cv_text text,
  is_starred boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.opportunities (
  id text primary key,
  title text not null,
  organization text,
  location text,
  continent text,
  modality text,
  type text,
  rubro text,
  value text,
  deadline timestamptz,
  description text,
  application_url text,
  source text not null default 'scraper',
  recruiter_vacancy_id uuid references public.recruiter_vacancies(id) on delete set null,
  is_active boolean not null default true,
  tags text[] not null default '{}',
  embedding extensions.vector(384),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (application_url)
);

create table if not exists public.linkedin_posts (
  id uuid primary key default gen_random_uuid(),
  opportunity_id text references public.opportunities(id) on delete cascade,
  linkedin_post_id text,
  created_at timestamptz not null default now()
);

create table if not exists public.generated_cvs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  vacancy_id text not null,
  cv_markdown text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, vacancy_id)
);

create table if not exists public.skill_dictionary (
  id uuid primary key default gen_random_uuid(),
  canonical_name text not null unique,
  variants text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.skill_candidates (
  id uuid primary key default gen_random_uuid(),
  term text not null,
  normalized text not null unique,
  mention_count integer not null default 1 check (mention_count >= 0),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now()
);

create table if not exists public.beta_waitlist (
  id uuid primary key default gen_random_uuid(),
  name text,
  email text not null unique,
  source text not null default 'landing_b2c',
  status text not null default 'pending',
  invited_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.b2b_prospects (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  email text not null,
  contact_name text,
  status text not null default 'pending',
  token text,
  notes text,
  invited_at timestamptz,
  activated_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  source text not null default 'site',
  created_at timestamptz not null default now()
);

-- Legacy commercial tables are retained because protected admin routes still
-- read them. They are server-only and contain no local seed customer data.
create table if not exists public.pedidos (
  id uuid primary key default gen_random_uuid(),
  email text,
  nombre text,
  producto text,
  status text not null default 'pending',
  estado text,
  metadata jsonb not null default '{}'::jsonb,
  fecha_creacion timestamptz not null default now()
);

create table if not exists public.tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  balance integer not null default 0 check (balance >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists recruiter_vacancies_slug_idx on public.recruiter_vacancies(slug);
create index if not exists recruiter_vacancies_token_idx on public.recruiter_vacancies(recruiter_token_id);
create index if not exists vacancy_applications_vacancy_id_idx on public.vacancy_applications(vacancy_id);
create index if not exists vacancy_applications_email_idx on public.vacancy_applications(email);
create index if not exists recruiter_analyses_token_created_idx on public.recruiter_analyses(token_id, created_at desc);
create index if not exists opportunities_created_idx on public.opportunities(created_at desc);
create index if not exists opportunities_source_idx on public.opportunities(source);
create index if not exists linkedin_posts_opp_idx on public.linkedin_posts(opportunity_id);

alter table public.content_hub enable row level security;
alter table public.user_master_profiles enable row level security;
alter table public.recruiter_tokens enable row level security;
alter table public.recruiter_leads enable row level security;
alter table public.recruiter_vacancies enable row level security;
alter table public.vacancy_applications enable row level security;
alter table public.recruiter_analyses enable row level security;
alter table public.opportunities enable row level security;
alter table public.linkedin_posts enable row level security;
alter table public.generated_cvs enable row level security;
alter table public.skill_dictionary enable row level security;
alter table public.skill_candidates enable row level security;
alter table public.beta_waitlist enable row level security;
alter table public.b2b_prospects enable row level security;
alter table public.newsletter_subscribers enable row level security;
alter table public.pedidos enable row level security;
alter table public.tokens enable row level security;

-- This baseline may also be applied to an existing environment whose original
-- schema predated migration tracking. Recreating the named policies keeps the
-- migration repeatable without broadening access.
drop policy if exists "own_profile_read" on public.user_master_profiles;
drop policy if exists "own_profile_insert" on public.user_master_profiles;
drop policy if exists "own_profile_update" on public.user_master_profiles;
drop policy if exists "public_verified_opportunities" on public.opportunities;

create policy "own_profile_read" on public.user_master_profiles
  for select to authenticated using (auth.uid() = user_id);
create policy "own_profile_insert" on public.user_master_profiles
  for insert to authenticated with check (auth.uid() = user_id);
create policy "own_profile_update" on public.user_master_profiles
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "public_verified_opportunities" on public.opportunities
  for select to anon, authenticated using (is_active = true);

grant select on public.content_hub, public.opportunities, public.recruiter_vacancies to anon, authenticated;
grant select, insert, update on public.user_master_profiles to authenticated;
grant all on all tables in schema public to service_role;

create or replace function public.match_opportunities(
  query_embedding extensions.vector(384),
  match_threshold double precision default 0.10,
  match_count integer default 120
) returns table(id text, similarity double precision)
language sql stable
set search_path = public, extensions
as $$
  select opportunities.id,
         1 - (opportunities.embedding <=> query_embedding) as similarity
  from public.opportunities
  where opportunities.embedding is not null
    and opportunities.is_active = true
    and 1 - (opportunities.embedding <=> query_embedding) >= match_threshold
  order by opportunities.embedding <=> query_embedding
  limit greatest(1, least(match_count, 500));
$$;

create or replace function public.opportunities_by_source()
returns table(source text, total bigint, last_seen timestamptz)
language sql stable
set search_path = public
as $$
  select coalesce(opportunities.source, 'unknown'), count(*), max(created_at)
  from public.opportunities
  group by coalesce(opportunities.source, 'unknown')
  order by count(*) desc;
$$;

create or replace function public.count_duplicate_opportunities()
returns table(duplicate_count bigint)
language sql stable
set search_path = public
as $$
  select count(*) - count(distinct (lower(title), lower(coalesce(organization, ''))))
  from public.opportunities;
$$;

revoke all on function public.match_opportunities(extensions.vector, double precision, integer) from public;
grant execute on function public.match_opportunities(extensions.vector, double precision, integer) to service_role;
revoke all on function public.opportunities_by_source() from public;
revoke all on function public.count_duplicate_opportunities() from public;
grant execute on function public.opportunities_by_source(), public.count_duplicate_opportunities() to service_role;
