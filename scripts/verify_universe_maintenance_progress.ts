import assert from 'node:assert/strict'
import {
  maintenanceCompletion,
  maintenanceIsStalled,
  nextNoProgressWindows,
  parseDirtyRefreshResponse,
} from '../shared/opportunity-universe-maintenance.ts'

assert.deepEqual(maintenanceCompletion(0), { status: 'COMPLETE', continuation_required: false })
assert.deepEqual(maintenanceCompletion(94), { status: 'RESUMABLE', continuation_required: true })
assert.equal(parseDirtyRefreshResponse({ pending_sources: 1, sources_refreshed: 0, opportunities_refreshed: 250, page_size: 250 }).opportunities_refreshed, 250)
assert.throws(() => parseDirtyRefreshResponse({ pending_sources: 1, sources_refreshed: 0, opportunities_refreshed: 251, page_size: 251 }), /page_size/)

// A stale queue is not stalled after one quiet window, and work in the current
// window resets the consecutive no-progress count regardless of queue age.
assert.equal(nextNoProgressWindows(null, false), 1)
assert.equal(nextNoProgressWindows(1, false), 2)
assert.equal(nextNoProgressWindows(7, true), 0)
assert.equal(maintenanceIsStalled(94, 3 * 60 * 60, 1), false)
assert.equal(maintenanceIsStalled(84, 3 * 60 * 60, 2), true)
assert.equal(maintenanceIsStalled(0, 3 * 60 * 60, 9), false)
assert.equal(maintenanceIsStalled(84, 20 * 60, 4), false)

// Offline durable-queue model: 94 sources, 13,204 rows, including a zero-row
// source, a very large source, and 249/250/251 boundaries. Every RPC is at
// most 250 rows, each cursor survives an interruption, and queued_at rotation
// gives small sources a turn while the large source remains resumable.
type QueueSource = { name: string; ids: string[]; cursor: number; queuedAt: number; completed: boolean }
const counts = Array.from({ length: 94 }, (_, index) => index === 0 ? 0 : index === 1 ? 12_365 : index === 2 ? 249 : index === 3 ? 250 : index === 4 ? 251 : 1)
assert.equal(counts.reduce((sum, value) => sum + value, 0), 13_204)
const queue: QueueSource[] = counts.map((count, index) => ({
  name: `source-${String(index).padStart(3, '0')}`,
  ids: Array.from({ length: count }, (_, row) => `id-${String(index).padStart(3, '0')}-${String(row).padStart(5, '0')}`),
  cursor: 0,
  queuedAt: 1,
  completed: false,
}))
const seen = new Set<string>()
let rpcCalls = 0
let completedSources = 0
function runPage(): void {
  queue.sort((a, b) => a.queuedAt - b.queuedAt || a.name.localeCompare(b.name))
  const source = queue.find(row => !row.completed)
  if (!source) return
  const page = source.ids.slice(source.cursor, source.cursor + 250)
  assert.ok(page.length <= 250)
  for (const id of page) {
    assert.ok(!seen.has(id), `duplicate processed id ${id}`)
    seen.add(id)
  }
  source.cursor += page.length
  rpcCalls += 1
  if (page.length < 250) {
    source.completed = true
    completedSources += 1
  } else {
    source.queuedAt = rpcCalls + 1
  }
}
for (let i = 0; i < 20; i++) runPage()
const checkpoint = queue.map(row => ({ ...row }))
// Crash/restart uses the persisted per-source cursor and queue order.
queue.splice(0, queue.length, ...checkpoint)
let watchdog = 0
while (queue.some(row => !row.completed)) {
  runPage()
  assert.ok(++watchdog < 300, 'bounded continuation eventually drains without starvation')
}
assert.equal(seen.size, 13_204)
assert.equal(completedSources, 94)
assert.ok(rpcCalls > 50)
const source = (name: string) => queue.find(row => row.name === name)!
assert.equal(source('source-000').cursor, 0, 'zero-row source completes without inventing rows')
assert.equal(source('source-002').cursor, 249)
assert.equal(source('source-003').cursor, 250, 'exact full page needs a final EOF call')
assert.equal(source('source-004').cursor, 251)
assert.equal(maintenanceCompletion(0).status, 'COMPLETE')

console.log('verify_universe_maintenance_progress: PASS exact-complete, 250-row RPC contract, two-window stall, age separated, progress resets streak')
