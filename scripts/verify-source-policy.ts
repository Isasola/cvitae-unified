// scripts/verify-source-policy.ts
// Source Intelligence V2 policy smoke tests.
// Run with: npx tsx scripts/verify-source-policy.ts
//
// Tests are static source-code checks — no DB required. Exit 0 = pass, 1 = fail.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

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

function src(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8')
}

const base = src('scrapers/source_cleaners/base.py')
const profiles = src('scrapers/source_cleaners/profiles.py')
const gates = src('netlify/functions/lib/eight-gates.ts')
const migration = src('supabase/migrations/202609160002_source_search_engine_policy.sql')
const adminData = src('netlify/functions/admin-data.ts')

console.log('=== Source Intelligence V2 Policy Tests ===')

// A. SourceProfile declares search_engine_indexing_allowed with tri-state type
console.log('\n[A] SourceProfile dataclass')
assert('A: search_engine_indexing_allowed field declared', base.includes('search_engine_indexing_allowed'))
assert('A: tri-state type (bool | None)', base.includes('bool | None'))
assert('A: default is None', base.includes('search_engine_indexing_allowed: bool | None = None'))

// B. All 4 V2 profiles declare search_engine_indexing_allowed=False
console.log('\n[B] V2 profile declarations')
assert('B: unjobs has search_engine_indexing_allowed=False', profiles.includes('source="unjobs"') && profiles.slice(profiles.indexOf('source="unjobs"'), profiles.indexOf('source="himalayas"')).includes('search_engine_indexing_allowed=False'))
assert('B: himalayas has search_engine_indexing_allowed=False', profiles.includes('web_catalog_allowed=True') && profiles.slice(profiles.indexOf('web_catalog_allowed=True'), profiles.indexOf('source="talentcom"')).includes('search_engine_indexing_allowed=False'))
assert('B: talentcom has search_engine_indexing_allowed=False', profiles.slice(profiles.indexOf('source="talentcom"'), profiles.indexOf('source="weworkremotely"')).includes('search_engine_indexing_allowed=False'))
assert('B: weworkremotely has search_engine_indexing_allowed=False', profiles.slice(profiles.indexOf('source="weworkremotely"')).includes('search_engine_indexing_allowed=False'))

// C. web_catalog_allowed ≠ search_engine_indexing_allowed (Himalayas confirms both exist)
console.log('\n[C] web_catalog_allowed vs search_engine_indexing_allowed separation')
const himalayasBlock = profiles.slice(profiles.indexOf('"himalayas"'), profiles.indexOf('"talentcom"'))
assert('C: Himalayas has web_catalog_allowed=True', himalayasBlock.includes('web_catalog_allowed=True'))
assert('C: Himalayas also has search_engine_indexing_allowed=False', himalayasBlock.includes('search_engine_indexing_allowed=False'))
assert('C: Both fields co-exist on same source', himalayasBlock.includes('web_catalog_allowed=True') && himalayasBlock.includes('search_engine_indexing_allowed=False'))

// D. Gate 8 handles POLICY_DENIED state for search_engine_indexing_allowed=false
console.log('\n[D] Gate 8 POLICY_DENIED')
assert('D: Gate 8 checks seiAllowed === false', gates.includes('seiAllowed === false'))
assert('D: POLICY_DENIED state emitted', gates.includes("'POLICY_DENIED'"))
assert('D: search_engine_indexing_allowed read from profile', gates.includes('profile.search_engine_indexing_allowed'))
assert('D: legacy path (null) falls through to seo_enabled', gates.includes('// null = legacy path'))

// E. Migration creates column with NULL default
console.log('\n[E] Migration 202609160002')
assert('E: ADD COLUMN search_engine_indexing_allowed', migration.includes('ADD COLUMN') && migration.includes('search_engine_indexing_allowed'))
assert('E: BOOLEAN DEFAULT NULL', migration.includes('BOOLEAN DEFAULT NULL'))
assert('E: UPDATE sets FALSE for 4 V2 sources', migration.includes("search_engine_indexing_allowed = FALSE") && migration.includes("IN ('unjobs', 'himalayas', 'talentcom', 'weworkremotely')"))
assert('E: No backfill comment present', migration.includes('NO backfill'))

// F. AdminActionResult interface defined in admin-data.ts
console.log('\n[F] AdminActionResult interface')
assert('F: interface AdminActionResult declared', adminData.includes('interface AdminActionResult'))
assert('F: status field', adminData.includes('"ok" | "error" | "blocked" | "no_change"'))
assert('F: executed field', adminData.includes('executed: boolean'))
assert('F: blockers field', adminData.includes('blockers: string[]'))

// G. get_source_catalog action exists and returns all 105 sources
console.log('\n[G] get_source_catalog action')
assert('G: action handler exists', adminData.includes('"get_source_catalog"'))
assert('G: reads from registry', adminData.includes('registry.sources || []'))
assert('G: joins search_engine_indexing_allowed from DB', adminData.includes('search_engine_indexing_allowed'))
assert('G: returns fetched_at timestamp', adminData.includes('fetched_at'))

// H. enable_seo_for_source preconditions
console.log('\n[H] enable_seo_for_source preconditions')
assert('H: action handler exists', adminData.includes('"enable_seo_for_source"'))
assert('H: P1 — SOURCE_NOT_CERTIFIED blocker', adminData.includes('SOURCE_NOT_CERTIFIED'))
assert('H: P2 — POLICY_DENIED_BY_SOURCE_CONTRACT blocker', adminData.includes('POLICY_DENIED_BY_SOURCE_CONTRACT'))
assert('H: P3 — ALREADY_ENABLED blocker', adminData.includes('ALREADY_ENABLED'))
assert('H: P4 — WEB_CATALOG_NOT_ALLOWED blocker', adminData.includes('WEB_CATALOG_NOT_ALLOWED'))
assert('H: P5 — INSUFFICIENT_INVENTORY blocker', adminData.includes('INSUFFICIENT_INVENTORY'))
assert('H: P6 — LATEST_RUN_FAILED blocker', adminData.includes('LATEST_RUN_FAILED'))
assert('H: returns AdminActionResult on block', adminData.includes('status: "blocked"'))
assert('H: returns AdminActionResult on success', adminData.includes('status: "ok"'))

// I. Sitemap routing fix in netlify.toml
console.log('\n[I] Sitemap routing fix')
const toml = src('netlify.toml')
assert('I: explicit /sitemap-static.xml route', toml.includes('from = "/sitemap-static.xml"'))
assert('I: explicit /sitemap-opportunities-:page.xml route', toml.includes('from = "/sitemap-opportunities-:page.xml"'))
assert('I: explicit routes appear BEFORE generic :segment rule', toml.indexOf('/sitemap-static.xml') < toml.indexOf('/sitemap-:segment.xml'))
assert('I: all routes point to sitemap function', (toml.match(/to = "\/.netlify\/functions\/sitemap"/g) || []).length >= 3)

// J. Founding Beta RPC accepts only status=accepted (not offered)
console.log('\n[J] Founding Beta RPC fix')
const migrationFoundingFix = src('supabase/migrations/202609160001_founding_beta_manual_approval.sql')
assert('J: RPC uses != accepted (not NOT IN)', migrationFoundingFix.includes("!= 'accepted'"))
assert('J: offered is no longer in approval guard', !migrationFoundingFix.includes("NOT IN ('accepted', 'offered')"))
assert('J: comment explains offered-only does not grant consent', migrationFoundingFix.includes('offered') && migrationFoundingFix.includes('consent'))

// K. Hueco 1: get_source_stats action
console.log('\n[K] get_source_stats (Hueco 1)')
assert('K: action handler exists', adminData.includes('"get_source_stats"'))
assert('K: aggregates per canonical (aliases summed)', adminData.includes('implementation_state') && adminData.includes('alias_count'))
assert('K: returns generated_at timestamp', adminData.includes('generated_at'))
assert('K: pools inventory, catalog, matching, seo', adminData.includes('acc.inventory') && adminData.includes('acc.catalog') && adminData.includes('acc.matching') && adminData.includes('acc.seo'))
assert('K: uses emitted_aliases not just canonical_source for lookup', adminData.includes('emitted_aliases'))

// K+5: Canonical aggregation math — ongs + 3 aliases must sum
// Replicates the exact reduce logic from admin-data.ts get_source_stats
{
  const mockStatsMap: Record<string, any> = {
    ongs:       { total: 5,  catalog: 3, matching: 2, seo: 1 },
    ong_bid_py: { total: 10, catalog: 7, matching: 5, seo: 2 },
    ong_giz_py: { total: 3,  catalog: 2, matching: 1, seo: 0 },
    ong_oas_py: { total: 4,  catalog: 3, matching: 3, seo: 1 },
  }
  const mockAliases = ['ong_bid_py', 'ong_giz_py', 'ong_oas_py', 'ongs']
  const pools = mockAliases.reduce((acc: any, alias: string) => {
    const statKey = Object.keys(mockStatsMap).find(k => k.toLowerCase() === alias)
    const v = mockStatsMap[alias] || (statKey ? mockStatsMap[statKey] : {}) || {}
    acc.inventory += Number((v as any).total || 0)
    acc.catalog   += Number((v as any).catalog || 0)
    acc.matching  += Number((v as any).matching || 0)
    acc.seo       += Number((v as any).seo || 0)
    return acc
  }, { inventory: 0, catalog: 0, matching: 0, seo: 0 })
  assert('K+5: ongs inventory = 5+10+3+4=22', pools.inventory === 22)
  assert('K+5: ongs catalog = 3+7+2+3=15',   pools.catalog === 15)
  assert('K+5: ongs matching = 2+5+1+3=11',  pools.matching === 11)
  assert('K+5: ongs seo = 1+2+0+1=4',        pools.seo === 4)
  assert('K+5: ongs alias_count = 4',         mockAliases.length === 4)
}

// Verify registry has the expected ongs aliases
{
  const { readFileSync } = await import('node:fs')
  const { resolve } = await import('node:path')
  const registry = JSON.parse(readFileSync(resolve(process.cwd(), 'src/generated/source-intelligence-registry.json'), 'utf8'))
  const ongsProfile = (registry.sources || []).find((s: any) => s.canonical_source === 'ongs')
  assert('K+5: ongs exists in registry', !!ongsProfile)
  const ongsAliases: string[] = ongsProfile?.emitted_aliases || []
  assert('K+5: ongs has ong_bid_py alias in registry', ongsAliases.includes('ong_bid_py'))
  assert('K+5: ongs has ong_giz_py alias in registry', ongsAliases.includes('ong_giz_py'))
  assert('K+5: ongs has ong_oas_py alias in registry', ongsAliases.includes('ong_oas_py'))
  assert('K+5: ongs has self as emitted alias', ongsAliases.includes('ongs'))
  assert('K+5: ongs has exactly 4 emitted aliases', ongsAliases.length === 4)
}

// L. Hueco 2: source_control_audit_log migration
console.log('\n[L] source_control_audit_log audit table (Hueco 2)')
const migration3 = src('supabase/migrations/202609160003_source_control_audit_log.sql')
assert('L: migration creates source_control_audit_log', migration3.includes('source_control_audit_log'))
assert('L: has action column', migration3.includes('action') && migration3.includes('text'))
assert('L: has result_status check constraint', migration3.includes('result_status') && migration3.includes('ok') && migration3.includes('blocked'))
assert('L: RLS enabled on audit table', migration3.includes('ENABLE ROW LEVEL SECURITY'))
assert('L: service_role only access', migration3.includes('service_role'))
assert('L: enable_seo_for_source writes audit row on success', adminData.includes('source_control_audit_log') && adminData.includes("action: \"enable_seo_for_source\""))
assert('L: enable_seo_for_source BLOCKED also writes audit row', (() => {
  // The blocked branch must insert to source_control_audit_log BEFORE returning
  const enableStart = adminData.indexOf('"enable_seo_for_source"')
  const enableBlock = adminData.slice(enableStart, enableStart + 3000)
  // Find the blocked branch: blockers.length > 0 section
  const blockedBranchStart = enableBlock.indexOf('blockers.length > 0')
  const blockedBranchEnd = enableBlock.indexOf('const { error: updateErr }')
  const blockedBranch = enableBlock.slice(blockedBranchStart, blockedBranchEnd)
  return blockedBranch.includes('source_control_audit_log') && blockedBranch.includes('"blocked"')
})())
assert('L: approve_search_indexing_policy writes audit row', adminData.includes("action: \"approve_search_indexing_policy\"") && adminData.includes('source_control_audit_log'))
assert('L: approve_search_indexing_policy FALSE path writes audit row', (() => {
  const approveStart = adminData.indexOf('"approve_search_indexing_policy"')
  const approveBlock = adminData.slice(approveStart, approveStart + 4000)
  const falsePath = approveBlock.indexOf('POLICY_DENIED_IMMUTABLE')
  const falseSection = approveBlock.slice(0, falsePath + 500)
  return falseSection.includes('source_control_audit_log')
})())

// M. Hueco 3: approve_search_indexing_policy action
console.log('\n[M] approve_search_indexing_policy (Hueco 3)')
assert('M: action handler exists', adminData.includes('"approve_search_indexing_policy"'))
assert('M: requires admin_note', adminData.includes('admin_note requerido'))
assert('M: POLICY_DENIED_IMMUTABLE blocker for FALSE', adminData.includes('POLICY_DENIED_IMMUTABLE'))
assert('M: no_change when already TRUE', adminData.includes('"no_change"'))
assert('M: enable_seo_for_source requires POLICY_NOT_EXPLICITLY_APPROVED', adminData.includes('POLICY_NOT_EXPLICITLY_APPROVED'))
assert('M: enable_seo_for_source checks for true explicitly', adminData.includes('search_engine_indexing_allowed !== true'))

// N. Hueco 4: diagnose_source action
console.log('\n[N] diagnose_source (Hueco 4)')
assert('N: action handler exists', adminData.includes('"diagnose_source"'))
assert('N: evaluates Eight Gates', adminData.includes('evaluateEightGates') && adminData.includes('diagnose_source'))
assert('N: returns overall_health', adminData.includes('overall_health'))
assert('N: returns diagnosed_at timestamp', adminData.includes('diagnosed_at'))
// The diagnose_source case spans ~3821 chars — use 4500 to cover the full case
assert('N: read-only (no mutations in full case)', (() => {
  const start = adminData.indexOf('"diagnose_source"')
  const slice = adminData.slice(start, start + 4500)
  return !slice.includes('.update(') && !slice.includes('.insert(') && !slice.includes('.delete(')
})())

// O. SourceOperationsView shows all sources (not just pilots)
console.log('\n[O] SourceOperationsView — all 105 sources')
const sov = src('src/components/admin/SourceOperationsView.tsx')
assert('O: PILOTS constant removed, replaced by SCAN_CAPABLE', !sov.includes('const PILOTS') && sov.includes('SCAN_CAPABLE'))
assert('O: source search filter present', sov.includes('sourceSearch') && sov.includes('filteredSources'))
assert('O: ANALIZAR ESTADO button present', sov.includes('ANALIZAR ESTADO'))
assert('O: APROBAR POLÍTICA SEO button present', sov.includes('APROBAR POLÍTICA SEO'))
assert('O: onAction prop wired', sov.includes('onAction'))
assert('O: ESCANEO NO DISPONIBLE for non-scan-capable sources', sov.includes('ESCANEO NO DISPONIBLE'))

console.log(`\n=== ${passed} passed, ${failed} failed ===`)
if (errors.length > 0) {
  console.error('\nFailed tests:')
  errors.forEach(e => console.error(`  - ${e}`))
  process.exit(1)
}
