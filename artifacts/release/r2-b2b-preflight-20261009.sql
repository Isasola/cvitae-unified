-- STOP A / READ_ONLY / metadata only. Prepared, NOT executed by the agent.
-- One SELECT; no application table scan, application RPC, DDL, DML or EXPLAIN.
-- Paste this entire file into the operator's authorized SQL editor.
-- Export the complete JSON result. Presence alone is NOT compatibility PASS.
-- No row counts, policy values, private CVs, emails or token values are read.
WITH
relation_manifest(schema_name, object_name, required, contract) AS (
  VALUES
    ('public','recruiter_tokens',true,'59/60/61/62/63'),
    ('public','recruiter_leads',true,'59/64'),
    ('public','recruiter_review_events',true,'59'),
    ('public','recruiter_vacancies',true,'60/61'),
    ('public','vacancy_applications',true,'61/63'),
    ('public','recruiter_analyses',true,'62/63'),
    ('public','recruiter_credit_operations',true,'62'),
    ('public','recruiter_credit_ledger',true,'62'),
    ('public','vacancy_review_batches',true,'62/63'),
    ('public','b2b_prospects',true,'64'),
    ('public','beta_waitlist',true,'64'),
    ('public','user_master_profiles',true,'42/43/44/privacy'),
    ('public','matching_diagnostic_snapshots',true,'42/43/44'),
    ('public','user_events',true,'43/44/66'),
    ('public','generated_cvs',true,'42'),
    ('public','cv_evidence_items',true,'42'),
    ('public','cv_ats_assessments',true,'42/ATS'),
    ('public','cv_ats_questions',true,'42/ATS'),
    ('public','learning_recommendations',true,'44'),
    ('public','founding_beta_enrollments',true,'43'),
    ('public','email_log',true,'43'),
    ('public','api_rate_limits',true,'42'),
    ('public','opportunities',true,'60/truth'),
    ('public','opportunity_sources',true,'60/policy'),
    ('public','opportunity_source_identity_aliases',true,'60/identity'),
    ('public','opportunity_source_consumer_permissions',true,'60/permissions'),
    ('public','admin_policy_events',true,'60/operator-switches'),
    ('public','opportunity_universe_state',true,'60/routing'),
    ('public','opportunity_universe_dirty_sources',true,'60/routing'),
    ('public','opportunity_source_observations',true,'60/lifecycle'),
    ('public','opportunity_lifecycle_repair_audit',true,'60/lifecycle'),
    ('public','opportunity_ingestion_events',true,'60/lineage'),
    ('public','opportunity_factory_snapshots',true,'60/quality'),
    ('public','opportunity_pipeline_status',true,'60/admin'),
    ('public','opportunity_catalog_universe',true,'60/catalog'),
    ('public','opportunity_final_matching_universe',true,'60/matching'),
    ('public','opportunity_alert_universe',true,'60/alerts'),
    ('public','opportunity_seo_universe',true,'60/seo'),
    ('storage','objects',true,'61/private-files'),
    ('storage','buckets',true,'61/private-files'),
    ('auth','users',true,'42/identity')
),
function_manifest(schema_name, object_name, argument_types, required) AS (
  VALUES
    ('public','create_recruiter_vacancy_atomic','text, text, text, text, text, text, text, text, text, text[], text',true),
    ('public','reserve_recruiter_credit','text, text, integer, jsonb',true),
    ('public','complete_recruiter_credit_operation','text, text, jsonb, jsonb',true),
    ('public','refund_recruiter_credit_operation','text, text, text',true),
    ('public','claim_vacancy_review_batch','text, uuid, text',true),
    ('public','settle_vacancy_review_batch','text, text, jsonb, jsonb, jsonb',true),
    ('public','refund_vacancy_review_batch','text, text, text',true),
    ('public','enforce_recruiter_verification','',true),
    ('public','stored_opportunity_source_policy','text',true),
    ('public','canonical_opportunity_source_policy','text',true),
    ('public','opportunity_universe_decision','jsonb, jsonb, jsonb, jsonb',true),
    ('public','refresh_opportunity_universe','text, boolean',true),
    ('public','opportunity_universe_after_write','',true),
    ('public','apply_opportunity_source_trust','',true),
    ('public','opportunity_deadline_state','text',true),
    ('public','opportunity_requirements_text','jsonb',true),
    ('public','get_opportunity_universe_row','text',true),
    ('public','get_source_distribution_policy','',true),
    ('public','create_cv_version','uuid, text, text, text, text, uuid, jsonb, jsonb, boolean',true),
    ('public','consume_api_rate_limit','text, text, integer, integer',true),
    ('public','update_learning_recommendation_status','uuid, uuid, text',true),
    ('public','mark_founding_beta_offered','uuid, text, text',true),
    ('public','create_cv_ats_assessment','uuid, uuid, text, text, uuid, text, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, text',true),
    ('public','review_cv_ats_question','uuid, uuid, text, text',true)
),
relations AS (
  SELECT m.*, c.oid, c.relkind, c.relrowsecurity, c.relforcerowsecurity,
    c.relowner, c.relacl, c.reloptions
  FROM relation_manifest m
  LEFT JOIN pg_catalog.pg_namespace n ON n.nspname = m.schema_name
  LEFT JOIN pg_catalog.pg_class c ON c.relnamespace = n.oid AND c.relname = m.object_name
),
functions AS (
  -- Include all overloads: a same-name/different-signature function is not a match.
  SELECT m.*, p.oid, p.proowner, p.proacl, p.prosecdef, p.provolatile,
    p.proconfig, p.proargnames, p.prorettype, p.proretset,
    pg_catalog.oidvectortypes(p.proargtypes) AS actual_argument_types
  FROM function_manifest m
  LEFT JOIN pg_catalog.pg_namespace n ON n.nspname = m.schema_name
  LEFT JOIN pg_catalog.pg_proc p ON p.pronamespace = n.oid AND p.proname = m.object_name AND p.prokind = 'f'
),
roles AS (
  SELECT wanted.name, r.oid, r.rolsuper, r.rolbypassrls
  FROM (VALUES ('anon'),('authenticated'),('service_role')) wanted(name)
  LEFT JOIN pg_catalog.pg_roles r ON r.rolname = wanted.name
),
blockers AS (
  SELECT 'MISSING_RELATION' AS reason, schema_name || '.' || object_name AS object
  FROM relations WHERE required AND oid IS NULL
  UNION ALL
  SELECT 'WRONG_RELATION_KIND', schema_name || '.' || object_name
  FROM relations WHERE oid IS NOT NULL AND relkind NOT IN ('r','p','v','m')
  UNION ALL
  SELECT 'MISSING_EXPECTED_FUNCTION_SIGNATURE', m.schema_name || '.' || m.object_name || '(' || m.argument_types || ')'
  FROM function_manifest m
  WHERE m.required AND NOT EXISTS (
    SELECT 1 FROM functions f WHERE f.schema_name=m.schema_name AND f.object_name=m.object_name
      AND f.oid IS NOT NULL AND f.actual_argument_types=m.argument_types
  )
  UNION ALL
  SELECT 'MISSING_ROLE', name FROM roles WHERE oid IS NULL
)
SELECT pg_catalog.jsonb_build_object(
  'artifact','r2-b2b-preflight-20261009-v1',
  'evidence_level','CATALOG_ONLY_OPERATOR_EXECUTION',
  'observed_at',pg_catalog.statement_timestamp(),
  'server_version_num',pg_catalog.current_setting('server_version_num'),
  'compatibility_status','REVIEW_REQUIRED_NOT_PASS',
  'blockers',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(b) ORDER BY object, reason) FROM blockers b),'[]'::jsonb),
  'roles',(SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(r) ORDER BY name) FROM roles r),
  'schemas',(SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'name',n.nspname,'owner',pg_catalog.pg_get_userbyid(n.nspowner),'acl',n.nspacl
  ) ORDER BY n.nspname) FROM pg_catalog.pg_namespace n WHERE n.nspname IN ('public','auth','storage','extensions')),
  'extensions',(SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'name',e.extname,'version',e.extversion,'schema',n.nspname
  ) ORDER BY e.extname) FROM pg_catalog.pg_extension e JOIN pg_catalog.pg_namespace n ON n.oid=e.extnamespace),
  'relations',(SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'schema',r.schema_name,'name',r.object_name,'contract',r.contract,'exists',r.oid IS NOT NULL,
    'kind',r.relkind,'rls',r.relrowsecurity,'force_rls',r.relforcerowsecurity,'options',r.reloptions,
    'owner',pg_catalog.pg_get_userbyid(r.relowner),'acl',r.relacl,
    'columns',(SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'name',a.attname,'position',a.attnum,'type',pg_catalog.format_type(a.atttypid,a.atttypmod),
      'type_schema',tn.nspname,'type_name',t.typname,'type_kind',t.typtype,
      'not_null',a.attnotnull,'identity',a.attidentity,'generated',a.attgenerated,
      'default',pg_catalog.pg_get_expr(d.adbin,d.adrelid),
      'enum_labels',(SELECT pg_catalog.jsonb_agg(e.enumlabel ORDER BY e.enumsortorder) FROM pg_catalog.pg_enum e WHERE e.enumtypid=t.oid)
    ) ORDER BY a.attnum) FROM pg_catalog.pg_attribute a
      JOIN pg_catalog.pg_type t ON t.oid=a.atttypid JOIN pg_catalog.pg_namespace tn ON tn.oid=t.typnamespace
      LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
      WHERE a.attrelid=r.oid AND a.attnum>0 AND NOT a.attisdropped),
    'constraints',(SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'name',k.conname,'type',k.contype,'validated',k.convalidated,'definition',pg_catalog.pg_get_constraintdef(k.oid,true)
    ) ORDER BY k.conname) FROM pg_catalog.pg_constraint k WHERE k.conrelid=r.oid),
    'indexes',(SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'definition',pg_catalog.pg_get_indexdef(i.indexrelid),'valid',i.indisvalid,'unique',i.indisunique
    ) ORDER BY i.indexrelid) FROM pg_catalog.pg_index i WHERE i.indrelid=r.oid),
    'policies',(SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'name',p.polname,'command',p.polcmd,'permissive',p.polpermissive,
      'roles',(SELECT pg_catalog.jsonb_agg(CASE WHEN pr.role_id=0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(pr.role_id) END)
        FROM pg_catalog.unnest(p.polroles) pr(role_id)),
      'using',pg_catalog.pg_get_expr(p.polqual,p.polrelid),'check',pg_catalog.pg_get_expr(p.polwithcheck,p.polrelid)
    ) ORDER BY p.polname) FROM pg_catalog.pg_policy p WHERE p.polrelid=r.oid),
    'triggers',(SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'name',t.tgname,'enabled',t.tgenabled,'definition',pg_catalog.pg_get_triggerdef(t.oid,true),
      'function',t.tgfoid::pg_catalog.regprocedure::text,
      'function_definition',pg_catalog.pg_get_functiondef(t.tgfoid)
    ) ORDER BY t.tgname) FROM pg_catalog.pg_trigger t WHERE t.tgrelid=r.oid AND NOT t.tgisinternal),
    'view_definition',CASE WHEN r.relkind IN ('v','m') THEN pg_catalog.pg_get_viewdef(r.oid,true) END,
    'effective_grants',(SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'role',role.name,'select',pg_catalog.has_table_privilege(role.oid,r.oid,'SELECT'),
      'insert',pg_catalog.has_table_privilege(role.oid,r.oid,'INSERT'),
      'update',pg_catalog.has_table_privilege(role.oid,r.oid,'UPDATE'),
      'delete',pg_catalog.has_table_privilege(role.oid,r.oid,'DELETE')
    ) ORDER BY role.name) FROM roles role WHERE role.oid IS NOT NULL AND r.oid IS NOT NULL)
  ) ORDER BY r.schema_name,r.object_name) FROM relations r),
  'functions',(SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'schema',f.schema_name,'name',f.object_name,'expected_arguments',f.argument_types,
    'actual_arguments',f.actual_argument_types,'argument_names',f.proargnames,
    'signature_matches',f.oid IS NOT NULL AND f.actual_argument_types=f.argument_types,
    'result',pg_catalog.pg_get_function_result(f.oid),'returns_set',f.proretset,
    'security_definer',f.prosecdef,'volatility',f.provolatile,
    'search_path',(SELECT cfg FROM pg_catalog.unnest(f.proconfig) cfg WHERE cfg LIKE 'search_path=%' LIMIT 1),
    'owner',pg_catalog.pg_get_userbyid(f.proowner),'acl',f.proacl,
    'definition',pg_catalog.pg_get_functiondef(f.oid),
    'effective_execute',(SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'role',r.name,'allowed',pg_catalog.has_function_privilege(r.oid,f.oid,'EXECUTE')
    ) ORDER BY r.name) FROM roles r WHERE r.oid IS NOT NULL AND f.oid IS NOT NULL)
  ) ORDER BY f.schema_name,f.object_name,f.actual_argument_types) FROM functions f),
  'limits',pg_catalog.jsonb_build_array(
    'No SQL was applied; no stored application function was invoked.',
    'Object presence does not prove types, ownership, RLS, locks or semantics correct.',
    'Catalog metadata does not prove candidate-cvs bucket configuration or source policy row values.',
    'Historical/future row denominators and independent consumer decisions remain NOT_VERIFIED.',
    'Review every function/view/trigger dependency before preparing dependent migration SQL.',
    'Any new dependency requires updating this preflight; no silent assumption is permitted.'
  )
) AS r2_b2b_preflight;
