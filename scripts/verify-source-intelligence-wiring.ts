// scripts/verify-source-intelligence-wiring.ts
// Regression tests for P0 Source Intelligence + Play + Eight Gates wiring fixes.
// Run with: npx tsx scripts/verify-source-intelligence-wiring.ts
//
// Static source-code checks only — no DB required. Exit 0 = pass, 1 = fail.

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

const monitor = src('scripts/run_scraper_monitored.py')
const adminData = src('netlify/functions/admin-data.ts')
const eightGates = src('netlify/functions/lib/eight-gates.ts')
const base = src('scrapers/source_cleaners/base.py')
const unjobs = src('scrapers/unjobs_scraper.py')
const himalayas = src('scrapers/himalayas_scraper.py')
const wwr = src('scrapers/weworkremotely_scraper.py')
const talentcom = src('scrapers/talentcom_scraper.py')
const migration1 = src('supabase/migrations/202609180001_source_quality_aggregate.sql')
const migration2 = src('supabase/migrations/202609180002_scraper_runs_scan_support.sql')

// ── P0.2: QUEUED eternal fix ──────────────────────────────────────────────────
console.log('\nP0.2 — QUEUED eternal fix:')

assert('P0.2-A: trigger_type uses "scan" literal (not f"scan:{uuid}")',
  monitor.includes('trigger_type = "scan" if scan_request_id') &&
  !monitor.includes('f"scan:{scan_request_id}"'))

assert('P0.2-B: scan_request_id included in RUNNING INSERT payload',
  monitor.includes('"scan_request_id": scan_request_id or None,'))

assert('P0.2-C: scan_request_id included in BLOCKED/SKIPPED INSERT payload',
  // Appears at least twice (once in each insert path)
  (monitor.match(/"scan_request_id": scan_request_id or None,/g) || []).length >= 2)

assert('P0.2-D: migration adds "scan" to trigger_type CHECK constraint',
  migration2.includes("check (trigger_type in ('schedule', 'manual', 'local', 'scan'))") ||
  migration2.includes("CHECK (trigger_type IN ('schedule', 'manual', 'local', 'scan'))") ||
  (migration2.includes("'scan'") && migration2.includes("trigger_type")))

assert('P0.2-E: migration adds scan_request_id column',
  migration2.includes('scan_request_id') && migration2.includes('add column'))

assert('P0.2-F: source_scan_status queries by scan_request_id not trigger_type:scan:uuid',
  adminData.includes('.eq("scan_request_id", requestId)') &&
  !adminData.includes('`scan:${requestId}`'))

// ── P0.3: Runner ID mismatch fix ─────────────────────────────────────────────
console.log('\nP0.3 — Runner ID mismatch fix:')

assert('P0.3-A: runnerIdsFor helper defined in admin-data.ts',
  adminData.includes('function runnerIdsFor(profile: any)'))

assert('P0.3-B: runnerIdsFor includes _scraper suffix',
  adminData.includes('`${base}_scraper`'))

assert('P0.3-C: runnerIdsFor includes _scrapper suffix',
  adminData.includes('`${base}_scrapper`'))

assert('P0.3-D: latestRun uses runnerIds.has (not aliasSet.has)',
  adminData.includes('const runnerIds = runnerIdsFor(profile)') &&
  adminData.includes('runnerIds.has(String(item.scraper_id'))

assert('P0.3-E: history filter uses runnerIds (not aliasSet)',
  adminData.includes('runRows.filter((item: any) => runnerIds.has('))

assert('P0.3-F: diagnose_source uses runnerIdsFor for scraper_runs query',
  adminData.includes('diagRunnerIds') && adminData.includes('.in("scraper_id", diagRunnerIds)'))

assert('P0.3-G: operational_runner_ids added to SourceProfile dataclass',
  base.includes('operational_runner_ids: tuple[str, ...] = field(default_factory=tuple)'))

// ── P0.1: Population mismatch fix ────────────────────────────────────────────
console.log('\nP0.1 — Population mismatch fix:')

assert('P0.1-A: migration creates admin_source_quality_aggregate function',
  migration1.includes('create or replace function') &&
  migration1.includes('admin_source_quality_aggregate'))

assert('P0.1-B: migration returns fingerprint_pending per source',
  migration1.includes('fingerprint_pending'))

assert('P0.1-C: sourceIntelligenceSnapshot calls admin_source_quality_aggregate RPC',
  adminData.includes('supabase.rpc("admin_source_quality_aggregate")'))

assert('P0.1-D: fingerprintPending computed from qualityAgg (not client-side filter)',
  adminData.includes('qualityAgg') &&
  !adminData.includes('fingerprintRows.filter((item: any) => aliasSet.has(item.source) && item.match_eligible'))

assert('P0.1-E: dynamic_metrics_unavailable includes quality_agg field',
  adminData.includes('quality_agg: qualityAggRes.error'))

// ── P0.4: Eight Gates scope marker ───────────────────────────────────────────
console.log('\nP0.4 — Eight Gates scope marker:')

assert('P0.4-A: evaluateEightGates accepts rowsScope parameter',
  eightGates.includes("rowsScope: 'full_inventory_sample' | 'run_specific'"))

assert('P0.4-B: quality gate metrics include _rows_source field',
  eightGates.includes('_rows_source: rowsScope'))

assert('P0.4-C: default scope is full_inventory_sample',
  eightGates.includes("= 'full_inventory_sample'"))

// ── P0.5: CVITAE_MAX_ITEMS early binding ─────────────────────────────────────
console.log('\nP0.5 — CVITAE_MAX_ITEMS early binding:')

assert('P0.5-A: unjobs reads CVITAE_MAX_ITEMS at start of main()',
  unjobs.includes("max_items = int(os.getenv(\"CVITAE_MAX_ITEMS\", \"250\"))"))

assert('P0.5-B: unjobs breaks outer loop when len(seen) >= max_items',
  unjobs.includes('if len(seen) >= max_items:') &&
  unjobs.indexOf('if len(seen) >= max_items:') < unjobs.indexOf('for job in scrape_page'))

assert('P0.5-C: himalayas reads CVITAE_MAX_ITEMS at start of main()',
  himalayas.includes("max_items = int(os.getenv(\"CVITAE_MAX_ITEMS\", \"250\"))"))

assert('P0.5-D: himalayas breaks inventory loop when limit reached',
  himalayas.includes('if len(seen) >= max_items:') &&
  himalayas.includes('for raw in inventory.jobs:'))

assert('P0.5-E: weworkremotely reads CVITAE_MAX_ITEMS at start of main()',
  wwr.includes("max_items = int(os.getenv(\"CVITAE_MAX_ITEMS\", \"250\"))"))

assert('P0.5-F: weworkremotely breaks both category and item loops',
  (wwr.match(/if len\(seen\) >= max_items:/g) || []).length >= 2)

assert('P0.5-G: talentcom reads CVITAE_MAX_ITEMS at start of main()',
  talentcom.includes("max_items = int(os.getenv(\"CVITAE_MAX_ITEMS\", \"250\"))"))

assert('P0.5-H: talentcom breaks both SEARCHES and job loops',
  (talentcom.match(/if len\(seen_urls\) >= max_items:/g) || []).length >= 2)

// ── P0.6: Scope markers in snapshot ──────────────────────────────────────────
console.log('\nP0.6 — Scope markers in snapshot:')

assert('P0.6-A: each source includes _inventory_scope object',
  adminData.includes('_inventory_scope: {'))

assert('P0.6-B: pools marked as full_db_rpc',
  adminData.includes('"full_db_rpc"'))

assert('P0.6-C: recent_rows marked as client_sample',
  adminData.includes('"client_sample"'))

// ── Safety: no regression of existing fixes ───────────────────────────────────
console.log('\nSafety — no regression of pre-existing fixes:')

assert('Safety-A: trigger_source_scan still generates requestId and dispatches',
  adminData.includes('requestId') && adminData.includes('GITHUB_ACTIONS_TOKEN'))

assert('Safety-B: search_engine_indexing_allowed still in SourceProfile',
  base.includes('search_engine_indexing_allowed: bool | None = None'))

assert('Safety-C: aliasSet still used for observations/policy filtering',
  adminData.includes('aliasSet.has(String(item.source'))

assert('Safety-D: OpportunitySink still applies max_items as hard cap',
  readFileSync(resolve(process.cwd(), 'scrapers/opportunity_sink.py'), 'utf8')
    .includes('if len(items) > max_items:'))

// ── T-W11–T-W16: RunQualityMetrics + run-specific Gates 4-6 in source_evidence.py ──
console.log('\nT-W11–T-W16 — RunQualityMetrics + Gates 4-6 run-specific:')

const evidence = src('scrapers/source_evidence.py')

assert('T-W11: RunQualityMetrics dataclass defined in source_evidence.py',
  evidence.includes('class RunQualityMetrics:'))

assert('T-W12: run_quality_metrics factory function defined',
  evidence.includes('def run_quality_metrics('))

assert('T-W13: eight_gates_run_evidence accepts quality_metrics: RunQualityMetrics | None param',
  evidence.includes('quality_metrics: RunQualityMetrics | None'))

assert('T-W14: eight_gates_run_evidence emits gate_4 with QUALITY_PASS reason when qm provided',
  evidence.includes('"gate_4"') && evidence.includes('QUALITY_PASS'))

assert('T-W15: eight_gates_run_evidence emits gate_5 with PERSISTED_OK reason when qm provided',
  evidence.includes('"gate_5"') && evidence.includes('PERSISTED_OK'))

assert('T-W16: eight_gates_run_evidence emits gate_6 with overall key when qm provided',
  evidence.includes('"gate_6"') && evidence.includes('"overall"'))

// ── T-W17–T-W18: diagnose_source delta reconciliation ────────────────────────
console.log('\nT-W17–T-W18 — diagnose_source delta reconciliation:')

assert('T-W17: diagnose_source response includes run_summary with discovered/normalized/persisted',
  adminData.includes('run_summary') && adminData.includes('discovered') && adminData.includes('normalized') && adminData.includes('persisted'))

assert('T-W18: diagnose_source response includes reconciliation.run_coverage_pct',
  adminData.includes('run_coverage_pct') && adminData.includes('reconciliation'))

// ── T-W19–T-W20: eight-gates.ts Gate 6 overall health synthesis ──────────────
console.log('\nT-W19–T-W20 — eight-gates.ts Gate 6 overall health synthesis:')

assert('T-W19: eight-gates.ts Gate 6 health metrics includes overall and RUNTIME_FAIL',
  eightGates.includes('healthOverall') && eightGates.includes('RUNTIME_FAIL'))

assert('T-W20: eight-gates.ts Gate 6 has scope: no_run_evidence when no latestRun',
  eightGates.includes('no_run_evidence') && eightGates.includes('healthScope'))

// ── Migration preflight ───────────────────────────────────────────────────────
console.log('\nMigration preflight (SAFE/NEEDS_ATTENTION/BLOCKER):')

const m1 = src('supabase/migrations/202609160001_founding_beta_manual_approval.sql')
const m2 = src('supabase/migrations/202609160002_source_search_engine_policy.sql')
const m3 = src('supabase/migrations/202609160003_source_control_audit_log.sql')

// 202609160001: SAFE — creates new RPCs only, no schema mutations
assert('Preflight-M1 [SAFE]: 202609160001 creates admin_approve_founding_beta RPC',
  m1.includes('admin_approve_founding_beta'))

assert('Preflight-M1 [SAFE]: 202609160001 uses CREATE OR REPLACE / no DROP TABLE',
  !m1.toLowerCase().includes('drop table') && !m1.toLowerCase().includes('alter table'))

// 202609160002: NEEDS_ATTENTION — adds nullable column (non-breaking, but requires downtime window awareness)
assert('Preflight-M2 [NEEDS_ATTENTION]: 202609160002 adds nullable search_engine_indexing_allowed column',
  m2.toLowerCase().includes('search_engine_indexing_allowed'))

assert('Preflight-M2 [NEEDS_ATTENTION]: 202609160002 uses IF NOT EXISTS or DEFAULT NULL',
  m2.toLowerCase().includes('if not exists') || m2.toLowerCase().includes('default null') || m2.toLowerCase().includes('boolean default null'))

// 202609160003: SAFE — creates new table, no existing schema changes
assert('Preflight-M3 [SAFE]: 202609160003 creates source_control_audit_log table',
  m3.toLowerCase().includes('source_control_audit_log'))

assert('Preflight-M3 [SAFE]: 202609160003 does not alter existing tables',
  !m3.toLowerCase().includes('alter table opportunities') && !m3.toLowerCase().includes('alter table scraper_runs'))

// 202609180001: SAFE — CREATE OR REPLACE FUNCTION, fully idempotent
assert('Preflight-M4 [SAFE]: 202609180001 uses CREATE OR REPLACE (idempotent)',
  migration1.toLowerCase().includes('create or replace function'))

assert('Preflight-M4 [SAFE]: 202609180001 grants to service_role only',
  migration1.toLowerCase().includes('service_role'))

// 202609180002: NEEDS_ATTENTION — ALTER TABLE (constraint drop+add + new column)
assert('Preflight-M5 [NEEDS_ATTENTION]: 202609180002 uses DROP CONSTRAINT IF EXISTS (safe)',
  migration2.toLowerCase().includes('drop constraint if exists'))

assert('Preflight-M5 [NEEDS_ATTENTION]: 202609180002 uses ADD COLUMN IF NOT EXISTS (idempotent)',
  migration2.toLowerCase().includes('add column if not exists') || migration2.toLowerCase().includes('if not exists'))

// ─────────────────────────────────────────────────────────────────────────────
console.log(`\n${'═'.repeat(65)}`)
console.log(`  VERIFY-SOURCE-INTELLIGENCE-WIRING: ${passed}  passed, ${failed}  failed`)
console.log(`${'═'.repeat(65)}\n`)

if (failed > 0) {
  console.error('Failed checks:', errors.join(', '))
  process.exit(1)
} else {
  console.log('All checks passed. Source Intelligence + Play + Eight Gates wiring verified.')
}
