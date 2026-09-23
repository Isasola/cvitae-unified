-- Source capability is a kill-switch; it is not row-level matching evidence.
-- This migration is intentionally local-only until the grouped RC is approved.
create or replace function public.admin_update_source_policy_atomic(
  p_source text,
  p_changes jsonb,
  p_expected_updated_at timestamptz default null,
  p_actor text default 'admin'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current public.opportunity_sources%rowtype;
  v_after public.opportunity_sources%rowtype;
  v_impacted integer := 0;
begin
  select * into v_current from public.opportunity_sources where source = p_source for update;
  if not found then raise exception 'source_not_found'; end if;
  if p_expected_updated_at is not null and v_current.updated_at is distinct from p_expected_updated_at then raise exception 'stale_source_policy'; end if;
  if p_changes ? 'source_tier' and p_changes->>'source_tier' not in ('SS', 'S', 'A', 'B') then raise exception 'invalid_source_tier'; end if;

  update public.opportunity_sources set
    display_name = case when p_changes ? 'display_name' then left(trim(p_changes->>'display_name'), 240) else display_name end,
    source_tier = case when p_changes ? 'source_tier' then p_changes->>'source_tier' else source_tier end,
    trust_level = case when p_changes ? 'trust_level' then p_changes->>'trust_level' else trust_level end,
    auto_verify = case when p_changes ? 'auto_verify' then (p_changes->>'auto_verify')::boolean else auto_verify end,
    is_enabled = case when p_changes ? 'is_enabled' then (p_changes->>'is_enabled')::boolean else is_enabled end,
    catalog_enabled = case when p_changes ? 'catalog_enabled' then (p_changes->>'catalog_enabled')::boolean else catalog_enabled end,
    matching_enabled = case when p_changes ? 'matching_enabled' then (p_changes->>'matching_enabled')::boolean else matching_enabled end,
    alerts_enabled = case when p_changes ? 'alerts_enabled' then (p_changes->>'alerts_enabled')::boolean else alerts_enabled end,
    seo_enabled = case when p_changes ? 'seo_enabled' then (p_changes->>'seo_enabled')::boolean else seo_enabled end,
    allowed_country_codes = case when p_changes ? 'allowed_country_codes' then array(select upper(value) from jsonb_array_elements_text(p_changes->'allowed_country_codes')) else allowed_country_codes end,
    allowed_opportunity_types = case when p_changes ? 'allowed_opportunity_types' then array(select value from jsonb_array_elements_text(p_changes->'allowed_opportunity_types')) else allowed_opportunity_types end,
    max_items_per_day = case when p_changes ? 'max_items_per_day' then greatest(1, least(5000, (p_changes->>'max_items_per_day')::integer)) else max_items_per_day end,
    retention_days = case when p_changes ? 'retention_days' then greatest(1, least(365, (p_changes->>'retention_days')::integer)) else retention_days end,
    verification_criteria = case when p_changes ? 'verification_criteria' then p_changes->'verification_criteria' else verification_criteria end,
    notes = case when p_changes ? 'notes' then nullif(left(trim(p_changes->>'notes'), 2000), '') else notes end,
    updated_at = clock_timestamp(), updated_by = left(coalesce(nullif(p_actor, ''), 'admin'), 120)
  where source = p_source returning * into v_after;

  -- Disabling a source is safe to fan out as a kill-switch. Enabling it never
  -- promotes rows: each row needs its own factory/quality readiness evidence.
  if p_changes ? 'matching_enabled' and (p_changes->>'matching_enabled')::boolean is false then
    update public.opportunities set match_eligible = false
    where source = p_source and verification_status = 'verified' and is_active and deleted_at is null and match_eligible is distinct from false;
    get diagnostics v_impacted = row_count;
  end if;

  insert into public.admin_policy_events(entity_type, entity_key, before_state, after_state, impacted_rows, actor)
  values ('source', p_source, to_jsonb(v_current), to_jsonb(v_after), v_impacted, left(coalesce(nullif(p_actor, ''), 'admin'), 120));
  return jsonb_build_object('ok', true, 'impacted_rows', v_impacted, 'updated_at', v_after.updated_at);
end;
$$;

revoke all on function public.admin_update_source_policy_atomic(text,jsonb,timestamptz,text) from public, anon, authenticated;
grant execute on function public.admin_update_source_policy_atomic(text,jsonb,timestamptz,text) to service_role;
