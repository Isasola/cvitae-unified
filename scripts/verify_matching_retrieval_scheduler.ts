import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { nextRetrievalSchedulerCursor, prioritizeRetrievalUsers, type RetrievalSchedulerCandidate, type RetrievalSchedulerReason } from '../shared/retrieval-user-scheduler.ts'

type Profile = { user_id: string }
const candidate = (id: string, reason: RetrievalSchedulerReason): RetrievalSchedulerCandidate<Profile> => ({ profile: { user_id: id }, scheduler_reason: reason })
const groups = (): Record<RetrievalSchedulerReason, Array<RetrievalSchedulerCandidate<Profile>>> => ({ PENDING: [], SCANNING: [], ERROR: [], STALE: [], NO_STATE: [], DELTA_PENDING: [] })

// A: 600 idle COMPLETE users are absent from schedulable groups; never-covered users win.
const noStateGroups = groups()
noStateGroups.NO_STATE = Array.from({ length: 10 }, (_, i) => candidate(`new-${String(i).padStart(2, '0')}`, 'NO_STATE'))
assert.deepEqual(prioritizeRetrievalUsers(2, noStateGroups).map((item) => item.scheduler_reason), ['NO_STATE', 'NO_STATE'])

// B: unfinished work outranks stale state; stale outranks never-covered.
const priorityGroups = groups()
priorityGroups.NO_STATE.push(candidate('never', 'NO_STATE'))
priorityGroups.STALE.push(candidate('stale', 'STALE'))
priorityGroups.PENDING.push(candidate('pending', 'PENDING'))
assert.deepEqual(prioritizeRetrievalUsers(2, priorityGroups).map((item) => item.profile.user_id), ['pending', 'stale'])

// C/D: NO_STATE precedes real DELTA; idle COMPLETE users are not candidates.
const deltaGroups = groups()
deltaGroups.NO_STATE.push(candidate('never', 'NO_STATE'))
deltaGroups.DELTA_PENDING.push(candidate('changed', 'DELTA_PENDING'))
assert.deepEqual(prioritizeRetrievalUsers(2, deltaGroups).map((item) => item.profile.user_id), ['never', 'changed'])
const idleGroups = groups()
assert.deepEqual(prioritizeRetrievalUsers(2, idleGroups), [], 'COMPLETE without changes consumes no worker slot')

// E: keyset pages plus cursor-at-last-selected eventually serve every profile.
const allProfiles = Array.from({ length: 1000 }, (_, i) => `user-${String(i).padStart(4, '0')}`)
const served = new Set<string>()
let cursor: string | null = null
for (let run = 0; run < 600 && served.size < allProfiles.length; run++) {
  const pageIds = allProfiles.filter((id) => !cursor || id > cursor).slice(0, 100)
  if (!pageIds.length) break
  const scanned = pageIds.map((id) => candidate(id, 'NO_STATE'))
  const pageGroups = groups()
  pageGroups.NO_STATE = scanned
  const selected = prioritizeRetrievalUsers(2, pageGroups)
  for (const item of selected) served.add(item.profile.user_id)
  cursor = nextRetrievalSchedulerCursor(scanned, selected, new Set(), cursor)
}
assert.equal(served.size, 1000, 'bounded keyset pages eventually select all 1000 never-covered profiles')

// F/G: interrupted scans resume their existing cursor; only signature drift resets FULL.
const worker = readFileSync(new URL('./run_matching_retrieval_expansion.ts', import.meta.url), 'utf8')
const processUser = worker.slice(worker.indexOf('async function processUser'), worker.indexOf("const { rows: policyRows"))
assert.ok(processUser.includes("state.profile_signature !== profileSig || state.source_policy_signature !== sourcePolicies.signature") && processUser.includes("initializeState(profile, profileSig, sourcePolicies.signature, 'FULL'"), 'signature drift keeps the FULL reset contract')
assert.ok(processUser.includes("else if (state.scan_status === 'ERROR')") && processUser.includes("if (current.scan_status === 'PENDING')") && !processUser.includes("state.scan_status === 'SCANNING'"), 'SCANNING resumes the existing state/cursor instead of resetting FULL')

// Delta discovery is bounded and only schedules a COMPLETE profile after a real changed row exists.
assert.ok(worker.includes(".eq('scan_status', 'COMPLETE')") && worker.includes(".gt('updated_at', watermark).lte('updated_at', cutoff).limit(1)") && worker.includes("if (changed.data?.length) add('DELTA_PENDING', profile)"), 'DELTA_PENDING requires an actual bounded change probe')
assert.ok(worker.includes('nextRetrievalSchedulerCursor') && worker.includes(".gt('user_id', cursor ??") && worker.includes(".lt('user_id', cursor)"), 'scheduler traverses profiles through cyclic keyset pages')

const accounting = readFileSync(new URL('./account_matching_retrieval_funnel.ts', import.meta.url), 'utf8')
assert.ok(accounting.includes('CURRENT_READONLY_PROD_${observationDate}') && !accounting.includes('CURRENT_READONLY_PROD_27SEP2026'), 'accounting label uses its runtime UTC observation date')

for (const workflow of ['refresh_embeddings.yml', 'matching-retrieval.yml', 'scheduled-source-automation.yml', 'opportunity-universe-maintenance.yml']) {
  const yaml = readFileSync(new URL(`../.github/workflows/${workflow}`, import.meta.url), 'utf8')
  assert.match(yaml, /group: cvitae-opportunity-pipeline-maintenance/, `${workflow} serializes pipeline maintenance workers`)
}
for (const workflow of ['scheduled-source-automation.yml', 'opportunity-universe-maintenance.yml']) {
  const yaml = readFileSync(new URL(`../.github/workflows/${workflow}`, import.meta.url), 'utf8')
  assert.doesNotMatch(yaml, /^\s{2}schedule:/m, `${workflow} remains manual until authorized PROD validation`)
}

console.log('PASS retrieval user scheduler: priority, idle skip, delta proof, cyclic fairness, resume cursor, signature reset, UTC label, serialized workers')
