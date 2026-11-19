-- Additive matching cache invalidation by transactional routing membership epoch.
-- Not applied to any shared or production database by this migration file.

alter table public.matching_retrieval_scheduler_state
  add column if not exists routing_epoch bigint not null default 1;

alter table public.matching_retrieval_states
  add column if not exists scan_routing_epoch bigint,
  add column if not exists completed_routing_epoch bigint not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.matching_retrieval_scheduler_state'::regclass
      and conname = 'matching_retrieval_scheduler_routing_epoch_positive'
  ) then
    alter table public.matching_retrieval_scheduler_state
      add constraint matching_retrieval_scheduler_routing_epoch_positive check (routing_epoch >= 1);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.matching_retrieval_states'::regclass
      and conname = 'matching_retrieval_scan_routing_epoch_nonnegative'
  ) then
    alter table public.matching_retrieval_states
      add constraint matching_retrieval_scan_routing_epoch_nonnegative
      check (scan_routing_epoch is null or scan_routing_epoch >= 1);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.matching_retrieval_states'::regclass
      and conname = 'matching_retrieval_completed_routing_epoch_nonnegative'
  ) then
    alter table public.matching_retrieval_states
      add constraint matching_retrieval_completed_routing_epoch_nonnegative check (completed_routing_epoch >= 0);
  end if;
end $$;

create or replace function public.bump_matching_routing_epoch()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if TG_OP = 'INSERT' then
    if NEW.final_matching_state = 'READY' then
      update public.matching_retrieval_scheduler_state
      set routing_epoch = routing_epoch + 1, updated_at = pg_catalog.clock_timestamp()
      where singleton = true;
    end if;
    return NEW;
  elsif TG_OP = 'DELETE' then
    if OLD.final_matching_state = 'READY' then
      update public.matching_retrieval_scheduler_state
      set routing_epoch = routing_epoch + 1, updated_at = pg_catalog.clock_timestamp()
      where singleton = true;
    end if;
    return OLD;
  elsif (OLD.final_matching_state = 'READY') is distinct from (NEW.final_matching_state = 'READY') then
    update public.matching_retrieval_scheduler_state
    set routing_epoch = routing_epoch + 1, updated_at = pg_catalog.clock_timestamp()
    where singleton = true;
  end if;
  return NEW;
end;
$$;

revoke all on function public.bump_matching_routing_epoch() from public, anon, authenticated;
grant execute on function public.bump_matching_routing_epoch() to service_role;

drop trigger if exists opportunity_universe_matching_routing_epoch on public.opportunity_universe_state;
create trigger opportunity_universe_matching_routing_epoch
after insert or update of final_matching_state or delete on public.opportunity_universe_state
for each row execute function public.bump_matching_routing_epoch();

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
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service_role_required';
  end if;

  select routing_epoch into v_epoch
  from public.matching_retrieval_scheduler_state
  where singleton = true
  for update;
  if v_epoch is null then raise exception 'matching_routing_epoch_singleton_missing'; end if;

  select * into v_state
  from public.matching_retrieval_states
  where user_id = p_user_id
  for update;
  if not found then raise exception 'matching_retrieval_state_missing'; end if;

  if v_epoch <> p_expected_routing_epoch or v_state.scan_routing_epoch is distinct from p_expected_routing_epoch then
    return jsonb_build_object('status', 'STALE_ROUTING_EPOCH', 'routing_epoch', v_epoch);
  end if;
  if v_state.scan_status <> 'SCANNING'
    or v_state.profile_signature is distinct from p_profile_signature
    or v_state.source_policy_signature is distinct from p_source_policy_signature
    or v_state.cursor_at is distinct from p_expected_cursor_at
    or v_state.cursor_id is distinct from p_expected_cursor_id then
    raise exception 'matching_retrieval_state_concurrency_conflict';
  end if;
  if v_state.scan_examined_count <> v_state.scan_target_count then
    raise exception 'matching_retrieval_coverage_incomplete';
  end if;

  if v_state.scan_kind = 'FULL' then
    select count(*)::integer into v_coverage_target
    from public.opportunity_final_matching_universe
    where created_at <= v_state.scan_cutoff and updated_at <= v_state.scan_cutoff;
    if v_state.scan_target_count <> v_coverage_target then
      raise exception 'matching_retrieval_full_denominator_changed';
    end if;
  else
    select count(*)::integer into v_coverage_target from public.opportunity_final_matching_universe;
  end if;

  select count(*)::integer into v_candidate_count
  from public.matching_retrieval_candidates
  where user_id = p_user_id and profile_signature = p_profile_signature;

  update public.matching_retrieval_states
  set scan_status = 'COMPLETE', completed_at = pg_catalog.clock_timestamp(),
      completed_routing_epoch = v_epoch, last_change_watermark = scan_cutoff,
      cursor_at = null, cursor_id = null, examined_count = v_coverage_target,
      target_count = v_coverage_target, candidate_count = v_candidate_count,
      inventory_funnel_at = case when scan_kind = 'FULL' then scan_cutoff else inventory_funnel_at end,
      updated_at = pg_catalog.clock_timestamp(), last_error_code = null
  where user_id = p_user_id;

  return jsonb_build_object('status', 'COMPLETE', 'routing_epoch', v_epoch,
    'examined_count', v_state.scan_examined_count, 'coverage_target', v_coverage_target,
    'candidate_count', v_candidate_count);
end;
$$;

revoke all on function public.complete_matching_retrieval_scan(uuid,bigint,timestamptz,text,text,text) from public, anon, authenticated;
grant execute on function public.complete_matching_retrieval_scan(uuid,bigint,timestamptz,text,text,text) to service_role;
