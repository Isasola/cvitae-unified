/** Local-only, no network / no DB writes / no Playwright / no AI. */
import assert from 'node:assert/strict'
import { readProductMetrics } from '../netlify/functions/lib/product-metrics.ts'

const iso = (daysAgo = 1) => new Date(Date.now() - daysAgo * 86400_000).toISOString()
const profiles = [
  ...Array.from({ length: 8 }, (_, i) => ({
    user_id: `real-${i}`, is_test: false, created_at: iso(),
    profile_data: i < 5 ? { onboarding_status: 'completed', onboarding_completed_at: iso() } : {},
    cv_storage_path: i < 4 ? `profiles/real-${i}.pdf` : null,
  })),
  ...Array.from({ length: 3 }, (_, i) => ({ user_id: `test-${i}`, is_test: true, created_at: iso(), profile_data: {}, cv_storage_path: null })),
  ...Array.from({ length: 3 }, () => ({ user_id: null, is_test: true, created_at: iso(), profile_data: {}, cv_storage_path: null })),
]
const tables: Record<string, any[]> = {
  user_master_profiles: profiles,
  cv_ats_assessments: [
    { user_id: 'real-1', created_at: iso() },
    { user_id: 'real-1', created_at: iso() },
    { user_id: 'real-2', created_at: iso() },
  ],
  b2c_acquisition: [{ user_id: 'real-1', source: 'google', medium: 'organic' }],
  user_events: [],
}
function dbWithTables(dataset: Record<string, any[]>) {
  return {
    from(name: string) {
      const filters: Array<(row: any) => boolean> = []
      return {
        select(_fields: string) { return this },
        gte(key: string, cutoff: string) { filters.push(row => row[key] >= cutoff); return this },
        in(key: string, ids: string[]) { filters.push(row => ids.includes(row[key])); return this },
        order(_key: string, _options?: any) { return this },
        async range(start: number, end: number) {
          return { data: dataset[name].filter(row => filters.every(fn => fn(row))).slice(start, end + 1), error: null }
        },
      }
    },
  }
}

async function run() {
  const real = await readProductMetrics(dbWithTables(tables), 30, false)
  assert.deepEqual(real.classification, { REAL: 8, TEST: 6, UNKNOWN: 0 })
  assert.equal(real.lifetime.selected_linked_user_ids, 8)
  assert.equal(real.registration.cohort_unique_ids, 8)
  assert.equal(real.lifetime.selected_profile_rows, 8)
  assert.equal(real.activation.profile_completed_in_cohort_current, 5)
  assert.equal(real.activation.profile_current_completion_rate_pct, 62.5)
  assert.equal(real.activation.cv_currently_stored_in_cohort, 4)
  assert.equal(real.activation.ats_diagnostics_saved_in_period, 3)
  assert.equal(real.activation.ats_diagnostic_users_in_period, 2)
  assert.equal(real.activation.cv_analysis_completed_users, null)
  assert.equal(real.observed_events.coverage, 'NO_EVENTS')
  assert.equal(real.retention.d7, null)
  assert.equal(real.funnel.first_successful_cv_analysis, null)
  assert.equal(real.attribution.attributed_unique_users, 1)

  const all = await readProductMetrics(dbWithTables(tables), 30, true)
  assert.equal(all.lifetime.selected_profile_rows, 14)
  assert.equal(all.lifetime.selected_linked_user_ids, 11)
  assert.equal(all.lifetime.selected_unlinked_profile_rows, 3)

  // An old profile stays in lifetime population, but never becomes a new registration.
  const historical = { ...tables, user_master_profiles: [...profiles, {
    user_id: 'old-real', is_test: false, created_at: iso(100), profile_data: {}, cv_storage_path: null,
  }], cv_ats_assessments: [...tables.cv_ats_assessments, { user_id: 'old-real', created_at: iso(2) }] }
  const old = await readProductMetrics(dbWithTables(historical), 30, false)
  assert.equal(old.lifetime.selected_linked_user_ids, 9)
  assert.equal(old.registration.cohort_unique_ids, 8)
  assert.equal(old.activation.ats_diagnostic_users_in_period, 3)

  // The same user marked REAL and TEST must NOT contaminate the REAL metrics.
  const mixed = { ...tables, user_master_profiles: [...profiles, {
    user_id: 'real-0', is_test: true, created_at: iso(2), profile_data: {}, cv_storage_path: null,
  }] }
  const clean = await readProductMetrics(dbWithTables(mixed), 30, false)
  assert.equal(clean.lifetime.mixed_classification_user_ids, 1)
  assert.equal(clean.lifetime.selected_linked_user_ids, 7)
  assert.equal(clean.registration.cohort_unique_ids, 7)

  // Strict coverage: an error must NOT be rewritten as a zero count.
  const badDb = { from() { return { select() { return this }, gte() { return this }, order() { return this }, async range() { return { error: { code: 'TEST_ERROR' }, data: null } } } } }
  await assert.rejects(() => readProductMetrics(badDb, 7, false), /TEST_ERROR/)
  console.log('verify_product_metrics_v1: PASS (lifetime vs cohort, TEST/UNKNOWN, mixed identities, observed ATS, no invented retention, query failure)')
}
run().catch(err => { console.error(err); process.exitCode = 1 })
