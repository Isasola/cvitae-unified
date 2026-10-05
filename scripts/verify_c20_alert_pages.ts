/** Offline test of the production sender orchestration; no provider or database network. */
import assert from 'node:assert/strict'
import { createHighMatchAlertsHandler } from '../netlify/functions/send-high-match-alerts.ts'
import { matchingProfileSignature } from '../shared/matching-profile-signature.ts'
import { normalizeSourcePolicyRow, sourcePolicySignature } from '../shared/matching-retrieval.ts'

const at = '2026-10-05T10:00:00.000Z'
const policies = [{ source: 'himalayas', is_enabled: true, matching_enabled: true, alerts_enabled: true }]
const permissions = [{ canonical_source: 'himalayas', consumer: 'matching', permission_state: 'ALLOWED' }]
const sourceSignature = await sourcePolicySignature(policies.map(normalizeSourcePolicyRow), x => String(x), permissions)
class Fixture {
  profiles = [{ id: 'profile-1', user_id: 'user-1', email: 'fixture@example.test', match_alerts_enabled: true, match_alert_threshold: 85, profile_data: {} }]
  selector = -1
  progress = new Map<string, any>()
  deliveries: any[] = []
  opportunities = Array.from({ length: 7 }, (_, i) => ({ id: `opp-${i}`, title: `Role ${i}`, source: 'himalayas', updated_at: at, created_at: at, content_fingerprint: 'v1' }))
  candidates: any[] = []
  states: any[] = []
  queries: any[] = []
  reads: number[] = []
  sends: string[] = []
  failReadOnce = false
  failProvider = false
  failSaveAfterSend = false
  forbidden = new Set<string>()
  rpc(name: string, args: any = {}) {
    if (name === 'get_source_distribution_policy') return Promise.resolve({ data: policies })
    if (name === 'claim_match_alert_scan') {
      this.selector = (this.selector + 1) % this.profiles.length
      const profile = this.profiles[this.selector]
      return Promise.resolve({ data: { profile, lease_token: 'fixture-lease', checkpoint: structuredClone(this.progress.get(profile.id) || {}) } })
    }
    if (name === 'save_match_alert_scan') {
      if (this.failSaveAfterSend && this.sends.length) return Promise.resolve({ error: { message: 'checkpoint temporarily unavailable' } })
      this.progress.set(args.p_profile_id, structuredClone(args.p_checkpoint))
      assert.ok(args.p_checkpoint.pending.length <= 2, 'durable pending descriptors bounded before effects')
      return Promise.resolve({ data: true })
    }
    if (name === 'claim_match_alert_delivery') {
      let row = this.deliveries.find(d => d.user_id === args.p_user_id && d.opportunity_id === args.p_opportunity_id)
      if (!row) { row = { id: `delivery-${this.deliveries.length}`, user_id: args.p_user_id, opportunity_id: args.p_opportunity_id, status: 'pending', attempts: 0 }; this.deliveries.push(row) }
      if (row.status === 'sent' || row.status === 'processing' || row.attempts >= 3) return Promise.resolve({ data: [] })
      row.status = 'processing'; row.attempts++
      return Promise.resolve({ data: [row] })
    }
    throw new Error(`unexpected RPC ${name}`)
  }
  from(table: string) {
    const trace: any = { table, filters: [], order: [], limit: null }
    this.queries.push(trace)
    let patch: any
    const builder: any = {
      select: () => builder, update: (data: any) => { patch = data; return builder },
      eq: (key: string, value: any) => { trace.filters.push((r: any) => r[key] === value); return builder },
      in: (key: string, ids: any[]) => { assert.ok(ids.length <= 2); trace.filters.push((r: any) => ids.includes(r[key])); return builder },
      gt: (key: string, value: any) => { trace.filters.push((r: any) => r[key] > value); return builder },
      gte: (key: string, value: any) => { trace.filters.push((r: any) => r[key] >= value); return builder },
      lte: (key: string, value: any) => { trace.filters.push((r: any) => r[key] <= value); return builder },
      limit: (limit: number) => { trace.limit = limit; return builder },
      order: (key: string) => { trace.order.push(key); return builder },
      or: (expr: string) => {
        const [, key, cutoff] = expr.match(/^(\w+)\.gt\.([^,]+),/) || []
        const idKey = key === 'updated_at' ? 'id' : 'opportunity_id'
        const id = expr.match(new RegExp(`${idKey}\\.gt\\.([^,)]+)`))?.[1]
        assert.ok(key && cutoff && id, `valid keyset predicate ${expr}`)
        trace.filters.push((r: any) => r[key] > cutoff || (r[key] === cutoff && r[idKey] > id!))
        return builder
      },
      then: (resolve: any, reject: any) => Promise.resolve().then(() => {
        if (this.failReadOnce && table === 'matching_retrieval_candidates') {
          this.failReadOnce = false; return { error: { message: 'fixture candidate page unavailable' } }
        }
        const tables: any = { opportunity_alert_universe: this.opportunities.filter(o => !this.forbidden.has(o.id)), user_master_profiles: this.profiles,
          opportunity_source_consumer_permissions: permissions, skill_dictionary: [], matching_retrieval_states: this.states,
          matching_retrieval_candidates: this.candidates, match_alert_deliveries: this.deliveries }
        let rows = tables[table].filter((r: any) => trace.filters.every((filter: any) => filter(r)))
        if (patch) { rows.forEach((r: any) => Object.assign(r, patch)); return { data: null } }
        rows.sort((a: any, b: any) => { for (const key of trace.order) { if (a[key] !== b[key]) return a[key] < b[key] ? -1 : 1 } return 0 })
        if (!['skill_dictionary', 'opportunity_source_consumer_permissions'].includes(table)) assert.ok(trace.limit != null && trace.limit <= 2, 'limit in query BEFORE collection')
        rows = rows.slice(0, trace.limit ?? rows.length)
        this.reads.push(rows.length)
        return { data: structuredClone(rows) }
      }).then(resolve, reject),
    }
    return builder
  }
  rank = (_profile: any, rows: any[], _dict: any, _preset: any, similarities: any) => {
    assert.ok(rows.length <= 2, 'rank retains only the current page')
    return { rankedV2: rows.map(opp => ({ opp, decision: { outcome: 'MATCH', confidence: 'HIGH', eligibility: 'ELIGIBLE', score: similarities.get(opp.id) === 0.1 ? 70 : 95, matched_skills: [] } })) }
  }
  send = async (_url: any, options: any) => {
    if (this.failProvider) { this.failProvider = false; return new Response('provider failure', { status: 503 }) }
    const key = options.headers['Idempotency-Key']
    assert.ok(!this.sends.includes(key), 'no duplicate provider effects')
    this.sends.push(key)
    return new Response('{"id":"fixture-message"}')
  }
  handler(now = Date.parse('2026-10-05T12:00:00Z')) {
    return createHighMatchAlertsHandler({ database: () => this, resendKey: 'offline', rank: this.rank as any, send: this.send as any, now: () => now, pageSize: 2, maxPages: 1, maxEmails: 1 })
  }
  async run(now?: number) { const r: any = await this.handler(now)({} as any, {} as any, () => {}); return { ...JSON.parse(r.body), status: r.statusCode } }
}

const f = new Fixture()
const first = await f.run()
assert.equal(first.sent, 1); assert.equal(first.pages, 1); assert.equal(first.continuation.pending, 1)
const saved = structuredClone(f.progress.get('profile-1'))
const second = await f.run()
assert.equal(second.pages, 0, 'resume pending effects before querying another page')
assert.deepEqual(f.progress.get('profile-1').recentCursor, saved.recentCursor)
for (let n = 0; n < 20 && !f.progress.get('profile-1').complete; n++) assert.equal((await f.run()).status, 200)
assert.equal(f.sends.length, 7); assert.ok(f.progress.get('profile-1').complete)
assert.ok(Math.max(...f.reads) <= 2, 'memory/read size depends on batch, not total inventory')
const delta = await f.run(Date.parse('2026-10-05T14:00:00Z'))
assert.equal(delta.opportunities, 0, 'completed watermark skips unchanged historical rows')
f.opportunities.push({ ...f.opportunities[0], id: 'future', updated_at: '2026-10-05T15:00:00.000Z' })
for (let n = 0; n < 8; n++) await f.run(Date.parse('2026-10-05T16:00:00Z'))
assert.ok(f.sends.some(key => key.endsWith('/future')))

// A stalled unfinished snapshot keeps its original window, even after 36 hours.
const lag = new Fixture(); await lag.run()
for (let n = 0; n < 20 && !lag.progress.get('profile-1').complete; n++) await lag.run(Date.parse('2026-10-09T12:00:00Z'))
assert.equal(lag.sends.length, 7, 'budget delays never silently age out unvisited rows')
// Strict DELTA lower bound avoids repeated reads of an unchanged cutoff boundary.
const boundary = new Fixture(); boundary.opportunities.forEach(o => o.updated_at = '2026-10-05T12:00:00.000Z')
for (let n = 0; n < 20 && !boundary.progress.get('profile-1')?.complete; n++) await boundary.run()
assert.equal((await boundary.run(Date.parse('2026-10-05T14:00:00Z'))).opportunities, 0)

const readFailure = new Fixture(); readFailure.failReadOnce = true
assert.equal((await readFailure.run()).status, 500)
assert.equal(readFailure.progress.get('profile-1').recentCursor, null, 'failed companion read cannot persist an unprocessed page cursor')
for (let n = 0; n < 20 && !readFailure.progress.get('profile-1').complete; n++) await readFailure.run()
assert.equal(readFailure.sends.length, 7, 'retry failed page retains all rows')

const retry = new Fixture(); retry.failProvider = true
assert.equal((await retry.run()).failed, 1)
assert.equal(retry.progress.get('profile-1').pending.length, 2)
for (let n = 0; n < 20 && !retry.progress.get('profile-1').complete; n++) await retry.run()
assert.equal(retry.sends.length, 7, 'retry preserves full coverage without duplicate effects')
const crash = new Fixture(); crash.failSaveAfterSend = true
assert.equal((await crash.run()).status, 500)
crash.failSaveAfterSend = false
for (let n = 0; n < 20 && !crash.progress.get('profile-1').complete; n++) await crash.run()
assert.equal(crash.sends.length, 7, 'durable delivery ledger handles checkpoint failure after sending')
const consent = new Fixture(); await consent.run(); consent.profiles[0].match_alerts_enabled = false
await consent.run(); assert.equal(consent.sends.length, 1, 'consent still gates pending effects')
const exclusion = new Fixture(); await exclusion.run(); exclusion.forbidden.add('opp-1')
await exclusion.run(); assert.ok(!exclusion.sends.some(key => key.endsWith('/opp-1')), 'pending hydration respects current canonical exclusion')

const cache = new Fixture(); cache.opportunities.forEach(o => { o.updated_at = o.created_at = '2026-09-01T00:00:00.000Z' })
cache.states = [{ user_id: 'user-1', profile_signature: matchingProfileSignature(cache.profiles[0]), source_policy_signature: sourceSignature }]
cache.candidates = cache.opportunities.map(o => ({ user_id: 'user-1', opportunity_id: o.id, evaluated_at: at, candidate_class: 'MATCH', evaluation_lane: 'INCREMENTAL', profile_signature: matchingProfileSignature(cache.profiles[0]), opportunity_content_fingerprint: 'v1', semantic_similarity: 0.9 }))
for (let n = 0; n < 20 && !cache.progress.get('profile-1')?.complete; n++) await cache.run()
assert.equal(cache.sends.length, 7, 'old rows with fresh incremental candidates traverse every cache page')
const scores = new Fixture(); scores.states = cache.states; scores.candidates = cache.candidates.map(c => ({ ...c, semantic_similarity: 0.1 }))
for (let n = 0; n < 20 && !scores.progress.get('profile-1')?.complete; n++) await scores.run()
assert.equal(scores.sends.length, 0, 'recent lane retains current cache semantic score and unchanged threshold')
const fair = new Fixture(); fair.profiles.push({ ...fair.profiles[0], id: 'profile-2', user_id: 'user-2' })
for (let n = 0; n < 40 && fair.sends.length < 14; n++) await fair.run()
assert.equal(fair.sends.length, 14, 'no profile monopolizes the bounded sender')
console.log('PASS C20 alert handler: 4+ pages; pending resume; delta; candidate lane; retries; dedup; consent; canonical exclusions; fair profiles; batch memory')
