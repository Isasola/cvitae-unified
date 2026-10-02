-- Local PostgreSQL integration test for Item 56.5C.
-- Run only against the local Supabase database after migrations, never against
-- production. The transaction is rolled back at the end.
\set ON_ERROR_STOP on
begin;

create or replace function pg_temp.assert(condition boolean, message text)
returns void language plpgsql as $$
begin
  if not coalesce(condition, false) then raise exception 'CANONICAL_DB_ASSERT: %', message; end if;
end;
$$;

do $$
declare
  v_id text := 'item56-canonical-' || substr(md5(clock_timestamp()::text), 1, 12);
  v_before timestamptz;
  v_result jsonb;
  v_row record;
  v_event record;
  v_error text;
  v_events_before integer;
begin
  insert into public.opportunities(id, title, organization, description, source, application_url, requirements, employment_type, deadline)
  values (v_id, 'Canonical fixture', 'Fixture Org', 'Existing factual description', 'fixture', 'https://fixture.invalid/' || v_id,
          '[{"text":"Existing requirement"}]'::jsonb, 'Existing type', '2026-09-30T00:00:00Z')
  returning updated_at into v_before;
  select count(*) into v_events_before from public.opportunity_enrichment_events where opportunity_id = v_id;

  select public.apply_opportunity_enrichment_atomic(
    v_id, v_before, 'fixture:v1', 'https://fixture.invalid/source', 'https://fixture.invalid/canonical',
    '{"requirements":[{"text":"English C1","category":"language"}],"employment_type":"Full-time","start_date":"2026-10-15","deadline":"2026-11-01T00:00:00Z"}'::jsonb,
    '{"method":"fixture","fields":["requirements","employment_type","start_date"]}'::jsonb
  ) into v_result;
  perform pg_temp.assert((v_result->>'changed')::boolean, 'success returns changed=true');

  select * into v_row from public.opportunities where id = v_id;
  perform pg_temp.assert(v_row.requirements = '[{"text":"English C1","category":"language"}]'::jsonb, 'requirements persisted canonically');
  perform pg_temp.assert(v_row.employment_type = 'Full-time', 'employment_type persisted');
  perform pg_temp.assert(v_row.start_date = date '2026-10-15', 'start_date persisted as date');
  perform pg_temp.assert(v_row.deadline = '2026-11-01T00:00:00Z', 'deadline persisted as factual text');
  perform pg_temp.assert((v_result->'changed_fields') ? 'requirements' and (v_result->'changed_fields') ? 'employment_type' and (v_result->'changed_fields') ? 'start_date', 'result lists canonical changed fields');

  select * into v_event from public.opportunity_enrichment_events where opportunity_id = v_id order by created_at desc limit 1;
  perform pg_temp.assert(v_event.changed_fields @> array['requirements','employment_type','start_date']::text[], 'event changed_fields contains canonical fields');
  perform pg_temp.assert(v_event.changed_fields @> array['deadline']::text[], 'event changed_fields contains deadline');
  perform pg_temp.assert(v_event.before_fields->>'employment_type' = 'Existing type', 'event before_fields records prior value');
  perform pg_temp.assert(v_event.before_fields->>'deadline' = '2026-09-30T00:00:00Z', 'event before_fields records prior deadline');
  perform pg_temp.assert(v_event.after_fields->>'employment_type' = 'Full-time', 'event after_fields records persisted value');
  perform pg_temp.assert(v_event.after_fields->>'deadline' = '2026-11-01T00:00:00Z', 'event after_fields records persisted deadline');
  perform pg_temp.assert((select count(*) from public.opportunity_enrichment_events where opportunity_id = v_id) = v_events_before + 1, 'success creates one enrichment event');

  -- Invalid scalar JSON types fail before UPDATE/event insertion.
  foreach v_error in array array['invalid_employment_type','invalid_duration_text','invalid_start_date_text'] loop
    begin
      if v_error = 'invalid_employment_type' then
        perform public.apply_opportunity_enrichment_atomic(v_id, (select updated_at from public.opportunities where id=v_id), 'fixture:v1', null, null, '{"employment_type":123}'::jsonb, '{}'::jsonb);
      elsif v_error = 'invalid_duration_text' then
        perform public.apply_opportunity_enrichment_atomic(v_id, (select updated_at from public.opportunities where id=v_id), 'fixture:v1', null, null, '{"duration_text":[]}'::jsonb, '{}'::jsonb);
      else
        perform public.apply_opportunity_enrichment_atomic(v_id, (select updated_at from public.opportunities where id=v_id), 'fixture:v1', null, null, '{"start_date_text":true}'::jsonb, '{}'::jsonb);
      end if;
      raise exception 'expected %', v_error;
    exception when others then
      perform pg_temp.assert(sqlerrm = v_error, 'invalid scalar raises ' || v_error);
    end;
  end loop;
  select * into v_row from public.opportunities where id = v_id;
  perform pg_temp.assert(v_row.employment_type = 'Full-time', 'invalid scalar does not mutate row');
  perform pg_temp.assert((select count(*) from public.opportunity_enrichment_events where opportunity_id = v_id) = v_events_before + 1, 'invalid scalar creates no partial event');

  -- Empty arrays and JSON null are evidence no-ops, not deletes.
  v_before := v_row.updated_at;
  select public.apply_opportunity_enrichment_atomic(v_id, v_before, 'fixture:v1', null, null, '{"requirements":[]}'::jsonb, '{}'::jsonb) into v_result;
  perform pg_temp.assert(not (v_result->>'changed')::boolean, 'empty requirements is no-op');
  perform pg_temp.assert((select requirements from public.opportunities where id=v_id) = '[{"text":"English C1","category":"language"}]'::jsonb, 'empty requirements does not delete');
  v_before := (select updated_at from public.opportunities where id=v_id);
  select public.apply_opportunity_enrichment_atomic(v_id, v_before, 'fixture:v1', null, null, '{"employment_type":null}'::jsonb, '{}'::jsonb) into v_result;
  perform pg_temp.assert(not (v_result->>'changed')::boolean, 'null employment_type is no-op');
  perform pg_temp.assert((select employment_type from public.opportunities where id=v_id) = 'Full-time', 'null employment_type does not delete');

  -- An old-contract field remains supported.
  v_before := (select updated_at from public.opportunities where id=v_id);
  select public.apply_opportunity_enrichment_atomic(v_id, v_before, 'fixture:v1', null, null, '{"description":"Updated factual description"}'::jsonb, '{}'::jsonb) into v_result;
  perform pg_temp.assert((select description from public.opportunities where id=v_id) = 'Updated factual description', 'legacy description still persists');

  -- Optimistic concurrency remains enforced and does not create an event.
  v_events_before := (select count(*) from public.opportunity_enrichment_events where opportunity_id=v_id);
  begin
    perform public.apply_opportunity_enrichment_atomic(v_id, timestamptz '2000-01-01', 'fixture:v1', null, null, '{"employment_type":"Should not persist"}'::jsonb, '{}'::jsonb);
    raise exception 'expected stale_opportunity';
  exception when others then
    perform pg_temp.assert(sqlerrm = 'stale_opportunity', 'wrong expected_updated_at raises stale_opportunity');
  end;
  perform pg_temp.assert((select employment_type from public.opportunities where id=v_id) = 'Full-time', 'stale call does not mutate row');
  perform pg_temp.assert((select count(*) from public.opportunity_enrichment_events where opportunity_id=v_id) = v_events_before, 'stale call creates no event');
end;
$$;

rollback;
select 'verify-canonical-opportunity-enrichment-database: PASS' as result;
