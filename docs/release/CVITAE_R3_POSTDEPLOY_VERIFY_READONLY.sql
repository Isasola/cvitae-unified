-- CVitae R3 post-deploy verification: READ ONLY, run after each authorized phase.
-- One SELECT result; no DML/DDL, RPC writes, reconciliation, email or scraper execution.
-- Counts are measured now; historical 5,266/5,238 snapshots are not release targets.
WITH expected(version) AS (VALUES
  ('202610120001'),('202610120002'),('202610120003'),('202610130001'),('202610130002')
), history_guard AS (
  SELECT c.oid IS NOT NULL AND c.relkind IN ('r','p')
    AND has_schema_privilege(c.relnamespace,'USAGE') AND has_table_privilege(c.oid,'SELECT')
    AND NOT c.relrowsecurity AS available
  FROM (SELECT to_regclass('supabase_migrations.schema_migrations') AS oid) x
  LEFT JOIN pg_catalog.pg_class c ON c.oid=x.oid
), history_xml AS (
  SELECT available,query_to_xml(CASE WHEN available THEN
    $history$SELECT coalesce(jsonb_agg(to_jsonb(m)->>'version' ORDER BY to_jsonb(m)->>'version'),'[]'::jsonb) AS payload
      FROM supabase_migrations.schema_migrations m WHERE to_jsonb(m)->>'version' IN ('202610120001','202610120002','202610120003','202610130001','202610130002')$history$
    ELSE 'SELECT ''[]''::jsonb AS payload' END,false,false,'') AS payload FROM history_guard
), history AS (
  SELECT available,coalesce(((xpath('/table/row/payload/text()',payload))[1]::text)::jsonb,'[]'::jsonb) AS versions FROM history_xml
), migration_result AS (
  SELECT jsonb_agg(jsonb_build_object('version',e.version,'recorded',e.version=ANY(ARRAY(SELECT jsonb_array_elements_text(h.versions)))) ORDER BY e.version) AS rows,
    h.available AND (SELECT count(*) FROM expected e WHERE e.version=ANY(ARRAY(SELECT jsonb_array_elements_text(h.versions))))=5 AS all_recorded
  FROM expected e CROSS JOIN history h GROUP BY h.available,h.versions
), inventory_xml AS (
  SELECT query_to_xml(CASE WHEN to_regclass('public.opportunities') IS NOT NULL
    AND (SELECT count(*)=2 FROM pg_catalog.pg_attribute WHERE attrelid=to_regclass('public.opportunities') AND attname IN ('match_eligible','embedding') AND attnum>0 AND NOT attisdropped)
    THEN $q$SELECT jsonb_build_object('status','EXACT','total',count(*),
      'match_eligible_true',count(*) FILTER(WHERE match_eligible IS TRUE),
      'match_eligible_unknown',count(*) FILTER(WHERE match_eligible IS NULL),
      'embedded',count(*) FILTER(WHERE embedding IS NOT NULL),
      'match_eligible_embedded',count(*) FILTER(WHERE match_eligible IS TRUE AND embedding IS NOT NULL)) AS payload FROM public.opportunities$q$
    ELSE 'SELECT jsonb_build_object(''status'',''UNAVAILABLE'') AS payload' END,false,false,'') AS payload
), inventory AS (SELECT coalesce(((xpath('/table/row/payload/text()',payload))[1]::text)::jsonb,'{}'::jsonb) AS value FROM inventory_xml),
universe_sql AS (
  SELECT 'SELECT jsonb_build_object(' ||
    CASE WHEN to_regclass('public.opportunity_final_matching_universe') IS NOT NULL THEN '''matching_final'',(SELECT count(*) FROM public.opportunity_final_matching_universe)' ELSE '''matching_final'',NULL' END || ',' ||
    CASE WHEN to_regclass('public.opportunity_catalog_universe') IS NOT NULL THEN '''catalog'',(SELECT count(*) FROM public.opportunity_catalog_universe)' ELSE '''catalog'',NULL' END || ',' ||
    CASE WHEN to_regclass('public.opportunity_alert_universe') IS NOT NULL THEN '''alerts'',(SELECT count(*) FROM public.opportunity_alert_universe)' ELSE '''alerts'',NULL' END || ',' ||
    CASE WHEN to_regclass('public.opportunity_seo_universe') IS NOT NULL THEN '''seo'',(SELECT count(*) FROM public.opportunity_seo_universe)' ELSE '''seo'',NULL' END || ') AS payload' AS sql
), universe_xml AS (SELECT query_to_xml(sql,false,false,'') AS payload FROM universe_sql),
universes AS (SELECT coalesce(((xpath('/table/row/payload/text()',payload))[1]::text)::jsonb,'{}'::jsonb) AS value FROM universe_xml),
policy_xml AS (
  SELECT query_to_xml(CASE WHEN to_regclass('public.opportunity_sources') IS NOT NULL
      AND to_regclass('public.opportunity_source_identity_aliases') IS NOT NULL
      AND to_regclass('public.opportunity_universe_dirty_sources') IS NOT NULL
      AND to_regprocedure('public.canonical_opportunity_source_policy(text)') IS NOT NULL
    THEN $q$WITH sources AS (
      SELECT canonical_source FROM public.opportunity_source_identity_aliases
      UNION SELECT coalesce(a.canonical_source,lower(s.source)) FROM public.opportunity_sources s LEFT JOIN public.opportunity_source_identity_aliases a ON a.emitted_source=lower(s.source)
    ) SELECT coalesce(jsonb_agg(jsonb_build_object('canonical_source',s.canonical_source,
      'effective_policy',public.canonical_opportunity_source_policy(s.canonical_source),
      'stored_rows',(SELECT coalesce(jsonb_agg(jsonb_build_object('source',os.source,'is_enabled',os.is_enabled,'catalog_enabled',os.catalog_enabled,'matching_enabled',os.matching_enabled,'alerts_enabled',os.alerts_enabled,'seo_enabled',os.seo_enabled) ORDER BY os.source),'[]'::jsonb) FROM public.opportunity_sources os LEFT JOIN public.opportunity_source_identity_aliases a ON a.emitted_source=lower(os.source) WHERE lower(os.source)=lower(s.canonical_source) OR a.canonical_source=s.canonical_source),
      'dirty_queue',(SELECT coalesce(jsonb_agg(to_jsonb(d)),'[]'::jsonb) FROM public.opportunity_universe_dirty_sources d WHERE lower(d.canonical_source)=lower(s.canonical_source))) ORDER BY s.canonical_source),'[]'::jsonb) AS payload FROM sources s$q$
    ELSE 'SELECT ''[]''::jsonb AS payload' END,false,false,'') AS payload
), policies AS (SELECT coalesce(((xpath('/table/row/payload/text()',payload))[1]::text)::jsonb,'[]'::jsonb) AS value FROM policy_xml),
retrieval_xml AS (
  SELECT query_to_xml(CASE WHEN to_regclass('public.matching_retrieval_scheduler_state') IS NOT NULL
      AND to_regclass('public.matching_retrieval_states') IS NOT NULL
      AND to_regclass('public.matching_retrieval_candidates') IS NOT NULL
      AND to_regclass('public.matching_routing_changes') IS NOT NULL
      AND EXISTS(SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid=to_regclass('public.matching_retrieval_scheduler_state') AND attname='routing_ledger_baseline_epoch' AND attnum>0 AND NOT attisdropped)
      AND (SELECT count(*)=7 FROM pg_catalog.pg_attribute WHERE attrelid=to_regclass('public.matching_retrieval_states') AND attname IN ('completed_routing_epoch','routing_ledger_baseline_epoch','routing_phase','routing_delta_from_epoch','routing_delta_cursor_epoch','routing_delta_target_epoch','scan_routing_epoch') AND attnum>0 AND NOT attisdropped)
    THEN $q$SELECT jsonb_build_object(
      'scheduler',(SELECT to_jsonb(s) FROM public.matching_retrieval_scheduler_state s WHERE singleton IS TRUE),
      'ledger',(SELECT jsonb_build_object('rows',count(*),'min_epoch',min(c.routing_epoch),'max_epoch',max(c.routing_epoch),
        'events_after_baseline',count(*) FILTER(WHERE c.routing_epoch>s.routing_ledger_baseline_epoch),
        'expected_events_after_baseline',s.routing_epoch-s.routing_ledger_baseline_epoch,
        'gap_suspected',count(*) FILTER(WHERE c.routing_epoch>s.routing_ledger_baseline_epoch) <> s.routing_epoch-s.routing_ledger_baseline_epoch)
        FROM public.matching_routing_changes c CROSS JOIN public.matching_retrieval_scheduler_state s WHERE s.singleton IS TRUE GROUP BY s.routing_epoch,s.routing_ledger_baseline_epoch),
      'candidate_state',(SELECT jsonb_build_object('total',count(*),'stale_epoch',count(*) FILTER(WHERE completed_routing_epoch<s.routing_epoch),
        'complete',count(*) FILTER(WHERE scan_status='COMPLETE'),'pending',count(*) FILTER(WHERE scan_status='PENDING'),
        'scanning',count(*) FILTER(WHERE scan_status='SCANNING'),'error',count(*) FILTER(WHERE scan_status='ERROR'))
        FROM public.matching_retrieval_states CROSS JOIN public.matching_retrieval_scheduler_state s WHERE s.singleton IS TRUE),
      'candidate_rows',(SELECT count(*) FROM public.matching_retrieval_candidates)) AS payload$q$
    ELSE 'SELECT jsonb_build_object(''status'',''MISSING_RETRIEVAL_LEDGER_OR_EPOCH'') AS payload' END,false,false,'') AS payload
), retrieval AS (SELECT coalesce(((xpath('/table/row/payload/text()',payload))[1]::text)::jsonb,'{}'::jsonb) AS value FROM retrieval_xml),
dirty_xml AS (
  SELECT query_to_xml(CASE WHEN to_regclass('public.opportunity_universe_dirty_sources') IS NOT NULL
    THEN 'SELECT jsonb_build_object(''pending_sources'',count(*),''oldest_queued_at'',min((to_jsonb(d)->>''queued_at'')::timestamptz),''cursor_rows'',count(*) FILTER(WHERE to_jsonb(d)->>''cursor_id'' IS NOT NULL),''sources'',coalesce(jsonb_agg(to_jsonb(d) ORDER BY to_jsonb(d)->>''queued_at''),''[]''::jsonb)) AS payload FROM public.opportunity_universe_dirty_sources d'
    ELSE 'SELECT jsonb_build_object(''status'',''MISSING_DIRTY_QUEUE'') AS payload' END,false,false,'') AS payload
), dirty AS (SELECT coalesce(((xpath('/table/row/payload/text()',payload))[1]::text)::jsonb,'{}'::jsonb) AS value FROM dirty_xml)
SELECT jsonb_build_object('observed_at',clock_timestamp(),'postgres_version',current_setting('server_version'),
  'migration_history_readable',(SELECT available FROM history),'migrations',(SELECT rows FROM migration_result),
  'all_five_migrations_recorded',(SELECT all_recorded FROM migration_result),
  'inventory_current',(SELECT value FROM inventory),'consumer_universes_current',(SELECT value FROM universes),
  'source_policy_stored_effective_dirty',(SELECT value FROM policies),'dirty_queue',(SELECT value FROM dirty),
  'matching_retrieval_and_ledger',(SELECT value FROM retrieval),
  'vector',(SELECT jsonb_build_object('extension_schema',n.nspname,'format_type',pg_catalog.format_type(a.atttypid,a.atttypmod),'vector_384_exists',to_regtype('public.vector(384)') IS NOT NULL)
    FROM pg_catalog.pg_extension e JOIN pg_catalog.pg_namespace n ON n.oid=e.extnamespace CROSS JOIN pg_catalog.pg_attribute a
    WHERE e.extname='vector' AND a.attrelid=to_regclass('public.opportunities') AND a.attname='embedding' AND a.attnum>0 AND NOT a.attisdropped),
  'rpcs',(SELECT jsonb_agg(jsonb_build_object('signature',s.signature,'exists',p.oid IS NOT NULL,
      'service_role_execute',CASE WHEN p.oid IS NULL OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='service_role') THEN NULL ELSE has_function_privilege('service_role',p.oid,'EXECUTE') END,
      'anon_execute',CASE WHEN p.oid IS NULL OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='anon') THEN NULL ELSE has_function_privilege('anon',p.oid,'EXECUTE') END,
      'authenticated_execute',CASE WHEN p.oid IS NULL OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='authenticated') THEN NULL ELSE has_function_privilege('authenticated',p.oid,'EXECUTE') END) ORDER BY s.signature)
    FROM (VALUES ('public.match_consumer_opportunities(public.vector,double precision,integer,text)'),('public.count_public_opportunities(text,text,text[],text)'),('public.complete_matching_retrieval_scan(uuid,bigint,timestamp with time zone,text,text,text)'),('public.score_opportunity_embeddings(public.vector,text[])')) s(signature)
    LEFT JOIN pg_catalog.pg_proc p ON p.oid=to_regprocedure(s.signature)),
  'routing_trigger',(SELECT jsonb_agg(jsonb_build_object('name',t.tgname,'enabled',t.tgenabled,'definition',pg_get_triggerdef(t.oid)) ORDER BY t.tgname)
    FROM pg_catalog.pg_trigger t WHERE t.tgrelid=to_regclass('public.opportunity_universe_state') AND NOT t.tgisinternal AND t.tgname='opportunity_universe_matching_routing_epoch'),
  'routing_ledger_rls',(SELECT jsonb_build_object('enabled',c.relrowsecurity,
      'service_role_select',CASE WHEN NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='service_role') THEN NULL ELSE has_table_privilege('service_role',c.oid,'SELECT') END,
      'anon_select',CASE WHEN NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='anon') THEN NULL ELSE has_table_privilege('anon',c.oid,'SELECT') END,
      'authenticated_select',CASE WHEN NOT EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='authenticated') THEN NULL ELSE has_table_privilege('authenticated',c.oid,'SELECT') END)
    FROM pg_catalog.pg_class c WHERE c.oid=to_regclass('public.matching_routing_changes')),
  'himalayas_jobicy_remotive_computrabajo',(SELECT coalesce(jsonb_agg(p ORDER BY p->>'canonical_source'),'[]'::jsonb) FROM jsonb_array_elements((SELECT value FROM policies)) p WHERE p->>'canonical_source' IN ('himalayas','jobicy','remotive','computrabajo','unjobs')),
  'alert_delivery','This query does not send or queue mail. Check alert-universe eligibility and the existing delivery ledger separately under the authorized alert canary.',
  'seo_permission','No policy is changed; SEO totals and effective policy are shown separately from matching.',
  'decision','Do not enable schedules or claim backfill completion unless migration history, schemas, routing ledger coverage, per-source identities, and independent consumer results reconcile. Compare this current snapshot to the saved preflight by IDs/revisions, not only totals.') AS cvitae_r3_postdeploy_verify_readonly;
