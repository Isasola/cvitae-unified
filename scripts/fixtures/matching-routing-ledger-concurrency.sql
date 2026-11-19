-- Minimal schema for isolated local PostgreSQL concurrency checks.
create schema auth;
create function auth.role() returns text language sql as $$select 'service_role'::text$$;

create table public.opportunities (
  id text primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.opportunity_universe_state (
  opportunity_id text primary key references public.opportunities(id) on delete cascade,
  final_matching_state text not null,
  evaluated_at timestamptz not null default now()
);
create table public.matching_retrieval_scheduler_state (
  singleton boolean primary key default true,
  profile_cursor uuid,
  updated_at timestamptz not null default now()
);
insert into public.matching_retrieval_scheduler_state(singleton) values(true);
create table public.matching_retrieval_states (
  user_id uuid primary key,
  profile_signature text not null,
  source_policy_signature text not null,
  scan_kind text not null default 'FULL',
  scan_status text not null default 'PENDING',
  scan_cutoff timestamptz,
  cursor_at timestamptz,
  cursor_id text,
  scan_examined_count integer not null default 0,
  scan_target_count integer not null default 0,
  examined_count integer not null default 0,
  target_count integer not null default 0,
  candidate_count integer not null default 0,
  completed_at timestamptz,
  last_change_watermark timestamptz,
  inventory_funnel_at timestamptz,
  updated_at timestamptz not null default now(),
  last_error_code text
);
create table public.matching_retrieval_candidates (
  user_id uuid not null,
  opportunity_id text not null,
  profile_signature text not null,
  primary key (user_id, opportunity_id)
);
create view public.opportunity_final_matching_universe as
select o.id, o.created_at, o.updated_at, 'READY'::text as universe_final_matching_state
from public.opportunities o
join public.opportunity_universe_state u on u.opportunity_id = o.id
where u.final_matching_state = 'READY';
