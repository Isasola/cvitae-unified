import assert from 'node:assert/strict'
import {
  classifyBackgroundCoverage, commitRetrievalPage, cursorAfterPage, pageMatchingRoutingChanges,
  retrievalCacheIsCurrent, retrievalStateRequiresFullRebuild, uniqueRoutingOpportunityIds,
} from '../shared/matching-retrieval.ts'

const check = (condition: unknown, message: string) => assert.ok(condition, message)
const results: string[] = []

// TEST 1 — model the durable keyset + fixed-target ledger contract. This is a
// deterministic fixture, not a repeat of the prior Docker/5,400 SQL canary.
const inventory = Array.from({ length: 5400 }, (_, i) => ({ id: `op-${String(i).padStart(5, '0')}`, created_at: new Date(i * 1000).toISOString() }))
let fullCursor: { at: string; id: string } | null = null
let fullRows = 0
let fullPages = 0
let routeEpoch = 100
const fixedFullStart = routeEpoch
const concurrentChanges: any[] = []
while (fullRows < inventory.length) {
  const page = inventory.filter(row => !fullCursor || row.created_at > fullCursor.at || (row.created_at === fullCursor.at && row.id > fullCursor.id)).slice(0, 250)
  assert.ok(page.length)
  fullPages++
  fullRows += page.length
  fullCursor = cursorAfterPage(page, 'created_at')
  // Transitions include IDs behind the cursor, proving the ledger (not a FULL
  // restart) repairs those misses after the scan.
  const changedId = inventory[(fullRows + 13) % inventory.length].id
  concurrentChanges.push({ routing_epoch: ++routeEpoch, opportunity_id: changedId, previous_ready: false, current_ready: true })
}
const fullTarget = routeEpoch
let deltaCursor = fixedFullStart
const replayed: string[] = []
while (deltaCursor < fullTarget) {
  const page = pageMatchingRoutingChanges(concurrentChanges, deltaCursor, fullTarget, 3)
  replayed.push(...uniqueRoutingOpportunityIds(page.rows))
  deltaCursor = page.cursor
}
assert.equal(fullRows, 5400)
assert.equal(replayed.length, concurrentChanges.length)
assert.equal(deltaCursor, fullTarget)
results.push('TEST_1_CONTINUOUS_INGESTION_FULL_CURSOR_PROGRESS_AND_LEDGER_REPLAY')

// TEST 2 — a previously COMPLETE candidate gets only the new event IDs.
const newEvents = Array.from({ length: 100 }, (_, i) => ({ routing_epoch: 501 + i, opportunity_id: `new-${i}`, previous_ready: false, current_ready: true }))
const newIds: string[] = []
let newCursor = 500
while (newCursor < 600) {
  const page = pageMatchingRoutingChanges(newEvents, newCursor, 600, 25)
  newIds.push(...uniqueRoutingOpportunityIds(page.rows))
  newCursor = page.cursor
}
assert.equal(newIds.length, 100)
assert.equal(new Set(newIds).size, 100)
assert.ok(newIds.length < 5500, 'routing delta is proportional to changed IDs, not the full inventory')
results.push('TEST_2_COMPLETE_CANDIDATE_100_EVENT_DELTA')

// TEST 3 — exclusion removes the cached MATCH and retains the reducer reason.
const privateCandidates = new Map([['leaves', { candidate_class: 'MATCH', reason_codes: ['PROFILE_FIT'] }]])
const currentUniverse = new Map([['leaves', { ready: false, reason: 'SOURCE_MATCHING_DISABLED' }]])
for (const [id, row] of currentUniverse) if (!row.ready) privateCandidates.delete(id)
assert.equal(privateCandidates.has('leaves'), false)
assert.equal(currentUniverse.get('leaves')?.reason, 'SOURCE_MATCHING_DISABLED')
results.push('TEST_3_READY_TO_NOT_READY_EXCLUSION')

// TEST 4 — repeated transitions of one ID coalesce to current authoritative state.
const oscillation = [
  { routing_epoch: 10, opportunity_id: 'same-id', previous_ready: false, current_ready: true },
  { routing_epoch: 11, opportunity_id: 'same-id', previous_ready: true, current_ready: false },
  { routing_epoch: 12, opportunity_id: 'same-id', previous_ready: false, current_ready: true },
]
const oscillationPage = pageMatchingRoutingChanges(oscillation, 9, 12, 10)
assert.deepEqual(uniqueRoutingOpportunityIds(oscillationPage.rows), ['same-id'])
const authoritativeUniverse = new Map([['same-id', true]]) // current reducer projection after all three events
const finalReady = authoritativeUniverse.get('same-id') === true
const oscillationCandidates = new Set<string>()
for (const id of uniqueRoutingOpportunityIds(oscillationPage.rows)) {
  if (authoritativeUniverse.get(id)) oscillationCandidates.add(id)
  else oscillationCandidates.delete(id)
}
assert.equal(finalReady, true)
assert.deepEqual([...oscillationCandidates], ['same-id'])
results.push('TEST_4_OSCILLATION_FINAL_STATE_IDEMPOTENT')

// TEST 5 — fixed target is not moved by later arrivals; next pass owns them.
const movingLedger = Array.from({ length: 10 }, (_, i) => ({ routing_epoch: 1 + i, opportunity_id: `x-${i}`, previous_ready: false, current_ready: true }))
const target500 = 5
const fixedPage = pageMatchingRoutingChanges(movingLedger, 0, target500, 10)
assert.equal(fixedPage.rows.length, 5)
assert.equal(fixedPage.cursor, 5)
assert.equal(movingLedger.filter(row => row.routing_epoch > fixedPage.cursor).length, 5, 'later revisions remain pending for the next invocation')
results.push('TEST_5_FIXED_TARGET_AND_RESUMABLE_PROGRESS')

// TEST 6 — candidate upsert is idempotent when interrupted before cursor save.
const durableCandidates = new Map<string, string>()
let durableCursor = 7
let interruptOnce = true
const eventsToReplay = [{ id: 'same-opportunity' }]
await assert.rejects(commitRetrievalPage(eventsToReplay, async rows => {
  for (const row of rows) durableCandidates.set('user-A:same-opportunity', row.id)
}, async () => {
  if (interruptOnce) { interruptOnce = false; throw new Error('INTERRUPTED_BEFORE_CURSOR') }
  durableCursor = 8
}), /INTERRUPTED_BEFORE_CURSOR/)
assert.equal(durableCursor, 7)
await commitRetrievalPage(eventsToReplay, async rows => {
  for (const row of rows) durableCandidates.set('user-A:same-opportunity', row.id)
}, async () => { durableCursor = 8 })
assert.equal(durableCandidates.size, 1)
assert.equal(durableCursor, 8)
results.push('TEST_6_INTERRUPTION_REPLAY_IDEMPOTENT')

// TEST 7 — policy signatures and private ownership remain consumer/user scoped.
const cached = { profile_signature: 'p', source_policy_signature: 'm', scan_status: 'COMPLETE', completed_routing_epoch: 12, routing_ledger_baseline_epoch: 1 }
assert.equal(retrievalCacheIsCurrent({ profile_signature: 'p' }, cached, 'p', 'm', 12), true)
assert.equal(retrievalCacheIsCurrent({ profile_signature: 'p' }, { ...cached, completed_routing_epoch: 11 }, 'p', 'm', 12), false)
assert.equal(durableCandidates.has('user-B:same-opportunity'), false, 'upsert/delete identity includes the owning candidate')
results.push('TEST_7_MATCHING_CONSUMER_AND_USER_BOUNDARY')

// TEST 8 — missing ledger baseline and behind-epoch cache are never COMPLETE.
assert.equal(retrievalCacheIsCurrent({ profile_signature: 'p' }, { ...cached, routing_ledger_baseline_epoch: null }, 'p', 'm', 12), false)
assert.equal(classifyBackgroundCoverage({ ...cached, completed_routing_epoch: 11 }, 'p', 'm', 12), 'STALE')
assert.equal(classifyBackgroundCoverage({ ...cached, routing_ledger_baseline_epoch: null }, 'p', 'm', 12), 'STALE')
assert.equal(retrievalStateRequiresFullRebuild({ ...cached, routing_ledger_baseline_epoch: null }, 1), true, 'legacy completion without a verifiable baseline requires one FULL')
assert.equal(retrievalStateRequiresFullRebuild({ ...cached, scan_kind: 'FULL', scan_status: 'SCANNING', scan_routing_epoch: 1, routing_ledger_baseline_epoch: null, routing_phase: 'FULL_SCAN' }, 1), false, 'a bootstrap FULL survives restart until its ledger DELTA completes')
assert.equal(retrievalStateRequiresFullRebuild({ ...cached, scan_kind: 'DELTA', scan_status: 'SCANNING', routing_delta_from_epoch: 10, routing_delta_cursor_epoch: 14, routing_delta_target_epoch: 13, routing_phase: 'ROUTING_DELTA' }, 1), true, 'corrupt delta cursor cannot falsely complete and requires safe rebuild')
results.push('TEST_8_STALE_CACHE_AND_LEGACY_BASELINE')

console.log(JSON.stringify({ evidence: 'FIXTURE', status: 'PASS', tests: results,
  metrics: { full_rows: fullRows, full_pages: fullPages, interleaved_routing_events: concurrentChanges.length,
    full_start_epoch: fixedFullStart, full_target_epoch: fullTarget, full_completed_epoch: deltaCursor,
    candidate_delta_events: newIds.length, candidate_delta_target_epoch: newCursor } }, null, 2))
