-- Atomic, append-only source policy audit for confirmed hard-dead details.
-- Schema and function only: this migration performs no row backfill.

create table if not exists public.opportunity_source_policy_events (
  id uuid primary key default gen_random_uuid(),
  opportunity_id text not null,
  source text not null,
  policy text not null,
  action text not null,
  reason text not null,
  observation_id uuid not null,
  adapter_version text null,
  http_status integer null,
  before_state jsonb not null default '{}'::jsonb,
  after_state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (policy = 'HARD_DEAD_SUPPRESSION'),
  check (action = 'SUPPRESS')
);

comment on table public.opportunity_source_policy_events is
  'Append-only audit for source-policy mutations; records compact before/after eligibility state only.';
comment on column public.opportunity_source_policy_events.before_state is
  'Compact policy-relevant state only; never an opportunity snapshot.';

create index if not exists opportunity_source_policy_events_opportunity_created_idx
  on public.opportunity_source_policy_events (opportunity_id, created_at desc);
create index if not exists opportunity_source_policy_events_source_created_idx
  on public.opportunity_source_policy_events (source, created_at desc);

alter table public.opportunity_source_policy_events enable row level security;
revoke all on table public.opportunity_source_policy_events from public, anon, authenticated, service_role;
grant select, insert on table public.opportunity_source_policy_events to service_role;

create or replace function public.apply_source_policy_suppression_atomic(
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
  v_updated public.opportunities%rowtype;
  v_observation public.opportunity_source_observations%rowtype;
  v_before jsonb;
  v_after jsonb;
begin
  if p_expected_updated_at is null then
    raise exception 'expected_updated_at_required';
  end if;

  select * into v_current
  from public.opportunities
  where id = p_opportunity_id
  for update;
  if not found then
    raise exception 'opportunity_not_found';
  end if;
  if v_current.source is distinct from nullif(trim(p_source), '') then
    raise exception 'source_mismatch';
  end if;
  if v_current.updated_at is distinct from p_expected_updated_at then
    raise exception 'stale_opportunity';
  end if;

  select * into v_observation
  from public.opportunity_source_observations
  where opportunity_id = v_current.id
    and source = v_current.source
  order by observed_at desc, id desc
  limit 1;
  if not found then
    return jsonb_build_object('changed', false, 'reason', 'missing_observation', 'opportunity_id', v_current.id);
  end if;
  if v_observation.identity_status not in ('REMOVED', 'DEAD')
     or v_observation.http_status not in (404, 410) then
    return jsonb_build_object('changed', false, 'reason', 'latest_observation_not_hard_dead', 'opportunity_id', v_current.id, 'observation_id', v_observation.id);
  end if;
  if not v_current.catalog_eligible and not v_current.match_eligible then
    return jsonb_build_object('changed', false, 'reason', 'already_suppressed', 'opportunity_id', v_current.id, 'observation_id', v_observation.id, 'updated_at', v_current.updated_at);
  end if;

  v_before := jsonb_build_object('catalog_eligible', v_current.catalog_eligible, 'match_eligible', v_current.match_eligible);
  update public.opportunities
  set catalog_eligible = false,
      match_eligible = false
  where id = v_current.id
  returning * into v_updated;
  v_after := jsonb_build_object('catalog_eligible', v_updated.catalog_eligible, 'match_eligible', v_updated.match_eligible);

  insert into public.opportunity_source_policy_events (
    opportunity_id, source, policy, action, reason, observation_id,
    adapter_version, http_status, before_state, after_state
  ) values (
    v_current.id, v_current.source, 'HARD_DEAD_SUPPRESSION', 'SUPPRESS',
    case when v_observation.http_status = 410 then 'latest_observation_removed_http_410' else 'latest_observation_dead_http_404' end,
    v_observation.id, v_observation.adapter_version, v_observation.http_status, v_before, v_after
  );

  return jsonb_build_object(
    'changed', true, 'policy', 'HARD_DEAD_SUPPRESSION', 'action', 'SUPPRESS',
    'opportunity_id', v_updated.id, 'observation_id', v_observation.id,
    'updated_at', v_updated.updated_at
  );
end;
$$;

revoke all on function public.apply_source_policy_suppression_atomic(text, text, timestamptz) from public, anon, authenticated, service_role;
grant execute on function public.apply_source_policy_suppression_atomic(text, text, timestamptz) to service_role;
