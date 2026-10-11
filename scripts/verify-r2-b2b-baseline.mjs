// Operator-only local contract probes. Real handler source; in-memory SDK/provider
// boundary. NOT a PostgreSQL/RLS/Universe/browser test and NOT a release gate.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import vm from 'node:vm'
import ts from 'typescript'

const root = new URL('../', import.meta.url)
const source = path => readFileSync(new URL(path, root), 'utf8')
const results = []
const artifacts = new Map()
const clone = value => JSON.parse(JSON.stringify(value))
const token = { id: 'org-a', access_token: 'synthetic-token-a', email: 'recruiter@example.invalid', company_name: 'Fixture A', is_active: true, verification_status: 'verified' }
const ownVacancy = { id: 'vacancy-a', recruiter_token_id: 'org-a', is_active: true, title: 'Analista de datos' }
const applicant = { id: 'app-a', vacancy_id: 'vacancy-a', email: 'person@example.invalid', name: 'Fixture Person', cv_storage_path: null, applied_at: '2026-10-01', review_status: 'pending', fit_score: 80, ats_score: 75, ai_summary: 'Evidencia sintética analizada.', strengths: ['SQL'], key_matches: ['SQL'], key_gaps: [], recommendation: 'Entrevistar' }

function database(overrides = {}, failure = null) {
  const rows = clone({
    recruiter_tokens: [token], recruiter_vacancies: [ownVacancy],
    opportunities: [{ id: 'mirror-a', recruiter_vacancy_id: 'vacancy-a', is_active: true }],
    vacancy_applications: [applicant], vacancy_review_batches: [], recruiter_analyses: [],
    user_master_profiles: [{ email: applicant.email, profile_data: { badges: ['PRIVATE_B2C_ONLY'] } }],
    recruiter_credit_operations: [], b2b_prospects: [], ...overrides,
  })
  const durableOperations = new Map()
  const calls = []
  const unexpected = []
  const unexpectedCall = name => { unexpected.push(name); throw new Error(`UNMODELED_BOUNDARY:${name}`) }
  const db = {
    rows, calls, unexpected, durableOperations,
    from(table) {
      if (!(table in rows)) return unexpectedCall(`table:${table}`)
      const state = { table, operation: 'select', filters: [], single: false, payload: null, range: null, limit: null, head: false }
      let settled
      const query = {
        select(_fields, options = {}) { state.head = options.head === true; return query },
        eq(key, value) { state.filters.push(row => row[key] === value); return query },
        in(key, values) { state.filters.push(row => values.includes(row[key])); return query },
        is(key, value) { state.filters.push(row => (row[key] ?? null) === value); return query },
        not(key, operation, value) {
          if (operation !== 'is') return unexpectedCall(`not:${operation}`)
          state.filters.push(row => (row[key] ?? null) !== value); return query
        },
        ilike(key, value) { state.filters.push(row => String(row[key]).toLowerCase() === String(value).toLowerCase()); return query },
        order() { return query }, // Ordering is deliberately not under test here.
        limit(n) { state.limit = n; return query },
        range(from, to) { state.range = [from, to]; return query },
        single() { state.single = true; return query },
        maybeSingle() { state.single = true; return query },
        update(payload) { state.operation = 'update'; state.payload = payload; return query },
        then(resolve, reject) {
          settled ||= Promise.resolve().then(() => {
            calls.push({ table, operation: state.operation })
            if (failure?.table === table && failure.operation === state.operation) {
              return { data: null, error: { code: 'FIXTURE_WRITE_OR_READ_FAILED', message: 'Fixture boundary failure' }, count: null }
            }
            let selected = rows[table].filter(row => state.filters.every(predicate => predicate(row)))
            const count = selected.length
            if (state.operation === 'update') selected.forEach(row => Object.assign(row, state.payload))
            if (state.range) selected = selected.slice(state.range[0], state.range[1] + 1)
            if (state.limit !== null) selected = selected.slice(0, state.limit)
            return { data: state.head ? null : clone(state.single ? selected[0] || null : selected), error: null, count }
          })
          return settled.then(resolve, reject)
        },
      }
      return query
    },
    async rpc(name, args) {
      calls.push({ rpc: name })
      if (name === 'create_recruiter_vacancy_atomic') {
        // Models the proposed atomic RPC boundary, not PostgreSQL transactionality.
        if (!/^[a-z0-9-]{3,80}$/.test(args.p_slug)) return { data: null, error: { code: 'P0001', message: 'invalid_vacancy_slug' } }
        if (failure?.rpc === name) return { data: null, error: { code: 'P0001', message: 'OPPORTUNITY_MIRROR_INSERT_FAILED' } }
        const key = `${args.p_recruiter_token_id}:${args.p_operation_id}`
        const request = JSON.stringify({ title: args.p_title, description: args.p_description, requirements: args.p_requirements, location: args.p_location, modality: args.p_modality, salary: args.p_salary_range, rubro: args.p_rubro, tags: args.p_tags })
        const prior = durableOperations.get(key)
        if (prior) {
          if (prior.request !== request) return { data: null, error: { code: 'P0001', message: 'operation_conflict' } }
          return { data: { ...prior.result, idempotent: true }, error: null }
        }
        const id = `created-${durableOperations.size + 1}`
        const result = { success: true, id, opportunity_id: `mirror-${id}`, slug: args.p_slug, url: args.p_application_url, idempotent: false }
        rows.recruiter_vacancies.push({ id, slug: args.p_slug, recruiter_token_id: args.p_recruiter_token_id, is_active: true })
        rows.opportunities.push({ id: result.opportunity_id, recruiter_vacancy_id: id, is_active: true })
        durableOperations.set(key, { request, result })
        return { data: result, error: null }
      }
      if (name === 'close_recruiter_vacancy_atomic') {
        const vacancy = rows.recruiter_vacancies.find(row => row.id === args.p_vacancy_id && row.recruiter_token_id === args.p_recruiter_token_id)
        if (!vacancy) return { data: null, error: { code: 'P0001', message: 'vacancy_not_owned' } }
        const mirror = rows.opportunities.find(row => row.recruiter_vacancy_id === vacancy.id)
        if (!mirror || failure?.rpc === name) return { data: null, error: { code: 'P0001', message: 'close_mirror_mismatch' } }
        const idempotent = vacancy.is_active === false
        vacancy.is_active = false
        mirror.is_active = false
        return { data: { ok: true, id: vacancy.id, opportunity_id: mirror.id, is_active: false, idempotent }, error: null }
      }
      return unexpectedCall(`rpc:${name}`)
    },
    storage: { from() { return unexpectedCall('storage') } },
  }
  return db
}

function realHandler(path, db, options = {}) {
  const text = source(path)
  artifacts.set(path, createHash('sha256').update(text).digest('hex'))
  const compiled = ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }, reportDiagnostics: true })
  assert.equal((compiled.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error).length, 0, 'Handler must transpile')
  const state = { providerCalls: 0, networkCalls: 0 }
  const fakeMath = Object.create(Math)
  fakeMath.random = options.random || (() => 1 / 36)
  const exports = {}
  const context = vm.createContext({
    exports, module: { exports }, Math: fakeMath, TextEncoder, TextDecoder, Buffer,
    process: { env: { SITE_URL: 'https://fixture.invalid' } },
    console: { log() {}, info() {}, warn() {}, error() {} },
    fetch() { state.networkCalls++; throw new Error('NETWORK_FORBIDDEN') },
    require(name) {
      if (name === './_supabase') return { makeSupabaseAdmin: () => db }
      if (name === 'node:crypto') return { createHash }
      if (name === './lib/ai-telemetry') return { observeAiCall: (_meta, operation) => operation() }
      if (name === '@aws-sdk/client-bedrock-runtime') return {
        InvokeModelCommand: class { constructor(input) { this.input = input } },
        BedrockRuntimeClient: class { async send() {
          state.providerCalls++
          return { body: new TextEncoder().encode(JSON.stringify({ content: [{ text: '{"verdict":"fixture-only"}' }] })) }
        } },
      }
      db.unexpected.push(`import:${name}`)
      throw new Error(`UNMODELED_IMPORT:${name}`)
    },
  }, { codeGeneration: { strings: false, wasm: false } })
  new vm.Script(compiled.outputText, { filename: path }).runInContext(context, { timeout: 5000 })
  assert.equal(typeof exports.handler, 'function')
  return {
    state,
    async call(body) {
      const response = await exports.handler({ httpMethod: 'POST', headers: {}, body: JSON.stringify(body) }, {})
      assert.equal(state.networkCalls, 0, 'No network call is permitted')
      assert.deepEqual(db.unexpected, [], 'No unknown boundary may be silently treated as product evidence')
      return { status: response.statusCode, payload: JSON.parse(response.body) }
    },
  }
}

async function probe(name, operation) {
  try { await operation(); results.push({ name, status: 'PASS' }); console.log(`PASS ${name}`) }
  catch (error) { results.push({ name, status: 'FAIL', reason: String(error.message).split('\n')[0] }); console.log(`FAIL ${name}: ${String(error.message).split('\n')[0]}`) }
}

const createPath = 'netlify/functions/create-vacancy.ts'
const validatePath = 'netlify/functions/validate-recruiter-token.ts'
const createInput = { token: token.access_token, title: 'Analista de datos', description: 'Vacante sintética, sin publicación real.', requirements: 'SQL confirmado por el publicador', location: 'Ubicación declarada', modality: 'Remoto', operation_id: 'fixture-create-0001' }

await probe('PREFLIGHT_DIRECT_DEPENDENCY_COVERAGE', async () => {
  const preflight = source('artifacts/release/r2-b2b-preflight-20261009.sql')
  const relations = new Set([...preflight.split('function_manifest(')[0].matchAll(/\('(?:public|storage|auth)','([^']+)'/g)].map(match => match[1]))
  const functions = new Set([...preflight.split('function_manifest(')[1].split('relations AS (')[0].matchAll(/\('public','([^']+)'/g)].map(match => match[1]))
  const proposedSql = [
    'supabase/migrations/202610090002_recruiter_opportunity_bridge.sql',
    'supabase/migrations/202610110001_private_b2c_matching_consumer.sql',
    'supabase/migrations/202610110002_recruiter_update_and_seo_plus_request.sql',
  ].map(source).join('\n')
  for (const match of proposedSql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?public\.([a-z0-9_]+)/gi)) relations.add(match[1])
  for (const match of proposedSql.matchAll(/create\s+or\s+replace\s+function\s+public\.([a-z0-9_]+)/gi)) functions.add(match[1])
  const entrypoints = [
    'create-vacancy', 'validate-recruiter-token', 'submit-lead', 'analyze-cv-candidate',
    'analyze-vacancy-applicants', 'compare-candidates', 'analyze-recruiters-batch',
    'send-b2b-invite', 'submit-beta', 'cv-ats-workspace', 'generate-cv-vivo',
    'cv-workspace', 'b2c-profile', 'founding-beta-action', 'gemini-courses',
    'log-user-event', 'lib/b2c-security', 'lib/cv-evidence',
  ]
  const missing = []
  for (const entrypoint of entrypoints) {
    const text = source(`netlify/functions/${entrypoint}.ts`)
    for (const match of text.matchAll(/\.from\(\s*['"]([^'"]+)['"]/g)) {
      // candidate-cvs is a bucket, not a SQL relation. objects/buckets metadata is
      // collected, but actual bucket privacy needs a separately authorized check.
      if (match[1] !== 'candidate-cvs' && !relations.has(match[1])) missing.push(`${entrypoint}:table:${match[1]}`)
    }
    for (const match of text.matchAll(/\.rpc\(\s*['"]([^'"]+)['"]/g)) {
      if (!functions.has(match[1])) missing.push(`${entrypoint}:rpc:${match[1]}`)
    }
  }
  assert.deepEqual(missing, [], 'Direct dependencies must exist in STOP A evidence or the proposed migration')
  // This is a structural guard only. Returned function/trigger/view bodies and
  // all column types still require compatibility review; it cannot declare PASS.
})
await probe('CREATE_UNVERIFIED_403_NO_WRITE', async () => {
  const db = database({ recruiter_tokens: [{ ...token, verification_status: 'pending' }] })
  const result = await realHandler(createPath, db).call(createInput)
  assert.equal(result.status, 403)
  assert.equal(db.calls.some(call => call.rpc), false)
})
await probe('CREATE_VERIFIED_ACCEPTS_GENERATED_SLUG', async () => {
  const db = database({ recruiter_vacancies: [], opportunities: [] })
  const result = await realHandler(createPath, db, { random: () => 0.1 }).call(createInput)
  assert.equal(result.status, 200, 'Verified valid input must generate a slug accepted by the existing RPC contract')
  assert.equal(db.rows.recruiter_vacancies.length, 1)
  assert.equal(db.rows.opportunities.length, 1)
})
await probe('CREATE_RETRY_SAME_OPERATION_ONE_PAIR', async () => {
  const db = database({ recruiter_vacancies: [], opportunities: [] })
  let sequence = 0
  const handler = realHandler(createPath, db, { random: () => ++sequence / 36 })
  assert.equal((await handler.call(createInput)).status, 200)
  assert.equal((await handler.call(createInput)).status, 200)
  assert.equal(db.rows.recruiter_vacancies.length, 1, 'Retry must reuse one durable publication operation')
  assert.equal(db.rows.opportunities.length, 1)
})
await probe('CREATE_DIFFERENT_OPERATION_CREATES_DISTINCT_PAIR', async () => {
  const db = database({ recruiter_vacancies: [], opportunities: [] })
  const handler = realHandler(createPath, db)
  assert.equal((await handler.call(createInput)).status, 200)
  assert.equal((await handler.call({ ...createInput, operation_id: 'fixture-create-0002' })).status, 200)
  assert.equal(db.rows.recruiter_vacancies.length, 2)
  assert.equal(db.rows.opportunities.length, 2)
})
await probe('CREATE_SAME_OPERATION_CHANGED_REQUEST_409', async () => {
  const db = database({ recruiter_vacancies: [], opportunities: [] })
  const handler = realHandler(createPath, db)
  assert.equal((await handler.call(createInput)).status, 200)
  const conflict = await handler.call({ ...createInput, title: 'Otro puesto' })
  assert.equal(conflict.status, 409)
  assert.equal(conflict.payload.reason, 'OPERATION_CONFLICT')
  assert.equal(db.rows.recruiter_vacancies.length, 1)
})
await probe('CREATE_SAME_OPERATION_CROSS_TENANT_SEPARATE', async () => {
  const tokenB = { ...token, id: 'org-b', access_token: 'synthetic-token-b', company_name: 'Fixture B' }
  const db = database({ recruiter_tokens: [token, tokenB], recruiter_vacancies: [], opportunities: [] })
  const handler = realHandler(createPath, db)
  assert.equal((await handler.call(createInput)).status, 200)
  assert.equal((await handler.call({ ...createInput, token: tokenB.access_token })).status, 200)
  assert.equal(db.rows.recruiter_vacancies.length, 2)
})
await probe('CREATE_CONCURRENT_RETRY_ONE_PAIR_SIMULATED', async () => {
  const db = database({ recruiter_vacancies: [], opportunities: [] })
  const handler = realHandler(createPath, db)
  const responses = await Promise.all([handler.call(createInput), handler.call(createInput)])
  assert.deepEqual(responses.map(item => item.status), [200, 200])
  assert.equal(db.rows.recruiter_vacancies.length, 1)
  assert.equal(db.rows.opportunities.length, 1)
})
await probe('CREATE_RPC_FAILURE_NOT_SUCCESS', async () => {
  const db = database({ recruiter_vacancies: [], opportunities: [] }, { rpc: 'create_recruiter_vacancy_atomic' })
  assert.equal((await realHandler(createPath, db).call(createInput)).status, 503)
  assert.equal(db.rows.recruiter_vacancies.length, 0)
  // Zero rows is fixture state, NOT a demonstration of PostgreSQL rollback.
})
await probe('CLOSE_MIRROR_FAILURE_NOT_SUCCESS_OR_PARTIAL', async () => {
  const db = database({}, { rpc: 'close_recruiter_vacancy_atomic' })
  const result = await realHandler(validatePath, db).call({ token: token.access_token, action: 'close_vacancy', vacancy_id: ownVacancy.id })
  assert.ok(result.status >= 400 && result.payload.ok !== true, 'Failed mirror write must not report close success')
  assert.equal(db.rows.recruiter_vacancies[0].is_active, db.rows.opportunities[0].is_active, 'Both lifecycle states must agree after failure')
})
await probe('CLOSE_SUCCESS_AND_RETRY_IDEMPOTENT', async () => {
  const db = database()
  const handler = realHandler(validatePath, db)
  const first = await handler.call({ token: token.access_token, action: 'close_vacancy', vacancy_id: ownVacancy.id })
  const retry = await handler.call({ token: token.access_token, action: 'close_vacancy', vacancy_id: ownVacancy.id })
  assert.equal(first.status, 200)
  assert.equal(first.payload.idempotent, false)
  assert.equal(retry.status, 200)
  assert.equal(retry.payload.idempotent, true)
  assert.equal(db.rows.opportunities[0].is_active, false)
})
await probe('CLOSE_OTHER_COMPANY_403_NO_WRITE', async () => {
  const db = database({ recruiter_vacancies: [{ ...ownVacancy, recruiter_token_id: 'org-b' }] })
  assert.equal((await realHandler(validatePath, db).call({ token: token.access_token, action: 'close_vacancy', vacancy_id: ownVacancy.id })).status, 403)
  assert.equal(db.calls.some(call => call.operation === 'update'), false)
})
await probe('APPLICANTS_NO_PRIVATE_B2C_EMAIL_JOIN', async () => {
  const db = database()
  const result = await realHandler(validatePath, db).call({ token: token.access_token, action: 'get_applicants', vacancy_id: ownVacancy.id })
  assert.equal(result.status, 200)
  assert.equal(result.payload.applicants.length, 1)
  assert.ok(!JSON.stringify(result.payload).includes('PRIVATE_B2C_ONLY'), 'Private B2C badges must not cross into recruiter response')
  assert.equal(db.calls.some(call => call.table === 'user_master_profiles'), false, 'Public application email does not authorize B2C profile lookup')
})
await probe('APPLICANTS_DATABASE_FAILURE_NOT_EMPTY_SUCCESS', async () => {
  const db = database({}, { table: 'vacancy_applications', operation: 'select' })
  const result = await realHandler(validatePath, db).call({ token: token.access_token, action: 'get_applicants', vacancy_id: ownVacancy.id })
  assert.ok(result.status >= 400, 'Unavailable applications must not be reported as a successful empty queue')
})
await probe('COMPARE_SAME_COMPANY_DIFFERENT_VACANCIES_BLOCKED', async () => {
  const db = database({
    recruiter_vacancies: [ownVacancy, { ...ownVacancy, id: 'vacancy-b' }],
    vacancy_applications: [applicant, { ...applicant, id: 'app-b', vacancy_id: 'vacancy-b' }],
  })
  const handler = realHandler('netlify/functions/compare-candidates.ts', db)
  const result = await handler.call({ token: token.access_token, mode: 'head_to_head', application_ids: ['app-a', 'app-b'], vacancy_id: ownVacancy.id })
  assert.ok(result.status >= 400, 'Same organization is insufficient: comparison needs the same vacancy')
  assert.equal(handler.state.providerCalls, 0)
})
await probe('COMPARE_OTHER_COMPANY_SAME_VACANCY_BLOCKED', async () => {
  const db = database({ recruiter_vacancies: [{ ...ownVacancy, recruiter_token_id: 'org-b' }], vacancy_applications: [applicant, { ...applicant, id: 'app-b' }] })
  const handler = realHandler('netlify/functions/compare-candidates.ts', db)
  const result = await handler.call({ token: token.access_token, mode: 'head_to_head', application_ids: ['app-a', 'app-b'], vacancy_id: ownVacancy.id })
  assert.equal(result.status, 403)
  assert.equal(handler.state.providerCalls, 0)
})
await probe('COMPARE_SAME_VACANCY_AUTHORIZED_BEFORE_PROVIDER', async () => {
  const db = database({ vacancy_applications: [applicant, { ...applicant, id: 'app-b', name: 'Fixture Person B' }] })
  const handler = realHandler('netlify/functions/compare-candidates.ts', db)
  const result = await handler.call({ token: token.access_token, mode: 'head_to_head', application_ids: ['app-a', 'app-b'], vacancy_id: ownVacancy.id })
  assert.equal(result.status, 200)
  assert.equal(handler.state.providerCalls, 1)
})
await probe('COMPARE_MISSING_EVIDENCE_ABSTAINS_NO_PROVIDER', async () => {
  const db = database({ vacancy_applications: [applicant, { ...applicant, id: 'app-b', ai_summary: null }] })
  const handler = realHandler('netlify/functions/compare-candidates.ts', db)
  const result = await handler.call({ token: token.access_token, mode: 'head_to_head', application_ids: ['app-a', 'app-b'], vacancy_id: ownVacancy.id })
  assert.equal(result.status, 200)
  assert.equal(result.payload.abstained, true)
  assert.equal(handler.state.providerCalls, 0)
})
await probe('PROPOSED_SQL_FUTURE_AND_HISTORICAL_GUARDS', async () => {
  const bridge = source('supabase/migrations/202610090002_recruiter_opportunity_bridge.sql')
  const policy = source('supabase/migrations/202610090001_controlled_recruiter_producer.sql')
  const preview = source('artifacts/release/r2-b2b-historical-preview-20261009.sql')
  const write = source('artifacts/release/r2-b2b-reconcile-write-20261009.sql')
  const verify = source('artifacts/release/r2-b2b-post-apply-verify-20261009.sql')
  assert.match(bridge, /primary key\(recruiter_token_id,operation_id\)/)
  assert.match(bridge, /pg_advisory_xact_lock/)
  assert.match(bridge, /unique index opportunities_recruiter_vacancy_unique_r2/)
  assert.match(bridge, /'PUBLISHER_DECLARED_NOT_INDEPENDENTLY_VERIFIED'/)
  assert.match(bridge, /v\.is_active,null,[\s\S]*false,'empleo','job','pending'/)
  assert.match(bridge, /if old\.is_active=false and new\.is_active=true then raise exception/)
  assert.match(policy, /'state','EXECUTABLE_PRODUCER'/)
  assert.match(policy, /WEB_CATALOG_DENIED/)
  assert.doesNotMatch(policy, /update\s+public\.opportunity_sources/i)
  assert.doesNotMatch(preview, /\n\s*limit\s+\d/i)
  assert.match(preview, /'total',8,'active',6,'inactive',2/)
  assert.match(write, /__EXPECTED_DIGEST_FROM_PREVIEW__/)
  assert.match(verify, /closed_ready_anywhere/)
})
await probe('DIRECT_APPLICATION_NOT_PUBLIC_DISTRIBUTION', async () => {
  const page = source('src/pages/VacantePage.tsx')
  const prerender = source('scripts/prerender.mjs')
  const sitemap = source('netlify/functions/sitemap.ts')
  assert.match(page, /name="robots" content="noindex,nofollow"/)
  assert.doesNotMatch(page, /application\/ld\+json|structuredData/)
  const vacancyBlock = prerender.slice(prerender.indexOf('let vacancyCount'))
  assert.match(vacancyBlock, /noindex,nofollow/)
  assert.doesNotMatch(vacancyBlock, /JobPosting|application\/ld\+json/)
  assert.match(sitemap, /sitemap-vacancies\.xml'[\s\S]*statusCode:404/)
})
await probe('LEGACY_BATCH_STAYS_410', async () => {
  const handler = realHandler('netlify/functions/analyze-recruiters-batch.ts', database())
  assert.equal((await handler.call({ token: token.access_token })).status, 410)
  assert.equal(handler.state.providerCalls, 0)
})

const failed = results.filter(result => result.status === 'FAIL').length
console.log(JSON.stringify({
  phase: 'LOCAL_IMPLEMENTATION_CONTRACT_NOT_RELEASE_GATE', boundary: 'SDK_DATABASE_AND_PROVIDER_SIMULATED_IN_VM_NO_NETWORK',
  sqlExecuted: false, browserExecuted: false, total: results.length, failed, results,
  sourceSha256: Object.fromEntries(artifacts),
}, null, 2))
process.exitCode = failed ? 1 : 0
