-- Local-only: auditable restoration of source existence after a later,
-- identity-confirmed live observation. It deliberately does not republish,
-- rematch, reindex, or change verification.

alter table public.opportunity_source_policy_events
  drop constraint if exists opportunity_source_policy_events_policy_check;
alter table public.opportunity_source_policy_events
  drop constraint if exists opportunity_source_policy_events_action_check;
alter table public.opportunity_source_policy_events
  add constraint opportunity_source_policy_events_policy_check
    check (policy in ('HARD_DEAD_SUPPRESSION', 'SOURCE_LIVE_RESTORE'));
alter table public.opportunity_source_policy_events
  add constraint opportunity_source_policy_events_action_check
    check (action in ('SUPPRESS', 'RESTORE'));

create or replace function public.apply_source_policy_restore_atomic(
  p_opportunity_id text,
  p_source text,
  p_expected_updated_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current public.opportunities%rowtype;
  v_observation public.opportunity_source_observations%rowtype;
  v_previous public.opportunity_source_policy_events%rowtype;
  v_before jsonb;
begin
  if p_expected_updated_at is null then raise exception 'expected_updated_at_required'; end if;
  select * into v_current from public.opportunities where id = p_opportunity_id for update;
  if not found then raise exception 'opportunity_not_found'; end if;
  if v_current.source is distinct from nullif(trim(p_source), '') then raise exception 'source_mismatch'; end if;
  if v_current.updated_at is distinct from p_expected_updated_at then raise exception 'stale_opportunity'; end if;
  select * into v_observation from public.opportunity_source_observations
    where opportunity_id = v_current.id and source = v_current.source
    order by observed_at desc, id desc limit 1;
  if not found or v_observation.identity_status <> 'IDENTITY_CONFIRMED' or v_observation.http_status <> 200 then
    return jsonb_build_object('changed', false, 'reason', 'latest_observation_not_confirmed_live', 'opportunity_id', v_current.id);
  end if;
  select * into v_previous from public.opportunity_source_policy_events
    where opportunity_id = v_current.id and source = v_current.source and action = 'SUPPRESS'
    order by created_at desc, id desc limit 1;
  if not found then return jsonb_build_object('changed', false, 'reason', 'not_previously_suppressed', 'opportunity_id', v_current.id); end if;
  if exists (select 1 from public.opportunity_source_policy_events where opportunity_id = v_current.id and source = v_current.source and action = 'RESTORE' and created_at > v_previous.created_at) then
    return jsonb_build_object('changed', false, 'reason', 'already_restored', 'opportunity_id', v_current.id, 'observation_id', v_observation.id);
  end if;
  v_before := jsonb_build_object('catalog_eligible', v_current.catalog_eligible, 'match_eligible', v_current.match_eligible);
  insert into public.opportunity_source_policy_events (opportunity_id, source, policy, action, reason, observation_id, adapter_version, http_status, before_state, after_state)
  values (v_current.id, v_current.source, 'SOURCE_LIVE_RESTORE', 'RESTORE', 'latest_identity_confirmed_http_200_requires_existing_gates', v_observation.id, v_observation.adapter_version, v_observation.http_status, v_before, v_before);
  return jsonb_build_object('changed', true, 'policy', 'SOURCE_LIVE_RESTORE', 'action', 'RESTORE', 'opportunity_id', v_current.id, 'observation_id', v_observation.id, 'catalog_eligible', v_current.catalog_eligible, 'match_eligible', v_current.match_eligible);
end;
$$;
revoke all on function public.apply_source_policy_restore_atomic(text, text, timestamptz) from public, anon, authenticated, service_role;
grant execute on function public.apply_source_policy_restore_atomic(text, text, timestamptz) to service_role;
