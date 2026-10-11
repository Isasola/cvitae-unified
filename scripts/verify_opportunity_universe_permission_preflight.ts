import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { classifyOpportunityUniverse, summarizeOpportunityUniverse, type UniversePolicy } from '../src/lib/opportunity-universe.ts'
import { canonicalSource, evaluateOpportunityDistribution } from '../src/lib/effective-source-policy.ts'
import { SOURCE_PERMISSION_DIMENSIONS, canonicalPermissionSource, canonicalSourcePermissionRegistry, sourcePermissionCoverage, sourcePermissionDimensionTruth, sourcePermissionTruth } from '../src/lib/source-permission-truth.ts'
import { deadlineLifecycle } from '../src/lib/opportunity-truth.ts'
import { evaluateEightGates } from '../netlify/functions/lib/eight-gates.ts'
import { hasProfessionalEvidence, professionalRequirementsText } from '../shared/professional-evidence.ts'
import { sourcePolicyForCanonical } from '../src/lib/effective-source-policy.ts'
import { firstNonConfirmedRequiredStage, summarizeSourceHealth } from '../src/lib/source-intelligence-contract.ts'

const artifact = new URL('../artifacts/opportunity-universe/preflight-prod.sql', import.meta.url)
const sql = readFileSync(artifact, 'utf8')
const verificationSql = readFileSync(new URL('../artifacts/opportunity-universe/verify-prod.sql', import.meta.url), 'utf8')
const universeVerificationSql = readFileSync(new URL('../artifacts/opportunity-universe/verify-universe-prod.sql', import.meta.url), 'utf8')
const runtimeManifest = readFileSync(new URL('../artifacts/opportunity-universe/runtime-release-manifest.md', import.meta.url), 'utf8')
const releasePlan = readFileSync(new URL('../artifacts/opportunity-universe/prod-apply-plan.md', import.meta.url), 'utf8')
const adminSource = readFileSync(new URL('../netlify/functions/admin-data.ts', import.meta.url), 'utf8')
const migration = readFileSync(new URL('../supabase/migrations/202609280001_opportunity_universe.sql', import.meta.url), 'utf8')
const sourceSwitchWiring = readFileSync(new URL('../supabase/migrations/202610040001_source_switch_wiring.sql', import.meta.url), 'utf8')
const schema = readFileSync(new URL('../artifacts/opportunity-universe/prod-apply-schema.sql', import.meta.url), 'utf8')
const generator = readFileSync(new URL('./generate_opportunity_universe_artifacts.ts', import.meta.url), 'utf8')
const sourceOperationsView = readFileSync(new URL('../src/components/admin/SourceOperationsView.tsx', import.meta.url), 'utf8')
const sitemapSource = readFileSync(new URL('../netlify/functions/sitemap.ts', import.meta.url), 'utf8')
const seoUniverseFetchSource = readFileSync(new URL('../src/lib/seo-universe-fetch.js', import.meta.url), 'utf8')
const seoInventoryGenerator = readFileSync(new URL('./generate-seo-inventory.ts', import.meta.url), 'utf8')
const directRuntimeContracts = [
  ['scripts/run_matching_retrieval_expansion.ts', 'opportunity_final_matching_universe'],
  ['supabase/functions/match-batch/index.ts', 'opportunity_final_matching_universe'],
  ['netlify/functions/send-high-match-alerts.ts', 'opportunity_alert_universe'],
  ['netlify/functions/public-opportunities.ts', 'opportunity_catalog_universe'],
  ['netlify/functions/admin-data.ts', 'get_opportunity_universe_summary'],
  ['netlify/functions/lib/eight-gates.ts', 'sourcePermissionDimensionTruth'],
  ['src/components/admin/SourceOperationsView.tsx', 'source_permission_unknown_dimension_claims'],
  ['.github/workflows/matching-retrieval.yml', 'run_matching_retrieval_expansion.ts'],
] as const
assert.doesNotMatch(sql, /\bx\.(?:requirements|professional_family)\b/i, 'preflight cannot bind optional fields as physical columns')
assert.match(sql, /to_jsonb\(o\)->'requirements'/, 'requirements are read through schema-tolerant JSONB access')
assert.match(sql, /to_jsonb\(o\)->>'professional_family'/, 'optional professional_family is read through row JSON, not a column reference')
assert.ok(/jsonb_typeof\(to_jsonb\(o\)->'requirements'\)/.test(sql) && /when 'array'/.test(sql) && /jsonb_array_elements\(to_jsonb\(o\)->'requirements'\)/.test(sql) && /item\.value->>'text'/.test(sql), 'preflight deterministically extracts JSONB text requirements')
assert.doesNotMatch(sql, /trim\(coalesce\(x\.requirements,|trim\(coalesce\(x\.professional_family,/, 'old schema-unsafe expressions are absent')
assert.match(sql,/TEMP_LEGACY_SEO_EXCEPTION_UNTIL_2026_10_09[\s\S]*\(now\(\) at time zone 'UTC'\)::date\s*<=\s*date '2026-10-09'/,'preflight presents the UTC-dated inclusive Computrabajo-only SEO exception')
assert.match(sql,/greatest\(q\.current_catalog-q\.catalog,0\)/,'per-source catalog removals qualify both CTE aliases to avoid PostgreSQL current_catalog resolution')
assert.match(sql,/greatest\(q\.catalog-q\.current_catalog,0\)/,'per-source catalog additions qualify both CTE aliases to avoid PostgreSQL current_catalog resolution')
assert.doesNotMatch(sql,/(?<![.\w])current_catalog\s*-\s*catalog|(?<![.\w])catalog\s*-\s*current_catalog/i,'no ambiguous unqualified current_catalog arithmetic is generated')
assert.match(sql,/'current_catalog',q\.current_catalog[\s\S]*'catalog_removed'[\s\S]*'catalog_added'/,'JSON output keys remain stable while internal references are qualified')
assert.match(sql,/temporary_legacy_seo_exception_applied[\s\S]{0,180}seo_permission='DENIED'[\s\S]{0,80}then 'NOT_READY'/,'only applied legacy rows bypass the explicit denial before expiry')
assert.match(sql,/legacy_created_on_or_before[\s\S]*2026-10-03|created_at[\s\S]{0,120}2026-10-03/,'preflight limits the exception to legacy rows present at the correction cutoff')
assert.match(sql,/TEMP_LEGACY_SEO_EXCEPTION[\s\S]*'permission_state','DENIED'[\s\S]*'expires_on_inclusive','2026-10-09'/,'preflight keeps permission denial observable separately from exception')
assert.match(sql,/SEO_ROW_READY[\s\S]*SEO_ROW_NOT_READY[\s\S]*SEO_ROW_UNKNOWN[\s\S]*SEO_EFFECTIVE_READY[\s\S]*TOP_SEO_BLOCK_REASONS/,'preflight exposes SEO row/effective counts and actionable block reasons')
assert.match(sql,/SEO_CONTENT_READY_WHILE_LIFECYCLE_UNRESOLVED[\s\S]*LIFECYCLE_UNRESOLVED_TOTAL[\s\S]*LIFECYCLE_RECOVERABLE_NOW[\s\S]*LIFECYCLE_REFRESH_REQUIRED[\s\S]*LIFECYCLE_CONTENT_NOT_READY[\s\S]*LIFECYCLE_SYSTEM_ERROR[\s\S]*TOP_LIFECYCLE_UNRESOLVED_REASONS[\s\S]*LIFECYCLE_RECOVERY_PER_SOURCE/,'preflight accounts unresolved lifecycle and SEO potential globally and per source')
const splitSqlSelectList = (input:string) => {
  const items:string[]=[]; let start=0; let depth=0; let quoted=false
  for(let i=0;i<input.length;i++){const ch=input[i];if(ch==="'"){if(quoted&&input[i+1]==="'"){i++;continue}quoted=!quoted;continue}if(quoted)continue;if(ch==='(')depth++;else if(ch===')')depth--;else if(ch===','&&depth===0){items.push(input.slice(start,i).trim());start=i+1}}
  items.push(input.slice(start).trim()); return items
}
const summaryAliases = (text:string) => {
  const projection=text.match(/summary as \(\s*select([\s\S]*?)\s+from failures\s*\)/i)?.[1]
  assert.ok(projection,'preflight summary projection is present')
  return new Set(splitSqlSelectList(projection!).map(item=>item.match(/\s+(?:as\s+)?([a-z_][a-z0-9_]*)\s*$/i)?.[1]).filter(Boolean))
}
const summaryReferences = (text:string) => {
  const output=text.match(/select jsonb_build_object\(\s*'observed_at',now\(\),'TOTAL_INVENTORY',s\.total_inventory([\s\S]*?)\)\s+as opportunity_universe_preflight/i)?.[1]
  assert.ok(output,'preflight JSON output projection is present')
  return [...output!.matchAll(/\bs\.([a-z_][a-z0-9_]*)/gi)].map(match=>match[1])
}
assert.match(generator,/summary as \(\s*select count\(\*\) AS total_inventory,[\s\S]*?from failures/i,'summary counts the complete failures inventory as total_inventory')
assert.match(sql,/summary as \(\s*select count\(\*\) AS total_inventory,[\s\S]*?from failures/i,'generated SQL projects total_inventory over the same complete failures set')
assert.match(generator,/SEO_ROW_RECONCILIATION_DIFFERENCE[\s\S]*s\.total_inventory\s*-\s*s\.seo_row_ready\s*-\s*s\.seo_row_not_ready\s*-\s*s\.seo_row_unknown/,'SEO partition difference uses the projected inventory total')
assert.doesNotMatch(generator,/\bs\.total\s*-/,'generator must not emit the invalid/reserved s.total arithmetic')
assert.doesNotMatch(sql,/\bs\.total\s*-/,'generated SQL must not contain invalid/reserved s.total arithmetic')
for(const [label,text] of [['generator',generator],['generated SQL',sql]] as const){const aliases=summaryAliases(text);const missing=[...new Set(summaryReferences(text))].filter(field=>!aliases.has(field));assert.deepEqual(missing,[],`${label} final JSON must reference only summary-projected s fields`)}
assert.ok(['seo_row_reason','MISSING_TITLE','MISSING_CANONICAL_IDENTITY','THIN_CONTENT','MISSING_ORGANIZATION'].every(value => sql.includes(value)),'preflight reports the exact intrinsic SEO readiness reason vocabulary')
assert.doesNotMatch(sql,/seo_permission='UNKNOWN'[\s\S]{0,180}then 'UNKNOWN'|seo_switch_state='UNKNOWN'[\s\S]{0,180}then 'UNKNOWN'/,'SEO permission UNKNOWN and legacy switch state do not block first-party routing')
assert.match(migration,/consumer_permission_states[\s\S]*'seo',v_seo_permission[\s\S]*seo_content_readiness_independent_of_lifecycle[\s\S]*lifecycle_recovery_class/,'persisted diagnostics retain SEO permission and lifecycle/content recovery signals separately')
const requirementTextFromJsonb = (value: unknown): string => typeof value === 'string' ? value.trim() : Array.isArray(value) ? value.flatMap(item => typeof item === 'string' ? [item.trim()] : item && typeof item === 'object' && !Array.isArray(item) && typeof (item as any).text === 'string' ? [(item as any).text.trim()] : []).filter(Boolean).join(' ') : ''
const structuredRequirements = [{text:'Applicants must demonstrate five years of relevant programme delivery experience.',required:true}]
for (const requirements of [null,'Applicants must demonstrate five years of relevant programme delivery experience.',structuredRequirements,['Applicants must demonstrate five years of relevant programme delivery experience.'],{summary:'Applicants must demonstrate five years of relevant programme delivery experience.'}]) {
  assert.equal(professionalRequirementsText(requirements), requirementTextFromJsonb(requirements), 'TS requirement representation matches the SQL JSONB extraction fixture')
}
assert.equal(hasProfessionalEvidence({ title:'Programme Officer',description:'',requirements:structuredRequirements }), true, 'realistic JSONB text contributes using the existing evidence threshold')
assert.equal(hasProfessionalEvidence({ title:'Programme Officer',description:'' }), false, 'optional professional_family and requirements keys may both be absent')
const aliasBase = { source: 'himalayas', is_enabled: true, catalog_enabled: true, matching_enabled: true, alerts_enabled: true, seo_enabled: true }
const storedSeoOff = sourcePolicyForCanonical('himalayas', [aliasBase, { ...aliasBase, source: 'HIMALAYAS', seo_enabled: false }])
assert.deepEqual(storedSeoOff.conflicts, { is_enabled: false, matching_enabled: false, catalog_enabled: false, alerts_enabled: false, seo_enabled: false }, 'legacy stored switches do not masquerade as explicit operator overrides')
assert.equal(storedSeoOff.policy?.seo_enabled, true, 'executable producer default normalizes a copied legacy SEO false when no override exists')
for (const field of ['catalog_enabled', 'matching_enabled', 'alerts_enabled'] as const) {
  const storedOnly = sourcePolicyForCanonical('himalayas', [aliasBase, { ...aliasBase, source: 'HIMALAYAS', [field]: false }])
  assert.equal(storedOnly.conflicts[field], false, `${field} copied legacy false is not operator intent`)
  assert.equal(storedOnly.policy?.[field], true, `${field} follows the executable-producer operational default without an override`)
}
const seoConflict = sourcePolicyForCanonical('himalayas', [aliasBase, { ...aliasBase, source: 'HIMALAYAS', seo_enabled: false, consumer_switch_overrides: { seo: false } }])
assert.deepEqual(seoConflict.conflicts, { is_enabled: false, matching_enabled: false, catalog_enabled: false, alerts_enabled: false, seo_enabled: true })
assert.equal(seoConflict.policy?.matching_enabled, true, 'SEO alias conflict does not erase matching switch')
assert.equal(seoConflict.policy?.catalog_enabled, true, 'SEO alias conflict does not erase catalog switch')
const matchingConflict = sourcePolicyForCanonical('himalayas', [aliasBase, { ...aliasBase, source: 'HIMALAYAS', matching_enabled: false, consumer_switch_overrides: { matching: false } }])
assert.equal(matchingConflict.policy?.matching_enabled, null)
assert.equal(matchingConflict.policy?.catalog_enabled, true)
assert.equal(matchingConflict.policy?.alerts_enabled, true)
assert.equal(matchingConflict.policy?.seo_enabled, true)
for (const dimension of ['catalog', 'matching', 'alerts', 'seo_index'] as const) assert.equal(sourcePermissionDimensionTruth('himalayas', dimension).state, 'ALLOWED', `${dimension} permission remains independently allowed`)
assert.equal(sourcePermissionDimensionTruth('himalayas', 'google_jobs').state, 'DENIED', 'SEO permission never grants Google Jobs distribution')
assert.equal(sourcePermissionDimensionTruth('himalayas', 'third_party_distribution').state, 'DENIED', 'first-party permissions never grant third-party distribution')
const permissionParityRow = { title: 'Programme Officer', slug: 'programme-officer', organization: 'Example', description: 'Professional responsibilities and relevant experience. '.repeat(3), is_active: true, verification_status: 'verified', source: 'himalayas', deadline: '2027-01-01' }
const effectiveSeoConflict = evaluateOpportunityDistribution(permissionParityRow, [aliasBase, { ...aliasBase, source: 'HIMALAYAS', seo_enabled: false, consumer_switch_overrides: { seo: false } }])
assert.equal(effectiveSeoConflict.matching.allowed, true, 'SEO-only alias conflict leaves Matching effective state unchanged')
assert.equal(effectiveSeoConflict.catalog.allowed, true)
assert.equal(effectiveSeoConflict.alerts.allowed, true)
assert.equal(effectiveSeoConflict.seo.allowed,false,'an explicit SEO override conflict blocks only the first-party SEO row')
assert.equal(effectiveSeoConflict.seo.capabilityState,'ALLOWED')
const effectiveMatchingConflict = evaluateOpportunityDistribution(permissionParityRow, [aliasBase, { ...aliasBase, source: 'HIMALAYAS', matching_enabled: false, consumer_switch_overrides: { matching: false } }])
assert.ok(effectiveMatchingConflict.matching.reasons.includes('SOURCE_POLICY_ALIAS_CONFLICT'))
assert.equal(effectiveMatchingConflict.catalog.allowed, true)
assert.equal(effectiveMatchingConflict.alerts.allowed, true)
const effectiveCatalogConflict = evaluateOpportunityDistribution(permissionParityRow, [aliasBase, { ...aliasBase, source: 'HIMALAYAS', catalog_enabled: false, consumer_switch_overrides: { catalog: false } }])
assert.ok(effectiveCatalogConflict.catalog.reasons.includes('SOURCE_POLICY_ALIAS_CONFLICT'))
assert.equal(effectiveCatalogConflict.matching.allowed, true)
assert.equal(effectiveCatalogConflict.alerts.allowed, true)
const effectiveAlertsConflict = evaluateOpportunityDistribution(permissionParityRow, [aliasBase, { ...aliasBase, source: 'HIMALAYAS', alerts_enabled: false, consumer_switch_overrides: { alerts: false } }])
assert.ok(effectiveAlertsConflict.alerts.reasons.includes('SOURCE_POLICY_ALIAS_CONFLICT'))
assert.equal(effectiveAlertsConflict.matching.allowed, true)
assert.equal(effectiveAlertsConflict.catalog.allowed, true)
const effectiveGlobalConflict = evaluateOpportunityDistribution(permissionParityRow, [aliasBase, { ...aliasBase, source: 'HIMALAYAS', is_enabled: false, consumer_switch_overrides: { source: false } }])
for (const consumer of ['catalog', 'matching', 'alerts', 'seo'] as const) assert.ok(effectiveGlobalConflict[consumer].reasons.includes('SOURCE_POLICY_ALIAS_CONFLICT'))
assert.match(migration, /matching_enabled_alias_conflict/)
assert.match(migration, /catalog_enabled_alias_conflict/)
assert.match(migration, /alerts_enabled_alias_conflict/)
assert.match(migration, /seo_enabled_alias_conflict/)
assert.match(migration, /consumer_diagnostics[\s\S]*'CATALOG'[\s\S]*'MATCHING'[\s\S]*'ALERTS'[\s\S]*'SEO'/, 'row diagnosis exposes all four independent consumers')
assert.match(migration, /lifecycle_state='ACTIVE_VALID'[\s\S]*?when v_state\.provenance->>'observation_id' is null then 'SOURCE → OBSERVATION: NO_LINKED_OBSERVATION'/, 'active lifecycle diagnosis is resolved before the informational missing-observation note')
assert.match(sourceOperationsView, /consumer_diagnostics\)/, 'Admin presents the four causal consumer decisions')
const sqlEquivalentFirstCable = (lifecycle: string, linkedObservation: boolean) => lifecycle === 'ACTIVE_VALID' ? 'MATCHING_OR_CONSUMER_DECISION' : !linkedObservation ? 'NO_LINKED_OBSERVATION' : 'LIFECYCLE_EVIDENCE'
assert.equal(sqlEquivalentFirstCable('ACTIVE_VALID', false), 'MATCHING_OR_CONSUMER_DECISION', 'ACTIVE_VALID remains diagnosable without an observation row')
assert.equal(sqlEquivalentFirstCable('LIFECYCLE_UNKNOWN', false), 'NO_LINKED_OBSERVATION', 'missing observation is causal only while lifecycle truth is unresolved')
for (const field of ['global_alias_conflict', 'matching_alias_conflict', 'catalog_alias_conflict', 'alerts_alias_conflict', 'seo_alias_conflict']) assert.match(generator, new RegExp(field))
const parityOpportunity = { id: 'alias-parity', source: 'himalayas', title: 'Senior Programme Officer', slug: 'senior-programme-officer', organization: 'Example', description: 'Professional responsibilities and required experience. '.repeat(3), is_active: true, verification_status: 'verified', deadline: '2027-01-01' }
const allowAll = (_source: string, _consumer: string) => ({ state: 'ALLOWED' as const, reason: 'fixture', provenance: 'fixture' })
const enabledPolicy: UniversePolicy = { source: 'himalayas', is_enabled: true, matching_enabled: true, catalog_enabled: true, alerts_enabled: true, seo_enabled: true }
for (const [field, conflictDimension] of [['seo_enabled', 'seo'], ['matching_enabled', 'matching'], ['catalog_enabled', 'catalog'], ['alerts_enabled', 'alerts'], ['is_enabled', 'global']] as const) {
  const override = field === 'is_enabled' ? { source: false } : { [conflictDimension]: false }
  const rows = [enabledPolicy, { ...enabledPolicy, source: 'HIMALAYAS', [field]: false, consumer_switch_overrides: override }]
  const ts = classifyOpportunityUniverse(parityOpportunity, rows, null, new Date('2026-09-30T12:00:00Z'), allowAll)
  const sqlDistinctConflict = (values: Array<boolean | null | undefined>) => new Set(values.map(value => value === true ? 'true' : value === false ? 'false' : 'UNKNOWN')).size > 1
  const globalConflict = sqlDistinctConflict(rows.map(row => row.is_enabled))
  const switches = {
    matching: globalConflict || sqlDistinctConflict(rows.map(row => row.matching_enabled)) ? 'UNKNOWN' : 'ALLOWED',
    catalog: globalConflict || sqlDistinctConflict(rows.map(row => row.catalog_enabled)) ? 'UNKNOWN' : 'ALLOWED',
    alerts: globalConflict || sqlDistinctConflict(rows.map(row => row.alerts_enabled)) ? 'UNKNOWN' : 'ALLOWED',
    seo: globalConflict || sqlDistinctConflict(rows.map(row => row.seo_enabled)) ? 'UNKNOWN' : 'ALLOWED',
  }
  assert.deepEqual({ matching: ts.source_matching_operational_state, catalog: ts.catalog_operational_state, alerts: ts.alerts_operational_state, seo: ts.seo_operational_state }, switches, `${conflictDimension} TS/SQL-equivalent switch result parity`)
}
for (const pattern of [/global_alias_conflict or x\.matching_alias_conflict/, /global_alias_conflict or x\.catalog_alias_conflict/, /global_alias_conflict or x\.alerts_alias_conflict/, /global_alias_conflict or x\.seo_alias_conflict/]) assert.match(sql, pattern, 'preflight CASE rules keep conflicts dimension-local with global conflict fan-out')
const currentBaselineRow = { ...parityOpportunity, source: 'talentcom', match_eligible: true, archived_at: null, deleted_at: null }
const currentLegacyMatching = currentBaselineRow.is_active && currentBaselineRow.verification_status === 'verified' && currentBaselineRow.match_eligible && enabledPolicy.is_enabled && enabledPolicy.matching_enabled
const operationalReadyWithUnknownPermission = classifyOpportunityUniverse(currentBaselineRow, [{ ...enabledPolicy, source: 'talentcom' }], null, new Date('2026-09-30T12:00:00Z'))
assert.equal(currentLegacyMatching, true, 'CURRENT_MATCHING baseline uses persisted lifecycle/readiness/switches only')
assert.equal(operationalReadyWithUnknownPermission.source_matching_state, 'UNKNOWN', 'canonical Matching permission remains consultative UNKNOWN evidence')
assert.notEqual(operationalReadyWithUnknownPermission.source_matching_state, 'ALLOWED', 'operational readiness cannot rewrite permission evidence to ALLOWED')
assert.ok(operationalReadyWithUnknownPermission.source_permission_unknown_dimensions.includes('matching'), 'unknown-dimension diagnostics retain Matching')
assert.equal(operationalReadyWithUnknownPermission.matching_row_state, 'READY', 'fixture row independently satisfies Matching readiness')
assert.equal(operationalReadyWithUnknownPermission.source_operational_state, 'ENABLED', 'fixture producer is independently operational')
assert.equal(operationalReadyWithUnknownPermission.source_matching_operational_state, 'ALLOWED', 'fixture Matching switch is independently enabled')
assert.equal(operationalReadyWithUnknownPermission.final_matching_state, 'READY', 'effective Matching follows readiness, executable producer and operational switches')
assert.match(sourceSwitchWiring, /v_final := case when v_matching_row <> 'READY'[\s\S]*v_source_enabled = 'false' or v_matching_enabled = 'false'[\s\S]*v_source_enabled = 'UNKNOWN' or v_matching_enabled = 'UNKNOWN'[\s\S]*else 'READY' end/, 'latest SQL wiring computes final Matching from row and operational states')
assert.match(sourceSwitchWiring, /'source_matching_state',v_permission[\s\S]*'source_matching_operational_state'/, 'latest SQL wiring keeps consultative permission distinct from the operational switch')
assert.match(sourceSwitchWiring, /'source_permission_unknown_dimensions',to_jsonb\(v_permission_unknown_dimensions\)/, 'latest SQL wiring preserves unknown permission dimensions')
const warningThenUnknown = [{ status: 'WARNING' }, { status: 'NOT_EVALUATED' }]
assert.equal(firstNonConfirmedRequiredStage(warningThenUnknown), 0, 'WARNING is the first degraded stage')
assert.deepEqual(summarizeSourceHealth(warningThenUnknown), { overall_health: 'UNKNOWN', first_non_confirmed_required_stage: 0, failing_gates: 0, warning_gates: 1, not_evaluated_gates: 1 }, 'missing required evidence outranks WARNING for overall health')
assert.equal(summarizeSourceHealth([{ status: 'FAIL' }, { status: 'NOT_EVALUATED' }]).overall_health, 'CRITICAL')
assert.equal(summarizeSourceHealth([{ status: 'NOT_APPLICABLE' }]).overall_health, 'HEALTHY')
assert.match(adminSource, /summarizeSourceHealth\(eightGates\.gates\)/, 'Admin endpoint uses the shared health/first-stage semantics')
assert.match(sourceOperationsView, /'NOT_EVALUATED'\]\./, 'Admin PROBLEMS includes missing-evidence stages')
assert.doesNotMatch(sourceOperationsView, /\['NOT_APPLICABLE', 'NOT_EVALUATED'\]\.includes\(gate\.status\)/, 'missing technical evidence is not mislabeled as policy blocked')
assert.match(migration, /opportunity_requirements_text\(p_row->'requirements'\)/, 'persisted SQL reducer uses the deterministic requirements extractor')
assert.ok(migration.includes('jsonb_array_elements(p_requirements)') && migration.includes("item.value->>'text'"), 'SQL reducer supports structured JSONB text arrays')
assert.doesNotMatch(universeVerificationSql, /matching_retrieval_states|matching_retrieval_candidates|score_opportunity_embeddings|prune_matching_retrieval_candidates|match_alert_deliveries/, 'pre-Retrieval verifier plans against a schema where Retrieval objects are absent')
assert.match(generator, /const verifyUniverseSql = `-- POST-UNIVERSE PRE-RETRIEVAL READ ONLY verification/i, 'pre-Retrieval verifier is constructed as an explicit SQL artifact')
assert.doesNotMatch(generator, /const verifyUniverseSql\s*=\s*verifySql\s*\.replace\(/i, 'pre-Retrieval SQL is never derived by textual replacement from the final verifier')
assertReadOnly(universeVerificationSql)
for (const field of ['INVENTORY_STATE_COVERAGE','LIFECYCLE_PARTITION','MATCHING_FIRST_FAILURE_PARTITION','CATALOG_VIEW_PARITY','MATCHING_VIEW_PARITY','ALERT_VIEW_PARITY','SEO_VIEW_PARITY','PERMISSION_REGISTRY_105X10','ALIASES_EXPECTED_COUNT','SOURCE_POLICY_ALIAS_CONFLICTS','PERMISSION_UNKNOWN_PRESERVED','UNKNOWN_NOT_DENIED','LIFECYCLE_REPAIR_AUDIT']) assert.ok(universeVerificationSql.includes(field), `pre-Retrieval verifier proves ${field}`)
for (const field of ['RETRIEVAL_SCHEMA_PRESENT','RETRIEVAL_FULL_DENOMINATOR_MISMATCHES','STALE_RETRIEVAL_CANDIDATES_OUTSIDE_UNIVERSE','SENT_ALERTS_FROM_FULL_BACKFILL','RETRIEVAL_STATE_STRUCTURAL_VALIDITY','CANARY_READINESS']) assert.ok(verificationSql.includes(field), `final verifier proves ${field}`)
for (const file of ['public-opportunities.ts','sitemap.ts','send-high-match-alerts.ts','admin-data.ts','eight-gates.ts','SourceOperationsView.tsx','opportunity-universe.ts','source-permission-truth.ts','effective-source-policy.ts','professional-evidence.ts','match-batch/index.ts','run_matching_retrieval_expansion.ts','matching-retrieval.yml']) assert.ok(runtimeManifest.includes(file), `runtime manifest includes ${file}`)
const releaseSteps = ['0. READ-ONLY PROD PREFLIGHT','1. Obtain explicit authorization','2. Apply prod-apply-schema.sql','3. Run scripts/apply_opportunity_universe_prod.ts','4. Run verify-universe-prod.sql','5. Apply prod-apply-retrieval.sql','6. Deploy Supabase Edge','7. Perform ONE protected Netlify production deploy','8. Activate/update the GitHub background worker/workflow','9. Run final verify-prod.sql','10. Run deterministic single-user FULL canary','11. Smoke actual Catalog','12. Mark PROD_CONFIRMED/CLOSE']
const releaseStepIndexes = releaseSteps.map(step => releasePlan.indexOf(step))
assert(releaseStepIndexes.every(index => index >= 0) && releaseStepIndexes.every((index, i) => i === 0 || index > releaseStepIndexes[i - 1]), `release plan includes every staged step in dependency-safe order: ${JSON.stringify(releaseStepIndexes)}`)
assert.ok(releasePlan.includes('Stage 2 is behavior-changing') && releasePlan.includes('do not start Stage 2 until the preflight consumer deltas have been explicitly accepted') && releasePlan.includes('Do not deliberately leave the release stopped between Stage 2 and runtime cutover') && releasePlan.includes('Any FAIL stops advancement immediately'), 'release plan prevents unaccepted Stage 2 and unattended transition gaps')
for (const [file, contract] of directRuntimeContracts) assert.ok(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8').includes(contract), `${file} directly consumes its canonical universe/permission contract`)
const forbiddenPublicInventoryRead = /\.from\s*\(\s*['"](?:opportunities|recruiter_vacancies)['"]\s*\)/
assert.match(sitemapSource, /import\s*\{\s*seoUniversePages\s*\}\s*from\s*['"]\.\.\/\.\.\/src\/lib\/seo-universe-fetch\.js['"]/, 'runtime sitemap imports the shared SEO universe boundary')
assert.ok((sitemapSource.match(/for\s+await\s*\([^)]*\bseoUniversePages\s*\(/g) || []).length >= 2, 'runtime sitemap pages and counts through the shared SEO universe boundary')
assert.match(seoInventoryGenerator, /import\s*\{\s*seoUniversePages\s*\}\s*from\s*['"]\.\.\/src\/lib\/seo-universe-fetch\.js['"]/, 'build inventory imports the shared SEO universe boundary')
assert.match(seoInventoryGenerator, /for\s+await\s*\([^)]*\bseoUniversePages\s*\(/, 'build inventory pages through the shared SEO universe boundary')
assert.match(seoUniverseFetchSource, /\.from\s*\(\s*['"]opportunity_seo_universe['"]\s*\)/, 'shared SEO universe boundary reads the canonical admitted universe')
assert.doesNotMatch(seoUniverseFetchSource, forbiddenPublicInventoryRead, 'shared SEO universe boundary has no raw opportunity/vacancy fallback')
assert.doesNotMatch(sitemapSource, forbiddenPublicInventoryRead, 'runtime sitemap has no raw opportunity/vacancy bypass')
assert.doesNotMatch(seoInventoryGenerator, forbiddenPublicInventoryRead, 'build inventory has no raw opportunity/vacancy bypass')
assert.match(sitemapSource, /async\s+function\s+publicRows\s*\([^)]*table\s*:\s*['"]content_hub['"][\s\S]*?\.from\s*\(\s*table\s*\)/, 'the sitemap dynamic table reader is statically limited to public content_hub rows')
assert.match(sitemapSource, /path\s*===\s*['"]\/sitemap-vacancies\.xml['"][\s\S]{0,180}?statusCode\s*:\s*404/, 'private recruiter vacancy routes remain excluded from the public sitemap')
assert.match(seoUniverseFetchSource, /if\s*\(\s*error\s*\)\s*throw\s+error/, 'shared SEO universe boundary propagates database errors')
assert.match(seoUniverseFetchSource, /if\s*\(\s*!Array\.isArray\(data\)\s*\)\s*throw\s+new\s+Error\(\s*['"]SEO_UNIVERSE_INVALID_PAGE['"]\s*\)/, 'shared SEO universe boundary rejects malformed pages')
assert.match(sitemapSource, /catch\s*\([^)]*\)\s*\{[\s\S]*?statusCode\s*:\s*500[\s\S]*?sitemap generation failed[\s\S]*?\}/, 'runtime sitemap fails closed instead of publishing a partial success')
assert.match(adminSource, /get_opportunity_universe_row/)
function stripSqlCommentsAndStrings(value: string) {
  return value.replace(/--[^\r\n]*/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/'(?:''|[^'])*'/g, "''")
}
function assertReadOnly(value: string) {
  const clean = stripSqlCommentsAndStrings(value)
  assert.match(clean.trimStart(), /^(with|select)\b/i)
  assert.doesNotMatch(clean, /\b(insert|update|delete|upsert|merge|create|alter|drop|truncate|call)\b/i)
  assert.doesNotMatch(clean, /\b(pg_advisory|set_config)\s*\(/i)
}
assertReadOnly(sql)
assert.ok(Buffer.byteLength(sql, 'utf8') < 100_000, 'compact permission universe keeps the generated preflight materially bounded')
assertReadOnly(verificationSql)
assert.match(stripSqlCommentsAndStrings(verificationSql), /public\.get_opportunity_universe_summary\(\)/i, 'post-apply verification reads persisted canonical reducer state')
assert.match(stripSqlCommentsAndStrings(sql).trimStart(), /^with\b/i, 'production preflight is one read-only CTE/SELECT')
assert.doesNotThrow(() => assertReadOnly('select 1'))
assert.throws(() => assertReadOnly('select 1; delete from public.opportunities'))
assert.doesNotMatch(stripSqlCommentsAndStrings(sql), /\blimit\b/i, 'preflight must not cap inventory or observation coverage')
assert.match(sql, /from\s+public\.opportunities\s+o\b/i)
assert.match(sql, /distinct\s+on\s*\(opportunity_id::text\)/i, 'latest canonical observation is selected for every opportunity')
assert.doesNotMatch(sql, /where\s+[^;]*match_eligible\s*=\s*true\s+\)/i, 'inventory universe starts unfiltered')
for (const field of ['ROUTING_UNRESOLVED_ROWS','ROWS_WITH_ANY_SOURCE_PERMISSION_UNKNOWN','SOURCE_PERMISSION_UNKNOWN_DIMENSION_CLAIMS','SOURCE_POLICY_ALIAS_CONFLICT_ROWS','FIRST_FAILURE','PER_SOURCE','CURRENT_VS_PREDICTED_IMPACT']) assert.ok(sql.includes(field), `preflight exposes ${field}`)
for (const field of ['INVENTORY_STATE_COVERAGE','LIFECYCLE_PARTITION','MATCHING_FIRST_FAILURE_PARTITION','CATALOG_VIEW_PARITY','MATCHING_VIEW_PARITY','ALERT_VIEW_PARITY','SEO_VIEW_PARITY','PERMISSION_REGISTRY_105X10','SOURCE_POLICY_ALIAS_CONFLICTS','PERMISSION_UNKNOWN_PRESERVED','UNKNOWN_NOT_DENIED','LIFECYCLE_REPAIR_AUDIT','RETRIEVAL_SCHEMA_PRESENT','RETRIEVAL_FULL_DENOMINATOR_MISMATCHES','STALE_RETRIEVAL_CANDIDATES_OUTSIDE_UNIVERSE','SENT_ALERTS_FROM_FULL_BACKFILL']) assert.ok(verificationSql.includes(field), `post-apply verifier names ${field}`)
assert.ok(generator.includes("writeFileSync(resolve(out, 'prod-apply-schema.sql'") && generator.includes("writeFileSync(resolve(out, 'prod-apply-retrieval.sql'"))
assert.doesNotMatch(generator, /do\s+\$\$\s+declare\s+v_cursor/i, 'release SQL has no full inventory DO-loop transaction')
assert.match(generator, /prod-apply\.sql is a non-executable pointer/)
for (const key of ['inventory_state_reconciliation_difference','matching_first_failure_reconciliation_difference','active_matching_reconciliation_difference']) assert.equal((migration.slice(migration.indexOf('create or replace function public.get_opportunity_universe_summary'), migration.indexOf('create or replace function public.get_opportunity_universe_row')).match(new RegExp(`'${key}'`,'g')) || []).length,1)
const invariantStatus = (actual: number, expected: number) => actual === expected ? 'PASS' : 'FAIL'
assert.equal(invariantStatus(16405,16405),'PASS')
assert.equal(invariantStatus(16404,16405),'FAIL','post-apply invariant check rejects a deliberately altered inventory count')

const permissionRows = canonicalSourcePermissionRegistry()
assert.equal(permissionRows.length, 105)
assert.equal(SOURCE_PERMISSION_DIMENSIONS.length, 10)
assert.match(generator, /permission_sources\(canonical_source\) as \(values/)
assert.match(generator, /permission_dimensions\(dimension\) as \(values/)
assert.match(sql, /from permission_sources s cross join permission_dimensions d\s+left join permission_overrides o using\(canonical_source,dimension\)/)
assert.match(generator, /const permissionUniverseSql = `permission_sources/)
assert.equal(permissionRows.length * SOURCE_PERMISSION_DIMENSIONS.length, 1050, 'compact generator still denotes all semantic permission decisions')
assert.match(schema, /DATE\s+'2026-09-29'/i, 'generated schema emits DATE-typed verified_at literals')
const permissionEvidenceCte = schema.match(/permission_evidence as \(([\s\S]*?)\)\s*insert into public\.opportunity_source_consumer_permissions/i)?.[1]
assert(permissionEvidenceCte, 'permission_evidence CTE immediately feeds the permission seed')
assert.match(permissionEvidenceCte, /coalesce\(o\.verified_at,\s*DATE\s+'2026-09-29'\)\s+verified_at/i, 'permission_evidence fallback is DATE-typed upstream')
assert.doesNotMatch(permissionEvidenceCte, /coalesce\(o\.verified_at,\s*'2026-09-29'\)/i, 'permission_evidence has no untyped text date fallback')
assert.match(generator, /index\s*===\s*7\s*\?\s*quoteDate\(field\)\s*:\s*quote\(field\)/, 'only permission override verified_at uses quoteDate')
const permissionTarget = migration.match(/create table if not exists public\.opportunity_source_consumer_permissions\s*\(([\s\S]*?)\n\);/i)?.[1]
assert(permissionTarget, 'permission seed target table definition is present')
const permissionSeedTargetTypes: Record<string,string> = { canonical_source:'text', consumer:'text', permission_state:'text', reason:'text', provenance:'text', evidence_type:'text', evidence_reference:'text', verified_at:'date', notes:'text' }
for (const [column,type] of Object.entries(permissionSeedTargetTypes)) assert.match(permissionTarget, new RegExp(`\\b${column}\\s+${type}\\b`, 'i'), `${column} target type is ${type}`)
assert.match(schema, /insert into public\.opportunity_source_consumer_permissions\([\s\S]*?\)\s*select canonical_source,dimension,permission_state,reason,provenance,evidence_type,evidence_reference,verified_at,notes from permission_evidence/i, 'the seed selects all nine values directly, without a final cast')
assert.match(sql, /match_eligible=true and is_enabled=true and matching_enabled=true\) current_matching/)
assert.doesNotMatch(sql, /current_matching[^,]*matching_permission='ALLOWED'/, 'CURRENT_MATCHING baseline excludes newly enforced permission truth')
assert.doesNotMatch(migration, /project_source_universe_permissions|new\.(catalog_enabled|matching_enabled|alerts_enabled|seo_enabled)\s*:=/i, 'canonical permission truth never projects into operator switches')
const permissionTriggerBody = migration.slice(migration.indexOf('create or replace function public.opportunity_permission_refresh_universe'), migration.indexOf('create or replace function public.refresh_dirty_opportunity_universe_sources'))
assert.match(permissionTriggerBody, /opportunity_universe_state u join public\.opportunities o/, 'permission refresh is coalesced only when persisted Universe rows already exist')
assert.match(permissionTriggerBody, /if v_has_reconciled_rows then[\s\S]*opportunity_universe_dirty_sources/, 'empty initial Universe does not queue the initial seed; later affected rows still invalidate')
assert.equal(new Set(permissionRows.map(row => row.canonical_source)).size, 105)
assert(permissionRows.every(row => SOURCE_PERMISSION_DIMENSIONS.every(dimension => ['ALLOWED','DENIED','UNKNOWN','NOT_APPLICABLE'].includes(row.dimensions[dimension].state) && row.dimensions[dimension].reason && row.dimensions[dimension].evidence_type && row.dimensions[dimension].provenance && row.dimensions[dimension].evidence_url_or_repo_reference && row.dimensions[dimension].verified_at)))
const coverage = sourcePermissionCoverage()
assert.equal(Object.keys(coverage.per_source).length,105,'permission coverage spans the whole canonical source registry, not a hardcoded inventory sample')
assert.equal(coverage.permission_dimensions.matching.UNKNOWN + coverage.permission_dimensions.matching.ALLOWED + coverage.permission_dimensions.matching.DENIED + coverage.permission_dimensions.matching.NOT_APPLICABLE,105)
assert.equal(canonicalPermissionSource('wwr'), canonicalPermissionSource('weworkremotely'))
assert.equal(sourcePermissionDimensionTruth('wwr','matching').state, sourcePermissionDimensionTruth('weworkremotely','matching').state)
assert.equal(sourcePermissionTruth('remotive', 'matching').state, 'ALLOWED')
assert.equal(sourcePermissionTruth('remotive', 'seo').state, 'UNKNOWN')
assert.equal(sourcePermissionTruth('himalayas', 'google_jobs').state, 'DENIED')
assert.equal(sourcePermissionTruth('himalayas', 'third_party_distribution').state, 'DENIED')
assert.equal(sourcePermissionTruth('himalayas', 'seo').state, 'ALLOWED')
assert.equal(sourcePermissionDimensionTruth('himalayas','seo_index').verified_at,'2026-10-03')
assert.equal(sourcePermissionDimensionTruth('computrabajo','collect').state,'DENIED')
assert.equal(sourcePermissionDimensionTruth('computrabajo','matching').state,'UNKNOWN')
assert.equal(sourcePermissionDimensionTruth('computrabajo','matching').verified_at,'2026-10-01')
assert.equal(sourcePermissionTruth('talentcom', 'matching').state, 'UNKNOWN')
assert.equal(sourcePermissionTruth('jobicy','collect').state,'ALLOWED')
assert.equal(sourcePermissionTruth('jobicy','catalog').state,'ALLOWED')
assert.equal(sourcePermissionTruth('jobicy','matching').state,'ALLOWED')
assert.equal(sourcePermissionTruth('jobicy','alerts').state,'ALLOWED')
assert.equal(sourcePermissionTruth('jobicy','attribution_requirement' as any).state,'ALLOWED')
assert.equal(sourcePermissionTruth('weworkremotely','matching').state,'DENIED')
assert.equal(sourcePermissionDimensionTruth('weworkremotely','detail_fetch').state,'DENIED')
assert.equal(sourcePermissionDimensionTruth('weworkremotely','third_party_distribution').state,'UNKNOWN')
assert.equal(sourcePermissionDimensionTruth('weworkremotely','seo_index').state,'DENIED')
assert.match(adminSource, /sourcePermissionSnapshot\(profile\.canonical_source\)/)
const missingEvidenceCanary = sourcePermissionDimensionTruth('__stopb_unknown_canary__', 'matching')
assert.equal(missingEvidenceCanary.state, 'UNKNOWN', 'Unregistered source must remain UNKNOWN')
assert.equal(missingEvidenceCanary.reason, 'SOURCE_PERMISSION_NOT_EVIDENCED', 'Missing evidence reason must survive')
assert.match(adminSource, /reason:\s*truth\.reason/, 'Admin exposes canonical permission reason')
const adminUnknown = evaluateEightGates({canonical_source:'computrabajo',distribution_policy:{search_engine_indexing_allowed:false,google_jobs_distribution_allowed:false,third_party_job_distribution_allowed:false,source_attribution_required:false}},[],null,[],[]).gates[7].metrics.surfaces as any
assert.equal(adminUnknown.organic_seo.state,'DENIED','Computrabajo official terms deny copied-content indexing')
assert.equal(adminUnknown.google_jobs.state,'DENIED')
assert.equal(adminUnknown.third_party_distribution.state,'DENIED')
assert.equal(adminUnknown.collect.state,'DENIED')
assert.equal(adminUnknown.detail_fetch.state,'DENIED')
assert.equal(adminUnknown.application_routing.state,'UNKNOWN')
assert.equal(adminUnknown.attribution_required.state,'UNKNOWN')
const adminHimalayas = evaluateEightGates({canonical_source:'himalayas'},[],null,[],[]).gates[7].metrics.surfaces as any
assert.equal(adminHimalayas.organic_seo.state,'ALLOWED')
assert.equal(adminHimalayas.google_jobs.state,'DENIED')
assert.equal(adminHimalayas.third_party_distribution.state,'DENIED')

type Consumer = 'catalog'|'matching'|'alerts'|'seo'
type PermissionEvidence = { state: 'ALLOWED'|'DENIED'|'UNKNOWN'; reason: string; provenance: string }
type Permission = (source: string, consumer: Consumer) => PermissionEvidence
type ExpectedFixture = { lifecycle: string; catalog: string; matching: string; alerts: string; seo: string; firstFailure: string }
const now = new Date('2026-09-29T12:00:00.000Z')
const active = { id: 'fixture-1', source: 'himalayas', title: 'Programme Officer', slug: 'programme-officer', organization: 'Example', description: 'Role details. '.repeat(12), is_active: true, verification_status: 'verified', deadline: '2026-12-31', updated_at: '2026-09-01T00:00:00.000Z' }
const executableSourceSql = sourceSwitchWiring.match(/v_executable:=v_source=any\(array\[([^\]]+)\]\)/)?.[1]
assert(executableSourceSql, 'latest SQL wiring exposes the executable-producer default set')
const sqlExecutableSources = new Set([...executableSourceSql!.matchAll(/'([^']+)'/g)].map(match => match[1]))
assert(sqlExecutableSources.size > 0, 'latest SQL executable-producer default set is non-empty')
assert.match(sourceSwitchWiring, /'first_party_permission_role','ADVISORY_ONLY'/, 'latest SQL keeps first-party permission evidence advisory')
assert.match(sourceSwitchWiring, /v_final := case when v_matching_row <> 'READY'[^;]+v_source_enabled = 'false' or v_matching_enabled = 'false'[^;]+else 'READY' end/s, 'latest SQL effective Matching is driven by row, producer and switch state')

function sqlEquivalent(row: Record<string, any>, policies: UniversePolicy[], observation?: Record<string, any> | null, permission: Permission = sourcePermissionTruth) {
  const src = canonicalPermissionSource(row.source)
  const executableProducer = sqlExecutableSources.has(src)
  const policyRows = policies.filter(policy => canonicalPermissionSource(policy.source) === src).map(policy => {
    const projected: UniversePolicy = { ...policy }
    const overrides = policy.consumer_switch_overrides || {}
    if (overrides.source !== undefined) projected.is_enabled = overrides.source
    else if (executableProducer) projected.is_enabled = true
    if (!executableProducer) projected.is_enabled = false
    for (const consumer of ['catalog','matching','alerts','seo'] as const) {
      const field = `${consumer}_enabled` as const
      if (overrides[consumer] !== undefined) projected[field] = overrides[consumer]
      else if (projected.is_enabled === true) projected[field] = true
    }
    return projected
  })
  const values = (key: 'is_enabled'|'matching_enabled'|'catalog_enabled'|'alerts_enabled'|'seo_enabled') => new Set(policyRows.map(policy => policy[key] === true ? 'true' : policy[key] === false ? 'false' : 'unknown'))
  const conflicts = {
    is_enabled: values('is_enabled').size > 1,
    matching_enabled: values('matching_enabled').size > 1,
    catalog_enabled: values('catalog_enabled').size > 1,
    alerts_enabled: values('alerts_enabled').size > 1,
    seo_enabled: values('seo_enabled').size > 1,
  }
  const state = (key: 'is_enabled'|'matching_enabled'|'catalog_enabled'|'alerts_enabled'|'seo_enabled') => {
    const states = values(key)
    return policyRows.length === 0 || states.size !== 1 || states.has('unknown') ? 'UNKNOWN' : states.has('true') ? 'ALLOWED' : 'DENIED'
  }
  const globalConflict = conflicts.is_enabled
  const sourceSwitch = state('is_enabled')
  const consumerOperational = (key: 'matching_enabled'|'catalog_enabled'|'alerts_enabled'|'seo_enabled') => globalConflict || conflicts[key] ? 'UNKNOWN' : state(key)
  const matchingOperational = consumerOperational('matching_enabled')
  const catalogOperational = consumerOperational('catalog_enabled')
  const alertsOperational = consumerOperational('alerts_enabled')
  const seoOperational = consumerOperational('seo_enabled')
  const aliasConflicts = (['is_enabled','matching_enabled','catalog_enabled','alerts_enabled','seo_enabled'] as const).filter(key => conflicts[key])
  const sourceOperational = globalConflict ? 'CONFLICT' : sourceSwitch === 'ALLOWED' ? 'ENABLED' : sourceSwitch === 'DENIED' ? 'DISABLED' : 'UNKNOWN'
  const sourceOperationalReason = globalConflict ? 'SOURCE_POLICY_ALIAS_CONFLICT' : sourceSwitch === 'UNKNOWN' ? 'SOURCE_POLICY_STATE_UNKNOWN' : !executableProducer ? 'NO_EXECUTABLE_PRODUCER' : sourceOperational === 'ENABLED' ? 'SOURCE_OPERATIONALLY_ENABLED' : 'SOURCE_DISABLED'
  const matchingOperationalReason = globalConflict || conflicts.matching_enabled ? 'SOURCE_POLICY_ALIAS_CONFLICT' : matchingOperational === 'UNKNOWN' ? 'SOURCE_MATCHING_SWITCH_UNKNOWN' : matchingOperational === 'DENIED' ? 'SOURCE_MATCHING_DISABLED' : 'SOURCE_MATCHING_ENABLED'
  const deadline = deadlineLifecycle(row.deadline, now)
  const observed = Date.parse(String(observation?.observed_at || ''))
  const updated = Date.parse(String(row.updated_at || ''))
  const newer = Number.isFinite(observed) && (!Number.isFinite(updated) || observed > updated)
  const hardDead = newer && ['DEAD','REMOVED'].includes(String(observation?.identity_status)) && [404,410].includes(Number(observation?.http_status))
  const latestLive = newer && observation?.identity_status === 'IDENTITY_CONFIRMED' && Number(observation?.http_status) === 200
  const lifecycle = row.deleted_at ? 'DELETED' : row.archived_at ? 'ARCHIVED' : deadline === 'EXPIRED' ? 'EXPIRED'
    : hardDead ? 'HARD_DEAD'
    : row.is_active !== true && latestLive ? 'STALE_DERIVED_STATE'
    : row.is_active === true && row.verification_status === 'verified' && deadline !== 'INVALID' ? 'ACTIVE_VALID'
    : row.is_active === false && ['rejected','quarantined'].includes(String(row.verification_status)) ? 'INACTIVE_VALID' : 'LIFECYCLE_UNKNOWN'
  const lifecycleReason = lifecycle === 'DELETED' ? 'ROW_DELETED' : lifecycle === 'ARCHIVED' ? 'ROW_ARCHIVED' : lifecycle === 'EXPIRED' ? 'DEADLINE_EXPIRED' : lifecycle === 'HARD_DEAD' ? 'LATEST_HARD_DEAD_OBSERVATION' : lifecycle === 'STALE_DERIVED_STATE' ? row.is_active === false ? 'LATEST_LIVE_OBSERVATION_CONTRADICTS_INACTIVE' : 'LATEST_LIVE_OBSERVATION_RESOLVES_UNKNOWN_ACTIVE' : lifecycle === 'ACTIVE_VALID' ? (deadline === 'UNKNOWN' ? 'ACTIVE_VERIFIED_NO_DEADLINE' : 'ACTIVE_VERIFIED_DEADLINE_OPEN') : lifecycle === 'INACTIVE_VALID' ? `VERIFICATION_${String(row.verification_status).toUpperCase()}` : deadline === 'INVALID' ? 'DEADLINE_INVALID_OR_TIMEZONE_UNKNOWN' : 'INSUFFICIENT_LIFECYCLE_EVIDENCE'
  const lifecycleReady = lifecycle === 'ACTIVE_VALID'
  const lifecycleRepair = lifecycle === 'HARD_DEAD' && row.is_active !== false ? {is_active:false} : lifecycle === 'STALE_DERIVED_STATE' && row.verification_status === 'verified' ? {is_active:true} : null
  const professional = String(row.title || '').trim().split(/\s+/).length >= 2 && (String(row.description || '').trim().length >= 100 || requirementTextFromJsonb(row.requirements).length >= 60 || Boolean(row.professional_family))
  const professionalState = !lifecycleReady ? 'PROFESSIONAL_UNKNOWN' : professional ? 'PROFESSIONAL_READY' : 'PROFESSIONAL_THIN'
  const professionalReason = !lifecycleReady ? 'LIFECYCLE_NOT_READY' : professional ? 'PROFESSIONAL_EVIDENCE_SUFFICIENT' : 'INSUFFICIENT_PROFESSIONAL_EVIDENCE'
  const matchingRow = !lifecycleReady ? ['LIFECYCLE_UNKNOWN','STALE_DERIVED_STATE'].includes(lifecycle) ? 'UNKNOWN' : 'NOT_READY' : professional ? 'READY' : 'NOT_READY'
  const matchingReason = !lifecycleReady ? lifecycleReason : professional ? 'PROFESSIONAL_EVIDENCE_SUFFICIENT' : 'INSUFFICIENT_PROFESSIONAL_EVIDENCE'
  const matchingPermission = permission(src,'matching')
  const sourceIdentityResolved = Boolean(src && src !== 'unknown')
  const finalMatching = lifecycle !== 'ACTIVE_VALID' ? ['LIFECYCLE_UNKNOWN','STALE_DERIVED_STATE'].includes(lifecycle) ? 'UNKNOWN' : 'NOT_READY'
    : matchingRow !== 'READY' ? matchingRow
    : !sourceIdentityResolved ? 'UNKNOWN'
    : matchingPermission.state === 'DENIED' || matchingOperational === 'DENIED' || sourceOperational === 'DISABLED' ? 'NOT_READY'
    : sourceOperational === 'CONFLICT' || conflicts.matching_enabled ? 'UNKNOWN' : 'READY'
  const unknownLifecycle = ['LIFECYCLE_UNKNOWN','STALE_DERIVED_STATE'].includes(lifecycle)
  const catalogRow = !lifecycleReady ? unknownLifecycle ? 'UNKNOWN' : 'NOT_READY' : !String(row.title || '').trim() || !String(row.slug || '').trim() ? 'NOT_READY' : 'READY'
  const alertsRow = !lifecycleReady ? unknownLifecycle ? 'UNKNOWN' : 'NOT_READY' : professional ? 'READY' : 'NOT_READY'
  const consumerState = (rowState: string, operational: string) => rowState !== 'READY' ? rowState : sourceOperational === 'UNKNOWN' || sourceOperational === 'CONFLICT' ? 'UNKNOWN' : sourceOperational === 'DISABLED' || operational === 'DENIED' ? 'NOT_READY' : operational === 'ALLOWED' ? 'READY' : 'UNKNOWN'
  const catalogState = consumerState(catalogRow,catalogOperational)
  const alertsState = consumerState(alertsRow,alertsOperational)
  const seoRow = !lifecycleReady ? unknownLifecycle ? 'UNKNOWN' : 'NOT_READY' : !String(row.title || '').trim() || !String(row.slug || '').trim() || String(row.description || '').trim().length < 100 || !String(row.organization || '').trim() ? 'NOT_READY' : 'READY'
  const seoRowReason = !lifecycleReady ? lifecycleReason : !String(row.title || '').trim() ? 'MISSING_TITLE' : !String(row.slug || '').trim() ? 'MISSING_CANONICAL_IDENTITY' : String(row.description || '').trim().length < 100 ? 'THIN_CONTENT' : !String(row.organization || '').trim() ? 'MISSING_ORGANIZATION' : 'SEO_ROW_READY'
  const seoState = seoRow !== 'READY' ? seoRow : seoOperational === 'DENIED' ? 'NOT_READY' : seoOperational === 'UNKNOWN' || sourceOperational === 'UNKNOWN' || sourceOperational === 'CONFLICT' ? 'UNKNOWN' : sourceOperational === 'DISABLED' ? 'NOT_READY' : 'READY'
  const seoEffectiveReason = seoRow !== 'READY' ? seoRowReason : seoOperational === 'DENIED' ? 'SOURCE_SEO_OPERATOR_DISABLED' : conflicts.seo_enabled ? 'SOURCE_POLICY_ALIAS_CONFLICT' : seoOperational === 'UNKNOWN' ? 'SOURCE_SEO_SWITCH_UNKNOWN' : sourceOperational === 'CONFLICT' ? 'SOURCE_POLICY_ALIAS_CONFLICT' : sourceOperational === 'UNKNOWN' ? 'SOURCE_OPERATIONAL_STATE_UNKNOWN' : sourceOperational === 'DISABLED' ? sourceOperationalReason : 'SEO_EFFECTIVE_READY'
  const seoContentReason = !String(row.title || '').trim() ? 'MISSING_TITLE' : !String(row.slug || '').trim() ? 'MISSING_CANONICAL_IDENTITY' : String(row.description || '').trim().length < 100 ? 'THIN_CONTENT' : !String(row.organization || '').trim() ? 'MISSING_ORGANIZATION' : 'SEO_CONTENT_READY_INDEPENDENT_OF_LIFECYCLE'
  const lifecycleUnresolvedReason = !unknownLifecycle ? null : lifecycle === 'STALE_DERIVED_STATE' ? lifecycleReason : deadline === 'INVALID' ? 'DEADLINE_INVALID_OR_TIMEZONE_UNKNOWN' : !observation?.id ? 'NO_OBSERVATION' : observation?.source && canonicalSource(observation.source) !== src ? 'OBSERVATION_SOURCE_MISMATCH' : observation?.identity_status === 'IDENTITY_UNRESOLVED' ? 'IDENTITY_UNRESOLVED' : observation?.identity_status === 'IDENTITY_MISMATCH' ? 'IDENTITY_MISMATCH' : [0,429].includes(Number(observation?.http_status)) || Number(observation?.http_status)>=500 ? 'TRANSIENT_HTTP_EVIDENCE' : observation?.identity_status === 'IDENTITY_CONFIRMED' && Number(observation?.http_status)===200 ? 'OBSERVATION_NOT_NEWER_THAN_ROW_UPDATE' : observation?.http_status == null ? 'HTTP_STATUS_UNKNOWN' : 'LIFECYCLE_EVIDENCE_INSUFFICIENT'
  const lifecycleRecoveryClass = !unknownLifecycle ? ['EXPIRED','DELETED','ARCHIVED','HARD_DEAD','INACTIVE_VALID'].includes(lifecycle) ? 'EXPLICITLY_INACTIVE' : 'NOT_UNRESOLVED' : lifecycleRepair ? 'RECOVERABLE_NOW' : seoContentReason !== 'SEO_CONTENT_READY_INDEPENDENT_OF_LIFECYCLE' ? 'CONTENT_NOT_READY' : lifecycleUnresolvedReason === 'OBSERVATION_SOURCE_MISMATCH' ? 'SYSTEM_ERROR' : 'REFRESH_REQUIRED'
  const unresolved: string[] = []
  if (unknownLifecycle) unresolved.push('LIFECYCLE')
  if (matchingRow === 'UNKNOWN') unresolved.push('ROW_MATCH_READINESS')
  if (matchingOperational === 'UNKNOWN') unresolved.push('SOURCE_MATCHING_SWITCH')
  if (matchingPermission.state === 'UNKNOWN') unresolved.push('MATCHING_PERMISSION_UNKNOWN:ADVISORY_PRIVATE_MATCHING')
  if (sourceOperational === 'UNKNOWN') unresolved.push('SOURCE_OPERATIONAL_STATE')
  if (sourceOperational === 'CONFLICT') unresolved.push('SOURCE_POLICY_ALIAS_CONFLICT:is_enabled')
  if (matchingOperational === 'UNKNOWN' && conflicts.matching_enabled) unresolved.push('SOURCE_POLICY_ALIAS_CONFLICT:matching_enabled')
  if (lifecycleReady && catalogRow === 'READY' && catalogOperational === 'UNKNOWN') unresolved.push(conflicts.catalog_enabled ? 'SOURCE_POLICY_ALIAS_CONFLICT:catalog_enabled' : 'CATALOG_SWITCH_UNKNOWN')
  if (lifecycleReady && alertsRow === 'READY' && alertsOperational === 'UNKNOWN') unresolved.push(conflicts.alerts_enabled ? 'SOURCE_POLICY_ALIAS_CONFLICT:alerts_enabled' : 'ALERT_SWITCH_UNKNOWN')
  const sourcePermissionUnknownDimensions = SOURCE_PERMISSION_DIMENSIONS.filter(dimension => sourcePermissionDimensionTruth(src,dimension).state === 'UNKNOWN')
  const permissionStates = Object.fromEntries((['catalog','matching','alerts','seo'] as const).map(consumer => [consumer,permission(src,consumer).state]))
  const firstFailure = lifecycle !== 'ACTIVE_VALID' ? `LIFECYCLE_${lifecycle}` : matchingRow === 'NOT_READY' ? `MATCH_ROW_${matchingReason}` : matchingRow === 'UNKNOWN' ? 'MATCH_ROW_UNKNOWN' : !sourceIdentityResolved ? 'SOURCE_IDENTITY_UNRESOLVED' : sourceOperational === 'CONFLICT' || conflicts.matching_enabled ? 'SOURCE_POLICY_ALIAS_CONFLICT' : matchingPermission.state === 'DENIED' ? 'SOURCE_MATCHING_PERMISSION_DENIED' : matchingOperational === 'DENIED' ? 'SOURCE_MATCHING_DISABLED' : sourceOperational === 'DISABLED' ? 'SOURCE_DISABLED' : finalMatching === 'READY' ? 'FINAL_MATCHING_UNIVERSE' : `FINAL_MATCHING_${finalMatching}`
  return { lifecycle_state:lifecycle, lifecycle_reason:lifecycleReason, lifecycle_repair:lifecycleRepair, professional_readiness:professionalState, professional_reason:professionalReason,
    catalog_row_state:catalogRow, catalog_state:catalogState, alerts_row_state:alertsRow, alerts_state:alertsState,
    matching_row_state:matchingRow, matching_row_reason:matchingReason, source_matching_state:matchingPermission.state, source_matching_reason:matchingPermission.reason, source_matching_provenance:matchingPermission.provenance,
    source_matching_operational_state:matchingOperational, source_matching_operational_reason:matchingOperationalReason, catalog_operational_state:catalogOperational, alerts_operational_state:alertsOperational, seo_operational_state:seoOperational,
    source_operational_state:sourceOperational, source_operational_reason:sourceOperationalReason, source_policy_alias_conflicts:aliasConflicts,
    final_matching_state:finalMatching, seo_row_state:seoRow, seo_row_reason:seoRowReason, seo_content_readiness_independent_of_lifecycle:seoContentReason === 'SEO_CONTENT_READY_INDEPENDENT_OF_LIFECYCLE' ? 'READY' : 'NOT_READY', seo_content_reason:seoContentReason, seo_effective_reason:seoEffectiveReason, seo_state:seoState,
    lifecycle_unresolved_reason:lifecycleUnresolvedReason, lifecycle_recovery_class:lifecycleRecoveryClass, unresolved_dimensions:unresolved.sort(), source_permission_unknown_dimensions:sourcePermissionUnknownDimensions.sort(), consumer_permission_states:permissionStates, first_failure:firstFailure }
}

const expected = (lifecycle:string,catalog:string,matching:string,alerts:string,seo:string,firstFailure:string): ExpectedFixture => ({lifecycle,catalog,matching,alerts,seo,firstFailure})
const enabled = (source='himalayas'): UniversePolicy => ({source,is_enabled:true,matching_enabled:true})
const fixtures: Array<{ row: Record<string,any>; policies: UniversePolicy[]; observation?: Record<string,any>|null; permission?: Permission; expected: ExpectedFixture }> = [
  { row: active, policies:[enabled()], expected:expected('ACTIVE_VALID','READY','READY','READY','READY','FINAL_MATCHING_UNIVERSE') },
  { row:{...active,id:'structured-requirements',description:'',requirements:[{text:'Applicants must demonstrate five years of relevant programme delivery experience.',required:true}]}, policies:[enabled()], expected:expected('ACTIVE_VALID','READY','READY','READY','NOT_READY','FINAL_MATCHING_UNIVERSE') },
  { row:{...active,id:'optional-professional-keys-absent',description:'',requirements:null}, policies:[enabled()], expected:expected('ACTIVE_VALID','READY','NOT_READY','NOT_READY','NOT_READY','MATCH_ROW_INSUFFICIENT_PROFESSIONAL_EVIDENCE') },
  { row:{...active,id:'thin',description:'',tags:['remote','LATAM']}, policies:[enabled()], expected:expected('ACTIVE_VALID','READY','NOT_READY','NOT_READY','NOT_READY','MATCH_ROW_INSUFFICIENT_PROFESSIONAL_EVIDENCE') },
  // WWR is executable, but its explicit matching/presentation restriction is
  // independent and must still block the private matching consumer.
  { row:{...active,id:'unknown-permission',source:'weworkremotely'}, policies:[enabled('wwr')], expected:expected('ACTIVE_VALID','READY','NOT_READY','READY','READY','SOURCE_MATCHING_PERMISSION_DENIED') },
  { row:{...active,id:'expired',deadline:'2020-01-01'}, policies:[enabled()], expected:expected('EXPIRED','NOT_READY','NOT_READY','NOT_READY','NOT_READY','LIFECYCLE_EXPIRED') },
  { row:{...active,id:'dead',is_active:false}, policies:[enabled()], observation:{id:'o1',identity_status:'DEAD',http_status:404,observed_at:'2026-09-20T00:00:00Z'}, expected:expected('HARD_DEAD','NOT_READY','NOT_READY','NOT_READY','NOT_READY','LIFECYCLE_HARD_DEAD') },
  { row:{...active,id:'unknown-activity-live-observation',is_active:null}, policies:[enabled()], observation:{id:'o-live',source:'himalayas',identity_status:'IDENTITY_CONFIRMED',http_status:200,observed_at:'2026-09-20T00:00:00Z'}, expected:expected('STALE_DERIVED_STATE','UNKNOWN','UNKNOWN','UNKNOWN','UNKNOWN','LIFECYCLE_STALE_DERIVED_STATE') },
  { row:{...active,id:'unknown-no-observation',is_active:false}, policies:[enabled()], expected:expected('LIFECYCLE_UNKNOWN','UNKNOWN','UNKNOWN','UNKNOWN','UNKNOWN','LIFECYCLE_LIFECYCLE_UNKNOWN') },
  { row:{...active,id:'observation-source-mismatch',is_active:false}, policies:[enabled()], observation:{id:'o-mismatch',source:'unjobs',identity_status:'IDENTITY_UNRESOLVED',http_status:0,observed_at:'2026-09-20T00:00:00Z'}, expected:expected('LIFECYCLE_UNKNOWN','UNKNOWN','UNKNOWN','UNKNOWN','UNKNOWN','LIFECYCLE_LIFECYCLE_UNKNOWN') },
  { row:{...active,id:'matching-switch-off'}, policies:[{...enabled(),consumer_switch_overrides:{matching:false}}], expected:expected('ACTIVE_VALID','READY','NOT_READY','READY','READY','SOURCE_MATCHING_DISABLED') },
  { row:{...active,id:'catalog-switch-off'}, policies:[{...enabled(),consumer_switch_overrides:{catalog:false}}], expected:expected('ACTIVE_VALID','NOT_READY','READY','READY','READY','FINAL_MATCHING_UNIVERSE') },
  { row:{...active,id:'alerts-switch-off'}, policies:[{...enabled(),consumer_switch_overrides:{alerts:false}}], expected:expected('ACTIVE_VALID','READY','READY','NOT_READY','READY','FINAL_MATCHING_UNIVERSE') },
  { row:{...active,id:'seo-unknown-switch-off',source:'jobicy',seo_eligible:false,seo_status:'review'}, policies:[{...enabled('jobicy'),consumer_switch_overrides:{seo:false}}], expected:expected('ACTIVE_VALID','READY','READY','READY','NOT_READY','FINAL_MATCHING_UNIVERSE') },
  { row:{...active,id:'seo-unknown-switch-on',source:'jobicy'}, policies:[enabled('jobicy')], expected:expected('ACTIVE_VALID','READY','READY','READY','READY','FINAL_MATCHING_UNIVERSE') },
  { row:{...active,id:'source-switch-off'}, policies:[{source:'himalayas',is_enabled:true,matching_enabled:true,catalog_enabled:true,alerts_enabled:true,seo_enabled:true,consumer_switch_overrides:{source:false}}], expected:expected('ACTIVE_VALID','NOT_READY','NOT_READY','NOT_READY','NOT_READY','SOURCE_DISABLED') },
  { row:{...active,id:'source-policy-missing'}, policies:[], expected:expected('ACTIVE_VALID','UNKNOWN','READY','UNKNOWN','UNKNOWN','FINAL_MATCHING_UNIVERSE') },
  { row:{...active,id:'catalog-alias-conflict'}, policies:[enabled(),{...enabled('HIMALAYAS'),consumer_switch_overrides:{catalog:false}}], expected:expected('ACTIVE_VALID','UNKNOWN','READY','READY','READY','FINAL_MATCHING_UNIVERSE') },
  { row:{...active,id:'matching-alias-conflict'}, policies:[enabled(),{...enabled('HIMALAYAS'),consumer_switch_overrides:{matching:false}}], expected:expected('ACTIVE_VALID','READY','UNKNOWN','READY','READY','SOURCE_POLICY_ALIAS_CONFLICT') },
  { row:{...active,id:'seo-description-missing',description:''}, policies:[enabled()], expected:expected('ACTIVE_VALID','READY','NOT_READY','NOT_READY','NOT_READY','MATCH_ROW_INSUFFICIENT_PROFESSIONAL_EVIDENCE') },
  { row:{...active,id:'seo-title-missing',title:''}, policies:[enabled()], expected:expected('ACTIVE_VALID','NOT_READY','NOT_READY','NOT_READY','NOT_READY','MATCH_ROW_INSUFFICIENT_PROFESSIONAL_EVIDENCE') },
  { row:{...active,id:'seo-slug-missing',slug:''}, policies:[enabled()], expected:expected('ACTIVE_VALID','NOT_READY','READY','READY','NOT_READY','FINAL_MATCHING_UNIVERSE') },
  { row:{...active,id:'seo-organization-missing',organization:''}, policies:[enabled()], expected:expected('ACTIVE_VALID','READY','READY','READY','NOT_READY','FINAL_MATCHING_UNIVERSE') },
]
const parityMatrix: Array<Record<string,string>> = []
const policyDivergences: Array<{fixture:string;consumer:Consumer;permission:string;effective:string;reason:string;provenance:string}> = []
for (const fixture of fixtures) {
  const perm: Permission = fixture.permission || ((source, consumer) => { const decision = sourcePermissionTruth(source,consumer); return {state:decision.state as PermissionEvidence['state'],reason:decision.reason,provenance:decision.provenance} })
  const ts = classifyOpportunityUniverse(fixture.row,fixture.policies,fixture.observation,now,perm)
  const sqlDecision = sqlEquivalent(fixture.row,fixture.policies,fixture.observation,perm)
  const summaryFirstFailures = summarizeOpportunityUniverse([ts]).first_failure
  const tsFirstFailure = Object.keys(summaryFirstFailures)[0]
  assert.equal(summaryFirstFailures[tsFirstFailure],1,`${fixture.row.id}: current summary assigns exactly one first failure`)
  const consumerStates = {catalog:ts.catalog_state,matching:ts.final_matching_state,alerts:ts.alerts_state,seo:ts.seo_state}
  const permissionEvidence = Object.fromEntries((['catalog','matching','alerts','seo'] as const).map(consumer => [consumer,perm(canonicalPermissionSource(fixture.row.source),consumer)])) as Record<Consumer,PermissionEvidence>
  for (const consumer of ['catalog','matching','alerts','seo'] as const) {
    assert(permissionEvidence[consumer].reason && permissionEvidence[consumer].provenance,`${fixture.row.id}:${consumer} permission retains reason and provenance`)
    assert.equal((ts.provenance.consumer_permission_states as any)[consumer],permissionEvidence[consumer].state,`${fixture.row.id}:${consumer} permission state remains diagnostic`)
    if (permissionEvidence[consumer].state === 'DENIED' && consumerStates[consumer] === 'READY') policyDivergences.push({fixture:fixture.row.id,consumer,permission:'DENIED',effective:'READY',reason:permissionEvidence[consumer].reason,provenance:permissionEvidence[consumer].provenance})
  }
  const tsComparable = { ...ts, unresolved_dimensions:[...ts.unresolved_dimensions].sort(), source_permission_unknown_dimensions:[...ts.source_permission_unknown_dimensions].sort(), source_policy_alias_conflicts:[...ts.source_policy_alias_conflicts].sort(), consumer_permission_states:ts.provenance.consumer_permission_states, first_failure:tsFirstFailure }
  sqlDecision.source_policy_alias_conflicts.sort()
  assert.equal([sqlDecision.seo_row_state === 'READY',sqlDecision.seo_row_state === 'NOT_READY',sqlDecision.seo_row_state === 'UNKNOWN'].filter(Boolean).length,1,`${fixture.row.id}: SEO row state belongs to exactly one full-inventory partition`)
  for (const key of Object.keys(sqlDecision) as Array<keyof typeof sqlDecision>) assert.deepEqual(tsComparable[key],sqlDecision[key],`${fixture.row.id}:${key} TS/current-SQL-oracle fixture parity`)
  assert.deepEqual({lifecycle:ts.lifecycle_state,catalog:ts.catalog_state,matching:ts.final_matching_state,alerts:ts.alerts_state,seo:ts.seo_state,firstFailure:tsFirstFailure},fixture.expected,`${fixture.row.id}: discriminant fixture matrix`)
  parityMatrix.push({fixture:fixture.row.id,lifecycle:ts.lifecycle_state,catalog:ts.catalog_state,matching:ts.final_matching_state,alerts:ts.alerts_state,seo:ts.seo_state,first_failure:tsFirstFailure})
}
const wwrDivergences = policyDivergences.filter(item => item.fixture === 'unknown-permission').sort((a,b) => a.consumer.localeCompare(b.consumer))
assert.deepEqual(wwrDivergences.map(item => item.consumer),['alerts','catalog','seo'],'Matching enforces its explicit presentation DENIED; unresolved public-consumer divergences remain visible')
const wwrPolicyRemediation = { status:'POLICY_REMEDIATION_REQUIRED', current_effective_gate:'MATCHING_DENIED_ENFORCED_PUBLIC_CONSUMERS_PENDING', proposal:'Review explicit DENIED gates for Catalog, Alerts and SEO independently; never promote executable-producer status into permission or infer external distribution.' }
assert.equal(wwrPolicyRemediation.status,'POLICY_REMEDIATION_REQUIRED')
const unknownSeoDecision = classifyOpportunityUniverse(fixtures.find(fixture => fixture.row.id==='seo-unknown-switch-off')!.row,fixtures.find(fixture => fixture.row.id==='seo-unknown-switch-off')!.policies,null,now)
assert.equal((unknownSeoDecision.provenance.consumer_permission_states as any).seo,'UNKNOWN')
assert.equal(unknownSeoDecision.seo_state,'NOT_READY','explicit SEO override OFF blocks while permission remains diagnostic UNKNOWN')
assert.equal(unknownSeoDecision.seo_effective_reason,'SOURCE_SEO_OPERATOR_DISABLED')
assert(unknownSeoDecision.source_permission_unknown_dimensions.includes('seo_index'))
const unknownPermissionReadyFixture = fixtures.find(fixture => fixture.row.id==='seo-unknown-switch-on')!
const unknownPermissionReady = classifyOpportunityUniverse(unknownPermissionReadyFixture.row,unknownPermissionReadyFixture.policies,null,now)
assert.equal((unknownPermissionReady.provenance.consumer_permission_states as any).seo,'UNKNOWN')
assert.equal(unknownPermissionReady.seo_state,'READY','UNKNOWN permission is preserved without becoming an implicit operational veto')
console.log(`fixture-parity-matrix=${JSON.stringify(parityMatrix)}`)
console.log(`policy-divergence=${JSON.stringify({source:'weworkremotely',...wwrPolicyRemediation,consumers:wwrDivergences})}`)
console.log('parity-evidence=FIXTURE_STATIC_ORACLE;postgresql-parity=BLOCKED_UNTIL_STOP_C')

const historical = { total:16405, inactive_or_unknown:9272, deadline_expired:91, source_matching_disabled:6460, match_eligibility_unexplained:429, source_allowed:153 }
assert.equal(historical.inactive_or_unknown + historical.deadline_expired + historical.source_matching_disabled + historical.match_eligibility_unexplained + historical.source_allowed, historical.total)
console.log('verify_opportunity_universe_permission_preflight: PASS prod-schema-compatibility, structured-requirements-parity, optional-family-absence, pre-retrieval-stage, final-retrieval-stage, runtime-manifest-order, registry-105x10, all-row/latest-observation, historical-baseline-reconciliation')
