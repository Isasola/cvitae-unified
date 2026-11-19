-- Atomic, append-only enrichment for source adapters. No backfill is performed.
create or replace function public.apply_opportunity_enrichment_atomic(
  p_opportunity_id text,
  p_expected_updated_at timestamptz,
  p_adapter_version text,
  p_source_url text,
  p_canonical_url text,
  p_patch jsonb,
  p_evidence jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current public.opportunities%rowtype;
  v_updated public.opportunities%rowtype;
  v_key text;
  v_changed jsonb := '{}'::jsonb;
  v_before jsonb := '{}'::jsonb;
  v_after jsonb := '{}'::jsonb;
  v_changed_fields text[] := '{}'::text[];
  v_text text;
  v_published_at timestamptz;
  v_remote boolean;
begin
  if p_expected_updated_at is null then raise exception 'expected_updated_at_required'; end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then raise exception 'invalid_enrichment_patch'; end if;
  if p_evidence is not null and jsonb_typeof(p_evidence) <> 'object' then raise exception 'invalid_enrichment_evidence'; end if;
  if octet_length(coalesce(p_evidence, '{}'::jsonb)::text) > 16384 then raise exception 'enrichment_evidence_too_large'; end if;

  for v_key in select jsonb_object_keys(p_patch) loop
    if v_key not in ('title', 'organization', 'description', 'location', 'country_code',
                     'onsite_country', 'remote_scope', 'remote', 'value', 'currency',
                     'published_at', 'deadline', 'application_url', 'source_url') then
      raise exception 'unsupported_enrichment_field: %', v_key;
    end if;
  end loop;

  select * into v_current from public.opportunities where id = p_opportunity_id for update;
  if not found then raise exception 'opportunity_not_found'; end if;
  if v_current.updated_at is distinct from p_expected_updated_at then raise exception 'stale_opportunity'; end if;

  -- JSON null can correct inherited geo/listing evidence only.
  if p_patch ? 'location' then
    v_text := nullif(trim(p_patch->>'location'), '');
    if jsonb_typeof(p_patch->'location') = 'null' then v_text := null; end if;
    if (jsonb_typeof(p_patch->'location') = 'null' or v_text is not null) and v_text is distinct from v_current.location then
      v_changed := v_changed || jsonb_build_object('location', v_text); v_before := v_before || jsonb_build_object('location', v_current.location); v_after := v_after || jsonb_build_object('location', v_text); v_changed_fields := array_append(v_changed_fields, 'location');
    end if;
  end if;
  if p_patch ? 'country_code' then
    v_text := nullif(upper(trim(p_patch->>'country_code')), '');
    if jsonb_typeof(p_patch->'country_code') = 'null' then v_text := null;
    elsif v_text !~ '^[A-Z]{2}$' then raise exception 'invalid_country_code'; end if;
    if (jsonb_typeof(p_patch->'country_code') = 'null' or v_text is not null) and v_text is distinct from v_current.country_code then
      v_changed := v_changed || jsonb_build_object('country_code', v_text); v_before := v_before || jsonb_build_object('country_code', v_current.country_code); v_after := v_after || jsonb_build_object('country_code', v_text); v_changed_fields := array_append(v_changed_fields, 'country_code');
    end if;
  end if;
  if p_patch ? 'onsite_country' then
    v_text := nullif(upper(trim(p_patch->>'onsite_country')), '');
    if jsonb_typeof(p_patch->'onsite_country') = 'null' then v_text := null;
    elsif v_text !~ '^[A-Z]{2}$' then raise exception 'invalid_onsite_country'; end if;
    if (jsonb_typeof(p_patch->'onsite_country') = 'null' or v_text is not null) and v_text is distinct from v_current.onsite_country then
      v_changed := v_changed || jsonb_build_object('onsite_country', v_text); v_before := v_before || jsonb_build_object('onsite_country', v_current.onsite_country); v_after := v_after || jsonb_build_object('onsite_country', v_text); v_changed_fields := array_append(v_changed_fields, 'onsite_country');
    end if;
  end if;
  if p_patch ? 'remote_scope' then
    v_text := nullif(upper(trim(p_patch->>'remote_scope')), '');
    if jsonb_typeof(p_patch->'remote_scope') = 'null' then v_text := null;
    elsif v_text not in ('WORLDWIDE', 'LATAM', 'REGIONAL', 'COUNTRY_SPECIFIC', 'ONSITE', 'HYBRID', 'UNKNOWN') then raise exception 'invalid_remote_scope'; end if;
    if (jsonb_typeof(p_patch->'remote_scope') = 'null' or v_text is not null) and v_text is distinct from v_current.remote_scope then
      v_changed := v_changed || jsonb_build_object('remote_scope', v_text); v_before := v_before || jsonb_build_object('remote_scope', v_current.remote_scope); v_after := v_after || jsonb_build_object('remote_scope', v_text); v_changed_fields := array_append(v_changed_fields, 'remote_scope');
    end if;
  end if;
  if p_patch ? 'remote' then
    if jsonb_typeof(p_patch->'remote') = 'null' then v_remote := null;
    elsif jsonb_typeof(p_patch->'remote') = 'boolean' then v_remote := (p_patch->>'remote')::boolean;
    else raise exception 'invalid_remote'; end if;
    if v_remote is distinct from v_current.remote then
      v_changed := v_changed || jsonb_build_object('remote', v_remote); v_before := v_before || jsonb_build_object('remote', v_current.remote); v_after := v_after || jsonb_build_object('remote', v_remote); v_changed_fields := array_append(v_changed_fields, 'remote');
    end if;
  end if;

  -- Other fields are enrichment-only: null and blank values never erase evidence.
  if p_patch ? 'title' then
    v_text := nullif(trim(p_patch->>'title'), '');
    if v_text is not null and v_text is distinct from v_current.title then v_changed := v_changed || jsonb_build_object('title', v_text); v_before := v_before || jsonb_build_object('title', v_current.title); v_after := v_after || jsonb_build_object('title', v_text); v_changed_fields := array_append(v_changed_fields, 'title'); end if;
  end if;
  if p_patch ? 'organization' then
    v_text := nullif(trim(p_patch->>'organization'), '');
    if v_text is not null and v_text is distinct from v_current.organization then v_changed := v_changed || jsonb_build_object('organization', v_text); v_before := v_before || jsonb_build_object('organization', v_current.organization); v_after := v_after || jsonb_build_object('organization', v_text); v_changed_fields := array_append(v_changed_fields, 'organization'); end if;
  end if;
  if p_patch ? 'description' then
    v_text := nullif(trim(p_patch->>'description'), '');
    if v_text is not null and v_text is distinct from v_current.description then v_changed := v_changed || jsonb_build_object('description', v_text); v_before := v_before || jsonb_build_object('description', v_current.description); v_after := v_after || jsonb_build_object('description', v_text); v_changed_fields := array_append(v_changed_fields, 'description'); end if;
  end if;
  if p_patch ? 'value' then
    v_text := nullif(trim(p_patch->>'value'), '');
    if v_text is not null and v_text is distinct from v_current.value then v_changed := v_changed || jsonb_build_object('value', v_text); v_before := v_before || jsonb_build_object('value', v_current.value); v_after := v_after || jsonb_build_object('value', v_text); v_changed_fields := array_append(v_changed_fields, 'value'); end if;
  end if;
  if p_patch ? 'currency' then
    v_text := nullif(upper(trim(p_patch->>'currency')), '');
    if v_text is not null and v_text is distinct from v_current.currency then v_changed := v_changed || jsonb_build_object('currency', v_text); v_before := v_before || jsonb_build_object('currency', v_current.currency); v_after := v_after || jsonb_build_object('currency', v_text); v_changed_fields := array_append(v_changed_fields, 'currency'); end if;
  end if;
  if p_patch ? 'published_at' then
    v_text := nullif(trim(p_patch->>'published_at'), ''); if v_text is not null then v_published_at := v_text::timestamptz; end if;
    if v_text is not null and v_published_at is distinct from v_current.published_at then v_changed := v_changed || jsonb_build_object('published_at', v_published_at); v_before := v_before || jsonb_build_object('published_at', v_current.published_at); v_after := v_after || jsonb_build_object('published_at', v_published_at); v_changed_fields := array_append(v_changed_fields, 'published_at'); end if;
  end if;
  if p_patch ? 'deadline' then
    v_text := nullif(trim(p_patch->>'deadline'), '');
    if v_text is not null and v_text is distinct from v_current.deadline then v_changed := v_changed || jsonb_build_object('deadline', v_text); v_before := v_before || jsonb_build_object('deadline', v_current.deadline); v_after := v_after || jsonb_build_object('deadline', v_text); v_changed_fields := array_append(v_changed_fields, 'deadline'); end if;
  end if;
  if p_patch ? 'application_url' then
    v_text := nullif(trim(p_patch->>'application_url'), '');
    if v_text is not null and v_text is distinct from v_current.application_url then v_changed := v_changed || jsonb_build_object('application_url', v_text); v_before := v_before || jsonb_build_object('application_url', v_current.application_url); v_after := v_after || jsonb_build_object('application_url', v_text); v_changed_fields := array_append(v_changed_fields, 'application_url'); end if;
  end if;
  if p_patch ? 'source_url' then
    v_text := nullif(trim(p_patch->>'source_url'), '');
    if v_text is not null and v_text is distinct from v_current.source_url then v_changed := v_changed || jsonb_build_object('source_url', v_text); v_before := v_before || jsonb_build_object('source_url', v_current.source_url); v_after := v_after || jsonb_build_object('source_url', v_text); v_changed_fields := array_append(v_changed_fields, 'source_url'); end if;
  end if;

  if cardinality(v_changed_fields) = 0 then
    return jsonb_build_object('changed', false, 'opportunity_id', v_current.id, 'changed_fields', v_changed_fields, 'updated_at', v_current.updated_at);
  end if;

  update public.opportunities set
    title = case when v_changed ? 'title' then v_changed->>'title' else title end,
    organization = case when v_changed ? 'organization' then v_changed->>'organization' else organization end,
    description = case when v_changed ? 'description' then v_changed->>'description' else description end,
    location = case when v_changed ? 'location' then v_changed->>'location' else location end,
    country_code = case when v_changed ? 'country_code' then v_changed->>'country_code' else country_code end,
    onsite_country = case when v_changed ? 'onsite_country' then v_changed->>'onsite_country' else onsite_country end,
    remote_scope = case when v_changed ? 'remote_scope' then v_changed->>'remote_scope' else remote_scope end,
    remote = case when v_changed ? 'remote' then (v_changed->>'remote')::boolean else remote end,
    value = case when v_changed ? 'value' then v_changed->>'value' else value end,
    currency = case when v_changed ? 'currency' then v_changed->>'currency' else currency end,
    published_at = case when v_changed ? 'published_at' then (v_changed->>'published_at')::timestamptz else published_at end,
    deadline = case when v_changed ? 'deadline' then v_changed->>'deadline' else deadline end,
    application_url = case when v_changed ? 'application_url' then v_changed->>'application_url' else application_url end,
    source_url = case when v_changed ? 'source_url' then v_changed->>'source_url' else source_url end
  where id = v_current.id
  returning * into v_updated;

  insert into public.opportunity_enrichment_events (
    opportunity_id, source, adapter_version, source_url, canonical_url,
    changed_fields, before_fields, after_fields, evidence
  ) values (
    v_current.id, v_current.source, nullif(trim(p_adapter_version), ''), nullif(trim(p_source_url), ''),
    nullif(trim(p_canonical_url), ''), v_changed_fields, v_before, v_after, coalesce(p_evidence, '{}'::jsonb)
  );

  return jsonb_build_object('changed', true, 'opportunity_id', v_updated.id, 'changed_fields', v_changed_fields, 'updated_at', v_updated.updated_at);
end;
$$;

revoke all on function public.apply_opportunity_enrichment_atomic(text,timestamptz,text,text,text,jsonb,jsonb) from public;
revoke all on function public.apply_opportunity_enrichment_atomic(text,timestamptz,text,text,text,jsonb,jsonb) from anon, authenticated;
grant execute on function public.apply_opportunity_enrichment_atomic(text,timestamptz,text,text,text,jsonb,jsonb) to service_role;
