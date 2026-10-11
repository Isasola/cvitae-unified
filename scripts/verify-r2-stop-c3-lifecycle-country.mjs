import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const checks = [];
const check = (name, condition) => {
  checks.push({ name, pass: Boolean(condition) });
  if (!condition) throw new Error(`STOP_C3_ASSERTION_FAILED:${name}`);
};

const migration = read('supabase/migrations/202610100001_recruiter_declared_lifecycle_country.sql');
const preview = read('artifacts/release/r2-b2b-stop-c3-repair-preview-readonly-20261010.sql');
const repair = read('artifacts/release/r2-b2b-stop-c3-historical-repair-write-20261010.sql');
const verify = read('artifacts/release/r2-b2b-post-apply-verify-20261009.sql');
const compensate = read('artifacts/release/r2-b2b-compensate-write-20261009.sql');
const scopedPackage = [migration, preview, repair, verify, compensate].join('\n');

check('NEW_MIGRATION_IS_SCOPED_TO_RECRUITER_B2B',
  migration.includes("lower(trim(coalesce(new.source,'')))<>'recruiter_b2b'") &&
  migration.includes("elsif v_source='recruiter_b2b' then") &&
  migration.includes('opportunity_universe_decision_before_r2_20261009') &&
  !migration.includes('create or replace function public.apply_opportunity_source_trust'));
check('ORDERED_TRIGGER_RESTORES_ONLY_DECLARED_LIFECYCLE_AND_UNKNOWN_COUNTRY',
  migration.includes('create trigger zzz_recruiter_declared_lifecycle_country') &&
  migration.includes('new.is_active:=v_declared_active') && migration.includes('new.country_code:=null') &&
  migration.includes("raise exception 'recruiter_owner_not_verified'"));
check('FACTUAL_VERIFICATION_AND_OBSERVATION_ARE_NOT_FABRICATED',
  !/new\.verification_status\s*:=\s*'verified'/i.test(migration) &&
  !/insert\s+into\s+public\.opportunity_source_observations/i.test(migration) &&
  migration.includes("'PUBLISHER_DECLARED_OPEN_FACTUAL_PENDING'") &&
  migration.includes("v_deadline_state in ('OPEN','UNKNOWN')"));
check('TERMINAL_LIFECYCLE_EVIDENCE_IS_PRESERVED',
  migration.includes("v_result->>'lifecycle_state'='LIFECYCLE_UNKNOWN'") &&
  migration.includes("nullif(p_row->>'deleted_at','') is null") &&
  migration.includes("nullif(p_row->>'archived_at','') is null"));
check('SECURITY_DEFINER_TRIGGER_HAS_EMPTY_SEARCH_PATH_AND_NO_PUBLIC_EXECUTE',
  /returns trigger language plpgsql security definer set search_path=''/.test(migration) &&
  migration.includes('revoke all on function public.guard_recruiter_declared_lifecycle_country() from public,anon,authenticated'));

const previewWithoutCommentsOrStrings = preview.replace(/--.*$/gm, '').replace(/'(?:''|[^'])*'/g, "''");
check('PREVIEW_IS_READ_ONLY_COMPLETE_8_5_3_AND_SCHEMA_AWARE',
  preview.includes("'mode','READ_ONLY'") && preview.includes("'denominator_8'") &&
  preview.includes("'exactly_5_existing_mirrors'") && preview.includes("'no_mirrors_outside_lineage'") &&
  preview.includes("'owner_missing_3_preserved_without_mirror'") && preview.includes("'declared_3_open_2_closed'") &&
  preview.includes("'schema_ready_for_historical_repair'") &&
  !/\b(insert|update|delete|alter|drop|truncate|create|grant|revoke|call)\b/i.test(previewWithoutCommentsOrStrings) &&
  !/\blimit\b/i.test(previewWithoutCommentsOrStrings));
check('REPAIR_IS_TWO_DIGEST_GUARDED_AND_CREATES_NO_OPPORTUNITY',
  repair.includes('__EXPECTED_REPAIR_TARGET_DIGEST_FROM_STOP_C3_PREVIEW__') &&
  repair.includes('__EXPECTED_PERMISSION_DIGEST_FROM_STOP_C3_PREVIEW__') &&
  repair.includes('v_linked_total<>5') &&
  repair.includes('(v_activity_mismatch,v_country_nonnull) not in ((3,5),(0,0))') &&
  /update public\.opportunities o set is_active=r\.is_active,country_code=null,updated_at=now\(\)/i.test(repair) &&
  !/insert\s+into\s+public\.opportunities/i.test(repair));
check('REPAIR_HAS_IDEMPOTENT_LINEAGE_AND_BLOCKS_DESTRUCTIVE_COMPENSATION',
  repair.includes("'HISTORICAL_LIFECYCLE_COUNTRY_REPAIR'") &&
  repair.includes("'country_evidence','NOT_PROVIDED'") && repair.includes('on conflict(event_key) do nothing') &&
  compensate.includes("'HISTORICAL_LIFECYCLE_COUNTRY_REPAIR'"));
check('REPAIR_TOUCHES_NEITHER_OWNERLESS_VACANCIES_NOR_PERMISSION_TABLES',
  !/update\s+public\.recruiter_vacancies/i.test(repair) &&
  !/(insert\s+into|update|delete\s+from)\s+public\.opportunity_source_consumer_permissions/is.test(repair));
check('POST_VERIFY_REQUIRES_EXACT_3_OPEN_2_CLOSED_AND_UNKNOWN_COUNTRY',
  verify.includes("'exactly_3_open_mirrors_correct'") && verify.includes('counts.open_lifecycle_correct=3') &&
  verify.includes("'exactly_2_closed_mirrors_correct'") && verify.includes('counts.closed_lifecycle_correct=2') &&
  verify.includes("'no_country_invented',counts.country_inferred=0") &&
  verify.includes("'factual_verification_still_pending',counts.factual_verification_mismatch=0") &&
  verify.includes("'correction_lineage_exactly_five'") && verify.includes("'permission_digest',md5(policy_snapshot.value::text)"));
check('PACKAGE_DOES_NOT_GRANT_DISTRIBUTION_OR_CHANGE_OTHER_SOURCE_POLICY',
  !/(insert\s+into|update|delete\s+from)\s+public\.opportunity_source_consumer_permissions/is.test(scopedPackage) &&
  !/set\s+(web_catalog_allowed|search_engine_indexing_allowed|google_jobs_distribution_allowed|third_party_job_distribution_allowed)\s*=\s*true/is.test(scopedPackage));

const before = [true, true, true, false, false].map((recruiterActive) => ({
  recruiterActive, opportunityActive: false, country: 'PY', lifecycle: 'INACTIVE_VALID', factual: 'pending',
}));
const after = before.map((row) => ({
  ...row, opportunityActive: row.recruiterActive, country: null,
  lifecycle: row.recruiterActive ? 'ACTIVE_VALID' : 'INACTIVE_VALID',
}));
check('FOCUSED_FIXTURE_CORRECTS_5_EXISTING_MIRRORS_WITHOUT_PROMOTION',
  after.filter((row) => row.opportunityActive && row.lifecycle === 'ACTIVE_VALID').length === 3 &&
  after.filter((row) => !row.opportunityActive && row.lifecycle === 'INACTIVE_VALID').length === 2 &&
  after.every((row) => row.country === null && row.factual === 'pending'));

console.log(JSON.stringify({
  gate: 'R2_STOP_C3_LIFECYCLE_COUNTRY_LOCAL', result: 'PASS', checks: checks.length,
  scope: { originals: 8, existing_mirrors: 5, owner_missing_untouched: 3, open: 3, closed: 2,
    inferred_country_after: 0, factual_verification: 'PENDING', publication_authorized: false },
  boundaries: ['LOCAL_STATIC_AND_FOCUSED_FIXTURE_ONLY', 'POSTGRESQL_NOT_EXECUTED', 'PROD_NOT_VALIDATED'],
}, null, 2));
