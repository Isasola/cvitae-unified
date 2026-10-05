-- Execute once in Supabase SQL Editor. One statement, one row, one JSONB column.
-- Reads persisted canonical decisions; does not recompute gates or invoke write RPCs.
-- Optional objects are resolved from catalogs before SELECT-only dynamic reads.
-- Statistics are cumulative since their reported reset, not a load-test measurement.
WITH RECURSIVE
wanted(name) AS (
  VALUES ('public.opportunities'), ('public.opportunity_pipeline_status'),
         ('public.opportunity_universe_state'), ('public.opportunity_universe_dirty_sources'),
         ('public.opportunity_sources'), ('public.opportunity_source_identity_aliases'),
         ('public.opportunity_source_consumer_permissions')
), relations AS (
  SELECT name, to_regclass(name)::oid AS oid FROM wanted
), dependencies(root_oid, oid) AS (
  SELECT oid, oid FROM relations WHERE oid IS NOT NULL
  UNION
  SELECT d.root_oid, dep.refobjid
  FROM dependencies d
  JOIN pg_catalog.pg_rewrite rw ON rw.ev_class = d.oid
  JOIN pg_catalog.pg_depend dep ON dep.classid = 'pg_rewrite'::regclass
    AND dep.objid = rw.oid AND dep.refclassid = 'pg_class'::regclass
  JOIN pg_catalog.pg_class c ON c.oid = dep.refobjid
  WHERE c.relkind IN ('r','p','v','m','f')
), readable AS (
  SELECT r.name, r.oid,
    r.oid IS NOT NULL AND coalesce(bool_and(has_table_privilege(d.oid, 'SELECT')), false)
    AND NOT EXISTS (SELECT 1 FROM dependencies sd
      JOIN pg_catalog.pg_class sc ON sc.oid=sd.oid
      WHERE sd.root_oid=r.oid AND NOT has_schema_privilege(sc.relnamespace,'USAGE'))
    AND NOT EXISTS (SELECT 1 FROM dependencies fd
      JOIN pg_catalog.pg_rewrite rw ON rw.ev_class=fd.oid
      JOIN pg_catalog.pg_depend dep ON dep.classid='pg_rewrite'::regclass AND dep.objid=rw.oid
        AND dep.refclassid='pg_proc'::regclass
      WHERE fd.root_oid=r.oid AND NOT has_function_privilege(dep.refobjid,'EXECUTE')) AS available
  FROM relations r LEFT JOIN dependencies d ON d.root_oid = r.oid
  GROUP BY r.name, r.oid
), required_pipeline_columns(name) AS (
  VALUES ('canonical_source'), ('lifecycle_state'), ('source_operational_state'),
    ('source_permission_states'), ('consumer_switch_states'),
    ('catalog_row_state'), ('catalog_state'), ('catalog_reason'),
    ('matching_row_state'), ('source_matching_state'), ('source_matching_operational_state'),
    ('final_matching_state'), ('matching_reason'),
    ('alerts_row_state'), ('alerts_state'), ('alerts_reason'),
    ('seo_row_state'), ('seo_state'), ('seo_reason')
), pipeline_guard AS (
  SELECT r.available AND NOT EXISTS (
    SELECT 1 FROM required_pipeline_columns k
    WHERE NOT EXISTS (SELECT 1 FROM pg_catalog.pg_attribute a
      WHERE a.attrelid = r.oid AND a.attname = k.name AND a.attnum > 0 AND NOT a.attisdropped
        AND (k.name NOT IN ('source_permission_states','consumer_switch_states')
          OR a.atttypid IN ('json'::regtype,'jsonb'::regtype)))
  ) AS available,
  coalesce((SELECT jsonb_agg(k.name ORDER BY k.name) FROM required_pipeline_columns k
    WHERE NOT EXISTS (SELECT 1 FROM pg_catalog.pg_attribute a
      WHERE a.attrelid = r.oid AND a.attname = k.name AND a.attnum > 0 AND NOT a.attisdropped
        AND (k.name NOT IN ('source_permission_states','consumer_switch_states')
          OR a.atttypid IN ('json'::regtype,'jsonb'::regtype)))), '[]'::jsonb) AS missing_columns
  FROM readable r WHERE r.name = 'public.opportunity_pipeline_status'
), inventory_document AS MATERIALIZED (
  SELECT query_to_xml(CASE WHEN available THEN
    'SELECT jsonb_build_object(''AVAILABLE'',true,''INVENTORY_TOTAL'',count(*))::text AS payload FROM public.opportunities'
    ELSE 'SELECT ''{"AVAILABLE":false,"STATUS":"NOT_AVAILABLE","INVENTORY_TOTAL":null}''::text AS payload'
    END, false, false, '') AS doc
  FROM readable WHERE name = 'public.opportunities'
), inventory AS (
  SELECT x.payload::jsonb AS value FROM inventory_document,
    XMLTABLE('/table/row' PASSING doc COLUMNS payload text PATH 'payload') x
), pipeline_document AS MATERIALIZED (
  SELECT query_to_xml(CASE WHEN available THEN $pipeline$
    WITH p AS MATERIALIZED (
      SELECT canonical_source::text AS canonical_source, lifecycle_state::text AS lifecycle_state,
        source_operational_state::text AS source_operational_state,
        source_permission_states::jsonb AS source_permission_states, consumer_switch_states::jsonb AS consumer_switch_states,
        catalog_row_state::text AS catalog_row_state, catalog_state::text AS catalog_state, catalog_reason::text AS catalog_reason,
        matching_row_state::text AS matching_row_state, source_matching_state::text AS source_matching_state,
        source_matching_operational_state::text AS source_matching_operational_state,
        final_matching_state::text AS final_matching_state, matching_reason::text AS matching_reason,
        alerts_row_state::text AS alerts_row_state, alerts_state::text AS alerts_state, alerts_reason::text AS alerts_reason,
        seo_row_state::text AS seo_row_state, seo_state::text AS seo_state, seo_reason::text AS seo_reason
      FROM public.opportunity_pipeline_status
    ), base AS (
      SELECT coalesce(nullif(canonical_source,''),'UNKNOWN') AS canonical_source,
        count(*) AS inventory, count(*) FILTER (WHERE lifecycle_state='ACTIVE_VALID') AS lifecycle_ready,
        count(*) FILTER (WHERE lifecycle_state='LIFECYCLE_UNKNOWN') AS lifecycle_unknown,
        count(*) FILTER (WHERE lifecycle_state='EXPIRED') AS expired,
        count(*) FILTER (WHERE lifecycle_state='HARD_DEAD') AS hard_dead,
        count(*) FILTER (WHERE lifecycle_state='STALE_DERIVED_STATE') AS stale_inconsistent
      FROM p GROUP BY 1
    ), consumers AS MATERIALIZED (
      SELECT coalesce(nullif(p.canonical_source,''),'UNKNOWN') AS canonical_source,
        p.source_operational_state AS global_switch, c.*
      FROM p CROSS JOIN LATERAL (VALUES
        ('catalog',catalog_row_state,catalog_state,source_permission_states->>'catalog',consumer_switch_states->>'catalog',catalog_reason),
        ('matching',matching_row_state,final_matching_state,source_matching_state,source_matching_operational_state,matching_reason),
        ('alerts',alerts_row_state,alerts_state,source_permission_states->>'alerts',consumer_switch_states->>'alerts',alerts_reason),
        ('seo',seo_row_state,seo_state,source_permission_states->>'seo',consumer_switch_states->>'seo',seo_reason)
      ) c(consumer,row_state,final_state,permission,switch,reason)
    ), grouped AS (
      SELECT canonical_source, consumer, count(*) FILTER (WHERE row_state='READY') AS row_ready,
        count(*) FILTER (WHERE final_state='READY') AS final_ready,
        count(*) FILTER (WHERE permission='ALLOWED') AS source_allowed,
        count(*) FILTER (WHERE global_switch='ENABLED') AS source_global_enabled,
        count(*) FILTER (WHERE switch='ALLOWED') AS consumer_switch_allowed,
        CASE WHEN count(DISTINCT coalesce(permission,'NOT_AVAILABLE'))=1
          THEN min(coalesce(permission,'NOT_AVAILABLE')) ELSE 'MIXED_PERSISTED_STATES' END AS permission,
        CASE WHEN count(DISTINCT coalesce(switch,'NOT_AVAILABLE'))=1
          THEN min(coalesce(switch,'NOT_AVAILABLE')) ELSE 'MIXED_PERSISTED_STATES' END AS switch
      FROM consumers GROUP BY GROUPING SETS ((canonical_source,consumer),(consumer))
    ), state_counts AS (
      SELECT canonical_source,consumer,dimension,state,count(*) n
      FROM consumers CROSS JOIN LATERAL (VALUES
        ('row',coalesce(row_state,'NOT_AVAILABLE')),
        ('permission',coalesce(permission,'NOT_AVAILABLE')),
        ('source_switch',coalesce(global_switch,'NOT_AVAILABLE')),
        ('consumer_switch',coalesce(switch,'NOT_AVAILABLE'))
      ) v(dimension,state)
      GROUP BY GROUPING SETS ((canonical_source,consumer,dimension,state),(consumer,dimension,state))
    ), state_maps AS (
      SELECT canonical_source,consumer,dimension,jsonb_object_agg(state,n) value
      FROM state_counts GROUP BY canonical_source,consumer,dimension
    ), consumer_state_maps AS (
      SELECT canonical_source,consumer,jsonb_object_agg(dimension||'_state_counts',value) value
      FROM state_maps GROUP BY canonical_source,consumer
    ), blocked AS (
      SELECT canonical_source,consumer,coalesce(nullif(reason,''),'NOT_AVAILABLE') reason
      FROM consumers WHERE final_state IS DISTINCT FROM 'READY'
    ), reason_counts AS (
      SELECT canonical_source,consumer,reason,count(*) n FROM blocked
      GROUP BY GROUPING SETS ((canonical_source,consumer,reason),(consumer,reason))
    ), reason_maps AS (
      SELECT canonical_source,consumer,jsonb_object_agg(reason,n) value,
        (array_agg(reason ORDER BY n DESC,reason))[1] top_block
      FROM reason_counts GROUP BY canonical_source,consumer
    ), metrics AS (
      SELECT g.*,sm.value state_maps,coalesce(rm.value,'{}'::jsonb) blocking_reasons,rm.top_block
      FROM grouped g JOIN consumer_state_maps sm
        ON sm.canonical_source IS NOT DISTINCT FROM g.canonical_source AND sm.consumer=g.consumer
      LEFT JOIN reason_maps rm
        ON rm.canonical_source IS NOT DISTINCT FROM g.canonical_source AND rm.consumer=g.consumer
    ), source_consumers AS (
      SELECT canonical_source,
        jsonb_object_agg(consumer||'_row_ready',to_jsonb(row_ready)) ||
        jsonb_object_agg(consumer||'_final_ready',to_jsonb(final_ready)) ||
        jsonb_object_agg(consumer||'_permission',to_jsonb(permission)) ||
        jsonb_object_agg(consumer||'_switch',to_jsonb(switch)) ||
        jsonb_object_agg('dominant_'||consumer||'_block',to_jsonb(top_block)) ||
        jsonb_object_agg(consumer||'_permission_counts',state_maps->'permission_state_counts') ||
        jsonb_object_agg(consumer||'_switch_counts',state_maps->'consumer_switch_state_counts') ||
        jsonb_object_agg(consumer||'_blocking_reasons',blocking_reasons) ||
        jsonb_build_object('source_global_switch_counts',min((state_maps->'source_switch_state_counts')::text)::jsonb) AS value
      FROM metrics WHERE canonical_source IS NOT NULL GROUP BY canonical_source
    ), global_consumers AS (
      SELECT cn.consumer,jsonb_build_object('row_ready',coalesce(m.row_ready,0),
        'source_allowed',coalesce(m.source_allowed,0),'source_global_enabled',coalesce(m.source_global_enabled,0),
        'consumer_switch_allowed',coalesce(m.consumer_switch_allowed,0),'final_ready',coalesce(m.final_ready,0),
        'first_blocking_reason_counts',coalesce(m.blocking_reasons,'{}'::jsonb),'top_block',m.top_block
      )||coalesce(m.state_maps,'{}'::jsonb) AS value
      FROM (VALUES ('catalog'),('matching'),('alerts'),('seo')) cn(consumer)
      LEFT JOIN metrics m ON m.canonical_source IS NULL AND m.consumer=cn.consumer
    )
    SELECT jsonb_build_object('AVAILABLE',true,'authority','public.opportunity_pipeline_status',
      'PIPELINE_ROWS',(SELECT count(*) FROM p),
      'lifecycle',(SELECT jsonb_build_object('ready_alive',count(*) FILTER (WHERE lifecycle_state='ACTIVE_VALID'),
        'unknown',count(*) FILTER (WHERE lifecycle_state='LIFECYCLE_UNKNOWN'),
        'expired',count(*) FILTER (WHERE lifecycle_state='EXPIRED'),
        'hard_dead',count(*) FILTER (WHERE lifecycle_state='HARD_DEAD'),
        'stale_inconsistent',count(*) FILTER (WHERE lifecycle_state='STALE_DERIVED_STATE'),
        'all_state_counts',coalesce((SELECT jsonb_object_agg(state,n) FROM (
          SELECT coalesce(lifecycle_state,'NOT_AVAILABLE') state,count(*) n FROM p GROUP BY 1) t),'{}'::jsonb)) FROM p),
      'consumers',coalesce((SELECT jsonb_object_agg(consumer,value) FROM global_consumers),'{}'::jsonb),
      'per_source',coalesce((SELECT jsonb_agg(to_jsonb(b)||s.value ORDER BY b.inventory DESC,b.canonical_source)
        FROM base b JOIN source_consumers s USING(canonical_source)),'[]'::jsonb)
    )::text AS payload
  $pipeline$ ELSE 'SELECT ''{"AVAILABLE":false,"STATUS":"NOT_AVAILABLE","PIPELINE_ROWS":null,"consumers":{},"per_source":[]}''::text AS payload'
  END,false,false,'') AS doc FROM pipeline_guard
), pipeline AS MATERIALIZED (
  SELECT x.payload::jsonb || jsonb_build_object('missing_columns',g.missing_columns) AS value
  FROM pipeline_document CROSS JOIN pipeline_guard g,
    XMLTABLE('/table/row' PASSING doc COLUMNS payload text PATH 'payload') x
), dirty_document AS MATERIALIZED (
  SELECT query_to_xml(CASE WHEN available THEN
    'SELECT jsonb_build_object(''AVAILABLE'',true,''queued_sources'',count(*))::text AS payload FROM public.opportunity_universe_dirty_sources'
    ELSE 'SELECT ''{"AVAILABLE":false,"STATUS":"NOT_AVAILABLE"}''::text AS payload' END,false,false,'') AS doc
  FROM readable WHERE name='public.opportunity_universe_dirty_sources'
), dirty AS (
  SELECT x.payload::jsonb AS value FROM dirty_document,
    XMLTABLE('/table/row' PASSING doc COLUMNS payload text PATH 'payload') x
), universe_document AS MATERIALIZED (
  SELECT query_to_xml(CASE WHEN available THEN $universe$
    SELECT jsonb_build_object('AVAILABLE',true,'rows',count(*),
      'oldest_evaluated_at',min(to_jsonb(u)->>'evaluated_at'),
      'newest_evaluated_at',max(to_jsonb(u)->>'evaluated_at'),
      'professional_readiness_counts',coalesce((SELECT jsonb_object_agg(state,n) FROM (
        SELECT coalesce(to_jsonb(s)->>'professional_readiness','NOT_AVAILABLE') state,count(*) n
        FROM public.opportunity_universe_state s GROUP BY 1) t),'{}'::jsonb)
    )::text AS payload FROM public.opportunity_universe_state u
  $universe$ ELSE 'SELECT ''{"AVAILABLE":false,"STATUS":"NOT_AVAILABLE"}''::text AS payload' END,false,false,'') AS doc
  FROM readable WHERE name='public.opportunity_universe_state'
), universe AS (
  SELECT x.payload::jsonb AS value FROM universe_document,
    XMLTABLE('/table/row' PASSING doc COLUMNS payload text PATH 'payload') x
), policy_guard AS (
  SELECT (SELECT available FROM pipeline_guard)
    AND (SELECT bool_and(available) FROM readable WHERE name IN (
      'public.opportunity_sources','public.opportunity_source_identity_aliases','public.opportunity_source_consumer_permissions'))
    AND EXISTS (SELECT 1 FROM pg_catalog.pg_proc p
      WHERE p.oid=to_regprocedure('public.canonical_opportunity_source_policy(text)')
        AND p.provolatile='s' AND p.prorettype='jsonb'::regtype AND has_function_privilege(p.oid,'EXECUTE'))
    AND NOT EXISTS (SELECT 1 FROM (VALUES
      ('public.opportunity_sources','source'),('public.opportunity_sources','is_enabled'),
      ('public.opportunity_sources','matching_enabled'),('public.opportunity_sources','catalog_enabled'),
      ('public.opportunity_sources','alerts_enabled'),('public.opportunity_sources','seo_enabled'),
      ('public.opportunity_source_identity_aliases','emitted_source'),('public.opportunity_source_identity_aliases','canonical_source'),
      ('public.opportunity_source_consumer_permissions','canonical_source'),
      ('public.opportunity_source_consumer_permissions','consumer'),
      ('public.opportunity_source_consumer_permissions','permission_state')) k(relation_name,column_name)
      WHERE NOT EXISTS (SELECT 1 FROM pg_catalog.pg_attribute a
        WHERE a.attrelid=to_regclass(k.relation_name) AND a.attname=k.column_name AND a.attnum>0 AND NOT a.attisdropped))
    AS available
), policy_document AS MATERIALIZED (
  SELECT query_to_xml(CASE WHEN g.available THEN format($policy$
    SELECT jsonb_build_object('AVAILABLE',true,
      'authority','canonical_opportunity_source_policy(text) + opportunity_source_consumer_permissions',
      'scope','Current source settings; separate from persisted consumer decisions above.',
      'per_source',coalesce(jsonb_agg(jsonb_build_object('canonical_source',s.canonical_source,
        'operational_policy',public.canonical_opportunity_source_policy(s.canonical_source),
        'permission_rows',coalesce((SELECT jsonb_agg(jsonb_build_object(
          'consumer',to_jsonb(cp)->>'consumer','permission_state',to_jsonb(cp)->>'permission_state',
          'reason',left(to_jsonb(cp)->>'reason',300),'provenance',left(to_jsonb(cp)->>'provenance',300))
          ORDER BY to_jsonb(cp)->>'consumer') FROM public.opportunity_source_consumer_permissions cp
          WHERE to_jsonb(cp)->>'canonical_source'=s.canonical_source),'[]'::jsonb)
      ) ORDER BY s.canonical_source),'[]'::jsonb))::text AS payload
    FROM (SELECT item->>'canonical_source' AS canonical_source FROM jsonb_array_elements(%L::jsonb) item) s
  $policy$,coalesce(p.value->'per_source','[]'::jsonb)::text)
  ELSE 'SELECT ''{"AVAILABLE":false,"STATUS":"NOT_AVAILABLE"}''::text AS payload'
  END,false,false,'') AS doc FROM policy_guard g CROSS JOIN pipeline p
), policy AS (
  SELECT x.payload::jsonb AS value FROM policy_document,
    XMLTABLE('/table/row' PASSING doc COLUMNS payload text PATH 'payload') x
), pgss_relation AS (
  SELECT c.oid,n.nspname,c.relname FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  WHERE c.relname='pg_stat_statements' AND c.relkind='v'
    AND has_table_privilege(c.oid,'SELECT')
    AND has_schema_privilege(c.relnamespace,'USAGE')
    AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_rewrite rw
      JOIN pg_catalog.pg_depend dep ON dep.classid='pg_rewrite'::regclass AND dep.objid=rw.oid
        AND dep.refclassid='pg_proc'::regclass
      WHERE rw.ev_class=c.oid AND NOT has_function_privilege(dep.refobjid,'EXECUTE'))
    AND EXISTS (SELECT 1 FROM pg_catalog.pg_settings
      WHERE name='shared_preload_libraries' AND setting ~ '(^|[, ])pg_stat_statements([, ]|$)')
    AND NOT EXISTS (SELECT 1 FROM (VALUES ('query'),('queryid'),('calls'),('total_exec_time'),
      ('mean_exec_time'),('rows'),('shared_blks_hit'),('shared_blks_read'),('temp_blks_written')) k(name)
      WHERE NOT EXISTS (SELECT 1 FROM pg_catalog.pg_attribute a
        WHERE a.attrelid=c.oid AND a.attname=k.name AND a.attnum>0 AND NOT a.attisdropped))
  ORDER BY n.nspname,c.oid LIMIT 1
), pgss_document AS MATERIALIZED (
  SELECT query_to_xml(CASE WHEN EXISTS(SELECT 1 FROM pgss_relation) THEN
    format($pgss$
      WITH q AS MATERIALIZED (
        SELECT queryid, left(regexp_replace(query,'[[:space:]]+',' ','g'),600) AS query_excerpt,
          calls,total_exec_time,mean_exec_time,rows,shared_blks_hit,shared_blks_read,temp_blks_written,
          array_remove(ARRAY[
            CASE WHEN query ~* '\madmin_[a-z_]' THEN 'Admin' END,
            CASE WHEN query ~* 'opportunity_universe|opportunity_(catalog|final_matching|alert|seo)_universe' THEN 'Opportunity Universe' END,
            CASE WHEN query ~* 'matching_' THEN 'Matching' END,
            CASE WHEN query ~* 'opportunity_source_observations|observation_' THEN 'Observations' END,
            CASE WHEN query ~* 'sitemap|seo_' THEN 'Sitemap/SEO' END,
            CASE WHEN query ~* 'scraper_|opportunity_ingestion' THEN 'Scrapers/Ingestion' END
          ],NULL) AS text_evidenced_modules
        FROM %I.%I
      ) SELECT jsonb_build_object('AVAILABLE',true,
        'top_total_exec_time',coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY total_exec_time DESC,queryid)
          FROM (SELECT * FROM q ORDER BY total_exec_time DESC,queryid LIMIT 20) t),'[]'::jsonb),
        'top_mean_exec_time',coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY mean_exec_time DESC,queryid)
          FROM (SELECT * FROM q ORDER BY mean_exec_time DESC,queryid LIMIT 20) t),'[]'::jsonb),
        'cvitae_top_total_exec_time',coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY total_exec_time DESC,queryid)
          FROM (SELECT * FROM q WHERE cardinality(text_evidenced_modules)>0 ORDER BY total_exec_time DESC,queryid LIMIT 20) t),'[]'::jsonb),
        'max_mean_exec_time_ms',(SELECT max(mean_exec_time) FROM q),
        'max_calls',(SELECT max(calls) FROM q),
        'total_shared_blks_read',(SELECT sum(shared_blks_read) FROM q),
        'total_temp_blks_written',(SELECT sum(temp_blks_written) FROM q)
      )::text AS payload
    $pgss$,(SELECT nspname FROM pgss_relation),(SELECT relname FROM pgss_relation))
    ELSE 'SELECT ''{"AVAILABLE":false,"STATUS":"NOT_AVAILABLE","top_total_exec_time":[],"top_mean_exec_time":[],"cvitae_top_total_exec_time":[]}''::text AS payload'
    END,false,false,'') AS doc
), pgss AS (
  SELECT x.payload::jsonb AS value FROM pgss_document,
    XMLTABLE('/table/row' PASSING doc COLUMNS payload text PATH 'payload') x
), db_stats AS (
  SELECT to_jsonb(s) AS j FROM pg_catalog.pg_stat_database s WHERE datname=current_database()
), database_metrics AS (
  SELECT jsonb_build_object('AVAILABLE',true,'database',current_database(),
    'database_size_bytes',pg_catalog.pg_database_size(current_database()),
    'active_connections',(SELECT count(*) FROM pg_catalog.pg_stat_activity
      WHERE datname=current_database() AND state='active'),
    'total_connections',(SELECT count(*) FROM pg_catalog.pg_stat_activity WHERE datname=current_database()),
    'activity_state_visibility',CASE WHEN EXISTS (SELECT 1 FROM pg_catalog.pg_roles
      WHERE rolname=current_user AND rolsuper) OR pg_has_role(current_user,'pg_read_all_stats','USAGE')
      THEN 'ALL_ROLES' ELSE 'PARTIAL_ROLE_VISIBILITY' END,
    'max_connections',(SELECT setting::integer FROM pg_catalog.pg_settings WHERE name='max_connections'),
    'blocks_read',(SELECT (j->>'blks_read')::numeric FROM db_stats),
    'blocks_hit',(SELECT (j->>'blks_hit')::numeric FROM db_stats),
    'cache_hit_ratio',(SELECT (j->>'blks_hit')::numeric /
      nullif((j->>'blks_hit')::numeric+(j->>'blks_read')::numeric,0) FROM db_stats),
    'temp_files',(SELECT (j->>'temp_files')::numeric FROM db_stats),
    'temp_bytes',(SELECT (j->>'temp_bytes')::numeric FROM db_stats),
    'deadlocks',(SELECT (j->>'deadlocks')::numeric FROM db_stats),
    'commits',(SELECT (j->>'xact_commit')::numeric FROM db_stats),
    'rollbacks',(SELECT (j->>'xact_rollback')::numeric FROM db_stats),
    'rollback_ratio',(SELECT (j->>'xact_rollback')::numeric /
      nullif((j->>'xact_commit')::numeric+(j->>'xact_rollback')::numeric,0) FROM db_stats),
    'stats_reset',(SELECT j->>'stats_reset' FROM db_stats)
  ) AS value
), table_metrics AS (
  SELECT jsonb_agg(jsonb_build_object('table',w.name,'AVAILABLE',c.oid IS NOT NULL,
    'relation_kind',c.relkind,'size_scope','Relation only; partition children are not summed.',
    'total_size_bytes',CASE WHEN c.oid IS NOT NULL THEN pg_catalog.pg_total_relation_size(c.oid) END,
    'table_size_bytes',CASE WHEN c.oid IS NOT NULL THEN pg_catalog.pg_relation_size(c.oid) END,
    'index_size_bytes',CASE WHEN c.oid IS NOT NULL THEN pg_catalog.pg_indexes_size(c.oid) END,
    'estimated_rows',c.reltuples,'estimated_live_rows',s.n_live_tup,'estimated_dead_rows',s.n_dead_tup,
    'seq_scan',s.seq_scan,'seq_tup_read',s.seq_tup_read,'idx_scan',s.idx_scan
  ) ORDER BY w.name) AS value
  FROM (VALUES ('opportunities'),('opportunity_universe_state'),('opportunity_ingestion_events'),
    ('opportunity_source_observations'),('opportunity_enrichment_events'),('opportunity_factory_snapshots'),
    ('matching_retrieval_states'),('matching_retrieval_candidates'),('matching_retrieval_scheduler_state'),
    ('scraper_runs'),('google_indexing_queue'),('seo_suggestions')) w(name)
  LEFT JOIN pg_catalog.pg_namespace n ON n.nspname='public'
  LEFT JOIN pg_catalog.pg_class c ON c.relnamespace=n.oid AND c.relname=w.name AND c.relkind IN ('r','p')
  LEFT JOIN pg_catalog.pg_stat_user_tables s ON s.relid=c.oid
), indexes AS (
  SELECT coalesce(jsonb_agg(jsonb_build_object('table',tablename,'index',indexname,'definition',indexdef)
    ORDER BY tablename,indexname),'[]'::jsonb) AS value FROM pg_catalog.pg_indexes
  WHERE schemaname='public' AND tablename ~ '^(opportunit|matching_retrieval|scraper_run|seo_)'
), signals AS (
  SELECT jsonb_object_agg(name,jsonb_build_object('state',CASE WHEN actual IS NULL THEN 'UNKNOWN'
    WHEN present THEN 'PRESENT' ELSE 'ABSENT' END,'evidence',actual,'threshold',threshold,
    'interpretation','Descriptive cumulative-statistics signal; not a compute recommendation.')) AS value
  FROM database_metrics d CROSS JOIN pgss p CROSS JOIN LATERAL (VALUES
    ('HIGH_SHARED_BLOCK_READS',(d.value->>'blocks_read')::numeric,100000::numeric,
      (d.value->>'blocks_read')::numeric>=100000),
    ('HIGH_TEMP_WRITES',(d.value->>'temp_bytes')::numeric,104857600::numeric,
      (d.value->>'temp_bytes')::numeric>=104857600),
    ('LOW_CACHE_HIT',(d.value->>'cache_hit_ratio')::numeric,0.95::numeric,
      (d.value->>'cache_hit_ratio')::numeric<0.95),
    ('HIGH_ROLLBACK_RATIO',(d.value->>'rollback_ratio')::numeric,0.05::numeric,
      (d.value->>'rollback_ratio')::numeric>=0.05),
    ('HIGH_MEAN_EXEC_TIME',(p.value->>'max_mean_exec_time_ms')::numeric,1000::numeric,
      (p.value->>'max_mean_exec_time_ms')::numeric>=1000),
    ('HIGH_CALL_VOLUME',(p.value->>'max_calls')::numeric,100000::numeric,
      (p.value->>'max_calls')::numeric>=100000)
  ) v(name,actual,threshold,present)
), seq_signal AS (
  SELECT jsonb_build_object('state',CASE WHEN NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_stat_user_tables WHERE schemaname='public' AND relname ~ '^(opportunit|matching_retrieval|scraper_run|seo_)')
    THEN 'UNKNOWN' WHEN count(*)>0 THEN 'PRESENT' ELSE 'ABSENT' END,
    'evidence',coalesce(jsonb_agg(jsonb_build_object('table',relname,'seq_scan',seq_scan,
      'seq_tup_read',seq_tup_read,'estimated_live_rows',n_live_tup,'idx_scan',idx_scan)
      ORDER BY seq_tup_read DESC),'[]'::jsonb),
    'threshold',jsonb_build_object('minimum_seq_tup_read',100000,'minimum_estimated_live_rows',1000),
    'interpretation','Sequential tuple reads do not prove an avoidable full scan or a missing index.') AS value
  FROM pg_catalog.pg_stat_user_tables WHERE schemaname='public'
    AND relname ~ '^(opportunit|matching_retrieval|scraper_run|seo_)'
    AND seq_tup_read>=100000 AND n_live_tup>=1000
)
SELECT jsonb_build_object(
  'captured_at',statement_timestamp(),'execution_role',current_user,
  'opportunity_diagnosis',i.value||p.value||jsonb_build_object('universe',u.value,'dirty_source_queue',q.value,
    'current_source_policy',sp.value,
    'inventory_minus_pipeline',(i.value->>'INVENTORY_TOTAL')::bigint-(p.value->>'PIPELINE_ROWS')::bigint,
    'scope','Whole persisted inventory; no sampled rows and no readiness recalculation.'),
  'database',d.value,'tables',t.value,'relevant_existing_indexes',ix.value,'pg_stat_statements',s.value,
  'capacity_signals',cs.value||jsonb_build_object('TABLE_WITH_LARGE_SEQ_SCAN_SIGNAL',ss.value),
  'next_decision_inputs',jsonb_build_object(
    'catalog_ready',p.value#>'{consumers,catalog,final_ready}',
    'matching_ready',p.value#>'{consumers,matching,final_ready}',
    'alerts_ready',p.value#>'{consumers,alerts,final_ready}',
    'seo_ready',p.value#>'{consumers,seo,final_ready}',
    'top_catalog_block',p.value#>'{consumers,catalog,top_block}',
    'top_matching_block',p.value#>'{consumers,matching,top_block}',
    'top_alerts_block',p.value#>'{consumers,alerts,top_block}',
    'top_seo_block',p.value#>'{consumers,seo,top_block}',
    'performance_metrics_available',(d.value->>'AVAILABLE')::boolean,
    'pg_stat_statements_available',(s.value->>'AVAILABLE')::boolean)
) AS cvitae_prod_diagnosis
FROM inventory i CROSS JOIN pipeline p CROSS JOIN universe u CROSS JOIN dirty q CROSS JOIN policy sp
  CROSS JOIN database_metrics d CROSS JOIN table_metrics t CROSS JOIN indexes ix CROSS JOIN pgss s
  CROSS JOIN signals cs CROSS JOIN seq_signal ss;
