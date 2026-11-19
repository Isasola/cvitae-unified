import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { matchingRunState, MATCHING_MAX_AGE_MS } from '../shared/matching-run-state.ts'
import { matchingCoverageFromSnapshot } from '../netlify/functions/b2c-profile.ts'

const now = Date.parse('2026-10-12T18:00:00.000Z')
const freshAt = new Date(now - 60_000).toISOString()
const oldAt = new Date(now - MATCHING_MAX_AGE_MS - 1).toISOString()
const snapshot = (changes: Record<string, unknown> = {}) => ({
  run_status: 'SUCCESS', run_at: freshAt, profile_updated_at: freshAt,
  profile_signature: 'signature-a', match_count: 0, visible_potential_count: 0,
  potential_scoreable_count: 0, coverage_state: 'NO_CONFIRMED_MATCH', ...changes,
})

assert.equal(matchingRunState(null, 'signature-a', now).reason, 'NO_RUN')
assert.equal(matchingRunState(snapshot({ run_status: 'ERROR' }), 'signature-a', now).reason, 'RUN_ERROR')
assert.equal(matchingRunState(snapshot(), 'signature-b', now).reason, 'PROFILE_CHANGED')
assert.equal(matchingRunState(snapshot({ run_at: oldAt }), 'signature-a', now).reason, 'AGE_EXPIRED')
assert.equal(matchingRunState(snapshot({ run_at: oldAt }), 'signature-b', now).reason, 'PROFILE_CHANGED_AND_AGE_EXPIRED')
assert.equal(matchingRunState(snapshot({ profile_signature: null }), 'signature-a', now).reason, 'MISSING_PROFILE_SIGNATURE')
assert.equal(matchingRunState(snapshot(), 'signature-a', now).status, 'SUCCESS_ZERO')
assert.equal(matchingRunState(snapshot({ match_count: 2 }), 'signature-a', now).status, 'SUCCESS_WITH_RESULTS')

const stale = matchingCoverageFromSnapshot(snapshot({ run_at: oldAt, match_count: 9 }), 'signature-a', now)
assert.equal(stale.match, null, 'historical count is never exposed as current')
assert.equal(stale.reason, 'AGE_EXPIRED')
const current = matchingCoverageFromSnapshot(snapshot({ match_count: 1, visible_potential_count: 2 }), 'signature-a', now)
assert.equal(current.match, 1)
assert.equal(current.potential, 2)

// Static contracts cover user isolation, dedupe/concurrency and consumer-scoped
// retrieval without exercising any production endpoint.
const admin = readFileSync(new URL('../netlify/functions/admin-data.ts', import.meta.url), 'utf8')
assert.match(admin, /\.eq\("user_id", userId\).*\.maybeSingle\(\)/s)
assert.match(admin, /\["PENDING", "SCANNING"\].*deduplicated: true/s)
assert.match(admin, /\.eq\("user_id", userId\)\.eq\("scan_status", state\.scan_status\)/)
assert.match(admin, /communication_eligible: matchingState\.is_current/)
const batch = readFileSync(new URL('../supabase/functions/match-batch/index.ts', import.meta.url), 'utf8')
assert.match(batch, /match_consumer_opportunities/)
assert.match(batch, /consumer: requestMode === 'alerts' \? 'alerts' : 'matching'/)
const migration = readFileSync(new URL('../supabase/migrations/202610120002_consumer_scoped_semantic_retrieval.sql', import.meta.url), 'utf8')
assert.match(migration, /opportunity_final_matching_universe/)
assert.match(migration, /opportunity_alert_universe/)
assert.doesNotMatch(migration, /catalog|seo/i)

console.log('verify_r3_matching_freshness: PASS reasons=8 current_vs_historical isolation dedupe consumer_scoped')
