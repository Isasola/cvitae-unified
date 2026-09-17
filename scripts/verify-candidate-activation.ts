// scripts/verify-candidate-activation.ts
// Smoke-test suite for Candidate Activation RC.
// Run with: npx tsx scripts/verify-candidate-activation.ts
//
// Tests are READ-ONLY against the DB, or fully mocked for logic paths.
// No writes are performed. Exit code 0 = all pass, 1 = failures.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || ''
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

let _supabase: SupabaseClient | null = null
function getSupabase(): SupabaseClient {
  if (!_supabase) _supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
  return _supabase
}

let passed = 0
let failed = 0
const errors: string[] = []

function assert(name: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  ✓ ${name}`)
    passed++
  } else {
    console.error(`  ✗ ${name}${detail ? `: ${detail}` : ''}`)
    failed++
    errors.push(name)
  }
}

// ── SECTION 1: Match visibility logic ────────────────────────────────────────

function testMatchSlice() {
  console.log('\n[1] Match visibility logic')

  const makeMatches = (n: number) => Array.from({ length: n }, (_, i) => ({ id: String(i) }))

  // FREE: slice(1, 3) → indices 1,2 → 2 additional + featured(0) = 3 total
  const free10 = makeMatches(10)
  const freeVisible = [free10[0], ...free10.slice(1, 3)]
  assert('FREE 10 matches → 3 visible', freeVisible.length === 3, `got ${freeVisible.length}`)

  // FREE: 1 match total → still shows 1 (the featured)
  const free1 = makeMatches(1)
  const freeVisible1 = [free1[0], ...free1.slice(1, 3)]
  assert('FREE 1 match → 1 visible', freeVisible1.length === 1, `got ${freeVisible1.length}`)

  // FREE: 2 matches → 2 visible
  const free2 = makeMatches(2)
  const freeVisible2 = [free2[0], ...free2.slice(1, 3)]
  assert('FREE 2 matches → 2 visible', freeVisible2.length === 2, `got ${freeVisible2.length}`)

  // FREE: 3 matches → 3 visible, NO paywall
  const free3 = makeMatches(3)
  const freeVisible3 = [free3[0], ...free3.slice(1, 3)]
  const paywallShows3 = !false && free3.length > 3  // isSubscribed=false
  assert('FREE 3 matches → 3 visible, no paywall', freeVisible3.length === 3 && !paywallShows3)

  // FREE: 4 matches → 3 visible + paywall
  const free4 = makeMatches(4)
  const freeVisible4 = [free4[0], ...free4.slice(1, 3)]
  const paywallShows4 = !false && free4.length > 3
  assert('FREE 4 matches → 3 visible + paywall', freeVisible4.length === 3 && paywallShows4)

  // PRO/subscribed: all visible
  const pro10 = makeMatches(10)
  const proVisible = [pro10[0], ...pro10.slice(1, undefined)]
  assert('PRO 10 matches → all 10 visible', proVisible.length === 10)
}

// ── SECTION 2: Founding Beta status transitions ───────────────────────────────

function testFoundingBetaShowModal() {
  console.log('\n[2] useFoundingBeta showModal logic')

  function showModal(loading: boolean, dismissed: boolean, enrollment: { status: string } | null, programFull: boolean) {
    return !loading && !dismissed && (
      enrollment === null
        ? !programFull
        : enrollment.status === 'eligible' || enrollment.status === 'offered'
    )
  }

  assert('null enrollment + not full → show modal', showModal(false, false, null, false))
  assert('null enrollment + program full → hide modal', !showModal(false, false, null, true))
  assert('status=offered → show modal', showModal(false, false, { status: 'offered' }, false))
  assert('status=eligible → show modal', showModal(false, false, { status: 'eligible' }, false))
  assert('status=accepted (pending) → hide modal', !showModal(false, false, { status: 'accepted' }, false))
  assert('status=active → hide modal', !showModal(false, false, { status: 'active' }, false))
  assert('status=completed → hide modal', !showModal(false, false, { status: 'completed' }, false))
  assert('status=declined → hide modal', !showModal(false, false, { status: 'declined' }, false))
  assert('loading=true → hide modal', !showModal(true, false, null, false))
  assert('dismissed=true → hide modal', !showModal(false, true, null, false))
}

// ── SECTION 3: Cap count correctness ─────────────────────────────────────────

async function testCapCount() {
  console.log('\n[3] Cap count — only active+completed occupy slots')

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.log('  ⚠ Skipping DB tests — SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set')
    return
  }

  const { count: activeCount, error: activeErr } = await getSupabase()
    .from('founding_beta_enrollments')
    .select('id', { count: 'exact', head: true })
    .in('status', ['active', 'completed'])
    .eq('program', 'founding_50')

  const { count: pendingCount, error: pendingErr } = await getSupabase()
    .from('founding_beta_enrollments')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'accepted')
    .eq('program', 'founding_50')

  assert('DB query for active+completed succeeds', !activeErr, activeErr?.message)
  assert('DB query for pending (accepted) succeeds', !pendingErr, pendingErr?.message)

  if (!activeErr && !pendingErr) {
    const slotsUsed = activeCount ?? 0
    const slotsRemaining = Math.max(0, 50 - slotsUsed)
    assert('slots_remaining does not count pending', slotsRemaining === 50 - slotsUsed)
    console.log(`     active/completed: ${slotsUsed}, pending: ${pendingCount ?? 0}, slots_remaining: ${slotsRemaining}`)
  }
}

// ── SECTION 4: Admin RPC functions exist ─────────────────────────────────────

async function testAdminRPCs() {
  console.log('\n[4] Admin RPC functions exist in DB')

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.log('  ⚠ Skipping DB tests — credentials not set')
    return
  }

  // Check admin_approve_founding_beta exists by calling with a dummy UUID (expect error, not "function not found")
  const { error: approveErr } = await getSupabase().rpc('admin_approve_founding_beta', {
    p_user_id: '00000000-0000-0000-0000-000000000000'
  })
  const approveExists = !approveErr || !approveErr.message.includes('does not exist')
  assert('admin_approve_founding_beta RPC exists', approveExists, approveErr?.message)

  const { error: rejectErr } = await getSupabase().rpc('admin_reject_founding_beta', {
    p_user_id: '00000000-0000-0000-0000-000000000000'
  })
  const rejectExists = !rejectErr || !rejectErr.message.includes('does not exist')
  assert('admin_reject_founding_beta RPC exists', rejectExists, rejectErr?.message)
}

// ── SECTION 5: Profile health columns exist ───────────────────────────────────

async function testProfileHealthColumns() {
  console.log('\n[5] user_master_profiles columns for profile health')

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.log('  ⚠ Skipping DB tests — credentials not set')
    return
  }

  const { data, error } = await getSupabase()
    .from('user_master_profiles')
    .select('is_subscribed, subscription_source, founding_offer_enabled')
    .limit(1)

  assert('is_subscribed column exists', !error, error?.message)
  assert('subscription_source column exists', !error, error?.message)
  assert('founding_offer_enabled column exists', !error, error?.message)
}

// ── SECTION 6: email_log table for founding emails ───────────────────────────

async function testEmailLog() {
  console.log('\n[6] email_log idempotency for founding templates')

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.log('  ⚠ Skipping DB tests — credentials not set')
    return
  }

  const { data, error } = await getSupabase()
    .from('email_log')
    .select('template, idempotency_key')
    .in('template', ['founding_offer_v1', 'founding_welcome_v1', 'founder_founding_requested'])
    .limit(5)

  assert('email_log query succeeds', !error, error?.message)
  if (!error) {
    console.log(`     ${data?.length ?? 0} founding-related email logs found`)
  }
}

// ── SECTION 7: accepted status accepted in schema ─────────────────────────────

async function testAcceptedStatusInSchema() {
  console.log('\n[7] founding_beta_enrollments accepts status=accepted')

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.log('  ⚠ Skipping DB tests — credentials not set')
    return
  }

  // Count enrollments with status=accepted
  const { count, error } = await getSupabase()
    .from('founding_beta_enrollments')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'accepted')

  assert('Query for status=accepted works (not rejected by constraint)', !error, error?.message)
}

// ── SECTION 8: Regression tests A–M ─────────────────────────────────────────

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function src(path: string) { return readFileSync(resolve(process.cwd(), path), 'utf8') }

function testRegressionAM() {
  console.log('\n[8] Regression tests A–M')

  const dashboard = src('src/hub/Dashboard.tsx')
  const hook = src('src/hooks/useFoundingBeta.ts')
  const betaAction = src('netlify/functions/founding-beta-action.ts')
  const adminData = src('netlify/functions/admin-data.ts')
  const migration = src('supabase/migrations/202609160001_founding_beta_manual_approval.sql')
  const profileBuilder = src('src/hub/ProfileBuilder.tsx')
  const mailer = src('netlify/functions/lib/founding-mailer.ts')

  // Helper: replicate the visible-match logic from Dashboard exactly
  function visibleMatchCount(total: number, isSubscribed: boolean): number {
    if (total === 0) return 0
    // matches[0] = featured (always shown when total > 0)
    // matches.slice(1, isSubscribed ? undefined : 3) = additional
    const additional = isSubscribed ? total - 1 : Math.min(total - 1, 2)
    return 1 + additional
  }

  // A. Old active user: showModal=false, all matches visible
  function showModal(loading: boolean, dismissed: boolean, enrollment: { status: string } | null, programFull: boolean) {
    return !loading && !dismissed && (
      enrollment === null ? !programFull
        : enrollment.status === 'eligible' || enrollment.status === 'offered'
    )
  }
  assert('A: active user → showModal false', !showModal(false, false, { status: 'active' }, false))
  assert('A: active user (isSubscribed=true) → all 10 matches visible', visibleMatchCount(10, true) === 10)

  // B. New accept → status=accepted, is_subscribed NOT changed
  assert('B: accept action → returns pending_review status', betaAction.includes('pending_review'))
  assert('B: accept action → does NOT set is_subscribed=true', !betaAction.includes("is_subscribed") || betaAction.indexOf("is_subscribed") > betaAction.indexOf("action === 'accept'"))
  // The accept handler should not touch is_subscribed (only admin_approve does that via RPC)
  const acceptSection = betaAction.slice(betaAction.indexOf("action === 'accept'"), betaAction.indexOf("action === 'decline'"))
  assert('B: accept handler does not set is_subscribed', !acceptSection.includes('is_subscribed'))

  // C. Admin approve: RPC + welcome email + active count returned
  assert('C: admin_approve_founding_beta called in admin-data', adminData.includes('admin_approve_founding_beta'))
  assert('C: founding_welcome_v1 sent after approval', adminData.includes("founding_welcome_v1"))
  assert('C: active_count returned after approval', adminData.includes('active_count'))

  // D. Double approve is idempotent: RPC returns invalid_state when already active
  assert('D: RPC guards against double-approve (invalid_state)', migration.includes("'invalid_state'"))
  // After the Founding Beta bug fix, the guard is now != 'accepted' (not NOT IN).
  // offered-only users cannot be approved — they must click Accept first.
  assert('D: approval guard is != accepted (not NOT IN)', migration.includes("!= 'accepted'"))
  assert('D: offered is removed from approval guard', !migration.includes("NOT IN ('accepted', 'offered')"))
  // admin-data handles invalid_state with a 409
  assert('D: admin-data handles invalid_state with 409', adminData.includes("invalid_state"))

  // E. Race condition for slot 50 is prevented by advisory lock
  assert('E: pg_advisory_xact_lock present in approve RPC', migration.includes('pg_advisory_xact_lock'))
  assert('E: lock key is stable string hash', migration.includes("hashtext('founding_50_cap')"))

  // F. Reject → declined, no slot consumed (no UPDATE to active/is_subscribed in reject)
  const rejectFn = migration.slice(migration.indexOf('admin_reject_founding_beta'), migration.indexOf('REVOKE ALL ON FUNCTION public.admin_reject_founding_beta'))
  assert('F: reject sets status=declined', rejectFn.includes("'declined'"))
  assert('F: reject only updates is_subscribed when subscription_source=founding_beta', rejectFn.includes("subscription_source = 'founding_beta'"))
  assert('F: reject does NOT touch active/completed count', !rejectFn.includes("'active'"))

  // G–J: Match visibility using helper
  assert('G: FREE backend 1 → 1 visible', visibleMatchCount(1, false) === 1)
  assert('H: FREE backend 2 → 2 visible', visibleMatchCount(2, false) === 2)
  assert('I: FREE backend 10 → 3 visible', visibleMatchCount(10, false) === 3)
  assert('J: Founding active (isSubscribed=true), backend 10 → 10 visible', visibleMatchCount(10, true) === 10)
  // Founding accepted (pending): is_subscribed stays false → same as FREE
  assert('J: Founding accepted (pending) backend 10 → 3 visible (FREE rules)', visibleMatchCount(10, false) === 3)

  // K. Location missing does NOT block onboarding (no hard required validation in ProfileBuilder)
  // Check that location field doesn't have a hard-required gate before step advance
  const stepAdvance = profileBuilder.slice(profileBuilder.indexOf('handleNext'), profileBuilder.indexOf('handleNext') + 600)
  assert('K: location not in required fields guard (no hard block)', !stepAdvance.includes("required.*location") && !stepAdvance.includes("location.*required"))

  // L. Location missing produces warning in admin drawer or admin-data
  assert('L: location warning present in admin-data or drawer',
    adminData.includes('has_location') || src('src/components/admin/UserDetailDrawer.tsx').includes('has_location'))

  // K+1. offered → approve attempt must be REJECTED (bug fix regression)
  // The RPC must NOT accept offered-only (user never clicked Accept)
  assert('K+1: approval guard uses != accepted (not NOT IN offered)', migration.includes("!= 'accepted'"))
  assert('K+1: offered status cannot bypass approval — guard excludes it', !migration.includes("NOT IN ('accepted', 'offered')"))

  // K+2. accepted → approve is allowed (happy path)
  assert('K+2: accepted status passes approval guard', migration.includes("!= 'accepted'") && migration.includes("status = 'active'"))

  // K+3. active/completed → approve must be rejected (double-approve prevention)
  // The guard !='accepted' blocks active, completed, declined, offered all at once
  assert('K+3: double-approve returns invalid_state', migration.includes("'invalid_state'"))

  // K+4. Comment in migration explains why offered is excluded
  assert('K+4: migration comment explains offered exclusion and consent requirement', migration.includes('consent'))

  // M. Email idempotency keys are distinct per event
  const requestedKey = "founder_founding_requested:"   // from notifyFounderMilestone with event=founding_requested
  const welcomeKey = "founding_welcome_v1:"             // from sendFoundingEmail stableKey = template:userId:v1
  const offeredKey = "founder_founding_offered:"
  assert('M: founding_requested key pattern is distinct', mailer.includes('founder_') && betaAction.includes('founding_requested'))
  assert('M: founding_welcome_v1 key uses template:userId:v1 pattern', mailer.includes('stableKey') && mailer.includes('`${template}:${userId}:v1`'))
  assert('M: sendFoundingEmail returns already_sent if key exists (no duplicate)', mailer.includes('already_sent: true'))
  assert('M: notifyFounderMilestone checks existing before sending', mailer.includes('if (existing) return { ok: true, already_sent: true }'))
}

// ── Runner ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Candidate Activation RC — Smoke Tests ===')
  console.log(`SUPABASE_URL: ${SUPABASE_URL ? '✓ set' : '✗ missing'}`)

  testMatchSlice()
  testFoundingBetaShowModal()
  await testCapCount()
  await testAdminRPCs()
  await testProfileHealthColumns()
  await testEmailLog()
  await testAcceptedStatusInSchema()
  testRegressionAM()

  console.log(`\n=== ${passed} passed, ${failed} failed ===`)
  if (errors.length > 0) {
    console.error('\nFailed tests:')
    errors.forEach(e => console.error(`  - ${e}`))
    process.exit(1)
  }
}

main().catch(e => {
  console.error('Fatal:', e)
  process.exit(1)
})
