import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const checks = [];
const check = (name, condition) => {
  checks.push({ name, pass: Boolean(condition) });
  if (!condition) throw new Error(`STOP_C2_ASSERTION_FAILED:${name}`);
};

const migrationPath = 'supabase/migrations/202610090002_recruiter_opportunity_bridge.sql';
const previewPath = 'artifacts/release/r2-b2b-historical-preview-20261009.sql';
const reconcilePath = 'artifacts/release/r2-b2b-reconcile-write-20261009.sql';
const verifyPath = 'artifacts/release/r2-b2b-post-apply-verify-20261009.sql';
const compensatePath = 'artifacts/release/r2-b2b-compensate-write-20261009.sql';
const rollbackPath = 'artifacts/release/r2-b2b-schema-rollback-write-20261009.sql';
const finalizePath = 'artifacts/release/r2-b2b-finalize-legacy-rpc-write-20261010.sql';
const dependencyPreflightPath = 'artifacts/release/r2-b2b-stop-c2-delete-dependencies-readonly-20261010.sql';

const migration = read(migrationPath);
const preview = read(previewPath);
const reconcile = read(reconcilePath);
const verify = read(verifyPath);
const compensate = read(compensatePath);
const rollback = read(rollbackPath);
const finalize = read(finalizePath);
const dependencyPreflight = read(dependencyPreflightPath);
const packageText = [migration, preview, reconcile, verify, compensate, rollback, finalize, dependencyPreflight].join('\n');

check('CLOSE_DOES_NOT_REFERENCE_ABSENT_RECRUITER_UPDATED_AT',
  !/update\s+public\.recruiter_vacancies\s+set\s+is_active\s*=\s*false\s*,\s*updated_at/is.test(migration));
check('NO_RECRUITER_UPDATED_AT_SCHEMA_WORKAROUND',
  !/alter\s+table\s+public\.recruiter_vacancies[\s\S]{0,120}add[\s\S]{0,40}updated_at/is.test(migration));
check('IDEMPOTENCY_REQUEST_INCLUDES_NORMALIZED_SLUG_AND_URL',
  migration.includes("'slug',v_slug,'application_url',v_application_url") &&
  migration.includes("lower(right(v_application_url,length(trim(p_slug))+1))<>'/'||v_slug") &&
  migration.includes("v_application_url:=left(v_application_url,length(v_application_url)-length(trim(p_slug)))||v_slug"));
check('CREATE_SERIALIZES_OPERATION_KEY',
  migration.includes("pg_advisory_xact_lock(hashtextextended('recruiter-create:'"));
check('LEGACY_RPC_DELEGATES_TO_12_ARGUMENT_AUTHORITY',
  migration.includes("'legacy:'||encode(extensions.digest") &&
  migration.includes("p_salary_range,v_slug,p_rubro,p_tags,v_application_url,v_operation_id") &&
  migration.includes("'compatibility_mode','LEGACY_REQUEST_FINGERPRINT'"));
check('LEGACY_AND_NEW_RPC_ARE_SERVICE_ROLE_ONLY',
  /revoke all on function public\.create_recruiter_vacancy_atomic\(text,text,text,text,text,text,text,text,text,text\[\],text\) from public,anon,authenticated;/i.test(migration) &&
  /grant execute on function public\.create_recruiter_vacancy_atomic\(text,text,text,text,text,text,text,text,text,text\[\],text\) to service_role;/i.test(migration));
check('SECURITY_DEFINER_FUNCTIONS_HAVE_EMPTY_SEARCH_PATH',
  [...migration.matchAll(/returns\s+(?:jsonb|text|trigger)\s+language\s+plpgsql\s+security\s+definer/gi)].length > 0 &&
  !/returns\s+(?:jsonb|text|trigger)\s+language\s+plpgsql\s+security\s+definer(?!\s+set\s+search_path='')/i.test(migration));

check('SCHEMA_STABLE_V1_DIGEST_IN_MIGRATION_AND_PREVIEW',
  migration.includes('RECRUITER_VACANCY_V1') && preview.includes('RECRUITER_VACANCY_V1') &&
  !migration.includes('string_agg(to_jsonb(r)::text') && !preview.includes('string_agg(to_jsonb(r)::text'));
check('RECONCILIATION_SIGNATURE_GUARDS_TOTAL_ELIGIBLE_PENDING',
  /reconcile_recruiter_vacancies_r2\(\s*p_expected_count integer,p_expected_digest text,p_expected_reconcilable integer,p_expected_pending integer,\s*p_expected_existing_mirrors integer/s.test(migration) &&
  migration.includes('v_reconciled+v_pending<>v_count'));
check('HISTORICAL_RECONCILIATION_REQUIRES_ZERO_PREEXISTING_MIRRORS',
  migration.includes("raise exception 'historical_preexisting_mirror:%'") &&
  migration.includes("raise exception 'historical_existing_mirrors_detected:expected=%,actual=%'") &&
  migration.includes('p_expected_existing_mirrors<>0'));
check('HISTORICAL_LINEAGE_MARKS_ONLY_NEW_INSERTS',
  migration.includes("'historical_created_by_reconciliation',p_origin='HISTORICAL_RECONCILIATION' and v_outcome='INSERTED'") &&
  migration.includes("e.reason='HISTORICAL_RECONCILIATION' and e.outcome='INSERTED'") &&
  migration.includes("e.evidence->>'historical_created_by_reconciliation'='true'"));
check('HISTORICAL_AND_FUTURE_WRITES_SHARE_ONE_FACTUAL_MAPPER',
  migration.includes("public.sync_recruiter_vacancy_mirror(new.id,case when tg_op='INSERT' then 'FUTURE_CREATE' else 'FUTURE_UPDATE' end)") &&
  migration.includes("public.sync_recruiter_vacancy_mirror(v.id,'HISTORICAL_RECONCILIATION')"));
check('OWNERLESS_HISTORY_IS_DIAGNOSED_NOT_SYNCHRONIZED',
  migration.includes("when owner_id is null then 'OWNER_MISSING'") &&
  migration.includes("if v.inventory_gate='INVENTORY_RECONCILABLE' then") &&
  migration.includes("'pending_rows',v_pending_rows"));
check('WRITE_REQUIRES_EXACT_8_5_3_PREVIEW',
  /reconcile_recruiter_vacancies_r2\(\s*8\s*,\s*'__EXPECTED_DIGEST_FROM_PREVIEW__'\s*,\s*5\s*,\s*3\s*,\s*0\s*\)/s.test(reconcile));
check('PREVIEW_STOPS_ON_ANY_EXISTING_MIRROR',
  preview.includes("when mirror_count>0 then 'PREEXISTING_MIRROR'") &&
  preview.includes("'existing_mirrors',0") && preview.includes("'reconciliation_write_allowed'"));
check('POST_VERIFY_ACCOUNTS_5_PLUS_3',
  verify.includes("'accounted_5_plus_3'") && verify.includes('counts.mirrors=5') &&
  verify.includes('counts.missing_mirror=3') && verify.includes("'owner_missing_3'"));
check('POST_VERIFY_REASSERTS_INDEPENDENT_DISTRIBUTION_GATES',
  verify.includes("'web_catalog_still_denied'") && verify.includes("'seo_permission_still_unknown'") &&
  verify.includes("'google_jobs_still_denied'") && verify.includes("'third_party_still_denied'"));
check('POST_VERIFY_ALL_DECLARED_FIELDS_SOURCE_AND_LIFECYCLE',
  ['title_exact','company_exact','description_exact','requirements_exact','compensation_text_exact',
    'location_exact','modality_exact','slug_exact','application_url_exact','source_exact','lifecycle_flag_exact']
    .every((field) => verify.includes(field)) &&
  verify.includes("'all_declared_fields_survive'") && verify.includes("'source_and_lifecycle_survive'") &&
  verify.includes("'universe_lifecycle_not_contradictory'"));
check('POST_VERIFY_COMPENSATION_SCOPE_IS_EXACTLY_NEW_INSERTS',
  verify.includes("e.outcome='INSERTED'") &&
  verify.includes("e.evidence->>'historical_created_by_reconciliation'='true'") &&
  verify.includes('ambiguous_historical_event_count=0') && verify.includes('candidates_outside_linked_set=0') &&
  verify.includes('not exists(select 1 from historical_candidates h where h.id=b.opportunity_id)') &&
  verify.includes("'historical_lineage_exactly_five_new_inserts'"));
check('COMPENSATION_USES_EXACT_HISTORICAL_SUBSET_AND_DIGEST',
  compensate.includes('__EXPECTED_HISTORICAL_MIRROR_DIGEST_FROM_POST_VERIFY__') &&
  compensate.includes('v_count<>5') && compensate.includes('v_historical_events<>5') && compensate.includes('v_ambiguous<>0') &&
  compensate.includes("e.outcome='INSERTED'") && compensate.includes("e.evidence->>'historical_created_by_reconciliation'='true'") &&
  compensate.includes('future_on_candidates') &&
  /delete from public\.opportunities o using candidates c where o\.id=c\.id;/i.test(compensate));
check('ROLLBACK_MATCHES_CORRECTED_RECONCILIATION_SIGNATURE',
  rollback.includes('reconcile_recruiter_vacancies_r2(integer,text,integer,integer,integer)'));
const dependencyPreflightWithoutCommentsOrStrings = dependencyPreflight
  .replace(/--.*$/gm, '')
  .replace(/'(?:''|[^'])*'/g, "''");
check('DEPENDENCY_PREFLIGHT_IS_ONE_READ_ONLY_METADATA_QUERY',
  dependencyPreflight.includes("'mode','READ_ONLY_METADATA'") &&
  dependencyPreflight.includes('pg_catalog.pg_constraint') && dependencyPreflight.includes('confdeltype') &&
  dependencyPreflight.includes('pg_catalog.pg_trigger') && dependencyPreflight.includes('pg_get_triggerdef') &&
  !/\b(insert|update|delete|alter|drop|truncate|create|grant|revoke|call)\b/i.test(dependencyPreflightWithoutCommentsOrStrings));
check('LEGACY_FINALIZATION_IS_A_SEPARATE_FAIL_CLOSED_WRITE',
  finalize.includes('operation_id_required_after_r2_cutover') && finalize.includes('NOT AUTHORIZED BY DEFAULT'));
check('PACKAGE_DOES_NOT_GRANT_DISTRIBUTION_PERMISSION',
  !/(insert\s+into|update)\s+public\.opportunity_source_consumer_permissions/is.test(packageText) &&
  !/set\s+(web_catalog_allowed|search_engine_indexing_allowed|google_jobs_distribution_allowed|third_party_job_distribution_allowed)\s*=\s*true/is.test(packageText));

const fixture = Array.from({ length: 8 }, (_, index) => ({
  id: `vacancy-${index + 1}`,
  active: index < 6,
  ownerExists: index >= 3,
  ownerActive: true,
  ownerVerified: true,
  slugValid: true,
  mirrorCount: 0,
  sourceConflicts: 0,
  slugCollisions: 0,
  urlCollisions: 0,
  qualityMissing: false,
}));
const classify = (row) => {
  if (!row.ownerExists) return 'OWNER_MISSING';
  if (!row.ownerActive) return 'PUBLISHER_INACTIVE';
  if (!row.ownerVerified) return 'PUBLISHER_IDENTITY_NOT_VERIFIED';
  if (!row.slugValid) return 'INVALID_SLUG';
  if (row.mirrorCount > 1) return 'DUPLICATE_MIRROR';
  if (row.sourceConflicts > 0) return 'MIRROR_SOURCE_CONFLICT';
  if (row.mirrorCount > 0) return 'PREEXISTING_MIRROR';
  if (row.slugCollisions > 0) return 'EXPECTED_SLUG_COLLISION';
  if (row.urlCollisions > 0) return 'APPLICATION_URL_COLLISION';
  if (row.qualityMissing) return 'QUALITY_MISSING';
  return 'INVENTORY_RECONCILABLE';
};
const classified = fixture.map((row) => ({ ...row, gate: classify(row) }));
check('FIXTURE_DENOMINATOR_8_ACTIVE_6_INACTIVE_2',
  classified.length === 8 && classified.filter((row) => row.active).length === 6 && classified.filter((row) => !row.active).length === 2);
check('FIXTURE_RECONCILES_5_AND_PRESERVES_3_OWNER_MISSING',
  classified.filter((row) => row.gate === 'INVENTORY_RECONCILABLE').length === 5 &&
  classified.filter((row) => row.gate === 'OWNER_MISSING').length === 3);
const fixtureWithUnexpectedMirror = fixture.map((row, index) => ({ ...row, mirrorCount: index === 4 ? 1 : 0 }));
check('FIXTURE_PREEXISTING_MIRROR_STOPS_RECONCILIATION',
  fixtureWithUnexpectedMirror.reduce((sum, row) => sum + row.mirrorCount, 0) === 1 &&
  classify(fixtureWithUnexpectedMirror[4]) === 'PREEXISTING_MIRROR');

const lineageEvents = [
  ...Array.from({ length: 5 }, (_, index) => ({ id: `new-${index}`, outcome: 'INSERTED', created: true })),
  { id: 'preexisting', outcome: 'UPDATED', created: false },
];
const compensable = lineageEvents.filter((event) => event.outcome === 'INSERTED' && event.created);
const ambiguous = lineageEvents.filter((event) => event.outcome !== 'INSERTED' || !event.created);
check('FIXTURE_COMPENSATION_EXCLUDES_UPDATED_PREEXISTING_MIRROR',
  compensable.length === 5 && !compensable.some((event) => event.id === 'preexisting') && ambiguous.length === 1);

const normalizedRequest = (slug, applicationUrl) => {
  const rawSlug = slug.trim();
  const normalizedSlug = rawSlug.toLowerCase();
  const rawUrl = applicationUrl.trim();
  return JSON.stringify({
    title: 'Vacancy', description: 'Description', requirements: 'Requirement', location: 'Asuncion',
    modality: 'hybrid', salary_range: null, rubro: null, tags: [],
    slug: normalizedSlug,
    application_url: `${rawUrl.slice(0, rawUrl.length - rawSlug.length)}${normalizedSlug}`,
  });
};
const stored = normalizedRequest('Role-One', 'https://cvitae.lat/vacante/Role-One');
check('EXACT_RETRY_HAS_IDENTICAL_DURABLE_REQUEST',
  stored === normalizedRequest('role-one', 'https://cvitae.lat/vacante/role-one'));
check('SAME_OPERATION_CHANGED_SLUG_CONFLICTS',
  stored !== normalizedRequest('role-two', 'https://cvitae.lat/vacante/role-two'));
check('SAME_OPERATION_CHANGED_URL_CONFLICTS',
  stored !== normalizedRequest('role-one', 'https://other.example/vacante/role-one'));

console.log(JSON.stringify({
  gate: 'R2_STOP_C2_LOCAL_ARTIFACTS',
  result: 'PASS',
  checks: checks.length,
  historical_matrix: {
    total: 8, active: 6, inactive: 2, reconcilable: 5,
    unresolved: 3, unresolved_by_reason: { OWNER_MISSING: 3 }, existing_mirrors_before: 0,
    compensable_new_inserts: 5, publication_authorized: false,
  },
  boundaries: ['LOCAL_STATIC_AND_FIXTURE_ONLY', 'POSTGRESQL_NOT_EXECUTED', 'PROD_NOT_VALIDATED'],
}, null, 2));
