-- Item 56.5C: additive canonical opportunity facts.
-- Deliberately nullable: UNKNOWN/unsupported source evidence remains NULL.
ALTER TABLE public.opportunities
  ADD COLUMN IF NOT EXISTS requirements jsonb,
  ADD COLUMN IF NOT EXISTS responsibilities jsonb,
  ADD COLUMN IF NOT EXISTS benefits jsonb,
  ADD COLUMN IF NOT EXISTS duration_text text,
  ADD COLUMN IF NOT EXISTS start_date date,
  ADD COLUMN IF NOT EXISTS start_date_text text,
  ADD COLUMN IF NOT EXISTS employment_type text;

COMMENT ON COLUMN public.opportunities.requirements IS
  'Ordered factual requirement items: [{"text": string, "category": optional string}]. NULL when source evidence is unavailable.';
COMMENT ON COLUMN public.opportunities.responsibilities IS
  'Ordered factual responsibility items: [{"text": string}]. NULL when source does not provide structured evidence.';
COMMENT ON COLUMN public.opportunities.benefits IS
  'Ordered factual benefit items: [{"text": string}]. NULL when source does not provide structured evidence.';
COMMENT ON COLUMN public.opportunities.duration_text IS
  'Factual source duration text; never interpreted as an exact end date.';
COMMENT ON COLUMN public.opportunities.start_date IS
  'Explicit factual start date only; approximate phrases belong in start_date_text.';
COMMENT ON COLUMN public.opportunities.start_date_text IS
  'Factual non-date start wording such as Immediately or Expected October 2026.';
COMMENT ON COLUMN public.opportunities.employment_type IS
  'Normalized contractual/employment type, separate from remote/work arrangement and candidate eligibility.';

-- Keep the additive schema and its atomic writer in one release unit. This
-- definition supersedes the older whitelist-only RPC from 202609120005.
create or replace function public.apply_opportunity_enrichment_atomic(
  p_opportunity_id text, p_expected_updated_at timestamptz, p_adapter_version text,
  p_source_url text, p_canonical_url text, p_patch jsonb, p_evidence jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_current public.opportunities%rowtype; v_updated public.opportunities%rowtype;
  v_key text; v_text text; v_remote boolean; v_published_at timestamptz; v_date date;
  v_item jsonb; v_items jsonb; v_item_text text; v_category text;
  v_changed jsonb := '{}'::jsonb; v_before jsonb := '{}'::jsonb; v_after jsonb := '{}'::jsonb;
  v_changed_fields text[] := '{}'::text[]; v_countries text[]; v_regions text[]; v_current_countries text[]; v_current_regions text[];
begin
  if p_expected_updated_at is null then raise exception 'expected_updated_at_required'; end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then raise exception 'invalid_enrichment_patch'; end if;
  if p_evidence is not null and jsonb_typeof(p_evidence) <> 'object' then raise exception 'invalid_enrichment_evidence'; end if;
  if octet_length(coalesce(p_evidence, '{}'::jsonb)::text) > 16384 then raise exception 'enrichment_evidence_too_large'; end if;
  for v_key in select jsonb_object_keys(p_patch) loop
    if v_key not in ('title','organization','description','location','country_code','onsite_country','remote_scope','remote','value','currency','published_at','deadline','application_url','source_url','eligible_countries','eligible_regions','requirements','responsibilities','benefits','duration_text','start_date','start_date_text','employment_type') then raise exception 'unsupported_enrichment_field: %', v_key; end if;
  end loop;
  select * into v_current from public.opportunities where id = p_opportunity_id for update;
  if not found then raise exception 'opportunity_not_found'; end if;
  if v_current.updated_at is distinct from p_expected_updated_at then raise exception 'stale_opportunity'; end if;

  foreach v_key in array array['location','country_code','onsite_country','remote_scope'] loop
    if p_patch ? v_key then
      v_text := nullif(trim(p_patch->>v_key), '');
      if jsonb_typeof(p_patch->v_key) = 'null' then v_text := null;
      elsif v_key in ('country_code','onsite_country') then v_text := upper(v_text); if v_text !~ '^[A-Z]{2}$' then raise exception 'invalid_%', v_key; end if;
      elsif v_key = 'remote_scope' then v_text := upper(v_text); if v_text not in ('WORLDWIDE','LATAM','REGIONAL','COUNTRY_SPECIFIC','ONSITE','HYBRID','UNKNOWN') then raise exception 'invalid_remote_scope'; end if; end if;
      if (jsonb_typeof(p_patch->v_key) = 'null' or v_text is not null) and v_text is distinct from (to_jsonb(v_current)->>v_key) then v_changed := v_changed || jsonb_build_object(v_key,v_text); v_before := v_before || jsonb_build_object(v_key,to_jsonb(v_current)->v_key); v_after := v_after || jsonb_build_object(v_key,v_text); v_changed_fields := array_append(v_changed_fields,v_key); end if;
    end if;
  end loop;
  if p_patch ? 'remote' then
    if jsonb_typeof(p_patch->'remote')='null' then v_remote:=null; elsif jsonb_typeof(p_patch->'remote')='boolean' then v_remote:=(p_patch->>'remote')::boolean; else raise exception 'invalid_remote'; end if;
    if v_remote is distinct from v_current.remote then v_changed:=v_changed||jsonb_build_object('remote',v_remote); v_before:=v_before||jsonb_build_object('remote',v_current.remote); v_after:=v_after||jsonb_build_object('remote',v_remote); v_changed_fields:=array_append(v_changed_fields,'remote'); end if;
  end if;
  foreach v_key in array array['title','organization','description','value','currency','deadline','application_url','source_url'] loop
    if p_patch ? v_key then v_text:=nullif(trim(p_patch->>v_key),''); if v_key='currency' then v_text:=upper(v_text); end if; if v_text is not null and v_text is distinct from (to_jsonb(v_current)->>v_key) then v_changed:=v_changed||jsonb_build_object(v_key,v_text); v_before:=v_before||jsonb_build_object(v_key,to_jsonb(v_current)->v_key); v_after:=v_after||jsonb_build_object(v_key,v_text); v_changed_fields:=array_append(v_changed_fields,v_key); end if; end if;
  end loop;
  if p_patch ? 'published_at' then v_text:=nullif(trim(p_patch->>'published_at'),''); if v_text is not null then begin v_published_at:=v_text::timestamptz; exception when others then raise exception 'invalid_published_at'; end; if v_published_at is distinct from v_current.published_at then v_changed:=v_changed||jsonb_build_object('published_at',v_published_at); v_before:=v_before||jsonb_build_object('published_at',v_current.published_at); v_after:=v_after||jsonb_build_object('published_at',v_published_at); v_changed_fields:=array_append(v_changed_fields,'published_at'); end if; end if; end if;
  if p_patch ? 'eligible_countries' and jsonb_typeof(p_patch->'eligible_countries') <> 'null' then
    if jsonb_typeof(p_patch->'eligible_countries') <> 'array' then raise exception 'invalid_eligible_countries'; end if; if jsonb_array_length(p_patch->'eligible_countries') > 100 then raise exception 'eligible_countries_too_many'; end if; if exists(select 1 from jsonb_array_elements(p_patch->'eligible_countries') item where jsonb_typeof(item) <> 'string') then raise exception 'invalid_eligible_country'; end if;
    select coalesce(array_agg(value order by value),'{}'::text[]) into v_countries from (select distinct upper(trim(value)) value from jsonb_array_elements_text(p_patch->'eligible_countries') where trim(value) <> '') s; if exists(select 1 from unnest(v_countries) value where value !~ '^[A-Z]{2}$') then raise exception 'invalid_eligible_country'; end if;
    select coalesce(array_agg(value order by value),'{}'::text[]) into v_current_countries from (select distinct upper(trim(value)) value from unnest(v_current.eligible_countries) value where trim(value) <> '') s; if cardinality(v_countries)>0 and v_countries is distinct from v_current_countries then v_changed:=v_changed||jsonb_build_object('eligible_countries',to_jsonb(v_countries)); v_before:=v_before||jsonb_build_object('eligible_countries',to_jsonb(v_current_countries)); v_after:=v_after||jsonb_build_object('eligible_countries',to_jsonb(v_countries)); v_changed_fields:=array_append(v_changed_fields,'eligible_countries'); end if;
  end if;
  if p_patch ? 'eligible_regions' and jsonb_typeof(p_patch->'eligible_regions') <> 'null' then
    if jsonb_typeof(p_patch->'eligible_regions') <> 'array' then raise exception 'invalid_eligible_regions'; end if; if jsonb_array_length(p_patch->'eligible_regions') > 50 then raise exception 'eligible_regions_too_many'; end if; if exists(select 1 from jsonb_array_elements(p_patch->'eligible_regions') item where jsonb_typeof(item) <> 'string') then raise exception 'invalid_eligible_region'; end if;
    select coalesce(array_agg(value order by value),'{}'::text[]) into v_regions from (select distinct upper(trim(value)) value from jsonb_array_elements_text(p_patch->'eligible_regions') where trim(value) <> '') s; if exists(select 1 from unnest(v_regions) value where length(value)>80) then raise exception 'invalid_eligible_region'; end if;
    select coalesce(array_agg(value order by value),'{}'::text[]) into v_current_regions from (select distinct upper(trim(value)) value from unnest(v_current.eligible_regions) value where trim(value) <> '') s; if cardinality(v_regions)>0 and v_regions is distinct from v_current_regions then v_changed:=v_changed||jsonb_build_object('eligible_regions',to_jsonb(v_regions)); v_before:=v_before||jsonb_build_object('eligible_regions',to_jsonb(v_current_regions)); v_after:=v_after||jsonb_build_object('eligible_regions',to_jsonb(v_regions)); v_changed_fields:=array_append(v_changed_fields,'eligible_regions'); end if;
  end if;

  foreach v_key in array array['requirements','responsibilities','benefits'] loop
    if p_patch ? v_key and jsonb_typeof(p_patch->v_key) <> 'null' then
      if jsonb_typeof(p_patch->v_key) <> 'array' then raise exception 'invalid_%', v_key; end if; if jsonb_array_length(p_patch->v_key) > 100 then raise exception '%_too_many', v_key; end if;
      v_items := '[]'::jsonb;
      for v_item in select value from jsonb_array_elements(p_patch->v_key) loop
        if jsonb_typeof(v_item) <> 'object' or jsonb_typeof(v_item->'text') <> 'string' then raise exception 'invalid_%', v_key; end if; v_item_text := nullif(trim(v_item->>'text'), ''); if v_item_text is null then raise exception 'invalid_%', v_key; end if;
        if v_key = 'requirements' then
          if v_item ? 'category' and jsonb_typeof(v_item->'category') <> 'string' then raise exception 'invalid_requirements'; end if; v_category := nullif(trim(v_item->>'category'), ''); if v_category is null then v_items := v_items || jsonb_build_array(jsonb_build_object('text',v_item_text)); else v_items := v_items || jsonb_build_array(jsonb_build_object('text',v_item_text,'category',v_category)); end if;
        else v_items := v_items || jsonb_build_array(jsonb_build_object('text',v_item_text)); end if;
      end loop;
      if jsonb_array_length(v_items)>0 and v_items is distinct from (to_jsonb(v_current)->v_key) then v_changed:=v_changed||jsonb_build_object(v_key,v_items); v_before:=v_before||jsonb_build_object(v_key,to_jsonb(v_current)->v_key); v_after:=v_after||jsonb_build_object(v_key,v_items); v_changed_fields:=array_append(v_changed_fields,v_key); end if;
    end if;
  end loop;
  foreach v_key in array array['duration_text','start_date_text','employment_type'] loop
    if p_patch ? v_key then
      if jsonb_typeof(p_patch->v_key) = 'null' then continue; end if;
      if jsonb_typeof(p_patch->v_key) <> 'string' then raise exception 'invalid_%', v_key; end if;
      v_text:=nullif(trim(p_patch->>v_key),'');
      if v_text is not null and v_text is distinct from (to_jsonb(v_current)->>v_key) then v_changed:=v_changed||jsonb_build_object(v_key,v_text); v_before:=v_before||jsonb_build_object(v_key,to_jsonb(v_current)->v_key); v_after:=v_after||jsonb_build_object(v_key,v_text); v_changed_fields:=array_append(v_changed_fields,v_key); end if;
    end if;
  end loop;
  if p_patch ? 'start_date' and jsonb_typeof(p_patch->'start_date') <> 'null' then
    v_text:=nullif(trim(p_patch->>'start_date'),''); if v_text is not null and v_text !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'invalid_start_date'; end if;
    if v_text is not null then begin v_date:=v_text::date; exception when others then raise exception 'invalid_start_date'; end; if v_date is distinct from v_current.start_date then v_changed:=v_changed||jsonb_build_object('start_date',v_date); v_before:=v_before||jsonb_build_object('start_date',v_current.start_date); v_after:=v_after||jsonb_build_object('start_date',v_date); v_changed_fields:=array_append(v_changed_fields,'start_date'); end if; end if;
  end if;
  if cardinality(v_changed_fields)=0 then return jsonb_build_object('changed',false,'opportunity_id',v_current.id,'changed_fields',v_changed_fields,'updated_at',v_current.updated_at); end if;
  update public.opportunities set
    title=case when v_changed?'title' then v_changed->>'title' else title end, organization=case when v_changed?'organization' then v_changed->>'organization' else organization end, description=case when v_changed?'description' then v_changed->>'description' else description end, location=case when v_changed?'location' then v_changed->>'location' else location end, country_code=case when v_changed?'country_code' then v_changed->>'country_code' else country_code end, onsite_country=case when v_changed?'onsite_country' then v_changed->>'onsite_country' else onsite_country end, remote_scope=case when v_changed?'remote_scope' then v_changed->>'remote_scope' else remote_scope end, remote=case when v_changed?'remote' then (v_changed->>'remote')::boolean else remote end, value=case when v_changed?'value' then v_changed->>'value' else value end, currency=case when v_changed?'currency' then v_changed->>'currency' else currency end, published_at=case when v_changed?'published_at' then (v_changed->>'published_at')::timestamptz else published_at end, deadline=case when v_changed?'deadline' then v_changed->>'deadline' else deadline end, application_url=case when v_changed?'application_url' then v_changed->>'application_url' else application_url end, source_url=case when v_changed?'source_url' then v_changed->>'source_url' else source_url end, eligible_countries=case when v_changed?'eligible_countries' then array(select jsonb_array_elements_text(v_changed->'eligible_countries')) else eligible_countries end, eligible_regions=case when v_changed?'eligible_regions' then array(select jsonb_array_elements_text(v_changed->'eligible_regions')) else eligible_regions end,
    requirements=case when v_changed?'requirements' then v_changed->'requirements' else requirements end, responsibilities=case when v_changed?'responsibilities' then v_changed->'responsibilities' else responsibilities end, benefits=case when v_changed?'benefits' then v_changed->'benefits' else benefits end, duration_text=case when v_changed?'duration_text' then v_changed->>'duration_text' else duration_text end, start_date=case when v_changed?'start_date' then (v_changed->>'start_date')::date else start_date end, start_date_text=case when v_changed?'start_date_text' then v_changed->>'start_date_text' else start_date_text end, employment_type=case when v_changed?'employment_type' then v_changed->>'employment_type' else employment_type end
  where id=v_current.id returning * into v_updated;
  insert into public.opportunity_enrichment_events(opportunity_id,source,adapter_version,source_url,canonical_url,changed_fields,before_fields,after_fields,evidence) values(v_current.id,v_current.source,nullif(trim(p_adapter_version),''),nullif(trim(p_source_url),''),nullif(trim(p_canonical_url),''),v_changed_fields,v_before,v_after,coalesce(p_evidence,'{}'::jsonb));
  return jsonb_build_object('changed',true,'opportunity_id',v_updated.id,'changed_fields',v_changed_fields,'updated_at',v_updated.updated_at);
end; $$;
revoke all on function public.apply_opportunity_enrichment_atomic(text,timestamptz,text,text,text,jsonb,jsonb) from public;
revoke all on function public.apply_opportunity_enrichment_atomic(text,timestamptz,text,text,text,jsonb,jsonb) from anon, authenticated;
grant execute on function public.apply_opportunity_enrichment_atomic(text,timestamptz,text,text,text,jsonb,jsonb) to service_role;
