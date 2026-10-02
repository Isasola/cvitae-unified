import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildDefaultDictionary } from '../supabase/functions/_shared/matching.ts'
import { isPotentialDiscoveryDecision, rankOpportunitiesV2, V2_PRESET_FULL } from '../supabase/functions/_shared/matching-v2.ts'
import { classifyMatchingCoverage } from '../src/lib/matching-coverage.ts'
import { reconcileInventoryRows, reconciliationSummary, mergeReconciliationSummaries, accumulateReconciliationPerSource } from '../src/lib/inventory-reconciliation.ts'
import { canonicalOpportunityPathForRow } from '../src/lib/opportunity-truth.ts'
import { matchingProfileSignature } from '../shared/matching-profile-signature.ts'
import { matchingCoverageFromSnapshot } from '../netlify/functions/b2c-profile.ts'

const dictionary = buildDefaultDictionary()
const profile = {
  professional_title: 'Programme Officer International Development',
  summary: 'International cooperation, NGO programme coordination and monitoring.',
  profile_data: {
    habilidades: ['Programme Management', 'Monitoring'], location: 'Paraguay',
    modality: 'remote', seniority: 'mid',
    candidate_truth: { evidence: { professional_title: 'CONFIRMED', summary: 'CONFIRMED', skills: 'CONFIRMED', location: 'CONFIRMED' } },
  },
}
const base = {
  source_match_state: 'ALLOWED', is_active: true, verification_status: 'verified',
  match_eligible: true, deleted_at: null, archived_at: null, deadline: null,
  location: 'Remote', type: 'Remote', tags: ['Programme Management', 'Monitoring'],
  description: 'International development programme coordination, monitoring and reporting.',
}
const strongUnknown = { ...base, id: 'potential', title: 'Programme Officer International Development', eligible_countries: [], eligible_regions: [] }
const ineligible = { ...strongUnknown, id: 'ineligible', eligible_countries: ['us'] }
const conflict = { ...base, id: 'conflict', title: 'Senior Backend Software Engineer', tags: ['Python', 'Docker'], description: 'Backend software APIs and cloud infrastructure.', eligible_countries: [] }
const thin = { ...base, id: 'thin', title: 'Opportunity', tags: [], description: 'Short listing.', eligible_countries: [] }
const confirmed = { ...base, id: 'confirmed', title: 'Programme Officer International Development', eligible_countries: ['py'], eligible_regions: [] }
const lowQuality = { ...base, id: 'low-quality', title: 'Administrative Assistant', tags: [], description: 'Administrative support.', eligible_countries: [], eligible_regions: [] }
const run = rankOpportunitiesV2(profile, [strongUnknown, ineligible, conflict, thin, confirmed, lowQuality], dictionary, V2_PRESET_FULL, new Map([['potential', .95], ['ineligible', .95], ['conflict', .95], ['thin', .95], ['confirmed', .95], ['low-quality', 0]]))
const byId = new Map(run.decisions.map(({ opp, decision }) => [opp.id, decision]))
assert.equal(byId.get('potential')?.outcome, 'ABSTAIN')
assert.equal(isPotentialDiscoveryDecision(byId.get('potential')), true)
assert.equal(run.rankedPotentialV2.some(({ opp }) => opp.id === 'potential'), true)
assert.equal(run.rankedPotentialV2.some(({ opp }) => opp.id === 'ineligible'), false)
assert.equal(run.rankedPotentialV2.some(({ opp }) => opp.id === 'conflict'), false)
assert.equal(run.rankedPotentialV2.some(({ opp }) => opp.id === 'thin'), false)
assert.equal(run.rankedPotentialV2.some(({ opp }) => opp.id === 'low-quality'), false, 'low quality potential stays hidden')
assert.ok(byId.get('low-quality')?.confidence === 'LOW' || (byId.get('low-quality')?.score ?? 0) < 45, 'low confidence/score candidate is below potential visibility bar')
assert.ok(run.potentialTotal >= run.rankedPotentialV2.length, 'potential total is not the visible top-N')
assert.equal(run.rankedV2.some(({ opp }) => opp.id === 'confirmed'), true)
assert.equal(run.rankedV2.some(({ opp }) => opp.id === 'potential'), false)
assert.equal(canonicalOpportunityPathForRow({ slug: 'job-potential', opportunity_type: 'job' }), '/empleos/job-potential')
assert.equal(canonicalOpportunityPathForRow({ slug: 'grant-potential', opportunity_type: 'scholarship' }), '/oportunidades/grant-potential')

assert.equal(classifyMatchingCoverage({ runStatus: 'SUCCESS', uniquePolicyCandidates: 100, sourceAllowed: 100, professionalEvidenceReady: 80, professionalFitKnown: 70, eligibilityEligible: 2, eligibilityUnknown: 98, eligibilityIneligible: 0, match: 0, potential: 10 }), 'ELIGIBILITY_UNKNOWN')
assert.notEqual(classifyMatchingCoverage({ runStatus: 'SUCCESS', uniquePolicyCandidates: 100, sourceAllowed: 100, professionalEvidenceReady: 80, professionalFitKnown: 70, eligibilityEligible: 2, eligibilityUnknown: 98, eligibilityIneligible: 0, match: 0, potential: 0 }), 'ELIGIBILITY_UNKNOWN', 'scoreable-only potentials do not claim visible potential')
assert.equal(classifyMatchingCoverage({ runStatus: 'ERROR', uniquePolicyCandidates: 0, sourceAllowed: 0, professionalEvidenceReady: 0, professionalFitKnown: 0, eligibilityEligible: 0, eligibilityUnknown: 0, eligibilityIneligible: 0, match: 0, potential: 0 }), 'ERROR')
assert.equal(classifyMatchingCoverage({ runStatus: 'NO_RUN', uniquePolicyCandidates: 0, sourceAllowed: 0, professionalEvidenceReady: 0, professionalFitKnown: 0, eligibilityEligible: 0, eligibilityUnknown: 0, eligibilityIneligible: 0, match: 0, potential: 0 }), 'NO_RUN')
assert.equal(classifyMatchingCoverage({ runStatus: 'SUCCESS', uniquePolicyCandidates: 0, sourceAllowed: 0, professionalEvidenceReady: 0, professionalFitKnown: 0, eligibilityEligible: 0, eligibilityUnknown: 0, eligibilityIneligible: 0, match: 0, potential: 0 }), 'LOW_RETRIEVAL_COVERAGE')
const staleCoverage = matchingCoverageFromSnapshot({ run_status: 'SUCCESS', run_at: '2026-09-24T12:00:00.000Z', profile_signature: 'old', coverage_state: 'ELIGIBILITY_UNKNOWN', match_count: 0, visible_potential_count: 10, potential_scoreable_count: 3 }, 'new', Date.parse('2026-09-24T13:00:00.000Z'))
assert.equal(staleCoverage.status, 'STALE')
assert.equal(staleCoverage.coverage_state, 'STALE')
assert.equal(staleCoverage.match, null)
assert.equal(staleCoverage.potential, null)
assert.equal(staleCoverage.potential_scoreable, null)
const coverageCard = readFileSync(new URL('../src/components/cv/MatchingCoverageCard.tsx', import.meta.url), 'utf8')
assert.match(coverageCard, /const terminal = coverage\.status === 'ERROR' \|\| coverage\.status === 'STALE' \|\| coverage\.status === 'NO_RUN'/)
assert.match(coverageCard, /Tu perfil cambiÃ³ desde el Ãºltimo anÃ¡lisis|Tu perfil cambió desde el último análisis/)

const signatureA = matchingProfileSignature({ professional_title: 'Analyst', profile_data: { habilidades: ['SQL'], modality: 'remote' }, is_subscribed: false, updated_at: 'a' })
const signatureB = matchingProfileSignature({ professional_title: 'Analyst', profile_data: { habilidades: ['SQL'], modality: 'remote' }, is_subscribed: true, updated_at: 'b' })
const signatureC = matchingProfileSignature({ professional_title: 'Analyst', profile_data: { habilidades: ['Python'], modality: 'remote' }, is_subscribed: true, updated_at: 'b' })
assert.equal(signatureA, signatureB, 'subscription/lifecycle changes do not stale matching signature')
assert.notEqual(signatureB, signatureC, 'matching field changes stale the signature')

const admin = readFileSync(new URL('../netlify/functions/admin-data.ts', import.meta.url), 'utf8')
assert.doesNotMatch(admin, /candidate_opportunity_matches/, 'Admin no longer depends on nonexistent match relation')
assert.match(admin, /matching_diagnostic_snapshots/, 'Admin reads persisted matcher diagnostics')
assert.match(admin, /no equivale a cero matches/, 'Admin distinguishes error from zero')
assert.match(admin, /accumulateReconciliationPerSource/, 'production preview accumulates per-source accounting in the paginated pass')
assert.match(admin, /per_source: perSource/, 'production preview exposes per_source accounting')
assert.match(admin, /matchingStatus === "STALE" \? null : matchCount/, 'Admin does not expose stale counts as current')
const batch = readFileSync(new URL('../supabase/functions/match-batch/index.ts', import.meta.url), 'utf8')
for (const field of ['potentialMatches', 'primary_retrieval', 'primary_retrieval_scope', 'semantic_retrieval_scope', 'potential_scoreable_count', 'visible_potential_count', 'coverage_state', 'top_reason_codes']) assert.match(batch, new RegExp(field))
assert.match(batch, /downstreamTrusted: !potential/, 'potential is never downstream trusted')
const dashboard = readFileSync(new URL('../src/hub/Dashboard.tsx', import.meta.url), 'utf8')
assert.match(dashboard, /canonicalOpportunityPathForRow/, 'potential cards use canonical opportunity routes')
const migration = readFileSync(new URL('../supabase/migrations/202609240002_matching_diagnostic_snapshots.sql', import.meta.url), 'utf8').toLowerCase()
assert.match(migration, /create table if not exists public\.matching_diagnostic_snapshots/)
assert.match(migration, /profile_updated_at timestamptz/)
assert.match(migration, /profile_signature text/)
assert.match(migration, /potential_scoreable_count integer/)
assert.match(migration, /visible_potential_count integer/)
assert.doesNotMatch(migration, /drop column|drop table|not null\s*;/)
const mailer = readFileSync(new URL('../netlify/functions/log-user-event.ts', import.meta.url), 'utf8')
assert.match(mailer, /matching_coverage_gap/)
assert.match(mailer, /from\("matching_diagnostic_snapshots"\)/)
const founderMailer = readFileSync(new URL('../netlify/functions/lib/founding-mailer.ts', import.meta.url), 'utf8')
assert.match(founderMailer, /founder_\$\{event\}:\$\{userId\}:\$\{dedupeKey \|\| "v1"\}/, 'coverage alert reuses idempotent founder mailer')
assert.match(founderMailer, /dedupeKey/, 'coverage alert supports profile-version dedupe')
const profileApi = readFileSync(new URL('../netlify/functions/b2c-profile.ts', import.meta.url), 'utf8')
assert.match(profileApi, /matching_coverage_snapshots|matching_diagnostic_snapshots/)
assert.match(profileApi, /matchingProfileSignature|profile_signature/)
assert.match(profileApi, /matchingProfileSignature/)
assert.match(profileApi, /coverage_state: 'STALE'/, 'stale endpoint state is neutral')

// Reconciliation preview contract: intrinsic-ready stale false proposes true;
// expired and thin rows remain false. This is a local deterministic preview.
const policy = [{ source: 'fixture', is_enabled: true, matching_enabled: true, catalog_enabled: true, alerts_enabled: true, seo_enabled: true, google_jobs_distribution_allowed: false, third_party_job_distribution_allowed: false }] as any
const row = (id: string, changes: Record<string, unknown> = {}) => ({
  id, source: 'fixture', title: 'Programme Officer', slug: id, organization: 'Fixture', location: 'Paraguay',
  description: 'Programme coordination and monitoring responsibilities with requirements and skills.', tags: ['programme', 'monitoring'], opportunity_type: 'job',
  is_active: true, verification_status: 'verified', match_eligible: false, catalog_eligible: true, alerts_eligible: false, seo_eligible: false,
  application_url: 'https://example.com/apply', source_url: 'https://example.com/source', deadline: null, deleted_at: null, archived_at: null,
  ...changes,
})
const preview = reconcileInventoryRows([row('ready'), row('expired', { source: 'source-b', deadline: '2020-01-01' }), row('thin', { source: 'source-b', description: 'Short', tags: [] })], policy)
assert.equal(preview.find((item) => item.id === 'ready')?.proposed.match_eligible, true)
assert.equal(preview.find((item) => item.id === 'expired')?.proposed.match_eligible, false)
assert.equal(preview.find((item) => item.id === 'thin')?.proposed.match_eligible, false)
const previewSummary = reconciliationSummary(preview)
assert.ok(previewSummary.total_examined === 3 && previewSummary.transitions_by_gate.match_eligible.false_to_true >= 1, 'preview accounts full rows and gate transitions')
assert.ok(previewSummary.deadline_blocks >= 1 && previewSummary.professional_evidence_blocks >= 1, 'preview preserves deadline and evidence block reasons')
assert.ok(previewSummary.known_unknown >= 0 && previewSummary.unexplained === 0, 'known UNKNOWN reasons are explained, not unexplained')
const perSource = accumulateReconciliationPerSource({}, preview)
const bySourceTotal = mergeReconciliationSummaries(Object.values(perSource))
assert.equal(bySourceTotal.total_examined, previewSummary.total_examined, 'per-source totals reconcile globally')
for (const gate of ['catalog_eligible', 'match_eligible', 'alerts_eligible', 'seo_eligible']) {
  for (const direction of Object.keys(previewSummary.transitions_by_gate[gate])) {
    assert.equal(bySourceTotal.transitions_by_gate[gate][direction], previewSummary.transitions_by_gate[gate][direction], `per-source ${gate}.${direction} reconciles`)
  }
}
const unknownReasonSummary = reconciliationSummary([{ ...preview[0], matching: { ...preview[0].matching, reasons: ['SOME_NEW_REASON_NOT_IN_CONTRACT'] } } as any])
assert.equal(unknownReasonSummary.known_unknown, 0)
assert.equal(unknownReasonSummary.unexplained, 1, 'unknown reason code is unexplained')

console.log('verify_item57_matching_observability: PASS potential=separate diagnostics=shared admin_error!=zero geo=global reconciliation=preview_only')
