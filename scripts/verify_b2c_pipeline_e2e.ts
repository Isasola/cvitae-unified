/** Local staged-system acceptance across producer, evidence, policy, consumers and Admin. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
const run = (command: string, args: string[]) => {
  const result = spawnSync(command, args, { encoding: 'utf8', shell: process.platform === 'win32' })
  assert.equal(result.status, 0, `${command} ${args.join(' ')}\n${result.stdout}\n${result.stderr}`)
  return result.stdout
}

// Real local fixtures exercise sink -> Factory -> readiness/policy, and the shared
// AdapterResult -> lineage -> observation writer. Both are isolated from providers.
const future = run('pnpm.cmd', ['exec', 'tsx', 'scripts/verify_future_ingestion_e2e.ts'])
const evidence = run('python', ['scripts/verify_source_scan_lineage.py'])
assert.match(future, /"factory\.queue\+seal\+commit"/)
assert.match(future, /"unknown source fail closed"/)
assert.match(evidence, /PASS source scan lineage/)

const adapters = read('../scrapers/source_adapters.py')
const bridge = read('./run_source_scan_automation_bridge.py')
const scheduled = read('./run_scheduled_source_automation.py')
const universe = read('../supabase/migrations/202609280001_opportunity_universe.sql')
const secondary = read('../scripts/verify_b2c_secondary_contracts.ts')
const admin = read('../netlify/functions/admin-data.ts')
assert.match(adapters, /FACTUAL_OBSERVATION_WRITTEN/)
assert.match(bridge, /opportunity_id.*scan_lineage|scan_lineage.*opportunity_id/s)
assert.match(scheduled, /registry_auto_enabled.*is not True/)
assert.match(scheduled, /registry_policy_hash.*expected\["registry_policy_hash"\]/)
assert.match(universe, /opportunity_catalog_universe/)
assert.match(universe, /opportunity_final_matching_universe/)
assert.match(universe, /opportunity_alert_universe/)
assert.match(universe, /opportunity_seo_universe/)
assert.match(secondary, /unknown or false durable permission is not promoted/)
assert.match(secondary, /private custom vacancy never enters global opportunities/)
assert.match(secondary, /URL_UPDATED checks canonical effective SEO membership/)
assert.match(admin, /admin_opportunity_pipeline_ledger/)
assert.match(admin, /sourceIntelligenceSnapshot/)
assert.match(read('../scripts/verify_canonical_robots_sitemap.ts'), /blocked-computrabajo|computrabajo/i)

console.log('verify_b2c_pipeline_e2e: PASS producer/sink/lineage/observation/Factory/authorized automation/Universe routing/secondary consumers/Admin; unknown, missing evidence, explicit SEO denial and private CV remain fail-closed')
