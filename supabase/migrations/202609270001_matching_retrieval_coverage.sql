-- Local additive schema for bounded background matching coverage. Not applied.
create table if not exists public.matching_retrieval_states (
  user_id uuid primary key references auth.users(id) on delete cascade,
  profile_signature text not null,
  source_policy_signature text not null,
  scan_kind text not null check (scan_kind in ('FULL', 'DELTA')),
  scan_status text not null check (scan_status in ('PENDING', 'SCANNING', 'COMPLETE', 'ERROR')),
  scan_cutoff timestamptz not null,
  cursor_at timestamptz,
  cursor_id text,
  last_change_watermark timestamptz,
  examined_count integer not null default 0 check (examined_count >= 0),
  target_count integer not null default 0 check (target_count >= 0),
  scan_examined_count integer not null default 0 check (scan_examined_count >= 0),
  scan_target_count integer not null default 0 check (scan_target_count >= 0),
  candidate_count integer not null default 0 check (candidate_count >= 0),
  completed_at timestamptz,
  last_error_code text,
  inventory_funnel jsonb not null default '{}'::jsonb,
  inventory_funnel_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.matching_retrieval_candidates (
  user_id uuid not null references auth.users(id) on delete cascade,
  opportunity_id text not null references public.opportunities(id) on delete cascade,
  profile_signature text not null,
  opportunity_content_fingerprint text not null,
  candidate_class text not null check (candidate_class in ('MATCH', 'POTENTIAL')),
  score_snapshot double precision,
  semantic_similarity double precision,
  reason_codes jsonb not null default '[]'::jsonb,
  retrieval_lanes text[] not null default '{}',
  evaluation_lane text not null check (evaluation_lane in ('FULL_BACKFILL', 'INCREMENTAL')),
  evaluated_at timestamptz not null default now(),
  primary key (user_id, opportunity_id)
);

-- Small durable selector cursor so users without a retrieval state are eventually reached.
create table if not exists public.matching_retrieval_scheduler_state (
  singleton boolean primary key default true check (singleton),
  profile_cursor uuid,
  updated_at timestamptz not null default now()
);
insert into public.matching_retrieval_scheduler_state (singleton) values (true) on conflict (singleton) do nothing;

create index if not exists matching_retrieval_candidates_live_idx
  on public.matching_retrieval_candidates (user_id, candidate_class, score_snapshot desc nulls last, evaluated_at desc);
create index if not exists matching_retrieval_candidates_evaluated_idx
  on public.matching_retrieval_candidates (evaluation_lane, evaluated_at desc);

alter table public.matching_retrieval_states enable row level security;
alter table public.matching_retrieval_candidates enable row level security;
alter table public.matching_retrieval_scheduler_state enable row level security;
revoke all on public.matching_retrieval_states, public.matching_retrieval_candidates, public.matching_retrieval_scheduler_state from public, anon, authenticated;
grant select, insert, update, delete on public.matching_retrieval_states, public.matching_retrieval_candidates, public.matching_retrieval_scheduler_state to service_role;

drop policy if exists matching_retrieval_states_service_role on public.matching_retrieval_states;
create policy matching_retrieval_states_service_role on public.matching_retrieval_states
  for all to service_role using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
drop policy if exists matching_retrieval_candidates_service_role on public.matching_retrieval_candidates;
create policy matching_retrieval_candidates_service_role on public.matching_retrieval_candidates
  for all to service_role using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
drop policy if exists matching_retrieval_scheduler_service_role on public.matching_retrieval_scheduler_state;
create policy matching_retrieval_scheduler_service_role on public.matching_retrieval_scheduler_state
  for all to service_role using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

create or replace function public.score_opportunity_embeddings(
  query_embedding public.vector(384),
  opportunity_ids text[]
) returns table(id text, similarity double precision)
language plpgsql stable
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service_role_required';
  end if;
  if coalesce(cardinality(opportunity_ids), 0) > 500 then
    raise exception 'opportunity_id_limit_exceeded';
  end if;
  return query
    select o.id, 1 - (o.embedding <=> query_embedding) as similarity
    from public.opportunities o
    where o.id = any(opportunity_ids)
      and o.embedding is not null;
end;
$$;
revoke all on function public.score_opportunity_embeddings(public.vector, text[]) from public, anon, authenticated;
grant execute on function public.score_opportunity_embeddings(public.vector, text[]) to service_role;

create or replace function public.prune_matching_retrieval_candidates()
returns integer
language plpgsql
set search_path = public
as $$
declare removed integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service_role_required';
  end if;
  delete from public.matching_retrieval_candidates c
  using public.opportunities o
  left join public.opportunity_universe_state u on u.opportunity_id = o.id::text
  where c.opportunity_id = o.id
    and (u.final_matching_state is distinct from 'READY'
      or c.opportunity_content_fingerprint is distinct from o.content_fingerprint);
  get diagnostics removed = row_count;
  return removed;
end;
$$;
revoke all on function public.prune_matching_retrieval_candidates() from public, anon, authenticated;
grant execute on function public.prune_matching_retrieval_candidates() to service_role;

alter table public.matching_diagnostic_snapshots
  add column if not exists background_retrieval_count integer not null default 0,
  add column if not exists background_scan_status text not null default 'NO_SCAN',
  add column if not exists background_examined_count integer not null default 0,
  add column if not exists background_target_count integer not null default 0,
  add column if not exists background_candidate_count integer not null default 0,
  add column if not exists background_completed_at timestamptz,
  add column if not exists total_inventory_count integer,
  add column if not exists inventory_funnel jsonb not null default '{}'::jsonb,
  add column if not exists inventory_funnel_at timestamptz;

alter table public.matching_diagnostic_snapshots
  drop constraint if exists matching_diagnostic_snapshots_background_status_check;
alter table public.matching_diagnostic_snapshots
  add constraint matching_diagnostic_snapshots_background_status_check
  check (background_scan_status in ('NO_SCAN', 'PARTIAL', 'COMPLETE', 'STALE', 'ERROR'));
