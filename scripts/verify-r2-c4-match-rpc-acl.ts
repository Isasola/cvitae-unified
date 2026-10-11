import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { extname, join, relative } from 'node:path'

const root = new URL('../', import.meta.url)
const source = (path: string) => readFileSync(new URL(path, root), 'utf8')
const executableRoots = ['src', 'netlify/functions', 'supabase/functions', 'scripts']
const executableExtensions = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs'])
const directRpc = /\.rpc\(\s*['"]match_opportunities['"]/g
const callers: string[] = []

const walk = (path: string) => {
  for (const entry of readdirSync(new URL(path, root), { withFileTypes: true })) {
    const child = join(path, entry.name).replaceAll('\\', '/')
    if (entry.isDirectory()) {
      if (!['node_modules', 'dist', 'generated'].includes(entry.name)) walk(child)
      continue
    }
    if (!executableExtensions.has(extname(entry.name)) || /^verify[-_]/.test(entry.name)) continue
    if (directRpc.test(source(child))) callers.push(relative('.', child).replaceAll('\\', '/'))
    directRpc.lastIndex = 0
  }
}
for (const path of executableRoots) walk(path)
assert.deepEqual(callers, ['supabase/functions/match-batch/index.ts'], 'only the internal Edge function calls the vector RPC')

const caller = source(callers[0])
assert.match(caller, /createClient\(Deno\.env\.get\('SUPABASE_URL'\), Deno\.env\.get\('SUPABASE_SERVICE_ROLE_KEY'\)\)/)
assert.match(caller, /supabase\.rpc\('match_opportunities'/)
assert.doesNotMatch(caller, /VITE_SUPABASE_ANON_KEY|SUPABASE_ANON_KEY/)

const migration = source('supabase/migrations/202610110001_private_b2c_matching_consumer.sql')
const preflight = source('artifacts/release/r2-c4-preflight-readonly-20261011.sql')
const postApply = source('artifacts/release/r2-c4-matching-post-apply-readonly-20261011.sql')
const rollback = source('artifacts/release/r2-c4-rollback-write-20261011.sql')
const signature = String.raw`public\.match_opportunities\(public\.vector,double precision,integer\)`

assert.match(migration, /input_acl_digest/)
assert.match(migration, /791d2b1e22edbb03f97770724fbb588b/)
assert.match(migration, /c4_match_baseline_acl/)
assert.match(migration, /c4_match_expected_acl_contract/)
assert.equal((migration.match(new RegExp(`revoke execute on function ${signature}`, 'gi')) || []).length, 1)
assert.equal((migration.match(new RegExp(`grant execute on function ${signature}`, 'gi')) || []).length, 1)
assert.match(migration, /from public,anon,authenticated/)
assert.match(migration, /to service_role/)
assert.match(migration, /match_opportunities_unrelated_acl_changed/)
assert.match(migration, /match_opportunities_acl_delta_mismatch/)
assert.match(migration, /v_after\.function_oid<>v_before\.function_oid/)
assert.match(migration, /v_after\.proowner<>v_before\.proowner/)
assert.match(migration, /pronargdefaults<>2/)
assert.match(migration, /match_opportunities_contract_changed/)
assert.match(migration, /TABLE\(id text, title text, organization text, location text, rubro text, tags text\[\], description text, application_url text, source text, similarity double precision\)/)
assert.doesNotMatch(migration, /(?:update|delete from)\s+public\.opportunities/i)
assert.doesNotMatch(migration, /(?:update|insert into)\s+public\.opportunity_source_consumer_permissions/i)

assert.match(preflight, /ACL_REMEDIATION_REQUIRED/)
assert.match(preflight, /authorized_input_acl_digest/)
assert.match(preflight, /expected_output_acl_contract_digest/)
assert.match(preflight, /rpc_structural_compatible/)
assert.match(preflight, /then 'ACL_REMEDIATION_REQUIRED'/)
assert.match(postApply, /authorized_input_acl_digest/)
assert.match(postApply, /acl_hardening_result/)
assert.match(postApply, /actual_output_acl_contract_digest/)
assert.match(postApply, /ONLY_PUBLIC_ANON_AUTHENTICATED_EXECUTE_REMOVED;SERVICE_ROLE_EXECUTE_PRESERVED/)
assert.match(rollback, /c4_rollback_requires_hardened_match_acl/)
assert.match(rollback, /c4_rollback_match_identity_or_hardened_acl_changed/)
assert.doesNotMatch(rollback, new RegExp(`grant execute on function ${signature}[\\s\\S]*?to (?:public|anon|authenticated)`, 'i'))

// Independent privilege model: PUBLIC made anon/authenticated effective before;
// the authorized delta removes only public presentation and preserves internal service execution.
const beforeDirect = new Set(['PUBLIC', 'service_role', 'owner', 'unrelated_internal_role'])
const effectiveBefore = (role: string) => beforeDirect.has(role) || beforeDirect.has('PUBLIC')
assert.equal(effectiveBefore('anon'), true)
assert.equal(effectiveBefore('authenticated'), true)
assert.equal(effectiveBefore('service_role'), true)
const afterDirect = new Set(beforeDirect)
afterDirect.delete('PUBLIC')
afterDirect.delete('anon')
afterDirect.delete('authenticated')
afterDirect.add('service_role')
const effectiveAfter = (role: string) => afterDirect.has(role)
assert.equal(effectiveAfter('anon'), false)
assert.equal(effectiveAfter('authenticated'), false)
assert.equal(effectiveAfter('service_role'), true)
assert.equal(effectiveAfter('owner'), true)
assert.equal(effectiveAfter('unrelated_internal_role'), true)

console.log(JSON.stringify({
  status: 'PASS',
  evidence: 'LOCAL_STATIC_ACL_CANARY',
  callers,
  acl: {
    input_digest: '791d2b1e22edbb03f97770724fbb588b',
    before: { anon: true, authenticated: true, service_role: true },
    after: { anon: false, authenticated: false, service_role: true },
    unrelated_grants_preserved: true,
  },
  postgres_runtime: 'PENDING',
  prod_validated: false,
}, null, 2))
