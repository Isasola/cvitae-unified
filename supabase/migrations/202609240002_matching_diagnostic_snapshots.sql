-- Item 57: bounded matching observability.  This table stores operational
-- counts only; it never stores CV text, evidence, or opportunity payloads.
create table if not exists public.matching_diagnostic_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  run_at timestamptz not null default now(),
  profile_signature text,
  profile_updated_at timestamptz,
  run_status text not null check (run_status in ('SUCCESS', 'ERROR')),
  request_mode text not null default 'default' check (request_mode in ('default', 'alerts')),
  primary_retrieval_count integer not null default 0,
  semantic_retrieval_count integer not null default 0,
  unique_policy_candidates_count integer not null default 0,
  source_allowed_count integer not null default 0,
  professional_evidence_ready_count integer not null default 0,
  professional_fit_known_count integer not null default 0,
  eligibility_eligible_count integer not null default 0,
  eligibility_unknown_count integer not null default 0,
  eligibility_ineligible_count integer not null default 0,
  match_count integer not null default 0,
  potential_scoreable_count integer not null default 0,
  visible_potential_count integer not null default 0,
  abstain_count integer not null default 0,
  deny_count integer not null default 0,
  visible_confirmed_count integer not null default 0,
  coverage_state text not null check (coverage_state in ('HEALTHY', 'LOW_RETRIEVAL_COVERAGE', 'DATA_COVERAGE_GAP', 'PROFESSIONAL_FIT_GAP', 'ELIGIBILITY_UNKNOWN', 'NO_CONFIRMED_MATCH', 'ERROR', 'NO_RUN')),
  top_reason_codes jsonb not null default '{}'::jsonb,
  embedding_readiness text,
  created_at timestamptz not null default now()
);

create index if not exists matching_diagnostic_snapshots_user_run_idx
  on public.matching_diagnostic_snapshots (user_id, run_at desc);

alter table public.matching_diagnostic_snapshots enable row level security;
revoke all on public.matching_diagnostic_snapshots from public, anon, authenticated;
grant select, insert, update, delete on public.matching_diagnostic_snapshots to service_role;

drop policy if exists matching_diagnostic_snapshots_service_role on public.matching_diagnostic_snapshots;
create policy matching_diagnostic_snapshots_service_role
  on public.matching_diagnostic_snapshots
  for all to service_role
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
