import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { classifyOpportunityUniverse, summarizeOpportunityUniverse } from '../src/lib/opportunity-universe.ts'
import { buildDefaultDictionary } from '../supabase/functions/_shared/matching.ts'
import { rankOpportunitiesV2, V2_PRESET_FULL } from '../supabase/functions/_shared/matching-v2.ts'

const root = new URL('../', import.meta.url)
const source = (path: string) => readFileSync(new URL(path, root), 'utf8')
const rich = {
  id: 'external-private-match', source: 'jobicy', title: 'Backend Software Engineer Senior', organization: 'Fixture',
  description: 'Backend engineering role building production APIs with Python, SQL and Docker. '.repeat(3),
  requirements: [{ text: 'Python SQL Docker APIs and production engineering experience.' }],
  location: 'Remote', type: 'Remote', is_active: true, verification_status: 'verified',
  match_eligible: true, deleted_at: null, archived_at: null, deadline: null,
}
const permission = (_source: string, consumer: string) => ({
  state: consumer === 'matching' ? 'ALLOWED' : 'DENIED', reason: `FIXTURE_${consumer}`, provenance: 'C4_FIXTURE',
}) as any
const explicitMatchingDeny = (_source: string, consumer: string) => ({
  state: consumer === 'matching' ? 'DENIED' : 'UNKNOWN', reason: `FIXTURE_${consumer}`, provenance: 'C4_FIXTURE',
}) as any

type OracleInput = {
  lifecycle: string
  row: 'READY' | 'NOT_READY' | 'UNKNOWN'
  sourceIdentity?: boolean
  permission: 'ALLOWED' | 'DENIED' | 'UNKNOWN'
  source: 'ENABLED' | 'DISABLED' | 'UNKNOWN' | 'CONFLICT'
  matchingSwitch: 'ALLOWED' | 'DENIED' | 'UNKNOWN'
  matchingConflict?: boolean
}
// Independent local transcription of the SQL decision order. It deliberately
// does not invoke classifyOpportunityUniverse, so fixture expectations cannot
// become expected=actual tautologies.
const sqlContractOracle = (input: OracleInput): 'READY' | 'NOT_READY' | 'UNKNOWN' => {
  if (input.lifecycle !== 'ACTIVE_VALID') return ['LIFECYCLE_UNKNOWN', 'STALE_DERIVED_STATE'].includes(input.lifecycle) ? 'UNKNOWN' : 'NOT_READY'
  if (input.row !== 'READY') return input.row
  if (input.sourceIdentity === false) return 'UNKNOWN'
  if (input.permission === 'DENIED') return 'NOT_READY'
  if (input.source === 'DISABLED' || input.matchingSwitch === 'DENIED') return 'NOT_READY'
  if (input.source === 'CONFLICT' || input.matchingConflict) return 'UNKNOWN'
  return 'READY'
}

const external = classifyOpportunityUniverse(rich, [{ source: 'jobicy', is_enabled: true, matching_enabled: true,
  catalog_enabled: false, alerts_enabled: false, seo_enabled: false,
  consumer_switch_overrides: { catalog: false, alerts: false, seo: false } }], null, new Date('2026-10-11T12:00:00Z'), permission)
assert.equal(external.final_matching_state, 'READY', 'public distribution denial does not veto private matching')
assert.equal(external.catalog_state, 'NOT_READY')
assert.equal(external.alerts_state, 'NOT_READY')
assert.equal(external.seo_state, 'NOT_READY')
assert.equal(external.source_matching_state, 'ALLOWED')

const restricted = classifyOpportunityUniverse({ ...rich, source: 'wwr' }, [{ source: 'wwr', is_enabled: true, matching_enabled: true,
  catalog_enabled: false, alerts_enabled: false, seo_enabled: false,
  consumer_switch_overrides: { catalog: false, alerts: false, seo: false } }], null, new Date('2026-10-11T12:00:00Z'), explicitMatchingDeny)
assert.equal(restricted.final_matching_state, 'NOT_READY', 'explicit candidate-presentation DENIED is enforced')

const recruiter = classifyOpportunityUniverse({ ...rich, id: 'recruiter-open', source: 'recruiter_b2b',
  verification_status: 'pending' }, [{ source: 'recruiter_b2b', is_enabled: true, matching_enabled: true,
  catalog_enabled: false, alerts_enabled: false, seo_enabled: false, web_catalog_allowed: false,
  search_engine_indexing_allowed: false, google_jobs_distribution_allowed: false,
  third_party_job_distribution_allowed: false, consumer_permission_states: { matching: 'UNKNOWN' } }],
  null, new Date('2026-10-11T12:00:00Z'), permission)
assert.equal(recruiter.lifecycle_state, 'ACTIVE_VALID')
assert.equal(recruiter.lifecycle_reason, 'PUBLISHER_DECLARED_OPEN_FACTUAL_PENDING')
assert.equal(recruiter.matching_row_state, 'READY')
assert.equal(recruiter.final_matching_state, 'READY')
assert.equal(recruiter.catalog_state, 'NOT_READY')
assert.equal(recruiter.seo_state, 'NOT_READY')
assert.equal(recruiter.source_matching_state, 'UNKNOWN')
assert.ok(recruiter.source_permission_unknown_dimensions.includes('matching'))
assert.ok(recruiter.unresolved_dimensions.includes('MATCHING_PERMISSION_UNKNOWN:ADVISORY_PRIVATE_MATCHING'))
assert.equal((recruiter.provenance as any).private_matching_permission_effect, 'ADVISORY_EVIDENCE')

const recruiterUnknownSwitchPolicy = [{ source: 'recruiter_b2b', is_enabled: true, matching_enabled: null,
  catalog_enabled: false, alerts_enabled: false, seo_enabled: false, web_catalog_allowed: false,
  search_engine_indexing_allowed: false, google_jobs_distribution_allowed: false,
  third_party_job_distribution_allowed: false, consumer_permission_states: { matching: 'UNKNOWN' as const } }]
const openRecruiters = [1, 2, 3].map(index => classifyOpportunityUniverse({ ...rich,
  id: `recruiter-open-${index}`, source: 'recruiter_b2b', verification_status: 'pending' },
  recruiterUnknownSwitchPolicy, null, new Date('2026-10-11T12:00:00Z'), permission))
for (const item of openRecruiters) {
  assert.equal(item.lifecycle_state, 'ACTIVE_VALID')
  assert.equal(item.source_matching_operational_state, 'UNKNOWN', 'the absent switch remains UNKNOWN evidence')
  assert.equal(item.source_matching_state, 'UNKNOWN', 'permission is not promoted to ALLOWED')
  assert.equal(item.final_matching_state, 'READY', 'absence of a private-matching prohibition is not an automatic veto')
  assert.ok(item.unresolved_dimensions.includes('SOURCE_MATCHING_SWITCH'))
  assert.ok(item.unresolved_dimensions.includes('MATCHING_PERMISSION_UNKNOWN:ADVISORY_PRIVATE_MATCHING'))
  assert.equal((item.provenance as any).private_matching_operational_effect, 'ADVISORY_ABSENCE_OF_DECISION')
}

const historicalScraper = classifyOpportunityUniverse({ ...rich, id: 'historical-jobicy-unknown-switch' },
  [{ source: 'jobicy', is_enabled: true, matching_enabled: null,
    consumer_switch_overrides: { matching: null, catalog: false, alerts: false, seo: false } }],
  null, new Date('2026-10-11T12:00:00Z'), permission)
assert.equal(historicalScraper.source_matching_operational_state, 'UNKNOWN')
assert.equal(historicalScraper.final_matching_state, 'READY', 'historical scraper inventory is recoverable without public distribution')
assert.ok(historicalScraper.unresolved_dimensions.includes('SOURCE_MATCHING_SWITCH'))
assert.equal(historicalScraper.first_failure, 'FINAL_MATCHING_UNIVERSE')

const closed = classifyOpportunityUniverse({ ...rich, id: 'recruiter-closed', source: 'recruiter_b2b',
  is_active: false, verification_status: 'pending' }, [{ source: 'recruiter_b2b', is_enabled: true,
  matching_enabled: true, catalog_enabled: false, alerts_enabled: false, seo_enabled: false,
  consumer_permission_states: { matching: 'UNKNOWN' } }], null, new Date('2026-10-11T12:00:00Z'), permission)
assert.equal(closed.lifecycle_state, 'INACTIVE_VALID')
assert.equal(closed.final_matching_state, 'NOT_READY')
const closedRecruiters = [closed, classifyOpportunityUniverse({ ...rich, id: 'recruiter-closed-2', source: 'recruiter_b2b',
  is_active: false, verification_status: 'pending' }, recruiterUnknownSwitchPolicy, null,
  new Date('2026-10-11T12:00:00Z'), permission)]
for (const item of closedRecruiters) {
  assert.equal(item.lifecycle_state, 'INACTIVE_VALID')
  assert.equal(item.final_matching_state, 'NOT_READY', 'publisher closure is a hard lifecycle barrier')
}

const expiredPrivate = classifyOpportunityUniverse({ ...rich, id: 'expired-private', deadline: '2020-01-01' },
  [{ source: 'jobicy', is_enabled: true, matching_enabled: null }], null,
  new Date('2026-10-11T12:00:00Z'), permission)
assert.equal(expiredPrivate.lifecycle_state, 'EXPIRED')
assert.equal(expiredPrivate.final_matching_state, 'NOT_READY')
const hardDeadPrivate = classifyOpportunityUniverse({ ...rich, id: 'hard-dead-private' },
  [{ source: 'jobicy', is_enabled: true, matching_enabled: true }],
  { id: 'dead-observation', source: 'jobicy', identity_status: 'DEAD', http_status: 404,
    observed_at: '2026-10-11T13:00:00Z' }, new Date('2026-10-11T14:00:00Z'), permission)
assert.equal(hardDeadPrivate.lifecycle_state, 'HARD_DEAD')
assert.equal(hardDeadPrivate.final_matching_state, 'NOT_READY')

const matchingAliasConflict = classifyOpportunityUniverse({ ...rich, id: 'matching-alias-conflict' }, [
  { source: 'jobicy', is_enabled: true, matching_enabled: true },
  { source: 'jobicy', is_enabled: true, matching_enabled: true, consumer_switch_overrides: { matching: false } },
], null, new Date('2026-10-11T12:00:00Z'), permission)
assert.equal(matchingAliasConflict.source_matching_operational_state, 'UNKNOWN')
assert.equal(matchingAliasConflict.final_matching_state, 'UNKNOWN', 'a real conflicting operator decision remains blocking and diagnosable')

const oracleCases: Array<[string, OracleInput, 'READY' | 'NOT_READY' | 'UNKNOWN']> = [
  ['open-unknown-advisory', { lifecycle: 'ACTIVE_VALID', row: 'READY', permission: 'UNKNOWN', source: 'UNKNOWN', matchingSwitch: 'UNKNOWN' }, 'READY'],
  ['explicit-permission-deny', { lifecycle: 'ACTIVE_VALID', row: 'READY', permission: 'DENIED', source: 'ENABLED', matchingSwitch: 'ALLOWED' }, 'NOT_READY'],
  ['explicit-switch-disable', { lifecycle: 'ACTIVE_VALID', row: 'READY', permission: 'UNKNOWN', source: 'ENABLED', matchingSwitch: 'DENIED' }, 'NOT_READY'],
  ['source-conflict', { lifecycle: 'ACTIVE_VALID', row: 'READY', permission: 'UNKNOWN', source: 'CONFLICT', matchingSwitch: 'UNKNOWN' }, 'UNKNOWN'],
  ['closed', { lifecycle: 'INACTIVE_VALID', row: 'NOT_READY', permission: 'UNKNOWN', source: 'UNKNOWN', matchingSwitch: 'UNKNOWN' }, 'NOT_READY'],
  ['expired', { lifecycle: 'EXPIRED', row: 'NOT_READY', permission: 'ALLOWED', source: 'ENABLED', matchingSwitch: 'ALLOWED' }, 'NOT_READY'],
  ['lifecycle-uncertain', { lifecycle: 'LIFECYCLE_UNKNOWN', row: 'UNKNOWN', permission: 'ALLOWED', source: 'ENABLED', matchingSwitch: 'ALLOWED' }, 'UNKNOWN'],
  ['source-identity-missing', { lifecycle: 'ACTIVE_VALID', row: 'READY', sourceIdentity: false, permission: 'UNKNOWN', source: 'UNKNOWN', matchingSwitch: 'UNKNOWN' }, 'UNKNOWN'],
]
for (const [name, input, expected] of oracleCases) assert.equal(sqlContractOracle(input), expected, name)
assert.equal(sqlContractOracle({ lifecycle: recruiter.lifecycle_state, row: recruiter.matching_row_state,
  permission: recruiter.source_matching_state, source: recruiter.source_operational_state,
  matchingSwitch: recruiter.source_matching_operational_state }), recruiter.final_matching_state)
assert.equal(sqlContractOracle({ lifecycle: restricted.lifecycle_state, row: restricted.matching_row_state,
  permission: restricted.source_matching_state, source: restricted.source_operational_state,
  matchingSwitch: restricted.source_matching_operational_state }), restricted.final_matching_state)
assert.equal(sqlContractOracle({ lifecycle: historicalScraper.lifecycle_state, row: historicalScraper.matching_row_state,
  permission: historicalScraper.source_matching_state, source: historicalScraper.source_operational_state,
  matchingSwitch: historicalScraper.source_matching_operational_state }), historicalScraper.final_matching_state)

const thin = classifyOpportunityUniverse({ ...rich, id: 'recruiter-thin', source: 'recruiter_b2b', title: 'Rol',
  description: 'Breve', requirements: [], verification_status: 'pending' }, [{ source: 'recruiter_b2b',
  is_enabled: true, matching_enabled: true, catalog_enabled: false, alerts_enabled: false, seo_enabled: false,
  consumer_permission_states: { matching: 'UNKNOWN' } }], null, new Date('2026-10-11T12:00:00Z'), permission)
assert.equal(thin.matching_row_state, 'NOT_READY')

const dictionary = buildDefaultDictionary()
const profile = { professional_title: 'Software Backend Developer', summary: 'Backend developer with Python SQL Docker and APIs.',
  profile_data: { habilidades: ['Python', 'SQL', 'Docker'], seniority: 'semi-senior', location: 'Asuncion, Paraguay',
    modality: 'remote', candidate_truth: { evidence: { professional_title: 'USER_CONFIRMED', skills: 'USER_CONFIRMED' } },
    candidate_eligibility: { version: 1, residence_country: 'PY', citizenship_countries: [], work_authorization_countries: [],
      evidence: { residence_country: 'USER_CONFIRMED', citizenship_countries: 'UNKNOWN', work_authorization_countries: 'UNKNOWN' } } } }
const base = { ...rich, source_match_state: 'ALLOWED', universe_final_matching_state: 'READY', verification_status: 'pending',
  match_eligible: true, remote: true, eligible_countries: ['py'], eligible_regions: [], requirements: [],
  tags: ['Python', 'SQL', 'Docker'], rubro: 'Technology' }
const candidates = [
  { ...base, id: 'excellent', match_eligible: false }, // legacy flag cannot override canonical Universe admission
  { ...base, id: 'medium', title: 'Software Support Engineer', tags: ['SQL'], description: 'Software support and SQL operations role. '.repeat(4) },
  { ...base, id: 'ineligible', eligible_countries: ['us'] },
  { ...base, id: 'unknown', eligible_countries: [], eligible_regions: [] },
]
const ranked = rankOpportunitiesV2(profile, candidates, dictionary, V2_PRESET_FULL,
  new Map([['excellent', .95], ['medium', .55], ['ineligible', .99], ['unknown', .8]]))
const decisions = new Map(ranked.decisions.map(({ opp, decision }) => [opp.id, decision]))
assert.equal(decisions.get('excellent')?.outcome, 'MATCH')
assert.equal(decisions.get('medium')?.outcome, 'MATCH')
assert.ok((decisions.get('excellent')?.score || 0) > (decisions.get('medium')?.score || 0))
assert.equal(decisions.get('ineligible')?.outcome, 'DENY')
assert.equal(decisions.get('unknown')?.outcome, 'ABSTAIN')
assert.ok(ranked.rankedPotentialV2.some(({ opp }) => opp.id === 'unknown'), 'unknown eligibility is visible only as potential')
assert.equal(decisions.size, candidates.length, 'every evaluated opportunity has an outcome')
const unknownTruthProfile = { ...profile, profile_data: { ...profile.profile_data,
  candidate_truth: { evidence: { professional_title: 'UNKNOWN', summary: 'UNKNOWN', skills: 'UNKNOWN',
    education: 'UNKNOWN', experience: 'UNKNOWN', languages: 'UNKNOWN', location: 'UNKNOWN', seniority: 'UNKNOWN' } } } }
const unknownTruthDecision = rankOpportunitiesV2(unknownTruthProfile, [{ ...base, id: 'unknown-candidate-truth' }], dictionary,
  V2_PRESET_FULL, new Map([['unknown-candidate-truth', .95]])).decisions[0].decision
assert.equal(unknownTruthDecision.outcome, 'ABSTAIN', 'missing candidate evidence never becomes a positive match')

const migration = source('supabase/migrations/202610110001_private_b2c_matching_consumer.sql')
const viewSql = migration.split('create or replace view public.opportunity_final_matching_universe')[1]
  .split('create or replace function public.match_opportunities')[0]
assert.match(viewSql, /final_matching_state='READY'/)
assert.doesNotMatch(viewSql, /catalog|seo|alerts_enabled|web_catalog|search_engine|google_jobs|third_party/i)
assert.match(migration, /when v_permission='DENIED' then 'NOT_READY'/)
assert.match(migration, /when v_lifecycle<>'ACTIVE_VALID' then/)
assert.match(migration, /MATCHING_PERMISSION_UNKNOWN:ADVISORY_PRIVATE_MATCHING/)
assert.match(migration, /'final_matching_reason',v_final_reason/)
assert.match(migration, /'first_failure',v_first_failure/)
assert.doesNotMatch(migration, /where value<>'MATCHING_PERMISSION_UNKNOWN'/)
assert.match(migration, /from public\.opportunity_final_matching_universe o/)
assert.match(migration, /match_opportunities_before_c4_20261011/)
assert.doesNotMatch(migration, /extensions\.vector/)
assert.match(migration, /query_embedding public\.vector\(384\)/)
assert.match(migration, /match_threshold double precision default 0\.3/)
assert.match(migration, /match_count integer default 20/)
assert.match(migration, /returns table\(\s*id text,\s*title text,\s*organization text,\s*location text,\s*rubro text,\s*tags text\[\],\s*description text,\s*application_url text,\s*source text,\s*similarity double precision\s*\)/s)
assert.match(migration, /match_opportunities_identity_changed_or_overloaded/)
assert.match(migration, /match_opportunities_owner_changed/)
assert.match(migration, /791d2b1e22edbb03f97770724fbb588b/)
assert.match(migration, /revoke execute on function public\.match_opportunities\(public\.vector,double precision,integer\)\s+from public,anon,authenticated/)
assert.match(migration, /grant execute on function public\.match_opportunities\(public\.vector,double precision,integer\)\s+to service_role/)
assert.match(migration, /match_opportunities_unrelated_acl_changed/)
assert.match(migration, /match_opportunities_acl_delta_mismatch/)
assert.match(migration, /v_after\.function_oid<>v_before\.function_oid/)
assert.match(migration, /position\('public\.opportunity_final_matching_universe' in pg_get_functiondef\(v_after\.function_oid\)\)=0/)
assert.equal((migration.match(/OPERATOR\(public\.<=>\)/g) || []).length, 3,
  'every vector-distance expression qualifies the operator under an empty search_path')
assert.match(migration, /public_vector_cosine_operator_contract_missing_or_ambiguous/)
assert.match(migration, /opportunity_universe_decision_identity_owner_or_acl_changed/)
assert.match(migration, /opportunity_universe_decision_backup_access_incompatible/)
assert.match(migration, /opportunity_universe_decision_backup_acl_mismatch/)
assert.match(migration, /aclexplode\(coalesce\(p\.proacl,acldefault\('f',p\.proowner\)\)\)/)
assert.doesNotMatch(migration, /revoke all on function public\.opportunity_universe_decision\(jsonb,jsonb,jsonb,jsonb\)/i)
assert.match(migration, /opportunity_final_matching_universe_contract_changed/)
assert.match(migration, /opportunity_final_matching_universe_access_incompatible/)
assert.doesNotMatch(migration, /drop\s+(?:view|table)[^;]*opportunity_final_matching_universe/i)
assert.doesNotMatch(migration, /update public\.opportunities|delete from public\.opportunities/)
assert.doesNotMatch(migration, /refresh_existing_recruiter_universe/)
assert.match(migration, /private_matching_c4_source_identity\(p_raw_source text\)/)
assert.match(migration, /EXPLICIT_ALIAS_OVERRIDES_CANONICAL_NAME_COLLISION/)
assert.match(migration, /MULTIPLE_ALIAS_ROWS_OR_TARGETS/)
assert.match(migration, /private_matching_c4_reconciliation_runs/)
assert.match(migration, /private_matching_c4_reconciliation_sources/)
assert.match(migration, /private_matching_c4_reconciliation_members/)
assert.match(migration, /opportunity_id text primary key/)
assert.match(migration, /private_matching_c4_reconciliation_batches/)
assert.match(migration, /private_matching_c4_reconciliation_outcomes/)
assert.match(migration, /p_limit<1 or p_limit>250/)
assert.match(migration, /v_refresh:=public\.refresh_opportunity_universe\(v_id,false\)/)
assert.match(migration, /from \(select opportunity_id from public\.private_matching_c4_reconciliation_members/)
assert.match(migration, /where status in \('PENDING','RUNNING'\) and identity_state='RESOLVED'/)
assert.match(migration, /STOP_FAILED_SOURCE/)
assert.match(migration, /resume_private_matching_c4_failed_source/)
assert.match(migration, /EXPLICIT_resume_private_matching_c4_failed_source_REQUIRED/)
assert.match(migration, /batch_identity_or_completeness_mismatch/)
assert.match(migration, /derived_universe_missing_after_refresh/)
assert.match(migration, /refresh_result_persistence_mismatch/)
assert.match(migration, /STOP_CONTRACT_DIGEST_DRIFT/)
assert.match(migration, /IMMUTABLE_EXISTING_MEMBERSHIP/)
assert.match(migration, /lock table public\.opportunities in share mode/)
assert.doesNotMatch(migration, /position\('public\.opportunities' in pg_get_viewdef/)
assert.match(migration, /d\.refobjid='public\.opportunities'::regclass/)
assert.match(migration, /d\.refobjid='public\.opportunity_universe_state'::regclass/)

const batch = source('supabase/functions/match-batch/index.ts')
assert.doesNotMatch(batch, /sourceMatchingAllowed\(sourcePolicyFor/)
assert.match(batch, /consumerUniverse = requestMode === 'alerts' \? 'opportunity_alert_universe' : 'opportunity_final_matching_universe'/)
assert.match(batch, /PUBLISHER_DECLARED_PENDING/)
const recruiterHandler = source('netlify/functions/validate-recruiter-token.ts')
const handlerCompile = ts.transpileModule(recruiterHandler, { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
}, reportDiagnostics: true })
assert.deepEqual((handlerCompile.diagnostics || []).filter(item => item.category === ts.DiagnosticCategory.Error), [],
  'the changed server handler must transpile without TypeScript syntax errors')
for (const action of ['update_vacancy', 'request_seo_plus', 'withdraw_seo_plus']) assert.match(recruiterHandler, new RegExp(`action === '${action}'`))
const seoMigration = source('supabase/migrations/202610110002_recruiter_update_and_seo_plus_request.sql')
assert.match(seoMigration, /explicit_public_indexing_consent_required/)
assert.match(seoMigration, /'NOT_CONTRACTED','CONSENT_RECORDED','NOT_EVALUATED'/)
assert.match(seoMigration, /'distribution_changed',false/)
assert.match(seoMigration, /delivery_status=case when current\.request_status='ACTIVE' then current\.delivery_status else 'NOT_EVALUATED' end/)
assert.doesNotMatch(seoMigration, /update\s+public\.opportunity_sources|insert\s+into\s+public\.opportunity_source_consumer_permissions/i)
assert.match(seoMigration, /update_recruiter_vacancy_atomic/)
assert.match(seoMigration, /update_mirror_mismatch/)
const recruiterUi = source('src/pages/Recruiters.tsx')
for (const phrase of ['SEO Plus', 'consentimiento', 'no activa el servicio', 'No garantiza', 'request_seo_plus', 'withdraw_seo_plus', 'update_vacancy']) assert.match(recruiterUi, new RegExp(phrase, 'i'))
const principles = source('WORKING_PRINCIPLES.md')
assert.match(principles, /PRIVATE B2C MATCHING IS A CORE CONSUMER, NOT PUBLIC DISTRIBUTION/)
const preflight = source('artifacts/release/r2-c4-preflight-readonly-20261011.sql')
const postApply = source('artifacts/release/r2-c4-post-apply-readonly-20261011.sql')
const rollback = source('artifacts/release/r2-c4-rollback-write-20261011.sql')
const matchingPostApply = source('artifacts/release/r2-c4-matching-post-apply-readonly-20261011.sql')
const backfillPreview = source('artifacts/release/r2-c4-private-matching-backfill-preview-readonly-20261011.sql')
const backfillPrepare = source('artifacts/release/r2-c4-private-matching-backfill-prepare-write-20261011.sql')
const backfillBatch = source('artifacts/release/r2-c4-private-matching-backfill-batch-write-20261011.sql')
const backfillResume = source('artifacts/release/r2-c4-private-matching-backfill-resume-write-20261011.sql')
const backfillVerify = source('artifacts/release/r2-c4-private-matching-backfill-verify-readonly-20261011.sql')
assert.match(preflight, /begin transaction read only/i)
assert.match(postApply, /begin transaction read only/i)
assert.match(backfillPreview, /begin transaction read only/i)
assert.match(backfillVerify, /begin transaction read only/i)
assert.deepEqual((backfillPreview.match(/\blimit\s+\d+\b/gi) || []).map(value => value.toLowerCase()),
  ['limit 1'], 'preview limits only each row latest-observation lookup, never the opportunity denominator')
assert.match(backfillPreview, /private_matching_c4_source_identity/)
assert.match(backfillPreview, /identity_review_members/)
assert.match(backfillPreview, /REFERENCE_ONLY_DIFFERENT_HISTORICAL_ALGORITHM_NOT_COMPARABLE/)
assert.match(backfillPrepare, /prepare_private_matching_c4_reconciliation\(\)/)
assert.match(backfillBatch, /reconcile_private_matching_c4_batch\(100\)/)
assert.match(backfillResume, /resume_private_matching_c4_failed_source/)
for (const writeArtifact of [backfillPrepare, backfillBatch, backfillResume]) {
  assert.match(writeArtifact, /set local role service_role/)
  assert.match(writeArtifact, /set_config\('request\.jwt\.claim\.role','service_role',true\)/)
}
assert.doesNotMatch(backfillBatch, /\bloop\b/i, 'operator batch artifact performs one bounded transaction only')
assert.match(backfillVerify, /denominator_identity_pass/)
assert.match(backfillVerify, /complete_identity_mismatches/)
assert.match(backfillVerify, /cumulative_histogram_mismatches/)
assert.match(backfillVerify, /c6dcc71299db2237f17d455729d238a7/)
assert.match(backfillVerify, /historical_8_5_3_preserved/)
assert.match(backfillVerify, /lifecycle_3_2_preserved/)
assert.match(backfillVerify, /public_consumer_promotions/)
assert.match(backfillVerify, /permission_global_digest/)
assert.match(backfillVerify, /permission_recruiter_digest/)
assert.match(backfillVerify, /source_policy_unchanged/)
for (const sql of [matchingPostApply, postApply, rollback]) {
  assert.doesNotMatch(sql, /extensions\.vector/)
  assert.match(sql, /public\.vector/)
}
assert.match(preflight, /to_regtype\('extensions\.vector'\)::text extensions_vector/,
  'preflight records the demonstrated absent legacy type as a negative diagnostic')
assert.doesNotMatch(preflight, /match_opportunities[^'\n]*extensions\.vector/)
assert.match(preflight, /public\.vector/)
assert.match(preflight, /exact_regprocedure/)
assert.match(preflight, /arguments_compatible/)
assert.match(preflight, /result_compatible/)
assert.match(preflight, /structural_contract_compatible/)
assert.match(preflight, /ACL_REMEDIATION_REQUIRED/)
assert.match(preflight, /authorized_input_acl_digest/)
assert.match(preflight, /overload_count/)
assert.match(preflight, /acl_digest/)
assert.match(matchingPostApply, /overload_count/)
assert.match(matchingPostApply, /contract_compatible/)
assert.match(matchingPostApply, /access_mismatched_roles/)
assert.match(matchingPostApply, /compatible_operator_count/)
assert.match(postApply, /overload_count/)
assert.match(postApply, /contract_compatible/)
assert.match(rollback, /c4_operational_rows_exist_forward_repair_required/)
assert.doesNotMatch(rollback, /(?:revoke|grant)[^;]*match_opportunities\(public\.vector/is,
  'rollback preserves the hardened RPC ACL instead of restoring public execution')
assert.match(rollback, /c4_rollback_requires_hardened_match_acl/)
assert.match(rollback, /c4_rollback_match_identity_or_hardened_acl_changed/)
assert.doesNotMatch(rollback, /(?:revoke|grant)[^;]*opportunity_universe_decision\(jsonb,jsonb,jsonb,jsonb\)/is,
  'rollback preserves the existing reducer ACL instead of replacing it')
assert.doesNotMatch(rollback, /delete\s+from\s+public\.(opportunities|recruiter_vacancies)/i)

const routingSummary = summarizeOpportunityUniverse([...openRecruiters, historicalScraper, ...closedRecruiters,
  restricted, expiredPrivate, hardDeadPrivate, matchingAliasConflict])
assert.equal(routingSummary.first_failure.FINAL_MATCHING_UNIVERSE, 4,
  'advisory UNKNOWN rows are counted as admitted, not as unexplained failures')
assert.equal(routingSummary.reconciliation_difference, 0)

const accounting = [external, restricted, recruiter, historicalScraper, ...openRecruiters, ...closedRecruiters,
  expiredPrivate, hardDeadPrivate, matchingAliasConflict, thin]
const included = accounting.filter(item => item.final_matching_state === 'READY').length
const excludedByReason = accounting.filter(item => item.final_matching_state !== 'READY').reduce((out, item) => {
  const reason = item.first_failure
  out[reason] = (out[reason] || 0) + 1
  return out
}, {} as Record<string, number>)
assert.equal(accounting.length, included + Object.values(excludedByReason).reduce((sum, count) => sum + count, 0))
console.log(JSON.stringify({ status: 'PASS', evidence: 'LOCAL_CONTRACT_AND_FIXTURE', inventory: { previous: accounting.length, evaluated: accounting.length, included, excluded: accounting.length - included, excluded_by_reason: excludedByReason }, matching: { excellent: decisions.get('excellent')?.outcome, medium: decisions.get('medium')?.outcome, ineligible: decisions.get('ineligible')?.outcome, eligibility_unknown: `${decisions.get('unknown')?.outcome}/POTENTIAL`, candidate_truth_unknown: unknownTruthDecision.outcome }, prod_validated: false }, null, 2))
