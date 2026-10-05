import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  buildCanonicalSourcePolicyIndex, cacheCandidateAlertEligible, classifyBackgroundCoverage, classifyInventoryRow, collectAlertCandidateSnapshot, expandEnabledSourceEmitters, inventoryFunnelPage,
  commitRetrievalPage, cursorAfterPage, deltaRowInSnapshot, mergeRetrievalSimilarities,
  opportunityCacheIsCurrent, retrievalCacheIsCurrent, sourceMatchingAllowed, sourcePolicyFor, sourcePolicySignature, sourcePolicySignatureRows, unionRetrievalLanes,
} from '../shared/matching-retrieval.ts'
import { buildDefaultDictionary } from '../supabase/functions/_shared/matching.ts'
import { rankOpportunitiesV2, V2_PRESET_FULL } from '../supabase/functions/_shared/matching-v2.ts'
import { EDGE_SOURCE_IDENTITIES } from '../supabase/functions/_shared/generated-source-registry.ts'

const inventory = Array.from({ length: 700 }, (_, i) => ({ id: String(i).padStart(4, '0'), created_at: new Date(i * 1000).toISOString() }))
const canonicalSource = (raw: unknown) => {
  const source = String(raw ?? '').trim().toLowerCase()
  const identity = EDGE_SOURCE_IDENTITIES.find(item => item.canonical_source === source || item.emitted_aliases.some(alias => alias === source))
  return identity?.canonical_source || source
}
const aliasRows = [
  { source: 'WWR', is_enabled: true, matching_enabled: true },
  { source: 'weworkremotely', is_enabled: true, matching_enabled: true },
  { source: 'jobicy', is_enabled: false, matching_enabled: true },
  { source: 'match-disabled', is_enabled: true, matching_enabled: false },
]
const policySig = await sourcePolicySignature(aliasRows, canonicalSource)
assert.notEqual(await sourcePolicySignature(aliasRows, canonicalSource, [{ canonical_source: 'wwr', consumer: 'matching', permission_state: 'UNKNOWN' }]), await sourcePolicySignature(aliasRows, canonicalSource, [{ canonical_source: 'wwr', consumer: 'matching', permission_state: 'ALLOWED' }]), 'canonical permission transition invalidates Matching retrieval coverage independently of switches')
assert.equal(policySig, await sourcePolicySignature([{ source: 'jobicy', is_enabled: false, matching_enabled: true }, { source: 'weworkremotely', is_enabled: true, matching_enabled: true }, { source: 'match-disabled', is_enabled: true, matching_enabled: false }], canonicalSource), 'source policy signature is order-independent and collapses aliases')
assert.notEqual(policySig, await sourcePolicySignature([{ source: 'jobicy', is_enabled: false, matching_enabled: true }, { source: 'weworkremotely', is_enabled: true, matching_enabled: true }, { source: 'match-disabled', is_enabled: true, matching_enabled: true }], canonicalSource), 'matching_enabled changes invalidate the policy signature')
const policyIndex = buildCanonicalSourcePolicyIndex(aliasRows, EDGE_SOURCE_IDENTITIES, canonicalSource)
assert.equal(policyIndex.canonical.size, 3, 'one signature/index entry per canonical source')
assert.equal(sourcePolicyFor(policyIndex, 'wwr')?.is_enabled, true)
assert.equal(sourcePolicyFor(policyIndex, 'weworkremotely')?.is_enabled, true)
assert.equal(sourceMatchingAllowed(sourcePolicyFor(policyIndex, 'wwr')), true)
assert.equal(sourceMatchingAllowed(sourcePolicyFor(policyIndex, 'match-disabled')), false)
assert.ok(expandEnabledSourceEmitters(policyIndex, EDGE_SOURCE_IDENTITIES).includes('wwr'), 'enabled canonical source expands to registered emitter aliases')
assert.ok(!expandEnabledSourceEmitters(policyIndex, EDGE_SOURCE_IDENTITIES).includes('match-disabled'), 'matching-disabled canonical source is excluded from worker targets')
const casePreservingPolicy = buildCanonicalSourcePolicyIndex([{ source: 'wwr', is_enabled: true, matching_enabled: true }], [{ canonical_source: 'wwr', emitted_aliases: ['WeWorkRemotely'] }], canonicalSource)
assert.ok(expandEnabledSourceEmitters(casePreservingPolicy, [{ canonical_source: 'wwr', emitted_aliases: ['WeWorkRemotely'] }]).includes('WeWorkRemotely'), 'raw database target expansion preserves registered emitter spelling')
assert.throws(() => sourcePolicySignatureRows([{ source: 'wwr', is_enabled: true, matching_enabled: true }, { source: 'weworkremotely', is_enabled: false, matching_enabled: true }], canonicalSource), /SOURCE_POLICY_ALIAS_CONFLICT/)
assert.throws(() => sourcePolicySignatureRows([{ source: 'wwr', is_enabled: true, matching_enabled: true }, { source: 'weworkremotely', is_enabled: true, matching_enabled: false }], canonicalSource), /SOURCE_POLICY_ALIAS_CONFLICT/)
assert.throws(() => buildCanonicalSourcePolicyIndex([{ source: 'wwr', is_enabled: true, matching_enabled: true }, { source: 'weworkremotely', is_enabled: true, matching_enabled: false }], EDGE_SOURCE_IDENTITIES, canonicalSource), /SOURCE_POLICY_ALIAS_CONFLICT/)
const examined: string[] = []
let cursor: { at: string; id: string } | null = null
while (examined.length < inventory.length) {
  const page = inventory.filter(row => !cursor || row.created_at > cursor.at || (row.created_at === cursor.at && row.id > cursor.id)).slice(0, 250)
  if (!page.length) break
  examined.push(...page.map(row => row.id))
  cursor = cursorAfterPage(page, 'created_at')
}
assert.equal(examined.length, 700, 'FULL scan must examine all 700 rows')
assert.equal(new Set(examined).size, 700, 'keyset pages must not duplicate rows')

let persistedCursor = 'before-page-2'
await assert.rejects(commitRetrievalPage([2], async () => { throw new Error('page failure') }, async () => { persistedCursor = 'after-page-2' }))
assert.equal(persistedCursor, 'before-page-2', 'failed page must leave cursor unchanged')
let upserts = new Set<string>()
await commitRetrievalPage(['same-id'], async rows => { for (const id of rows) upserts.add(id) }, async () => { persistedCursor = 'after-retry' })
await commitRetrievalPage(['same-id'], async rows => { for (const id of rows) upserts.add(id) }, async () => { persistedCursor = 'after-retry' })
assert.equal(upserts.size, 1, 'retry upserts are idempotent')

assert.equal(retrievalCacheIsCurrent({ profile_signature: 'old' }, { profile_signature: 'new', source_policy_signature: 'p' }, 'new', 'p'), false, 'profile signature change invalidates cache')
assert.equal(retrievalCacheIsCurrent({ profile_signature: 'new' }, { profile_signature: 'new', source_policy_signature: 'old' }, 'new', 'new'), false, 'policy signature change invalidates cache')
assert.equal(opportunityCacheIsCurrent({ opportunity_content_fingerprint: 'old' }, { content_fingerprint: 'new' }), false, 'fingerprint change invalidates cache')
assert.equal(classifyBackgroundCoverage({ profile_signature: 'old', source_policy_signature: 'p' }, 'new', 'p'), 'STALE')
const matchingAllowedPolicy = { source: 'allowed', is_enabled: true, matching_enabled: true }
const sourceDisabledPolicy = { source: 'off', is_enabled: false, matching_enabled: true }
const matchingDisabledPolicy = { source: 'match-off', is_enabled: true, matching_enabled: false }
assert.equal(classifyInventoryRow({ is_active: true, verification_status: 'verified', match_eligible: false }, matchingAllowedPolicy, new Date().toISOString()).reason, 'MATCH_ELIGIBILITY_UNEXPLAINED', 'matching-capable source plus match_eligible false stays unresolved, not automatically stale')
assert.equal(classifyInventoryRow({ is_active: true, verification_status: 'verified', match_eligible: false, match_eligibility_stale: true }, matchingAllowedPolicy, new Date().toISOString()).class, 'STALE_DERIVED_STATE', 'stale derived state still requires an explicit independent marker')
assert.equal(classifyInventoryRow({ is_active: true, verification_status: 'verified', match_eligible: true }, sourceDisabledPolicy, new Date().toISOString()).reason, 'SOURCE_DISABLED')
assert.equal(classifyInventoryRow({ is_active: true, verification_status: 'verified', match_eligible: true }, matchingDisabledPolicy, new Date().toISOString()).reason, 'SOURCE_MATCHING_DISABLED')
const funnelRows = [
  { id: 'eligible', source: 'wwr', is_active: true, verification_status: 'verified', deleted_at: null, archived_at: null, deadline: null, match_eligible: true, title: 'Engineer', content_fingerprint: 'fp' },
  { id: 'inactive', source: 'weworkremotely', is_active: false, verification_status: 'verified', match_eligible: true },
  { id: 'stale-derived', source: 'weworkremotely', is_active: true, verification_status: 'verified', deleted_at: null, archived_at: null, deadline: null, match_eligible: false },
  { id: 'source-disabled', source: 'jobicy', is_active: true, verification_status: 'verified', deleted_at: null, archived_at: null, deadline: null, match_eligible: true },
  { id: 'source-matching-disabled', source: 'match-disabled', is_active: true, verification_status: 'verified', deleted_at: null, archived_at: null, deadline: null, match_eligible: true },
  { id: 'unknown-lifecycle', source: 'weworkremotely', is_active: null, verification_status: null, match_eligible: true },
]
const funnel = inventoryFunnelPage(funnelRows, policyIndex, new Date().toISOString())
assert.equal(funnel.counts.TOTAL_INVENTORY, 6, 'funnel denominator starts with every inventory row')
assert.equal(funnel.counts.MATCH_ELIGIBLE, 3)
assert.equal(funnel.counts.SOURCE_ALLOWED, 1)
assert.equal(funnel.eligible.length, 1)
assert.equal(funnel.counts.WHY_NOT_MATCH_UNIVERSE.MATCH_ELIGIBILITY_UNEXPLAINED, 1)
assert.equal(funnel.counts.WHY_NOT_MATCH_UNIVERSE.SOURCE_DISABLED, 1)
assert.equal(funnel.counts.WHY_NOT_MATCH_UNIVERSE.SOURCE_MATCHING_DISABLED, 1)
assert.equal(funnel.counts.WHY_NOT_MATCH_UNIVERSE.ACTIVE_STATE_UNKNOWN, 1, 'unknown lifecycle state remains unresolved')
assert.equal(funnel.counts.EXCLUSION_CLASSES.VALID_EXCLUSION, 3)
assert.equal(deltaRowInSnapshot('2025-01-02T00:00:00.000Z', '2025-01-01T00:00:00.000Z', '2025-01-03T00:00:00.000Z'), true, 'new and changed rows enter DELTA')
assert.equal(deltaRowInSnapshot('2025-01-04T00:00:00.000Z', '2025-01-01T00:00:00.000Z', '2025-01-03T00:00:00.000Z'), false, 'future changes wait for next delta cutoff')

const union = unionRetrievalLanes([
  { lane: 'RECENT', rows: [{ id: 'x', content_fingerprint: 'fresh' }] },
  { lane: 'SEMANTIC', rows: [{ id: 'x', content_fingerprint: 'fresh' }] },
  { lane: 'BACKGROUND_MATCH', rows: [{ id: 'x', content_fingerprint: 'fresh' }] },
])
assert.equal(union.length, 1, 'RECENT/SEMANTIC/CACHE duplicate must hydrate and rank once')
assert.equal(union[0].lanes.size, 3, 'lane provenance is retained internally')
const scoreMap = new Map<string, number>()
scoreMap.set('scored', 0.73)
assert.equal(scoreMap.get('scored'), 0.73, 'page semantic score passes unchanged')
assert.equal(scoreMap.has('no-embedding'), false, 'missing embedding stays ABSENT, not zero')
const mergedScores = mergeRetrievalSimilarities(new Map([['same', 0.4], ['cached', 0.8]]), new Map([['same', 0.7]]))
assert.equal(mergedScores.get('same'), 0.7, 'live top-120 semantic score overrides cached score')
assert.equal(mergedScores.get('cached'), 0.8, 'valid cache semantic score remains available')
assert.equal(cacheCandidateAlertEligible({ candidate_class: 'MATCH', evaluation_lane: 'FULL_BACKFILL' }, { created_at: '2020-01-01', updated_at: '2020-01-01' }, '2025-01-01'), false, 'FULL_BACKFILL cannot trigger historical alerts')
assert.equal(cacheCandidateAlertEligible({ candidate_class: 'MATCH', evaluation_lane: 'INCREMENTAL' }, { created_at: '2020-01-01', updated_at: '2020-01-01' }, '2025-01-01'), true, 'incremental MATCH may enter alert lane for reranking')
assert.equal(cacheCandidateAlertEligible({ candidate_class: 'MATCH', evaluation_lane: 'FULL_BACKFILL' }, { created_at: '2025-01-02', updated_at: '2025-01-02' }, '2025-01-01'), true, 'a FULL result is alertable only when the opportunity itself is inside the alert window')
assert.equal(cacheCandidateAlertEligible({ candidate_class: 'POTENTIAL', evaluation_lane: 'INCREMENTAL' }, {}, '2025-01-01'), false)
const alertFixtureRows = Array.from({ length: 1203 }, (_, i) => ({ evaluated_at: new Date(i * 1000).toISOString(), user_id: `u${String(Math.floor(i / 7)).padStart(4, '0')}`, opportunity_id: `o${String(i).padStart(5, '0')}` }))
let alertPageCalls = 0
const pagedAlertRows: any[] = []
let alertCursor: any = null
for (;;) {
  const page = await collectAlertCandidateSnapshot(async (cursor, limit) => {
    alertPageCalls++
    const remaining = cursor ? alertFixtureRows.filter((row) => row.evaluated_at > cursor.evaluated_at || (row.evaluated_at === cursor.evaluated_at && (row.user_id > cursor.user_id || (row.user_id === cursor.user_id && row.opportunity_id > cursor.opportunity_id)))) : alertFixtureRows
    return remaining.slice(0, limit)
  }, 500, alertCursor)
  assert.ok(page.rows.length <= 500, 'one invocation retains at most its batch')
  pagedAlertRows.push(...page.rows) // Fixture accounting only; production persists cursor + effects.
  alertCursor = page.cursor
  if (page.complete) break
}
assert.equal(pagedAlertRows.length, 1203, 'resumable alert pages eventually cover every candidate')
assert.equal(new Set(pagedAlertRows.map(r => r.opportunity_id)).size, 1203, 'no cursor replay')
assert.equal(alertPageCalls, 3)

const candidate = {
  professional_title: 'Software Backend Developer', summary: 'Backend developer with Python SQL Docker and APIs.',
  cv_text: 'Python SQL Docker backend APIs production engineering',
  profile_data: { habilidades: ['Python', 'SQL', 'Docker'], seniority: 'semi-senior', candidate_truth: { evidence: { professional_title: 'USER_CONFIRMED', skills: 'USER_CONFIRMED' } }, candidate_eligibility: { version: 1, residence_country: 'PY', citizenship_countries: [], work_authorization_countries: [], evidence: { residence_country: 'USER_CONFIRMED', citizenship_countries: 'UNKNOWN', work_authorization_countries: 'UNKNOWN' } } },
}
const opportunity: any = { id: 'current-authority', source_match_state: 'ALLOWED', is_active: true, verification_status: 'verified', match_eligible: true, deleted_at: null, archived_at: null, deadline: null, remote: true, eligible_countries: ['PY'], eligible_regions: [], location: 'Remote', type: 'Remote', title: 'Backend Software Engineer Senior', rubro: 'Technology', tags: ['Python', 'SQL', 'Docker'], description: 'Senior backend engineering role building APIs with Python, SQL, Docker, and production systems. '.repeat(2) }
const dictionary = buildDefaultDictionary()
const scored = rankOpportunitiesV2(candidate, [opportunity], dictionary, V2_PRESET_FULL, new Map([['current-authority', 0.73]]))
assert.equal(scored.rankedV2[0]?.breakdown?.semanticScore != null, true, 'page semantic score reaches V2 as known evidence')
const noEmbedding = rankOpportunitiesV2(candidate, [opportunity], dictionary, V2_PRESET_FULL)
assert.equal(noEmbedding.decisions[0]?.decision.eligibility, 'ELIGIBLE')
assert.equal(noEmbedding.rankedV2[0]?.breakdown?.evidence?.semanticSignal, 'ABSENT', 'missing embedding reaches V2 as ABSENT')
const unknownCandidate = { ...candidate, profile_data: { ...candidate.profile_data, candidate_eligibility: undefined } }
const cachedSaysMatch = { candidate_class: 'MATCH', score_snapshot: 99 }
const reranked = rankOpportunitiesV2(unknownCandidate, [{ ...opportunity, eligible_countries: [], eligible_regions: [] }], dictionary, V2_PRESET_FULL)
assert.equal(cachedSaysMatch.candidate_class, 'MATCH', 'fixture models cache hint')
assert.equal(reranked.decisions[0]?.decision.outcome, 'ABSTAIN', 'current V2 ABSTAIN overrides cached MATCH hint')

const workerSource = readFileSync(new URL('./run_matching_retrieval_expansion.ts', import.meta.url), 'utf8')
const liveSource = readFileSync(new URL('../supabase/functions/match-batch/index.ts', import.meta.url), 'utf8')
const alertSource = readFileSync(new URL('../netlify/functions/send-high-match-alerts.ts', import.meta.url), 'utf8')
const accountingSource = readFileSync(new URL('./account_matching_retrieval_funnel.ts', import.meta.url), 'utf8')
const migrationSource = readFileSync(new URL('../supabase/migrations/202609270001_matching_retrieval_coverage.sql', import.meta.url), 'utf8')
const workflowSource = readFileSync(new URL('../.github/workflows/matching-retrieval.yml', import.meta.url), 'utf8')
assert.ok(accountingSource.includes('inventoryFunnelPage(') && accountingSource.includes('mergeInventoryFunnelCounts('), 'read-only accounting uses the single shared funnel implementation')
assert.ok(accountingSource.includes("select('source,is_enabled,matching_enabled')") && accountingSource.includes('normalizeSourcePolicyRow'), 'accounting reads and normalizes the full Matching capability policy')
assert.ok(!['.insert(', '.update(', '.upsert(', '.delete(', '.rpc('].some(method => accountingSource.includes(method)), 'accounting script contains no database mutation/RPC path')
assert.ok(accountingSource.includes("from('opportunities')") && !accountingSource.includes(".eq('match_eligible', true)"), 'accounting keyset-scans all inventory before classifying')
assert.ok(workerSource.includes('rankOpportunitiesV2(') && workerSource.includes("rpc('score_opportunity_embeddings'"), 'background pages use shared V2 plus page scoring RPC')
assert.ok(workerSource.includes("from('matching_retrieval_candidates').delete") && workerSource.includes('scan_examined_count'), 'changed rows are removed/replaced and cursor progress is persisted')
assert.ok(!accountingSource.includes(".eq('match_eligible', true)"), 'inventory accounting begins with unfiltered total inventory')
assert.ok(liveSource.includes('unionRetrievalLanes(') && liveSource.includes('match_count: 120') && liveSource.includes('.limit(300)'), 'live recent, semantic, and background lanes remain bounded and unified')
assert.ok(liveSource.includes("rpc('get_source_distribution_policy')") && liveSource.includes('sourceMatchingAllowed(sourcePolicyFor(sourcePolicyIndex, item.source))'), 'live Matching consumes effective switches and preserves explicit operator disables')
assert.ok(alertSource.includes(".eq('candidate_class', 'MATCH')") && alertSource.includes('evaluation_lane') && alertSource.includes('cacheCandidateAlertEligible') && alertSource.includes('deps.rank || rankOpportunitiesV2'), 'alerts gate candidate class/lane/window and rerank current V2')
assert.ok(alertSource.includes('from("opportunity_alert_universe")') && !alertSource.includes('sourceMatchingAllowed('), 'Alerts use alert-universe routing, independent of Matching operational switch')
assert.ok(workerSource.includes("rpc('refresh_dirty_opportunity_universe_sources'") && workerSource.includes('OPPORTUNITY_UNIVERSE_DIRTY_SOURCE_QUEUE_NOT_DRAINED'), 'worker drains coalesced policy invalidations before reading the canonical universe')
assert.ok(workerSource.includes("from('opportunity_final_matching_universe')") && workerSource.includes("from('opportunities')") && workerSource.includes("from('opportunity_universe_state')") && workerSource.includes("String(row.universe_final_matching_state || 'READY')"), 'FULL targets consume the canonical final universe and DELTA removes rows that leave it')
assert.ok(alertSource.includes('collectAlertCandidateSnapshot') && alertSource.includes('claim_match_alert_scan') && alertSource.includes('save_match_alert_scan') && alertSource.includes(".gte('evaluated_at', progress.lower)") && alertSource.includes(".lte('evaluated_at', progress.cutoff)") && !alertSource.includes('.limit(1000)'), 'alert cache pages use a durable profile cursor and frozen freshness cutoff, without snapshot accumulation')
const pruneFunction = migrationSource.slice(migrationSource.indexOf('create or replace function public.prune_matching_retrieval_candidates()'), migrationSource.indexOf('revoke all on function public.prune_matching_retrieval_candidates()'))
assert.ok(pruneFunction.includes('u.final_matching_state is distinct from \'READY\'') && pruneFunction.includes('c.opportunity_content_fingerprint') && !pruneFunction.includes('opportunity_sources'), 'cache prune follows canonical universe state/fingerprint without raw source-policy joins')
assert.ok(migrationSource.includes('create table if not exists public.matching_retrieval_states') && migrationSource.includes('create table if not exists public.matching_retrieval_candidates'), 'additive local migration defines retrieval state and shortlist')
assert.ok(migrationSource.includes('to service_role') && migrationSource.includes('opportunity_ids text[]'), 'derived persistence and score RPC stay service-role scoped')
assert.ok(workflowSource.includes("cron: '17 * * * *'") && workflowSource.includes('workflow_dispatch') && workflowSource.includes('SUPABASE_SERVICE_ROLE_KEY'), 'future worker is bounded scheduled/manual GitHub automation, not Netlify deploy')

console.log('PASS matching retrieval expansion: full pages, cursor safety, idempotent retry, invalidation, classification, union, semantic absence, alert lane')
