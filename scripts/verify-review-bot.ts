import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { reviewOpportunityDeterministic, type OpportunityReviewInput } from '../src/lib/review/opportunity-review'
import { fetchOpportunityPage } from '../netlify/functions/lib/safe-opportunity-fetch'
import { clarifyReviewWithGemini } from '../netlify/functions/lib/review-gemini'
import { validateBatchApprovalSnapshot } from '../netlify/functions/lib/batch-review-snapshot'
import { reconcileSources } from '../netlify/functions/lib/source-reconciliation'

const now = new Date('2026-08-20T12:00:00Z')
const base: OpportunityReviewInput = {
  id: 'fixture-1', slug: 'backend-engineer-fixture', title: 'Backend Engineer',
  organization: 'Acme', description: 'A'.repeat(180), application_url: 'https://jobs.example.com/1',
  deadline: '2026-09-30', source: 'official_fixture', source_authority: 'original',
  original_source_verified: true, opportunity_type: 'job', type: 'FULL_TIME',
  location: 'Asunción', country_code: 'PY', geo_confidence: 'confirmed',
  remote_scope: 'COUNTRY_SPECIFIC', is_active: false, verification_status: 'in_review',
}

const page = {
  requestedUrl: base.application_url!, finalUrl: base.application_url!, redirects: [], status: 200,
  canonical: base.application_url!, title: 'Backend Engineer | Acme', organization: 'Acme',
  hasStructuredData: true, closedSignal: null, pageKind: 'opportunity' as const,
}

const resolved = reviewOpportunityDeterministic(base, page, [], now)
assert.equal(resolved.recommendation, 'approve', 'deterministic complete record should be approvable')
assert.equal(resolved.ai.used, false, 'deterministic path must use zero AI')
assert.equal(resolved.deterministic.needsAi, false, 'complete evidence must not request Gemini')
assert.equal(resolved.flags.matching.recommended, true)

const expired = reviewOpportunityDeterministic({ ...base, deadline: '2026-01-01' }, page, [], now)
assert.equal(expired.recommendation, 'do_not_publish')
assert(expired.deterministic.hardBlocks.includes('EXPIRED'))

const aggregator = reviewOpportunityDeterministic({ ...base, source_authority: 'aggregator', original_source_verified: false }, { ...page, pageKind: 'aggregator' }, [], now)
assert.equal(aggregator.recommendation, 'do_not_publish')

const unknownGeo = reviewOpportunityDeterministic({ ...base, country_code: null, remote_scope: 'UNKNOWN', geo_confidence: 'unknown', location: null }, page, [], now)
assert.equal(unknownGeo.recommendation, 'review')
assert.equal(unknownGeo.flags.matching.recommended, false)
assert.equal(unknownGeo.deterministic.needsAi, true)

const duplicate = reviewOpportunityDeterministic(base, page, [{ id: 'existing', kind: 'normalized_url' }], now)
assert.equal(duplicate.recommendation, 'do_not_publish')

const notFound = reviewOpportunityDeterministic(base, { ...page, status: 404, pageKind: 'error' }, [], now)
assert.equal(notFound.recommendation, 'do_not_publish')
assert(notFound.deterministic.hardBlocks.includes('HTTP_404'))
const gone = reviewOpportunityDeterministic(base, { ...page, status: 410, pageKind: 'error' }, [], now)
assert(gone.deterministic.hardBlocks.includes('HTTP_410'))

let fetchCount = 0
const redirectPage = await fetchOpportunityPage('https://public.example/start', {
  resolveHost: async () => ['93.184.216.34'],
  fetchImpl: (async (url: string | URL | Request) => {
    fetchCount++
    if (String(url).endsWith('/start')) return new Response('', { status: 302, headers: { location: '/final' } })
    return new Response('<html><head><title>Backend Engineer | Acme</title><link rel="canonical" href="/final"><script type="application/ld+json">{}</script></head></html>', { status: 200, headers: { 'content-type': 'text/html' } })
  }) as typeof fetch,
})
assert.equal(fetchCount, 2)
assert.equal(redirectPage.redirects.length, 1)
assert.equal(redirectPage.finalUrl, 'https://public.example/final')

let geminiCalls = 0
const ambiguous = reviewOpportunityDeterministic({ ...base, id: 'fixture-ai', country_code: null, remote_scope: 'UNKNOWN', geo_confidence: 'unknown', location: null }, page, [], now)
const geminiMock = (async () => {
  geminiCalls++
  return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({
    pageRepresentsOpportunity: true, organization: 'Acme', opportunityType: 'job',
    eligibilitySummary: 'No explícita', contradictions: [], explanation: 'La ubicación requiere revisión humana.',
  }) }] } }] }), { status: 200, headers: { 'content-type': 'application/json' } })
}) as typeof fetch
const miss = await clarifyReviewWithGemini({ ...base, id: 'fixture-ai', country_code: null, remote_scope: 'UNKNOWN', geo_confidence: 'unknown', location: null }, ambiguous, { apiKey: 'fixture-key', fetchImpl: geminiMock })
assert.equal(miss.cached, false)
const hit = await clarifyReviewWithGemini({ ...base, id: 'fixture-ai', country_code: null, remote_scope: 'UNKNOWN', geo_confidence: 'unknown', location: null }, ambiguous, { apiKey: 'fixture-key', fetchImpl: geminiMock })
assert.equal(hit.cached, true)
assert.equal(geminiCalls, 1, 'cache hit must not call Gemini again')

const failedInput = { ...base, id: 'fixture-ai-failure', organization: null }
const failedReview = reviewOpportunityDeterministic(failedInput, page, [], now)
await assert.rejects(() => clarifyReviewWithGemini(failedInput, failedReview, {
  apiKey: 'fixture-key', fetchImpl: (async () => new Response('no', { status: 503 })) as typeof fetch,
}), /gemini_http_503/)

const reviewSource = readFileSync(new URL('../netlify/functions/admin-review-bot.ts', import.meta.url), 'utf8')
assert(!/BedrockRuntimeClient|InvokeModelCommand/.test(reviewSource), 'Review Bot V1 must not call Bedrock')
const adminDataSource = readFileSync(new URL('../netlify/functions/admin-data.ts', import.meta.url), 'utf8')
const retiredLegacyConfirm = adminDataSource.indexOf('requiredAction: "bulk_verify_opportunities"')
const legacyWriteLoop = adminDataSource.indexOf('const rawIds = Array.isArray(payload.candidateIds)')
assert(retiredLegacyConfirm >= 0 && retiredLegacyConfirm < legacyWriteLoop,
  'legacy auto-approve confirm must exit before any write path')
const mailerSource = readFileSync(new URL('../netlify/functions/lib/founding-mailer.ts', import.meta.url), 'utf8')
assert(/idempotency/i.test(mailerSource) && /Resend/.test(mailerSource), 'Founding email safety contract remains present; tests never invoke Resend')

const batchPayload = {
  ids: ['fixture-1'], note: 'Fixture approval', idempotency_key: 'snapshot-fixture-1',
  features: { catalog: true, matching: true, alerts: false, seo: false },
  review_snapshot: [{ id: 'fixture-1', recommendation: 'approve', rules_version: 'fixture' }],
}
const batchCandidate = [{ id: 'fixture-1', verification_status: 'in_review', source_authority: 'original', original_source_verified: true }]
const batchValid = validateBatchApprovalSnapshot(batchCandidate, batchPayload)
assert.equal(batchValid.ok, true, 'snapshot with explicit mixed flags must pass')
if (batchValid.ok) assert.deepEqual(batchValid.features, batchPayload.features)
assert.equal(validateBatchApprovalSnapshot(batchCandidate, { ...batchPayload, features: { catalog: true } }).ok, false, 'implicit flags must fail')
const doubleSubmit = validateBatchApprovalSnapshot([], batchPayload)
assert.equal(doubleSubmit.ok, false, 'a second submit after rows leave review state is stale/idempotent')
if (!doubleSubmit.ok) assert.equal(doubleSubmit.status, 409)

const reconciled = reconcileSources(
  [{ source_id: 'official', script: 'scrapers/official_scraper.py', source_tier: 'A' }],
  'run: python scripts/run_scraper_monitored.py official_scraper official scrapers/official_scraper.py',
  [{ scraper_id: 'official_scraper', script_path: 'scrapers/official_scraper.py', collection_enabled: false, require_review: true, last_run_status: 'success' }],
  [{ source: 'official' }],
)
assert.equal(reconciled.length, 1)
assert.equal(reconciled[0].in_registry && reconciled[0].in_workflow && reconciled[0].in_runtime, true)

console.log('PASS verify-review-bot: deterministic, redirects, 404/410, expiry, aggregator, geo, duplicates, Gemini cache/failure, snapshot/mixed flags/double submit, legacy auto-write retired, source reconciliation, no Bedrock, no Resend')
