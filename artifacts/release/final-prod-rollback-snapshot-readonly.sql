-- Paste once immediately before the five authorized migrations; save the complete JSON.
-- Catalog definitions and bounded source/control records only. No opportunity data.
-- A false capture_complete or any blocker means the saved capture is insufficient.
-- Absent planned objects are recorded explicitly; absence is not a fabricated definition.
-- Full source audit history is retained when within budget, including unchanged manual kills.
-- Control records must be readable without row filtering; unavailable records fail closed.
WITH manifest AS (
  SELECT $snapshot_manifest${
  "release_candidate": "093f9f795f163d2928cb5567dc4942cdb296e6b4",
  "migrations": [
    {
      "version": "202610030001",
      "filename": "202610030001_pipeline_trace_contract_v2.sql",
      "sha256_lf": "b7b647864b6a3818f96b4103e06b99d77eb2d25118db6a1719885c9898363be7"
    },
    {
      "version": "202610030002",
      "filename": "202610030002_opportunity_universe_seo_permission.sql",
      "sha256_lf": "f4f67041c67b9f23fd86f165c8c4a7aecb929ac8e99111975fb7a8007d3c3048"
    },
    {
      "version": "202610040001",
      "filename": "202610040001_source_switch_wiring.sql",
      "sha256_lf": "3055782d986c1043697adb5b7ca70376efef94ab41d3bf9b3fd0644a82e59b0c"
    },
    {
      "version": "202610040002",
      "filename": "202610040002_public_catalog_coverage.sql",
      "sha256_lf": "865e368098e929d4cec06c3504344ef10d5f5f4e214c881fd6039f03c232772f"
    },
    {
      "version": "202610050001",
      "filename": "202610050001_bounded_alert_progress.sql",
      "sha256_lf": "abbe29082ef6eec5fd394484f2680a656c745602aa83dbcebacf0da544700de6"
    }
  ],
  "functions": [
    {
      "schema": "public",
      "name": "admin_opportunity_pipeline_ledger",
      "signature": "public.admin_opportunity_pipeline_ledger()",
      "migrations": [
        "202610030001"
      ]
    },
    {
      "schema": "public",
      "name": "opportunity_universe_decision",
      "signature": "public.opportunity_universe_decision(jsonb,jsonb,jsonb,jsonb)",
      "migrations": [
        "202610030002",
        "202610040001"
      ]
    },
    {
      "schema": "public",
      "name": "stored_opportunity_source_policy",
      "signature": "public.stored_opportunity_source_policy(text)",
      "migrations": [
        "202610040001"
      ]
    },
    {
      "schema": "public",
      "name": "canonical_opportunity_source_policy",
      "signature": "public.canonical_opportunity_source_policy(text)",
      "migrations": [
        "202610040001"
      ]
    },
    {
      "schema": "public",
      "name": "admin_update_source_policy_atomic",
      "signature": "public.admin_update_source_policy_atomic(text,jsonb,timestamptz,text)",
      "migrations": [
        "202610040001"
      ]
    },
    {
      "schema": "public",
      "name": "get_source_distribution_policy",
      "signature": "public.get_source_distribution_policy()",
      "migrations": [
        "202610040001"
      ]
    },
    {
      "schema": "public",
      "name": "opportunity_source_policy_refresh_universe",
      "signature": "public.opportunity_source_policy_refresh_universe()",
      "migrations": [
        "202610040001"
      ]
    },
    {
      "schema": "public",
      "name": "refresh_dirty_opportunity_universe_sources",
      "signature": "public.refresh_dirty_opportunity_universe_sources(integer)",
      "migrations": [
        "202610040001"
      ]
    },
    {
      "schema": "public",
      "name": "opportunity_permission_refresh_universe",
      "signature": "public.opportunity_permission_refresh_universe()",
      "migrations": [
        "202610040001"
      ]
    },
    {
      "schema": "public",
      "name": "opportunity_universe_schedule_deadline",
      "signature": "public.opportunity_universe_schedule_deadline()",
      "migrations": [
        "202610040001"
      ]
    },
    {
      "schema": "public",
      "name": "refresh_due_opportunity_universe",
      "signature": "public.refresh_due_opportunity_universe(integer)",
      "migrations": [
        "202610040001"
      ]
    },
    {
      "schema": "public",
      "name": "get_opportunity_universe_row",
      "signature": "public.get_opportunity_universe_row(text)",
      "migrations": [
        "202610040001"
      ]
    },
    {
      "schema": "public",
      "name": "catalog_search_text",
      "signature": "public.catalog_search_text(text,text,text,text,text,text)",
      "migrations": [
        "202610040002"
      ]
    },
    {
      "schema": "public",
      "name": "search_public_opportunities",
      "signature": "public.search_public_opportunities(text,text,text[],text,timestamptz,text,integer)",
      "migrations": [
        "202610040002"
      ]
    },
    {
      "schema": "public",
      "name": "claim_match_alert_scan",
      "signature": "public.claim_match_alert_scan()",
      "migrations": [
        "202610050001"
      ]
    },
    {
      "schema": "public",
      "name": "save_match_alert_scan",
      "signature": "public.save_match_alert_scan(uuid,uuid,jsonb,boolean)",
      "migrations": [
        "202610050001"
      ]
    },
    {
      "schema": "public",
      "name": "latest_maintenance_enrichments",
      "signature": "public.latest_maintenance_enrichments(text[])",
      "migrations": [
        "202610050001"
      ]
    },
    {
      "schema": "public",
      "name": "apply_opportunity_source_trust",
      "signature": "public.apply_opportunity_source_trust()",
      "migrations": [
        "202610040001"
      ]
    }
  ],
  "views": [
    {
      "schema": "public",
      "name": "opportunity_pipeline_status",
      "migration": "202610030001"
    },
    {
      "schema": "public",
      "name": "opportunity_final_matching_universe",
      "migration": "202610040001"
    },
    {
      "schema": "public",
      "name": "opportunity_catalog_universe",
      "migration": "202610040001"
    },
    {
      "schema": "public",
      "name": "opportunity_alert_universe",
      "migration": "202610040001"
    },
    {
      "schema": "public",
      "name": "opportunity_seo_universe",
      "migration": "202610040001"
    }
  ],
  "indexes": [
    {
      "schema": "public",
      "name": "admin_policy_events_source_lookup_idx",
      "migration": "202610040001"
    },
    {
      "schema": "public",
      "name": "opportunities_universe_source_cursor_idx",
      "migration": "202610040001"
    },
    {
      "schema": "public",
      "name": "opportunities_catalog_order_idx",
      "migration": "202610040001"
    },
    {
      "schema": "public",
      "name": "opportunity_universe_next_lifecycle_check_idx",
      "migration": "202610040001"
    },
    {
      "schema": "public",
      "name": "opportunities_catalog_search_idx",
      "migration": "202610040002"
    },
    {
      "schema": "public",
      "name": "opportunities_catalog_area_idx",
      "migration": "202610040002"
    },
    {
      "schema": "public",
      "name": "user_master_profiles_alert_walk_idx",
      "migration": "202610050001"
    },
    {
      "schema": "public",
      "name": "scraper_runs_maintenance_progress_idx",
      "migration": "202610050001"
    },
    {
      "schema": "public",
      "name": "matching_retrieval_candidates_alert_cursor_idx",
      "migration": "202610050001"
    },
    {
      "schema": "public",
      "name": "opportunities_maintenance_cursor_idx",
      "migration": "202610050001"
    }
  ],
  "columns": [
    {
      "relation": "opportunity_ingestion_events",
      "name": "trace_contract_version",
      "migration": "202610030001"
    },
    {
      "relation": "opportunity_ingestion_events",
      "name": "identity_factual",
      "migration": "202610030001"
    },
    {
      "relation": "opportunity_ingestion_events",
      "name": "trace_reason",
      "migration": "202610030001"
    },
    {
      "relation": "opportunity_universe_dirty_sources",
      "name": "cursor_id",
      "migration": "202610040001"
    },
    {
      "relation": "opportunity_universe_state",
      "name": "next_lifecycle_check_at",
      "migration": "202610040001"
    },
    {
      "relation": "matching_retrieval_scheduler_state",
      "name": "alert_profile_cursor",
      "migration": "202610050001"
    }
  ],
  "constraints": [
    {
      "relation": "opportunity_ingestion_events",
      "name": "opportunity_ingestion_events_v2_traced_requirements",
      "migration": "202610030001"
    },
    {
      "relation": "opportunity_ingestion_events",
      "name": "opportunity_ingestion_events_v2_persisted_identity",
      "migration": "202610030001"
    }
  ],
  "triggers": [
    {
      "relation": "opportunity_universe_state",
      "name": "opportunity_universe_schedule_deadline",
      "migration": "202610040001"
    }
  ],
  "relations": [
    {
      "schema": "public",
      "name": "admin_policy_events"
    },
    {
      "schema": "public",
      "name": "match_alert_scan_progress"
    },
    {
      "schema": "public",
      "name": "matching_retrieval_candidates"
    },
    {
      "schema": "public",
      "name": "matching_retrieval_scheduler_state"
    },
    {
      "schema": "public",
      "name": "opportunities"
    },
    {
      "schema": "public",
      "name": "opportunity_alert_universe"
    },
    {
      "schema": "public",
      "name": "opportunity_catalog_universe"
    },
    {
      "schema": "public",
      "name": "opportunity_final_matching_universe"
    },
    {
      "schema": "public",
      "name": "opportunity_ingestion_events"
    },
    {
      "schema": "public",
      "name": "opportunity_pipeline_status"
    },
    {
      "schema": "public",
      "name": "opportunity_seo_universe"
    },
    {
      "schema": "public",
      "name": "opportunity_source_consumer_permissions"
    },
    {
      "schema": "public",
      "name": "opportunity_source_identity_aliases"
    },
    {
      "schema": "public",
      "name": "opportunity_sources"
    },
    {
      "schema": "public",
      "name": "opportunity_universe_dirty_sources"
    },
    {
      "schema": "public",
      "name": "opportunity_universe_state"
    },
    {
      "schema": "public",
      "name": "scraper_runs"
    },
    {
      "schema": "public",
      "name": "user_master_profiles"
    },
    {
      "schema": "supabase_migrations",
      "name": "schema_migrations"
    }
  ],
  "controls": [
    {
      "key": "source_switches",
      "schema": "public",
      "relation": "opportunity_sources",
      "required_columns": [
        "source"
      ],
      "row_budget": 512,
      "predicate": "",
      "ordering": "source",
      "read_query": "WITH bounded_rows AS (SELECT to_jsonb(t) AS row FROM public.opportunity_sources t  ORDER BY source LIMIT 513), packed AS (SELECT coalesce(jsonb_agg(row), '[]'::jsonb) AS rows FROM bounded_rows) SELECT jsonb_build_object('available', true, 'complete', jsonb_array_length(rows) <= 512, 'status', CASE WHEN jsonb_array_length(rows) <= 512 THEN 'CAPTURED' ELSE 'INCOMPLETE_ROW_BUDGET_EXCEEDED' END, 'captured_rows', jsonb_array_length(rows), 'row_budget', 512, 'rows', rows) AS payload FROM packed"
    },
    {
      "key": "source_permissions",
      "schema": "public",
      "relation": "opportunity_source_consumer_permissions",
      "required_columns": [
        "canonical_source",
        "consumer"
      ],
      "row_budget": 4096,
      "predicate": "",
      "ordering": "canonical_source, consumer",
      "read_query": "WITH bounded_rows AS (SELECT to_jsonb(t) AS row FROM public.opportunity_source_consumer_permissions t  ORDER BY canonical_source, consumer LIMIT 4097), packed AS (SELECT coalesce(jsonb_agg(row), '[]'::jsonb) AS rows FROM bounded_rows) SELECT jsonb_build_object('available', true, 'complete', jsonb_array_length(rows) <= 4096, 'status', CASE WHEN jsonb_array_length(rows) <= 4096 THEN 'CAPTURED' ELSE 'INCOMPLETE_ROW_BUDGET_EXCEEDED' END, 'captured_rows', jsonb_array_length(rows), 'row_budget', 4096, 'rows', rows) AS payload FROM packed"
    },
    {
      "key": "source_aliases",
      "schema": "public",
      "relation": "opportunity_source_identity_aliases",
      "required_columns": [
        "emitted_source",
        "canonical_source"
      ],
      "row_budget": 2048,
      "predicate": "",
      "ordering": "emitted_source",
      "read_query": "WITH bounded_rows AS (SELECT to_jsonb(t) AS row FROM public.opportunity_source_identity_aliases t  ORDER BY emitted_source LIMIT 2049), packed AS (SELECT coalesce(jsonb_agg(row), '[]'::jsonb) AS rows FROM bounded_rows) SELECT jsonb_build_object('available', true, 'complete', jsonb_array_length(rows) <= 2048, 'status', CASE WHEN jsonb_array_length(rows) <= 2048 THEN 'CAPTURED' ELSE 'INCOMPLETE_ROW_BUDGET_EXCEEDED' END, 'captured_rows', jsonb_array_length(rows), 'row_budget', 2048, 'rows', rows) AS payload FROM packed"
    },
    {
      "key": "source_override_audit",
      "schema": "public",
      "relation": "admin_policy_events",
      "required_columns": [
        "id",
        "entity_type",
        "entity_key",
        "before_state",
        "after_state",
        "created_at"
      ],
      "row_budget": 2048,
      "predicate": "WHERE entity_type = 'source'",
      "ordering": "created_at DESC, id DESC",
      "read_query": "WITH bounded_rows AS (SELECT to_jsonb(t) AS row FROM public.admin_policy_events t WHERE entity_type = 'source' ORDER BY created_at DESC, id DESC LIMIT 2049), packed AS (SELECT coalesce(jsonb_agg(row), '[]'::jsonb) AS rows FROM bounded_rows) SELECT jsonb_build_object('available', true, 'complete', jsonb_array_length(rows) <= 2048, 'status', CASE WHEN jsonb_array_length(rows) <= 2048 THEN 'CAPTURED' ELSE 'INCOMPLETE_ROW_BUDGET_EXCEEDED' END, 'captured_rows', jsonb_array_length(rows), 'row_budget', 2048, 'rows', rows) AS payload FROM packed"
    },
    {
      "key": "source_reconciliation_queue",
      "schema": "public",
      "relation": "opportunity_universe_dirty_sources",
      "required_columns": [
        "canonical_source"
      ],
      "row_budget": 512,
      "predicate": "",
      "ordering": "canonical_source",
      "read_query": "WITH bounded_rows AS (SELECT to_jsonb(t) AS row FROM public.opportunity_universe_dirty_sources t  ORDER BY canonical_source LIMIT 513), packed AS (SELECT coalesce(jsonb_agg(row), '[]'::jsonb) AS rows FROM bounded_rows) SELECT jsonb_build_object('available', true, 'complete', jsonb_array_length(rows) <= 512, 'status', CASE WHEN jsonb_array_length(rows) <= 512 THEN 'CAPTURED' ELSE 'INCOMPLETE_ROW_BUDGET_EXCEEDED' END, 'captured_rows', jsonb_array_length(rows), 'row_budget', 512, 'rows', rows) AS payload FROM packed"
    },
    {
      "key": "matching_scheduler_checkpoint",
      "schema": "public",
      "relation": "matching_retrieval_scheduler_state",
      "required_columns": [
        "singleton"
      ],
      "row_budget": 4,
      "predicate": "WHERE singleton",
      "ordering": "singleton",
      "read_query": "WITH bounded_rows AS (SELECT to_jsonb(t) AS row FROM public.matching_retrieval_scheduler_state t WHERE singleton ORDER BY singleton LIMIT 5), packed AS (SELECT coalesce(jsonb_agg(row), '[]'::jsonb) AS rows FROM bounded_rows) SELECT jsonb_build_object('available', true, 'complete', jsonb_array_length(rows) <= 4, 'status', CASE WHEN jsonb_array_length(rows) <= 4 THEN 'CAPTURED' ELSE 'INCOMPLETE_ROW_BUDGET_EXCEEDED' END, 'captured_rows', jsonb_array_length(rows), 'row_budget', 4, 'rows', rows) AS payload FROM packed"
    },
    {
      "key": "migration_history",
      "schema": "supabase_migrations",
      "relation": "schema_migrations",
      "required_columns": [
        "version"
      ],
      "row_budget": 32,
      "predicate": "WHERE to_jsonb(t)->>'version' IN ('202610030001','202610030002','202610040001','202610040002','202610050001')",
      "ordering": "to_jsonb(t)->>'version'",
      "read_query": "WITH bounded_rows AS (SELECT to_jsonb(t) AS row FROM supabase_migrations.schema_migrations t WHERE to_jsonb(t)->>'version' IN ('202610030001','202610030002','202610040001','202610040002','202610050001') ORDER BY to_jsonb(t)->>'version' LIMIT 33), packed AS (SELECT coalesce(jsonb_agg(row), '[]'::jsonb) AS rows FROM bounded_rows) SELECT jsonb_build_object('available', true, 'complete', jsonb_array_length(rows) <= 32, 'status', CASE WHEN jsonb_array_length(rows) <= 32 THEN 'CAPTURED' ELSE 'INCOMPLETE_ROW_BUDGET_EXCEEDED' END, 'captured_rows', jsonb_array_length(rows), 'row_budget', 32, 'rows', rows) AS payload FROM packed"
    }
  ],
  "local_correction": "C09.1 final first-party row-driven / 96 canonical executable producers, 92 entrypoint files; PROD not queried"
}$snapshot_manifest$::jsonb AS j
), operator_context AS (
  SELECT current_user AS role_name, r.oid AS role_oid, r.rolsuper, r.rolbypassrls
  FROM pg_catalog.pg_roles r WHERE r.rolname = current_user
), wanted_functions AS (
  SELECT f.*, to_regprocedure(f.signature)::oid AS target_oid
  FROM manifest, jsonb_to_recordset(j->'functions')
    f(schema text, name text, signature text, migrations jsonb)
), wanted_relations AS (
  SELECT r.schema, r.name, c.oid, c.relkind, c.relowner,
    c.relacl, c.reloptions, c.relrowsecurity, c.relforcerowsecurity, c.relnamespace
  FROM manifest CROSS JOIN LATERAL jsonb_to_recordset(j->'relations') r(schema text, name text)
  LEFT JOIN pg_catalog.pg_namespace n ON n.nspname = r.schema
  LEFT JOIN pg_catalog.pg_class c ON c.relnamespace = n.oid AND c.relname = r.name
), relevant_triggers AS (
  SELECT t.*, n.nspname AS relation_schema, c.relname AS relation_name
  FROM pg_catalog.pg_trigger t
  JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE NOT t.tgisinternal AND (
    t.tgrelid IN (SELECT oid FROM wanted_relations WHERE schema = 'public')
    OR t.tgfoid IN (SELECT target_oid FROM wanted_functions WHERE target_oid IS NOT NULL)
  )
), function_oids AS (
  SELECT p.oid
  FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE p.prokind = 'f' AND EXISTS (
    SELECT 1 FROM wanted_functions f WHERE f.schema = n.nspname AND f.name = p.proname
  )
  UNION
  SELECT tgfoid FROM relevant_triggers
), function_definitions AS (
  SELECT p.oid,
    jsonb_build_object(
      'oid', p.oid, 'schema', n.nspname, 'name', p.proname,
      'identity_arguments', pg_get_function_identity_arguments(p.oid),
      'arguments_with_defaults', pg_get_function_arguments(p.oid),
      'result_type', pg_get_function_result(p.oid), 'returns_set', p.proretset,
      'owner', pg_get_userbyid(p.proowner), 'language', l.lanname,
      'security_definer', p.prosecdef, 'volatility', p.provolatile,
      'parallel', p.proparallel, 'configuration', to_jsonb(p.proconfig),
      'definition', pg_get_functiondef(p.oid), 'comment', obj_description(p.oid, 'pg_proc'),
      'acl_raw', to_jsonb(p.proacl), 'acl_uses_default', p.proacl IS NULL,
      'effective_acl', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'grantor', pg_get_userbyid(a.grantor),
        'grantee', CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,
        'privilege', a.privilege_type, 'grantable', a.is_grantable
      ) ORDER BY a.grantee, a.privilege_type, a.grantor), '[]'::jsonb)
      FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a)
    ) AS payload
  FROM function_oids f JOIN pg_catalog.pg_proc p ON p.oid = f.oid
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  JOIN pg_catalog.pg_language l ON l.oid = p.prolang
), relation_definitions AS (
  SELECT r.oid, r.schema, r.name,
    jsonb_build_object(
      'schema', r.schema, 'name', r.name, 'existed', r.oid IS NOT NULL,
      'status', CASE WHEN r.oid IS NULL THEN 'NOT_PRESENT_BEFORE_APPLY' ELSE 'CAPTURED' END,
      'oid', r.oid, 'kind', r.relkind, 'owner', pg_get_userbyid(r.relowner),
      'options', to_jsonb(r.reloptions), 'row_security', r.relrowsecurity,
      'force_row_security', r.relforcerowsecurity,
      'view_definition', CASE WHEN r.relkind IN ('v','m') THEN pg_get_viewdef(r.oid, true) END,
      'comment', obj_description(r.oid, 'pg_class'),
      'acl_raw', to_jsonb(r.relacl), 'acl_uses_default', r.relacl IS NULL,
      'effective_acl', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'grantor', pg_get_userbyid(a.grantor),
        'grantee', CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,
        'privilege', a.privilege_type, 'grantable', a.is_grantable
      ) ORDER BY a.grantee, a.privilege_type, a.grantor), '[]'::jsonb)
      FROM aclexplode(coalesce(r.relacl, acldefault('r', r.relowner))) a),
      'columns', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'ordinal', a.attnum, 'name', a.attname, 'type', format_type(a.atttypid, a.atttypmod),
        'not_null', a.attnotnull, 'identity', a.attidentity, 'generated', a.attgenerated,
        'default_expression', pg_get_expr(d.adbin, d.adrelid, true),
        'collation', CASE WHEN a.attcollation <> 0 THEN a.attcollation::regcollation::text END,
        'comment', col_description(a.attrelid, a.attnum), 'acl_raw', to_jsonb(a.attacl),
        'column_acl', (SELECT coalesce(jsonb_agg(jsonb_build_object(
          'grantor', pg_get_userbyid(ca.grantor),
          'grantee', CASE WHEN ca.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(ca.grantee) END,
          'privilege', ca.privilege_type, 'grantable', ca.is_grantable
        ) ORDER BY ca.grantee, ca.privilege_type, ca.grantor), '[]'::jsonb)
        FROM aclexplode(a.attacl) ca)
      ) ORDER BY a.attnum), '[]'::jsonb)
      FROM pg_catalog.pg_attribute a LEFT JOIN pg_catalog.pg_attrdef d
        ON d.adrelid = a.attrelid AND d.adnum = a.attnum
      WHERE a.attrelid = r.oid AND a.attnum > 0 AND NOT a.attisdropped),
      'constraints', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'name', c.conname, 'type', c.contype, 'validated', c.convalidated,
        'deferrable', c.condeferrable, 'deferred', c.condeferred,
        'definition', pg_get_constraintdef(c.oid, true), 'comment', obj_description(c.oid, 'pg_constraint')
      ) ORDER BY c.conname), '[]'::jsonb) FROM pg_catalog.pg_constraint c WHERE c.conrelid = r.oid),
      'row_security_policies', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'name', p.polname, 'command_code', p.polcmd, 'permissive', p.polpermissive,
        'roles', (SELECT coalesce(jsonb_agg(CASE WHEN id = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(id) END ORDER BY id), '[]'::jsonb) FROM unnest(p.polroles) id),
        'using_expression', pg_get_expr(p.polqual, p.polrelid, true),
        'check_expression', pg_get_expr(p.polwithcheck, p.polrelid, true)
      ) ORDER BY p.polname), '[]'::jsonb) FROM pg_catalog.pg_policy p WHERE p.polrelid = r.oid)
    ) AS payload
  FROM wanted_relations r
), trigger_definitions AS (
  SELECT jsonb_build_object(
    'relation_schema', t.relation_schema, 'relation', t.relation_name,
    'name', t.tgname, 'enabled', t.tgenabled,
    'definition', pg_get_triggerdef(t.oid, true), 'comment', obj_description(t.oid, 'pg_trigger'),
    'function_oid', t.tgfoid, 'function', (SELECT payload FROM function_definitions f WHERE f.oid = t.tgfoid),
    'old_transition_table', t.tgoldtable, 'new_transition_table', t.tgnewtable,
    'parent_trigger_oid', t.tgparentid
  ) AS payload FROM relevant_triggers t
), index_definitions AS (
  SELECT jsonb_build_object(
    'schema', x.schema, 'name', x.name, 'migration', x.migration,
    'existed', c.oid IS NOT NULL,
    'status', CASE WHEN c.oid IS NULL THEN 'NOT_PRESENT_BEFORE_APPLY' ELSE 'CAPTURED' END,
    'owner', pg_get_userbyid(c.relowner), 'options', to_jsonb(c.reloptions),
    'definition', CASE WHEN c.relkind IN ('i','I') THEN pg_get_indexdef(c.oid) END,
    'valid', i.indisvalid, 'ready', i.indisready, 'live', i.indislive,
    'comment', obj_description(c.oid, 'pg_class')
  ) AS payload
  FROM manifest CROSS JOIN LATERAL jsonb_to_recordset(j->'indexes') x(schema text, name text, migration text)
  LEFT JOIN pg_catalog.pg_namespace n ON n.nspname = x.schema
  LEFT JOIN pg_catalog.pg_class c ON c.relnamespace = n.oid AND c.relname = x.name
  LEFT JOIN pg_catalog.pg_index i ON i.indexrelid = c.oid
), target_baselines AS (
  SELECT jsonb_build_object(
    'columns', (SELECT coalesce(jsonb_agg(jsonb_build_object(
      'relation', x.relation, 'name', x.name, 'existed', a.attnum IS NOT NULL,
      'type', format_type(a.atttypid, a.atttypmod), 'ordinal', a.attnum
    ) ORDER BY x.relation, x.name), '[]'::jsonb)
    FROM manifest CROSS JOIN LATERAL jsonb_to_recordset(j->'columns') x(relation text, name text)
    LEFT JOIN wanted_relations r ON r.schema = 'public' AND r.name = x.relation
    LEFT JOIN pg_catalog.pg_attribute a ON a.attrelid = r.oid AND a.attname = x.name AND a.attnum > 0 AND NOT a.attisdropped),
    'constraints', (SELECT coalesce(jsonb_agg(jsonb_build_object(
      'relation', x.relation, 'name', x.name, 'existed', c.oid IS NOT NULL,
      'definition', pg_get_constraintdef(c.oid, true), 'validated', c.convalidated
    ) ORDER BY x.relation, x.name), '[]'::jsonb)
    FROM manifest CROSS JOIN LATERAL jsonb_to_recordset(j->'constraints') x(relation text, name text)
    LEFT JOIN wanted_relations r ON r.schema = 'public' AND r.name = x.relation
    LEFT JOIN pg_catalog.pg_constraint c ON c.conrelid = r.oid AND c.conname = x.name),
    'triggers', (SELECT coalesce(jsonb_agg(jsonb_build_object(
      'relation', x.relation, 'name', x.name, 'existed', t.oid IS NOT NULL,
      'definition', pg_get_triggerdef(t.oid, true), 'enabled', t.tgenabled
    ) ORDER BY x.relation, x.name), '[]'::jsonb)
    FROM manifest CROSS JOIN LATERAL jsonb_to_recordset(j->'triggers') x(relation text, name text)
    LEFT JOIN wanted_relations r ON r.schema = 'public' AND r.name = x.relation
    LEFT JOIN pg_catalog.pg_trigger t ON t.tgrelid = r.oid AND t.tgname = x.name)
  ) AS payload
), control_manifest AS (
  SELECT d.* FROM manifest CROSS JOIN LATERAL jsonb_to_recordset(j->'controls')
    d(key text, schema text, relation text, required_columns text[], row_budget integer, read_query text)
), control_guards AS (
  SELECT d.*, c.oid,
    CASE
      WHEN c.oid IS NULL THEN 'NOT_AVAILABLE_RELATION_MISSING'
      WHEN c.relkind NOT IN ('r','p') THEN 'NOT_AVAILABLE_NON_TABLE'
      WHEN NOT has_schema_privilege(c.relnamespace, 'USAGE') OR NOT has_table_privilege(c.oid, 'SELECT') THEN 'NOT_AVAILABLE_PRIVILEGE'
      WHEN c.relrowsecurity AND NOT (o.rolsuper OR o.rolbypassrls OR (NOT c.relforcerowsecurity AND pg_has_role(current_user, c.relowner, 'USAGE'))) THEN 'NOT_AVAILABLE_RLS_FILTERING_POSSIBLE'
      WHEN EXISTS (SELECT 1 FROM unnest(d.required_columns) col WHERE NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_attribute a WHERE a.attrelid = c.oid AND a.attname = col AND a.attnum > 0 AND NOT a.attisdropped
      )) THEN 'NOT_AVAILABLE_REQUIRED_COLUMN_MISSING'
      ELSE 'READABLE'
    END AS status
  FROM control_manifest d CROSS JOIN operator_context o
  LEFT JOIN pg_catalog.pg_namespace n ON n.nspname = d.schema
  LEFT JOIN pg_catalog.pg_class c ON c.relnamespace = n.oid AND c.relname = d.relation
), control_xml AS (
  SELECT g.key, g.schema, g.relation, g.status, g.row_budget,
    query_to_xml(CASE WHEN g.status = 'READABLE' THEN g.read_query
      ELSE $unavailable$SELECT jsonb_build_object('available', false, 'complete', false, 'rows', '[]'::jsonb) AS payload$unavailable$ END,
      false, false, '') AS doc
  FROM control_guards g
), control_data AS (
  SELECT c.key, c.schema, c.relation,
    x.payload::jsonb || jsonb_build_object('schema', c.schema, 'relation', c.relation,
      'access_status', c.status, 'row_budget', c.row_budget) AS payload
  FROM control_xml c CROSS JOIN LATERAL
    XMLTABLE('/table/row' PASSING c.doc COLUMNS payload text PATH 'payload') x
), migration_history AS (
  SELECT jsonb_build_object(
    'available', h.payload->'available', 'complete', h.payload->'complete',
    'status', CASE WHEN h.payload->>'available' = 'true' THEN h.payload->>'status' ELSE h.payload->>'access_status' END,
    'versions', (SELECT jsonb_agg(jsonb_build_object(
      'version', m->>'version', 'filename', m->>'filename',
      'status', CASE WHEN h.payload->>'complete' <> 'true' THEN 'UNKNOWN_INCOMPLETE_CAPTURE'
        WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(h.payload->'rows') row WHERE row->>'version' = m->>'version') THEN 'RECORDED'
        ELSE 'NOT_RECORDED_NOT_PROOF_OF_UNAPPLIED' END,
      'rows', (SELECT coalesce(jsonb_agg(row), '[]'::jsonb) FROM jsonb_array_elements(h.payload->'rows') row WHERE row->>'version' = m->>'version')
    )) FROM manifest, jsonb_array_elements(j->'migrations') m)
  ) AS payload FROM control_data h WHERE h.key = 'migration_history'
), catalog_targets AS (
  SELECT 'pg_proc'::regclass::oid AS classid, oid AS objid FROM function_oids
  UNION SELECT 'pg_class'::regclass::oid, oid FROM wanted_relations WHERE oid IS NOT NULL
), dependencies AS (
  SELECT DISTINCT d.classid, d.objid, d.objsubid, d.refclassid, d.refobjid, d.refobjsubid, d.deptype
  FROM pg_catalog.pg_depend d
  WHERE EXISTS (SELECT 1 FROM catalog_targets t WHERE (t.classid = d.classid AND t.objid = d.objid) OR (t.classid = d.refclassid AND t.objid = d.refobjid))
), schemas AS (
  SELECT n.oid, n.nspname, n.nspowner, n.nspacl
  FROM pg_catalog.pg_namespace n WHERE n.nspname IN ('public','extensions','supabase_migrations')
)
SELECT jsonb_build_object(
  'artifact', 'final-prod-rollback-snapshot-readonly:v1',
  'captured_at', statement_timestamp(), 'database', current_database(),
  'server_version', current_setting('server_version'), 'operator', current_user,
  'release_candidate', j->>'release_candidate', 'migration_manifest', j->'migrations',
  'capture_complete', NOT EXISTS (SELECT 1 FROM control_data WHERE payload->>'complete' IS DISTINCT FROM 'true'),
  'blockers', (SELECT coalesce(jsonb_agg(jsonb_build_object(
    'area', key, 'status', CASE WHEN payload->>'available' <> 'true' THEN payload->>'access_status' ELSE payload->>'status' END
  ) ORDER BY key), '[]'::jsonb) FROM control_data WHERE payload->>'complete' IS DISTINCT FROM 'true'),
  'function_targets', (SELECT jsonb_agg(jsonb_build_object(
    'signature', f.signature, 'migrations', f.migrations, 'existed', f.target_oid IS NOT NULL,
    'status', CASE WHEN f.target_oid IS NULL THEN 'NOT_PRESENT_BEFORE_APPLY' ELSE 'CAPTURED' END,
    'definition', (SELECT payload FROM function_definitions d WHERE d.oid = f.target_oid)
  ) ORDER BY f.signature) FROM wanted_functions f),
  'function_definitions', (SELECT coalesce(jsonb_agg(payload ORDER BY payload->>'schema', payload->>'name', payload->>'identity_arguments'), '[]'::jsonb) FROM function_definitions),
  'view_targets', (SELECT jsonb_agg(jsonb_build_object(
    'schema', v.schema, 'name', v.name, 'migration', v.migration,
    'before_apply', (SELECT payload FROM relation_definitions r WHERE r.schema = v.schema AND r.name = v.name)
  ) ORDER BY v.name) FROM jsonb_to_recordset(j->'views') v(schema text, name text, migration text)),
  'relations_metadata', (SELECT coalesce(jsonb_agg(payload ORDER BY schema, name), '[]'::jsonb) FROM relation_definitions),
  'triggers', (SELECT coalesce(jsonb_agg(payload ORDER BY payload->>'relation_schema', payload->>'relation', payload->>'name'), '[]'::jsonb) FROM trigger_definitions),
  'index_targets', (SELECT coalesce(jsonb_agg(payload ORDER BY payload->>'schema', payload->>'name'), '[]'::jsonb) FROM index_definitions),
  'column_constraint_trigger_baselines', (SELECT payload FROM target_baselines),
  'source_policy_and_control_state', (SELECT jsonb_object_agg(key, payload) FROM control_data WHERE key <> 'migration_history'),
  'migration_history', (SELECT payload FROM migration_history),
  'schema_ownership_acl', (SELECT coalesce(jsonb_agg(jsonb_build_object(
    'schema', nspname, 'owner', pg_get_userbyid(nspowner), 'acl_raw', to_jsonb(nspacl),
    'effective_acl', (SELECT coalesce(jsonb_agg(jsonb_build_object(
      'grantor', pg_get_userbyid(a.grantor),
      'grantee', CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,
      'privilege', a.privilege_type, 'grantable', a.is_grantable
    ) ORDER BY a.grantee, a.privilege_type, a.grantor), '[]'::jsonb) FROM aclexplode(coalesce(nspacl, acldefault('n', nspowner))) a)
  ) ORDER BY nspname), '[]'::jsonb) FROM schemas),
  'default_acl', (SELECT coalesce(jsonb_agg(jsonb_build_object(
    'owner', pg_get_userbyid(d.defaclrole), 'schema', n.nspname, 'object_type', d.defaclobjtype,
    'acl_raw', to_jsonb(d.defaclacl),
    'acl', (SELECT coalesce(jsonb_agg(jsonb_build_object(
      'grantor', pg_get_userbyid(a.grantor),
      'grantee', CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,
      'privilege', a.privilege_type, 'grantable', a.is_grantable
    ) ORDER BY a.grantee, a.privilege_type, a.grantor), '[]'::jsonb) FROM aclexplode(d.defaclacl) a)
  ) ORDER BY d.defaclrole, d.defaclnamespace, d.defaclobjtype), '[]'::jsonb)
    FROM pg_catalog.pg_default_acl d LEFT JOIN pg_catalog.pg_namespace n ON n.oid = d.defaclnamespace
    WHERE d.defaclnamespace = 0 OR d.defaclnamespace IN (SELECT oid FROM schemas)),
  'dependencies', (SELECT coalesce(jsonb_agg(jsonb_build_object(
    'object', to_jsonb(pg_identify_object(d.classid, d.objid, d.objsubid)),
    'referenced_object', to_jsonb(pg_identify_object(d.refclassid, d.refobjid, d.refobjsubid)),
    'dependency_type', d.deptype
  ) ORDER BY d.classid, d.objid, d.objsubid, d.refclassid, d.refobjid, d.refobjsubid), '[]'::jsonb) FROM dependencies d),
  'extension_baseline', (SELECT jsonb_build_object('name', 'pg_trgm', 'existed', e.oid IS NOT NULL,
    'version', e.extversion, 'schema', n.nspname, 'owner', pg_get_userbyid(e.extowner))
    FROM (SELECT 1) seed LEFT JOIN pg_catalog.pg_extension e ON e.extname = 'pg_trgm'
    LEFT JOIN pg_catalog.pg_namespace n ON n.oid = e.extnamespace),
  'scope', jsonb_build_object('inventory_rows_read', false, 'application_rpcs_invoked', false,
    'control_overflow_is_blocker', true, 'missing_control_state_is_blocker', true,
    'absence_baselines_preserved', true)
) AS cvitae_prod_rollback_snapshot
FROM manifest;
