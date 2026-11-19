-- Durable per-opportunity routing transitions for resumable candidate DELTAs.
-- This migration is additive and is intentionally not applied to production.

alter table public.matching_retrieval_scheduler_state
  add column if not exists routing_ledger_baseline_epoch bigint not null default 0;

alter table public.matching_retrieval_states
  add column if not exists routing_ledger_baseline_epoch bigint,
  add column if not exists routing_phase text,
  add column if not exists routing_delta_from_epoch bigint,
  add column if not exists routing_delta_cursor_epoch bigint,
  add column if not exists routing_delta_target_epoch bigint;

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.matching_retrieval_scheduler_state'::regclass and conname = 'matching_retrieval_ledger_baseline_nonnegative') then
    alter table public.matching_retrieval_scheduler_state add constraint matching_retrieval_ledger_baseline_nonnegative check (routing_ledger_baseline_epoch >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.matching_retrieval_states'::regclass and conname = 'matching_retrieval_candidate_ledger_epochs_nonnegative') then
    alter table public.matching_retrieval_states add constraint matching_retrieval_candidate_ledger_epochs_nonnegative check (
      (routing_ledger_baseline_epoch is null or routing_ledger_baseline_epoch >= 0)
      and (routing_delta_from_epoch is null or routing_delta_from_epoch >= 0)
      and (routing_delta_cursor_epoch is null or routing_delta_cursor_epoch >= 0)
      and (routing_delta_target_epoch is null or routing_delta_target_epoch >= 0)
    );
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.matching_retrieval_states'::regclass and conname = 'matching_retrieval_routing_phase_valid') then
    alter table public.matching_retrieval_states add constraint matching_retrieval_routing_phase_valid check (routing_phase is null or routing_phase in ('FULL_SCAN', 'ROUTING_DELTA'));
  end if;
end $$;

create table if not exists public.matching_routing_changes (
  routing_epoch bigint primary key check (routing_epoch >= 1),
  opportunity_id text not null,
  previous_ready boolean not null,
  current_ready boolean not null,
  changed_at timestamptz not null default now(),
  constraint matching_routing_changes_transition check (previous_ready is distinct from current_ready)
);

create index if not exists matching_routing_changes_opportunity_epoch_idx
  on public.matching_routing_changes (opportunity_id, routing_epoch);

alter table public.matching_routing_changes enable row level security;
revoke all on table public.matching_routing_changes from public, anon, authenticated;
grant select, insert on table public.matching_routing_changes to service_role;
drop policy if exists matching_routing_changes_service_role on public.matching_routing_changes;
create policy matching_routing_changes_service_role on public.matching_routing_changes
  for all to service_role using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- Replace the function bound to the one existing transition trigger.
create or replace function public.bump_matching_routing_epoch()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_previous boolean;
  v_current boolean;
  v_opportunity_id text;
  v_epoch bigint;
  v_transition boolean := false;
begin
  if TG_OP = 'INSERT' then
    v_previous := false;
    v_current := NEW.final_matching_state = 'READY';
    v_opportunity_id := NEW.opportunity_id::text;
    v_transition := v_current;
  elsif TG_OP = 'DELETE' then
    v_previous := OLD.final_matching_state = 'READY';
    v_current := false;
    v_opportunity_id := OLD.opportunity_id::text;
    v_transition := v_previous;
  else
    v_previous := OLD.final_matching_state = 'READY';
    v_current := NEW.final_matching_state = 'READY';
    v_opportunity_id := NEW.opportunity_id::text;
    v_transition := v_previous is distinct from v_current;
  end if;

  if v_transition then
    update public.matching_retrieval_scheduler_state
      set routing_epoch = routing_epoch + 1,
          updated_at = pg_catalog.clock_timestamp()
      where singleton = true
      returning routing_epoch into v_epoch;
    if v_epoch is null then
      raise exception 'matching_routing_epoch_singleton_missing';
    end if;
    insert into public.matching_routing_changes
      (routing_epoch, opportunity_id, previous_ready, current_ready, changed_at)
    values (v_epoch, v_opportunity_id, v_previous, v_current, pg_catalog.clock_timestamp());
  end if;
  if TG_OP = 'DELETE' then return OLD; end if;
  return NEW;
end;
$$;

revoke all on function public.bump_matching_routing_epoch() from public, anon, authenticated;
grant execute on function public.bump_matching_routing_epoch() to service_role;

-- CREATE OR REPLACE above updates the function used by the one existing trigger;
-- deliberately do not create or replace a second trigger here.

-- Set the ledger boundary only after the existing trigger function writes the
-- ledger. Concurrent transitions serialize on the same singleton row: one is
-- either included in this baseline (and recovered by FULL), or above it with
-- a durable event.
update public.matching_retrieval_scheduler_state
set routing_ledger_baseline_epoch = routing_epoch
where singleton = true and routing_ledger_baseline_epoch = 0;

create or replace function public.complete_matching_retrieval_scan(
  p_user_id uuid,
  p_expected_routing_epoch bigint,
  p_expected_cursor_at timestamptz,
  p_expected_cursor_id text,
  p_profile_signature text,
  p_source_policy_signature text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_epoch bigint;
  v_state public.matching_retrieval_states%rowtype;
  v_candidate_count integer;
  v_coverage_target integer;
  v_ledger_events bigint;
  v_ledger_baseline bigint;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'service_role_required'; end if;

  -- Lock ordering is singleton then candidate, matching the transition trigger.
  select routing_epoch, routing_ledger_baseline_epoch into v_epoch, v_ledger_baseline
  from public.matching_retrieval_scheduler_state where singleton = true for update;
  if v_epoch is null then raise exception 'matching_routing_epoch_singleton_missing'; end if;
  select * into v_state from public.matching_retrieval_states where user_id = p_user_id for update;
  if not found then raise exception 'matching_retrieval_state_missing'; end if;

  if v_state.routing_phase is distinct from 'ROUTING_DELTA'
    or v_state.routing_delta_target_epoch is distinct from p_expected_routing_epoch
    or v_state.routing_delta_cursor_epoch is distinct from p_expected_routing_epoch then
    raise exception 'matching_retrieval_state_concurrency_conflict';
  end if;
  if v_state.scan_status <> 'SCANNING'
    or v_state.profile_signature is distinct from p_profile_signature
    or v_state.source_policy_signature is distinct from p_source_policy_signature
    or v_state.cursor_at is distinct from p_expected_cursor_at
    or v_state.cursor_id is distinct from p_expected_cursor_id then
    raise exception 'matching_retrieval_state_concurrency_conflict';
  end if;
  if v_state.routing_delta_from_epoch is null
    or v_state.routing_delta_from_epoch < v_ledger_baseline
    or (v_state.routing_ledger_baseline_epoch is not null and v_state.routing_ledger_baseline_epoch <> v_ledger_baseline)
    or (v_state.scan_kind = 'DELTA' and v_state.routing_ledger_baseline_epoch is null)
    or (v_state.scan_kind = 'FULL' and v_state.routing_delta_from_epoch is distinct from v_state.scan_routing_epoch)
    or (v_state.scan_kind = 'DELTA' and v_state.routing_delta_from_epoch is distinct from v_state.completed_routing_epoch)
    or v_state.routing_delta_target_epoch > v_epoch then
    return jsonb_build_object('status', 'STALE_ROUTING_EPOCH', 'routing_epoch', v_epoch);
  end if;
  -- Every post-baseline epoch is committed atomically with exactly one ledger
  -- event. This guards both truncation and an unrecorded transition.
  select count(*) into v_ledger_events from public.matching_routing_changes
  where routing_epoch > v_state.routing_delta_from_epoch
    and routing_epoch <= v_state.routing_delta_target_epoch
    and opportunity_id <> '__ledger_baseline__';
  if v_ledger_events <> v_state.routing_delta_target_epoch - v_state.routing_delta_from_epoch then
    raise exception 'matching_routing_ledger_gap';
  end if;

  if v_state.scan_kind = 'FULL' then
    -- The worker reached EOF in its durable keyset scan before entering this
    -- phase. Routing changes during the scan are replayed from the ledger.
    v_coverage_target := v_state.scan_examined_count;
  else
    select count(*)::integer into v_coverage_target from public.opportunity_final_matching_universe;
  end if;
  select count(*)::integer into v_candidate_count from public.matching_retrieval_candidates
  where user_id = p_user_id and profile_signature = p_profile_signature;

  update public.matching_retrieval_states
  set scan_status = 'COMPLETE', completed_at = pg_catalog.clock_timestamp(),
      completed_routing_epoch = v_state.routing_delta_target_epoch,
      routing_ledger_baseline_epoch = (select routing_ledger_baseline_epoch from public.matching_retrieval_scheduler_state where singleton = true),
      routing_phase = null, routing_delta_from_epoch = null, routing_delta_cursor_epoch = null, routing_delta_target_epoch = null,
      last_change_watermark = scan_cutoff,
      cursor_at = null, cursor_id = null,
      examined_count = v_coverage_target, target_count = v_coverage_target, candidate_count = v_candidate_count,
      inventory_funnel_at = case when scan_kind = 'FULL' then scan_cutoff else inventory_funnel_at end,
      updated_at = pg_catalog.clock_timestamp(), last_error_code = null
  where user_id = p_user_id;
  return jsonb_build_object('status', 'COMPLETE', 'routing_epoch', v_state.routing_delta_target_epoch,
    'global_routing_epoch', v_epoch, 'examined_count', v_state.scan_examined_count,
    'coverage_target', v_coverage_target, 'candidate_count', v_candidate_count);
end;
$$;

revoke all on function public.complete_matching_retrieval_scan(uuid,bigint,timestamptz,text,text,text) from public, anon, authenticated;
grant execute on function public.complete_matching_retrieval_scan(uuid,bigint,timestamptz,text,text,text) to service_role;
