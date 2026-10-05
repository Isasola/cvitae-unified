-- READ ONLY. Operator runs this once after an authorized release.
-- One SELECT returns exactly one JSON document. No EXPLAIN ANALYZE, writes,
-- maintenance, or pg_stat_statements reset is performed.
with pgss as (
  select n.nspname as schema_name
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where c.relname = 'pg_stat_statements' and c.relkind in ('v', 'm')
  order by (n.nspname = 'public') desc
  limit 1
), statement_report as (
  select case
    when (select schema_name from pgss) is null then
      '<table><row><payload>{"available":false,"top_total_exec_time":[],"cvitae_top_total_exec_time":[]}</payload></row></table>'::xml
    else query_to_xml(format($query$
      select jsonb_build_object(
        'available', true,
        'top_total_exec_time', coalesce((
          select jsonb_agg(to_jsonb(q) order by q.total_exec_time desc)
          from (
            select queryid, query, calls, total_exec_time, mean_exec_time, rows,
                   shared_blks_hit, shared_blks_read, temp_blks_written
            from %I.pg_stat_statements
            order by total_exec_time desc
            limit 50
          ) q
        ), '[]'::jsonb),
        'cvitae_top_total_exec_time', coalesce((
          select jsonb_agg(to_jsonb(q) order by q.total_exec_time desc)
          from (
            select queryid, query, calls, total_exec_time, mean_exec_time, rows,
                   shared_blks_hit, shared_blks_read, temp_blks_written
            from %I.pg_stat_statements
            where query ~* '(opportunit|matching|factory|source|scraper|seo|alert|embedding|admin_)'
            order by total_exec_time desc
            limit 50
          ) q
        ), '[]'::jsonb)
      )::text as payload
    $query$, (select schema_name from pgss), (select schema_name from pgss)), false, true, '')
  end as document
), statement_json as (
  select coalesce((xpath('/table/row/payload/text()', document))[1]::text, '{"available":false}')::jsonb as value
  from statement_report
), cache as (
  select coalesce(sum(blks_hit), 0) as hit, coalesce(sum(blks_read), 0) as read
  from pg_catalog.pg_stat_database
  where datname = current_database()
), sizes as (
  select coalesce(jsonb_agg(to_jsonb(q) order by q.total_bytes desc), '[]'::jsonb) as value
  from (
    select schemaname, relname as table_name,
           pg_catalog.pg_relation_size(relid) as table_bytes,
           pg_catalog.pg_indexes_size(relid) as index_bytes,
           pg_catalog.pg_total_relation_size(relid) as total_bytes
    from pg_catalog.pg_stat_user_tables
    where schemaname = 'public'
    order by pg_catalog.pg_total_relation_size(relid) desc
    limit 25
  ) q
), indexes as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'schema', schemaname, 'table', tablename, 'index', indexname, 'definition', indexdef
  ) order by tablename, indexname), '[]'::jsonb) as value
  from pg_catalog.pg_indexes
  where schemaname = 'public'
    and tablename ~* '(opportunit|matching|factory|source_observation|ingestion|scraper_run|alert|embedding|profile|seo)'
)
select jsonb_build_object(
  'database', current_database(),
  'captured_at', clock_timestamp(),
  'connections', jsonb_build_object(
    'current_database_total', (select count(*) from pg_catalog.pg_stat_activity where datname = current_database()),
    'current_database_by_state', coalesce((
      select jsonb_object_agg(coalesce(state, 'unknown'), n)
      from (select state, count(*) n from pg_catalog.pg_stat_activity where datname = current_database() group by state) c
    ), '{}'::jsonb),
    'max_connections', current_setting('max_connections')::integer
  ),
  'cache', jsonb_build_object(
    'shared_blocks_hit', cache.hit,
    'shared_blocks_read', cache.read,
    'hit_percent', case when cache.hit + cache.read = 0 then null else round(100.0 * cache.hit / (cache.hit + cache.read), 4) end
  ),
  'largest_public_tables', sizes.value,
  'pg_stat_statements', statement_json.value,
  'relevant_existing_indexes', indexes.value
) as performance_prod_readonly;
