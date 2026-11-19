-- CVitae R3 preflight: READ ONLY, run in Supabase SQL Editor before any release action.
-- One SELECT result. No application RPC writes, DML, DDL, refresh, or scraper invocation.
-- Exact aggregate scans are intentional; run in a quiet window and preserve the returned JSON.
-- History unavailable/hidden is UNKNOWN, never proof that a migration is unapplied.
WITH expected(version, name) AS (VALUES
  ('202610120001','remove_legacy_generated_cvs_uniqueness'),
  ('202610120002','consumer_scoped_semantic_retrieval'),
  ('202610120003','public_catalog_exact_count'),
  ('202610130001','matching_routing_epoch'),
  ('202610130002','matching_routing_changes')
), history_guard AS (
  SELECT c.oid, c.relkind,
    c.oid IS NOT NULL AND c.relkind IN ('r','p')
      AND has_schema_privilege(c.relnamespace,'USAGE')
      AND has_table_privilege(c.oid,'SELECT')
      AND NOT c.relrowsecurity AS available
  FROM (SELECT to_regclass('supabase_migrations.schema_migrations') AS oid) x
  LEFT JOIN pg_catalog.pg_class c ON c.oid=x.oid
), history_xml AS (
  SELECT available,
    query_to_xml(CASE WHEN available THEN
      $history$SELECT coalesce(jsonb_agg(jsonb_build_object('version',to_jsonb(m)->>'version','name',to_jsonb(m)->>'name') ORDER BY to_jsonb(m)->>'version'),'[]'::jsonb) AS payload
        FROM supabase_migrations.schema_migrations m
        WHERE to_jsonb(m)->>'version' IN ('202610120001','202610120002','202610120003','202610130001','202610130002')$history$
      ELSE 'SELECT ''[]''::jsonb AS payload' END, false, false, '') AS payload
  FROM history_guard
), history AS (
  SELECT available,
    coalesce(((xpath('/table/row/payload/text()',payload))[1]::text)::jsonb,'[]'::jsonb) AS rows
  FROM history_xml
), migration_status AS (
  SELECT jsonb_agg(jsonb_build_object('version',e.version,'name',e.name,
    'status',CASE WHEN NOT h.available THEN 'HISTORY_NOT_READABLE'
      WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(h.rows) r WHERE r->>'version'=e.version) THEN 'RECORDED'
      ELSE 'NOT_RECORDED_NOT_PROOF_OF_UNAPPLIED' END) ORDER BY e.version) AS value
  FROM expected e CROSS JOIN history h
), contracts AS (
  SELECT jsonb_build_object(
    'generated_cvs',jsonb_build_object('table_exists',to_regclass('public.generated_cvs') IS NOT NULL,
      'legacy_constraint', (SELECT pg_get_constraintdef(c.oid) FROM pg_catalog.pg_constraint c WHERE c.conrelid=to_regclass('public.generated_cvs') AND c.conname='generated_cvs_user_vacancy' AND c.contype='u'),
      'version_index_exists',to_regclass('public.generated_cvs_user_vacancy_version_uidx') IS NOT NULL,
      'duplicate_user_vacancy_version_groups',CASE WHEN to_regclass('public.generated_cvs') IS NOT NULL
        AND (SELECT count(*)=3 FROM pg_catalog.pg_attribute a WHERE a.attrelid=to_regclass('public.generated_cvs') AND a.attname IN ('user_id','vacancy_id','version_number') AND a.attnum>0 AND NOT a.attisdropped)
        THEN (SELECT count(*) FROM (SELECT user_id,vacancy_id,version_number FROM public.generated_cvs GROUP BY user_id,vacancy_id,version_number HAVING count(*)>1) d)
        ELSE NULL END),
    'vector',jsonb_build_object('extension_schema',(SELECT n.nspname FROM pg_catalog.pg_extension e JOIN pg_catalog.pg_namespace n ON n.oid=e.extnamespace WHERE e.extname='vector'),
      'base_type_schema',(SELECT n.nspname FROM pg_catalog.pg_type t JOIN pg_catalog.pg_namespace n ON n.oid=t.typnamespace WHERE t.typname='vector' AND t.typtype='b' LIMIT 1),
      'vector_384_type_exists',to_regtype('public.vector(384)') IS NOT NULL,
      'embedding_format_type',(SELECT pg_catalog.format_type(a.atttypid,a.atttypmod) FROM pg_catalog.pg_attribute a WHERE a.attrelid=to_regclass('public.opportunities') AND a.attname='embedding' AND a.attnum>0 AND NOT a.attisdropped),
      'cosine_operator',EXISTS(SELECT 1 FROM pg_catalog.pg_operator op JOIN pg_catalog.pg_type lt ON lt.oid=op.oprleft JOIN pg_catalog.pg_namespace ln ON ln.oid=lt.typnamespace JOIN pg_catalog.pg_type rt ON rt.oid=op.oprright JOIN pg_catalog.pg_namespace rn ON rn.oid=rt.typnamespace JOIN pg_catalog.pg_type result ON result.oid=op.oprresult WHERE op.oprname='<=>' AND ln.nspname='public' AND lt.typname='vector' AND rn.nspname='public' AND rt.typname='vector' AND result.typname='float8')),
    'relations',jsonb_build_object(
      'opportunity_final_matching_universe',to_regclass('public.opportunity_final_matching_universe') IS NOT NULL,
      'opportunity_catalog_universe',to_regclass('public.opportunity_catalog_universe') IS NOT NULL,
      'opportunity_alert_universe',to_regclass('public.opportunity_alert_universe') IS NOT NULL,
      'opportunity_seo_universe',to_regclass('public.opportunity_seo_universe') IS NOT NULL,
      'matching_retrieval_scheduler_state',to_regclass('public.matching_retrieval_scheduler_state') IS NOT NULL,
      'matching_retrieval_states',to_regclass('public.matching_retrieval_states') IS NOT NULL,
      'matching_retrieval_candidates',to_regclass('public.matching_retrieval_candidates') IS NOT NULL,
      'matching_routing_changes',to_regclass('public.matching_routing_changes') IS NOT NULL),
    'functions',jsonb_build_object(
      'match_consumer_opportunities',to_regprocedure('public.match_consumer_opportunities(public.vector,double precision,integer,text)') IS NOT NULL,
      'count_public_opportunities',to_regprocedure('public.count_public_opportunities(text,text,text[],text)') IS NOT NULL,
      'catalog_search_text',to_regprocedure('public.catalog_search_text(text,text,text,text,text,text)') IS NOT NULL,
      'complete_matching_retrieval_scan',to_regprocedure('public.complete_matching_retrieval_scan(uuid,bigint,timestamp with time zone,text,text,text)') IS NOT NULL,
      'canonical_opportunity_source_policy',to_regprocedure('public.canonical_opportunity_source_policy(text)') IS NOT NULL,
      'score_opportunity_embeddings',to_regprocedure('public.score_opportunity_embeddings(public.vector,text[])') IS NOT NULL),
    'function_contracts',(SELECT coalesce(jsonb_agg(jsonb_build_object('expected',e.signature,'exists',p.oid IS NOT NULL,
      'identity_arguments',pg_get_function_identity_arguments(p.oid),'return_type',pg_get_function_result(p.oid),
      'service_role_execute',CASE WHEN sr.oid IS NULL OR p.oid IS NULL THEN NULL ELSE has_function_privilege(sr.oid,p.oid,'EXECUTE') END,
      'anon_execute',CASE WHEN ar.oid IS NULL OR p.oid IS NULL THEN NULL ELSE has_function_privilege(ar.oid,p.oid,'EXECUTE') END,
      'authenticated_execute',CASE WHEN ur.oid IS NULL OR p.oid IS NULL THEN NULL ELSE has_function_privilege(ur.oid,p.oid,'EXECUTE') END) ORDER BY e.signature),'[]'::jsonb)
      FROM (VALUES
        ('public.match_consumer_opportunities(public.vector,double precision,integer,text)'),
        ('public.count_public_opportunities(text,text,text[],text)'),
        ('public.catalog_search_text(text,text,text,text,text,text)'),
        ('public.score_opportunity_embeddings(public.vector,text[])'),
        ('public.complete_matching_retrieval_scan(uuid,bigint,timestamp with time zone,text,text,text)'),
        ('public.canonical_opportunity_source_policy(text)'),('public.bump_matching_routing_epoch()')
      ) e(signature)
      LEFT JOIN pg_catalog.pg_proc p ON p.oid=to_regprocedure(e.signature)
      LEFT JOIN pg_catalog.pg_roles sr ON sr.rolname='service_role'
      LEFT JOIN pg_catalog.pg_roles ar ON ar.rolname='anon'
      LEFT JOIN pg_catalog.pg_roles ur ON ur.rolname='authenticated'),
    'routing_ledger_security',jsonb_build_object('rls_enabled',(SELECT relrowsecurity FROM pg_catalog.pg_class WHERE oid=to_regclass('public.matching_routing_changes')),
      'service_role_select',CASE WHEN to_regclass('public.matching_routing_changes') IS NULL OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='service_role') THEN NULL ELSE has_table_privilege('service_role','public.matching_routing_changes','SELECT') END,
      'anon_select',CASE WHEN to_regclass('public.matching_routing_changes') IS NULL OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='anon') THEN NULL ELSE has_table_privilege('anon','public.matching_routing_changes','SELECT') END,
      'authenticated_select',CASE WHEN to_regclass('public.matching_routing_changes') IS NULL OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='authenticated') THEN NULL ELSE has_table_privilege('authenticated','public.matching_routing_changes','SELECT') END),
    'roles',jsonb_build_object('service_role',EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='service_role'),
      'authenticated',EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='authenticated'),
      'anon',EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='anon'))
  ) AS value
), inventory_xml AS (
  SELECT query_to_xml(CASE WHEN to_regclass('public.opportunities') IS NOT NULL
      AND EXISTS(SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid=to_regclass('public.opportunities') AND attname='match_eligible' AND attnum>0 AND NOT attisdropped)
      AND EXISTS(SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid=to_regclass('public.opportunities') AND attname='embedding' AND attnum>0 AND NOT attisdropped)
    THEN $inventory$SELECT jsonb_build_object('status','EXACT','total',count(*),
      'match_eligible_true',count(*) FILTER(WHERE match_eligible IS TRUE),
      'match_eligible_unknown',count(*) FILTER(WHERE match_eligible IS NULL),
      'embedding_nonnull',count(*) FILTER(WHERE embedding IS NOT NULL),
      'match_eligible_with_embedding',count(*) FILTER(WHERE match_eligible IS TRUE AND embedding IS NOT NULL)) AS payload
      FROM public.opportunities$inventory$
    ELSE 'SELECT jsonb_build_object(''status'',''UNAVAILABLE_MISSING_TABLE_OR_COLUMNS'') AS payload' END,false,false,'') AS payload
), inventory AS (
  SELECT coalesce(((xpath('/table/row/payload/text()',payload))[1]::text)::jsonb,'{}'::jsonb) AS value FROM inventory_xml
), universe_sql AS (
  SELECT 'SELECT jsonb_build_object(' ||
    CASE WHEN to_regclass('public.opportunity_final_matching_universe') IS NOT NULL THEN '''matching_final'',(SELECT count(*) FROM public.opportunity_final_matching_universe)' ELSE '''matching_final'',NULL' END || ',' ||
    CASE WHEN to_regclass('public.opportunity_catalog_universe') IS NOT NULL THEN '''catalog'',(SELECT count(*) FROM public.opportunity_catalog_universe)' ELSE '''catalog'',NULL' END || ',' ||
    CASE WHEN to_regclass('public.opportunity_alert_universe') IS NOT NULL THEN '''alerts'',(SELECT count(*) FROM public.opportunity_alert_universe)' ELSE '''alerts'',NULL' END || ',' ||
    CASE WHEN to_regclass('public.opportunity_seo_universe') IS NOT NULL THEN '''seo'',(SELECT count(*) FROM public.opportunity_seo_universe)' ELSE '''seo'',NULL' END ||
    ') AS payload' AS sql
), universe_xml AS (SELECT query_to_xml(sql,false,false,'') AS payload FROM universe_sql),
universes AS (SELECT coalesce(((xpath('/table/row/payload/text()',payload))[1]::text)::jsonb,'{}'::jsonb) AS value FROM universe_xml),
source_xml AS (
  SELECT query_to_xml(CASE WHEN to_regclass('public.opportunities') IS NOT NULL
      AND to_regclass('public.opportunity_sources') IS NOT NULL
      AND to_regclass('public.opportunity_source_identity_aliases') IS NOT NULL
      AND to_regclass('public.opportunity_universe_dirty_sources') IS NOT NULL
      AND to_regclass('public.opportunity_universe_state') IS NOT NULL
      AND (SELECT count(*)=4 FROM pg_catalog.pg_attribute WHERE attrelid=to_regclass('public.opportunity_universe_state') AND attname IN ('final_matching_state','catalog_state','alerts_state','seo_state') AND attnum>0 AND NOT attisdropped)
      AND EXISTS(SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid=to_regclass('public.opportunities') AND attname='match_eligible' AND attnum>0 AND NOT attisdropped)
      AND to_regprocedure('public.canonical_opportunity_source_policy(text)') IS NOT NULL
    THEN $sources$WITH identities AS (
      SELECT lower(trim(source)) AS emitted,coalesce(a.canonical_source,lower(trim(source))) AS canonical
      FROM public.opportunity_sources s LEFT JOIN public.opportunity_source_identity_aliases a ON a.emitted_source=lower(trim(s.source))
      UNION SELECT lower(trim(o.source)),coalesce(a.canonical_source,lower(trim(o.source)))
      FROM public.opportunities o LEFT JOIN public.opportunity_source_identity_aliases a ON a.emitted_source=lower(trim(o.source))
      UNION SELECT emitted_source,canonical_source FROM public.opportunity_source_identity_aliases
    ), inventory AS (
      SELECT i.canonical,count(o.id) AS inventory_total,
        count(o.id) FILTER(WHERE o.match_eligible IS TRUE) AS match_eligible
      FROM identities i LEFT JOIN public.opportunities o ON lower(trim(o.source))=i.emitted
      GROUP BY i.canonical
    ), stored AS (
      SELECT i.canonical,jsonb_agg(jsonb_build_object('source',s.source,'is_enabled',s.is_enabled,'catalog_enabled',s.catalog_enabled,
        'matching_enabled',s.matching_enabled,'alerts_enabled',s.alerts_enabled,'seo_enabled',s.seo_enabled) ORDER BY lower(s.source)) AS evidence
      FROM identities i JOIN public.opportunity_sources s ON lower(s.source)=i.emitted GROUP BY i.canonical
    ), consumer AS (
      SELECT i.canonical,
        count(o.id) FILTER(WHERE u.final_matching_state='READY') AS matching_final_ready,
        count(o.id) FILTER(WHERE u.catalog_state='READY') AS catalog_ready,
        count(o.id) FILTER(WHERE u.alerts_state='READY') AS alerts_ready,
        count(o.id) FILTER(WHERE u.seo_state='READY') AS seo_ready
      FROM identities i JOIN public.opportunities o ON lower(trim(o.source))=i.emitted
      LEFT JOIN public.opportunity_universe_state u ON u.opportunity_id=o.id::text
      GROUP BY i.canonical
    )
    SELECT coalesce(jsonb_agg(jsonb_build_object('canonical_source',i.canonical,'inventory_total',i.inventory_total,
      'match_eligible',i.match_eligible,'stored_switches',coalesce(st.evidence,'[]'::jsonb),
      'consumer_universe',to_jsonb(c),
      'effective_policy',public.canonical_opportunity_source_policy(i.canonical),
      'dirty_queue',to_jsonb(d),'dirty',d.canonical_source IS NOT NULL) ORDER BY i.canonical),'[]'::jsonb) AS payload
    FROM inventory i LEFT JOIN stored st ON st.canonical=i.canonical
    LEFT JOIN consumer c ON c.canonical=i.canonical
    LEFT JOIN public.opportunity_universe_dirty_sources d ON lower(d.canonical_source)=lower(i.canonical)$sources$
    ELSE 'SELECT ''[]''::jsonb AS payload' END,false,false,'') AS payload
), sources AS (SELECT coalesce(((xpath('/table/row/payload/text()',payload))[1]::text)::jsonb,'[]'::jsonb) AS value FROM source_xml),
retrieval_xml AS (
  SELECT query_to_xml(CASE WHEN to_regclass('public.matching_retrieval_scheduler_state') IS NOT NULL
      AND to_regclass('public.matching_retrieval_states') IS NOT NULL
      AND to_regclass('public.matching_retrieval_candidates') IS NOT NULL
      AND to_regclass('public.matching_routing_changes') IS NOT NULL
      AND EXISTS(SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid=to_regclass('public.matching_retrieval_scheduler_state') AND attname='routing_epoch' AND attnum>0 AND NOT attisdropped)
      AND EXISTS(SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid=to_regclass('public.matching_retrieval_scheduler_state') AND attname='routing_ledger_baseline_epoch' AND attnum>0 AND NOT attisdropped)
      AND (SELECT count(*)=5 FROM pg_catalog.pg_attribute WHERE attrelid=to_regclass('public.matching_retrieval_states') AND attname IN ('routing_ledger_baseline_epoch','routing_phase','routing_delta_from_epoch','routing_delta_target_epoch','routing_delta_cursor_epoch') AND attnum>0 AND NOT attisdropped)
    THEN $retrieval$SELECT jsonb_build_object(
      'scheduler',(SELECT to_jsonb(s) FROM public.matching_retrieval_scheduler_state s WHERE singleton IS TRUE),
      'ledger',(SELECT jsonb_build_object('rows',count(*),'min_epoch',min(routing_epoch),'max_epoch',max(routing_epoch),
        'events_after_baseline',count(*) FILTER(WHERE routing_epoch>s.routing_ledger_baseline_epoch),
        'expected_events_after_baseline',s.routing_epoch-s.routing_ledger_baseline_epoch,
        'gap_suspected',count(*) FILTER(WHERE routing_epoch>s.routing_ledger_baseline_epoch) <> s.routing_epoch-s.routing_ledger_baseline_epoch)
        FROM public.matching_routing_changes CROSS JOIN public.matching_retrieval_scheduler_state s WHERE s.singleton IS TRUE GROUP BY s.routing_epoch,s.routing_ledger_baseline_epoch),
      'states',(SELECT coalesce(jsonb_agg(jsonb_build_object('scan_status',scan_status,'scan_kind',scan_kind,
        'completed_routing_epoch',completed_routing_epoch,'routing_phase',routing_phase,'routing_delta_target_epoch',routing_delta_target_epoch,
        'routing_delta_cursor_epoch',routing_delta_cursor_epoch,'cursor_at',cursor_at,'cursor_id',cursor_id,'updated_at',updated_at)
        ORDER BY updated_at),'[]'::jsonb) FROM public.matching_retrieval_states),
      'candidate_rows',(SELECT count(*) FROM public.matching_retrieval_candidates)) AS payload$retrieval$
    ELSE 'SELECT jsonb_build_object(''status'',''UNAVAILABLE_PRE_MIGRATION_OR_MISSING_COLUMNS'') AS payload' END,false,false,'') AS payload
), retrieval AS (SELECT coalesce(((xpath('/table/row/payload/text()',payload))[1]::text)::jsonb,'{}'::jsonb) AS value FROM retrieval_xml)
SELECT jsonb_build_object(
  'observed_at',clock_timestamp(),'postgres_version',current_setting('server_version'),'current_user',current_user,
  'migration_history_readable',(SELECT available FROM history),'migration_versions',(SELECT value FROM migration_status),
  'contracts',(SELECT value FROM contracts),'inventory',(SELECT value FROM inventory),
  'consumer_universe_counts',(SELECT value FROM universes),'sources_stored_effective_dirty',(SELECT value FROM sources),
  'matching_retrieval',(SELECT value FROM retrieval),
  'named_source_focus',(SELECT coalesce(jsonb_agg(s ORDER BY s->>'canonical_source'),'[]'::jsonb) FROM jsonb_array_elements((SELECT value FROM sources)) s WHERE s->>'canonical_source' IN ('himalayas','jobicy','remotive','computrabajo','unjobs')),
  'decision','NO-GO if history is not readable, any required predecessor/signature/type/permission is incompatible, a legacy uniqueness definition differs, duplicates prevent the replacement index, the ledger/routing objects are partially applied, or any result is unavailable/ambiguous.'
) AS cvitae_r3_preflight_readonly;
