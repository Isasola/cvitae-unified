import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { chromium } from '@playwright/test'
import { createPublicOpportunitiesHandler } from '../netlify/functions/public-opportunities.ts'
import { createPublicDetailHandler, config as detailConfig } from '../netlify/functions/public-opportunity-detail.ts'
import { canonicalOpportunityPathForRow } from '../src/lib/opportunity-truth.ts'
import { evaluateOpportunityDistribution } from '../src/lib/effective-source-policy.ts'
import { buildSeoInventoryFromUniverse } from '../src/lib/seo-inventory.ts'

// Local PostgreSQL only. Use the existing SQL-test installation, never credentials.
const { PGlite } = await import('../.cvitae-state/cable-sql-test/node_modules/@electric-sql/pglite/dist/index.js')
const db = new PGlite()
const read = (file: string) => fs.readFileSync(file, 'utf8')
const columns = read('netlify/functions/public-opportunities.ts').match(/const COLUMNS = '([^']+)'/)![1].split(',')
const booleans = new Set(['remote', 'fully_funded', 'is_active', 'catalog_eligible', 'match_eligible', 'alerts_eligible', 'seo_eligible'])
const arrays = new Set(['tags', 'eligible_countries', 'eligible_regions'])
const json = new Set(['requirements', 'responsibilities', 'benefits'])
const timestamps = new Set(['created_at', 'updated_at', 'deleted_at', 'archived_at', 'published_at'])
await db.exec(`create schema extensions;
  create table opportunities(${columns.map(c => `${c} ${booleans.has(c) ? 'boolean' : arrays.has(c) ? 'text[]' : json.has(c) ? 'jsonb' : timestamps.has(c) ? 'timestamptz' : 'text'}`).join(',')}, private_note text, primary key(id), unique(slug));
  create table opportunity_universe_state(opportunity_id text primary key, lifecycle_state text, catalog_state text, seo_state text);
  create table opportunity_source_identity_aliases(emitted_source text primary key,canonical_source text);
  create table opportunity_sources(source text primary key,policy jsonb);
  create function canonical_opportunity_source_policy(s text) returns jsonb language sql stable as $$select policy from opportunity_sources where source=s$$;`)
const baseline = read('supabase/migrations/202609280001_opportunity_universe.sql')
await db.exec(baseline.match(/create or replace function public.opportunity_deadline_state[\s\S]*?end \$\$;/i)![0])
const wiring = read('supabase/migrations/202610040001_source_switch_wiring.sql')
await db.exec(wiring.match(/create or replace view public.opportunity_catalog_universe[\s\S]*?;/i)![0])
// Executes the real deployed SEO read-path definition in an isolated in-memory DB.
await db.exec(read('supabase/migrations/202610080001_seo_universe_read_path.sql'))
const coverage = read('supabase/migrations/202610040002_public_catalog_coverage.sql')
await db.exec(coverage.match(/create or replace function public.catalog_search_text[\s\S]*?\$\$;/i)![0])
await db.exec(coverage.match(/create or replace function public.search_public_opportunities[\s\S]*?end \$\$;/i)![0])
const policies = ['himalayas', 'jobicy', 'future_source_fixture', 'killed_source', 'consumer_killed'].map(source => ({
  source, canonical_source: source, is_enabled: source !== 'killed_source',
  catalog_enabled: source !== 'consumer_killed', seo_enabled: source !== 'consumer_killed',
}))
for (const policy of policies) await db.query('insert into opportunity_sources values($1,$2)', [policy.source, policy])
await db.exec("insert into opportunity_source_identity_aliases values('himalayas','himalayas')")
const facts = {
  title: 'Programme Officer', organization: 'Fixture Organization', description: 'Coordinate programme delivery, monitoring, reporting and stakeholder communications. '.repeat(3),
  source: 'himalayas', opportunity_type: 'job', opportunity_kind: 'empleo', deadline: null,
  location: 'Remote', remote_scope: 'WORLDWIDE', tags: ['programme'], requirements: ['Programme coordination experience'],
  application_url: 'https://example.org/apply', source_url: 'https://example.org/job',
  created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-08T00:00:00Z',
  is_active: true, verification_status: 'verified', catalog_eligible: true, seo_eligible: true,
  match_eligible: true, alerts_eligible: true, private_note: 'must_not_be_public',
}
async function seed(id: string, extra: Record<string, any> = {}, catalog = 'READY', seo = 'READY', lifecycle = 'ACTIVE_VALID') {
  const row = { ...facts, id, slug: id, ...extra }
  await db.query('insert into opportunities select (jsonb_populate_record(null::opportunities,$1::jsonb)).*', [JSON.stringify(row)])
  await db.query('insert into opportunity_universe_state values($1,$2,$3,$4)', [id, lifecycle, catalog, seo])
  return row
}
// Canary A's actual states are unknown. This controlled SEO-only fixture reproduces
// the demonstrated publication/detail split without inventing its PROD row facts.
const a = await seed('canary-a', { slug: 'legal-counsel-locally-recruited-texcoco-mexico-fe96fc8b', title: 'Legal Counsel (locally recruited), Texcoco, Mexico' }, 'NOT_READY')
const b = await seed('canary-b', { slug: 'executive-assistant-recruitment-specialist-permanent-dayshift-remote-au--66b4d43d', title: 'Executive Assistant / Recruitment Specialist' }, 'READY', 'NOT_READY')
const future = await seed('future-public-role', { source: 'future_source_fixture', title: 'Future source role' })
const other = await seed('other-source-role', { source: 'jobicy', title: 'Other source role' })
const alias = await seed('alias-role', { source: ' HIMALAYAS ', title: 'Alias source role' })
const scholarship = await seed('scholarship-role', { opportunity_type: 'scholarship', opportunity_kind: 'beca', title: 'Scholarship role' })
await seed('canonical-not-legacy', { verification_status: 'pending' })
await seed('expired-role', { deadline: '2000-01-01' }) // live deadline veto, even if derived state was stale
await seed('invalid-deadline', { deadline: 'not-a-date' })
for (const [id, extra] of Object.entries({ 'deleted-role': { deleted_at: facts.updated_at }, 'archived-role': { archived_at: facts.updated_at }, 'inactive-role': { is_active: false }, 'unknown-role': {} })) {
  await seed(id, extra, 'NOT_READY', 'NOT_READY', id === 'unknown-role' ? 'LIFECYCLE_UNKNOWN' : 'HARD_DEAD')
}
await seed('source-kill', { source: 'killed_source' })
await seed('consumer-kill', { source: 'consumer_killed' })
for (let n = 0; n < 105; n++) await seed(`paged-${String(n).padStart(4, '0')}`, {}, 'READY', 'NOT_READY')
for (let n = 0; n < 2501; n++) await seed(`seo-page-${String(n).padStart(4, '0')}`, {}, 'NOT_READY', 'READY')
// Existing database identity contract prevents two rows owning the same slug.
await assert.rejects(() => seed('duplicate-id', { slug: a.slug }), /unique|duplicate/i)

const query = async (sql: string, args: any[] = []) => JSON.parse(JSON.stringify((await db.query(sql, args)).rows))
const reads: { relation: string; scope: string; returned: number }[] = []
const transport = {
  rpc: async (name: string, args: any) => ({ data: name === 'get_source_distribution_policy' ? policies
    : await query('select * from search_public_opportunities($1,$2,$3,$4,$5,$6,$7)', [args.p_query, args.p_area, args.p_types, args.p_mode, args.p_after_updated_at, args.p_after_id, args.p_limit]), error: null }),
  from: (relation: string) => {
    assert.ok(['opportunity_catalog_universe', 'opportunity_seo_universe'].includes(relation), 'no raw opportunity fallback')
    let select = '*', slug: string | null = null, ids: string[] | null = null
    const builder = {
      select(c: string) { select = c; return builder },
      eq(field: string, value: string) { assert.equal(field, 'slug'); slug = value; return builder },
      order() { return builder },
      async limit(n: number) {
        assert.equal(n, 1); assert.ok(slug)
        const rows = await query(`select ${select} from ${relation} where slug=$1 order by updated_at desc nulls last,id asc limit 1`, [slug])
        reads.push({ relation, scope: 'exact_slug', returned: rows.length })
        return { data: rows, error: null }
      },
      async in(field: string, values: string[]) {
        assert.equal(field, 'id'); assert.ok(values.length <= 100)
        ids = values
        const rows = await query(`select ${select} from ${relation} where id=any($1::text[])`, [ids])
        reads.push({ relation, scope: 'page_ids', returned: rows.length })
        return { data: rows, error: null }
      },
    }
    return builder
  },
}
const api = createPublicOpportunitiesHandler(() => transport as any)
const event = (params: Record<string, string>) => ({ queryStringParameters: params }) as any
const invoke = async (params: Record<string, string>) => await api(event(params), {} as any, () => {}) as any
const template = '<html><head><title>Home</title><meta name="robots" content="index,follow"><link rel="canonical" href="https://cvitae.lat"><script type="module" src="/assets/app.js"></script></head><body><div id="root">Home snapshot</div></body></html>'
const htmlHandler = createPublicDetailHandler(api, () => template)
const html = async (slug: string, family = 'empleos') => {
  const response = await htmlHandler(new Request(`http://localhost/${family}/${slug}`), { params: { slug } } as any)
  return { statusCode: response.status, headers: { Location: response.headers.get('Location') }, body: await response.text() }
}
assert.deepEqual(detailConfig.path, ['/empleos/:slug', '/oportunidades/:slug'])
assert.equal(detailConfig.preferStatic, true)
assert.deepEqual(detailConfig.method, ['GET'])
assert.doesNotMatch(read('netlify.toml'), /from = "\/(empleos|oportunidades)\/:slug"/)
const detailSource = read('netlify/functions/public-opportunity-detail.ts')
assert.match(detailSource, /context\.params\.slug/)
assert.match(detailSource, /new URL\(request\.url\)\.pathname/)
assert.doesNotMatch(detailSource, /queryStringParameters \|\||\.from\(|slug ===|source ===/)
const injected = await htmlHandler(new Request(`http://localhost/empleos/missing-role?slug=${a.slug}&family=empleos`), { params: { slug: 'missing-role' } } as any)
assert.equal(injected.status, 404, 'query parameters cannot grant native routing identity')
let cursor = '', pages = 0
const listed = new Map<string, any>()
do {
  const result = await invoke({ mode: 'all', ...(cursor ? { cursor } : {}) })
  assert.equal(result.statusCode, 200)
  const rows = JSON.parse(result.body)
  assert.ok(rows.length <= 100)
  for (const row of rows) {
    assert.ok(!listed.has(row.id)); listed.set(row.id, row)
    const detail = await invoke({ mode: 'all', slug: row.slug })
    assert.equal(detail.statusCode, 200); assert.equal(JSON.parse(detail.body).id, row.id)
    assert.equal('private_note' in row, false)
  }
  cursor = result.headers['X-Next-Cursor'] || ''; pages++
} while (cursor)
assert.ok(pages > 1); assert.ok(listed.has('paged-0104'))
assert.ok(!listed.has(a.id), 'SEO door does not force admission into Catalog')
for (const row of [a, b, future, other, alias, scholarship]) {
  const result = await invoke({ mode: 'all', slug: row.slug })
  assert.equal(result.statusCode, 200); assert.equal(JSON.parse(result.body).id, row.id)
  const canonical = canonicalOpportunityPathForRow(row)
  const response = await html(row.slug, canonical.split('/')[1])
  assert.equal(response.statusCode, 200); assert.ok(response.body.includes(row.title))
  assert.ok(response.body.includes(`https://cvitae.lat${canonical}`)); assert.doesNotMatch(response.body, /Home snapshot/)
  assert.equal((response.body.match(/rel="canonical"/g) || []).length, 1)
  assert.match(response.body, /type="module"/)
}
assert.equal(JSON.parse((await invoke({ slug: alias.slug })).body).distribution.canonicalSource, 'himalayas')
assert.equal(evaluateOpportunityDistribution({ ...facts, source: 'future_source_fixture' }, policies).catalog.allowed, false, 'old Registry gate would drop future canonical rows')
assert.equal(JSON.parse((await invoke({ slug: future.slug })).body).distribution.seo.allowed, true)
assert.equal(JSON.parse((await invoke({ slug: b.slug })).body).distribution.seo.allowed, false, 'Catalog-only rows remain noindex')
assert.match((await html(b.slug)).body, /noindex,follow/)
for (const slug of ['expired-role', 'invalid-deadline', 'deleted-role', 'archived-role', 'inactive-role', 'unknown-role', 'source-kill', 'consumer-kill', '__missing_local__']) {
  assert.equal((await invoke({ slug })).statusCode, 404)
  const response = await html(slug)
  assert.equal(response.statusCode, 404); assert.match(response.body, /noindex,follow/)
  assert.doesNotMatch(response.body, /application\/ld\+json|JobPosting/)
  assert.ok(![...listed.values()].some(row => row.slug === slug))
}
const redirect = await html(a.slug, 'oportunidades')
assert.equal(redirect.statusCode, 301); assert.equal(redirect.headers.Location, canonicalOpportunityPathForRow(a))
const deduped = buildSeoInventoryFromUniverse([{ ...a, id: 'old', updated_at: '2026-10-01T00:00:00Z' }, { ...a, id: 'new' }])
assert.equal(deduped.length, 1); assert.equal(deduped[0].id, 'new')
const failedApi = createPublicOpportunitiesHandler(() => ({ ...transport,
  from: () => ({ select: () => ({ eq: () => ({ order: () => ({ order: () => ({ limit: async () => ({ data: null, error: { code: '57014' } }) }) }) }) }) }),
}) as any)
const originalError = console.error
try {
  console.error = () => {}
  assert.equal((await failedApi(event({ slug: a.slug }), {} as any, () => {}) as any).statusCode, 503)
  const unavailable = await createPublicDetailHandler(failedApi, () => template)(new Request(`http://localhost/empleos/${a.slug}`), { params: { slug: a.slug } } as any)
  assert.equal(unavailable.status, 503, 'database errors remain unavailable, not false 404')
} finally { console.error = originalError }
const seoRows = await query('select * from opportunity_seo_universe order by id')
assert.ok(seoRows.length > 2501); assert.ok(seoRows.some(row => row.slug === 'seo-page-2500'))
assert.ok(seoRows.some(row => row.source === 'future_source_fixture'))
if (process.argv.includes('--prepare-fixture') || process.argv.includes('--build')) {
  fs.mkdirSync('.cvitae-state/cable-build', { recursive: true })
  fs.writeFileSync('.cvitae-state/cable-build/public-detail-fixture.json', JSON.stringify({ fromUniverse: true, opportunities: seoRows, policies }))
}
console.log(`PUBLIC_LIST_DETAIL_SQL=PASS catalog_rows=${listed.size} pages=${pages} seo_rows=${seoRows.length} exact_bounded_reads=${reads.length}`)

if (process.argv.includes('--build')) {
  // Keep every server/build read local, including the unrelated public blog and
  // recruiter sitemap reads. Never inherit Supabase production credentials.
  const mock = http.createServer((request, response) => {
    assert.equal(request.method, 'GET')
    response.writeHead(200, { 'Content-Type': 'application/json' }); response.end('[]')
  })
  await new Promise<void>(resolve => mock.listen(0, '127.0.0.1', resolve))
  const env = { ...process.env }
  for (const name of Object.keys(env)) if (/SUPABASE|CVITAE_DB_URL/.test(name)) delete env[name]
  env.VITE_SUPABASE_URL = `http://127.0.0.1:${(mock.address() as any).port}`
  env.VITE_SUPABASE_ANON_KEY = 'local-fixture-public-key'
  env.SEO_INVENTORY_FIXTURE = path.resolve('.cvitae-state/cable-build/public-detail-fixture.json')
  env.PRERENDER_PUBLIC_FIXTURE = path.resolve('scripts/fixtures/prerender-public-fixture.json')
  const derived = ['generated/public-seo-inventory.json', 'generated/source-distribution-policy-snapshot.json']
    .map(file => [file, fs.readFileSync(file)] as const)
  const run = (command: string) => new Promise<void>((resolve, reject) => {
    const child = spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', command], { env, stdio: 'inherit' })
    child.on('error', reject)
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(`${command}: exit ${code}`)))
  })
  try {
    await run('pnpm.cmd build')
    await run('pnpm.cmd exec tsx scripts/verify-seo-build-parity.ts')
    console.log('FIXTURE_BUILD=PASS production_credentials=REMOVED sitemap_reads=LOCAL_FIXTURE')
  } finally {
    for (const [file, bytes] of derived) fs.writeFileSync(file, bytes)
    await new Promise<void>(resolve => mock.close(() => resolve()))
  }
}

if (process.argv.includes('--browser')) {
  assert.ok(fs.existsSync('dist/index.html'), 'run the fixture build first')
  let reproduceOldFailure = false
  // Fixture transport only. Netlify Dev itself decides static/function/SPA routing.
  const server = http.createServer(async (request, response) => {
    try {
      assert.equal(request.method, 'GET', 'browser test forbids writes')
      const url = new URL(request.url!, 'http://localhost')
      let result: any
      if (url.pathname === '/api') {
        const params = Object.fromEntries(url.searchParams)
        result = reproduceOldFailure && params.slug === a.slug
          ? { statusCode: 404, body: '{"error":"not_found"}', headers: { 'Content-Type': 'application/json' } }
          : await invoke(params)
      } else if (/^\/sitemap[^/]*\.xml$/.test(url.pathname)) {
        result = { statusCode: 200, headers: { 'Content-Type': 'application/xml' }, body: fs.readFileSync(path.join('dist', url.pathname.slice(1))) }
      } else result = { statusCode: 404, body: 'Not found' }
      response.writeHead(result.statusCode, result.headers || {}); response.end(result.body)
    } catch (error) { response.writeHead(500); response.end(String(error)) }
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const fixtureOrigin = `http://127.0.0.1:${(server.address() as any).port}`
  const freePort = async () => {
    const probe = http.createServer()
    await new Promise<void>(resolve => probe.listen(0, '127.0.0.1', resolve))
    const port = (probe.address() as any).port
    await new Promise<void>(resolve => probe.close(() => resolve()))
    return port
  }
  const port = await freePort(), functionsPort = await freePort()
  const origin = `http://localhost:${port}`
  const fixtureFunctions = '.cvitae-state/native-detail-functions'
  fs.mkdirSync(fixtureFunctions, { recursive: true })
  // Bundle the unchanged production factory for the local harness. Netlify Dev
  // otherwise tries Windows package symlinks requiring developer/admin mode.
  const require = createRequire(import.meta.url)
  const esbuild = createRequire(require.resolve('vite'))('esbuild')
  await esbuild.build({
    stdin: { contents: "export { createPublicDetailHandler } from './netlify/functions/public-opportunity-detail.ts'", resolveDir: process.cwd(), loader: 'ts' },
    bundle: true, platform: 'node', format: 'esm', tsconfigRaw: {},
    outfile: '.cvitae-state/native-detail-runtime.mjs',
  })
  // Copy the exact production config declaration, rather than a test routing model.
  const nativeConfig = detailSource.match(/export const config: Config = \{[\s\S]*?\n\}/)![0]
  fs.writeFileSync(`${fixtureFunctions}/public-opportunity-detail.ts`, `
import type { Config } from '@netlify/functions'
import { createPublicDetailHandler } from '../native-detail-runtime.mjs'
${nativeConfig}
const readPublic = async (event: any) => {
  const response = await fetch(${JSON.stringify(fixtureOrigin)} + '/api?' + new URLSearchParams(event.queryStringParameters))
  return { statusCode: response.status, headers: Object.fromEntries(response.headers), body: await response.text() }
}
const detail = createPublicDetailHandler(readPublic as any)
export default async (request: Request, context: any) => {
  const response = await detail(request, context)
  response.headers.set('X-Local-Detail-Function', 'native')
  return response
}
`)
  fs.writeFileSync(`${fixtureFunctions}/public-opportunities.mjs`, `
export const handler = async event => {
  const response = await fetch(${JSON.stringify(fixtureOrigin)} + '/api?' + new URLSearchParams(event.queryStringParameters))
  return { statusCode: response.status, headers: Object.fromEntries(response.headers), body: await response.text() }
}
`)
  fs.writeFileSync(`${fixtureFunctions}/sitemap.mjs`, `
export const handler = async event => {
  const response = await fetch(${JSON.stringify(fixtureOrigin)} + new URL(event.rawUrl).pathname)
  return { statusCode: response.status, headers: Object.fromEntries(response.headers), body: await response.text() }
}
`)
  const devEnv = { ...process.env }
  for (const name of Object.keys(devEnv)) if (/SUPABASE|CVITAE_DB_URL|NETLIFY_AUTH_TOKEN|NETLIFY_SITE_ID/.test(name)) delete devEnv[name]
  devEnv.CVITAE_PROD_RELEASE_VALIDATED = 'false'
  const dev = spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c',
    `netlify.cmd dev --offline --skip-gitignore --geo mock --no-open --framework #static --dir dist --functions ${fixtureFunctions} --port ${port} --functions-port ${functionsPort}`],
    { env: devEnv, stdio: ['ignore', 'pipe', 'pipe'] })
  let devOutput = '', devExited = false
  dev.stdout.on('data', chunk => { devOutput = (devOutput + chunk).slice(-16000) })
  dev.stderr.on('data', chunk => { devOutput = (devOutput + chunk).slice(-16000) })
  dev.on('exit', () => { devExited = true })
  const stopDev = async () => {
    if (devExited) return
    await new Promise<void>((resolve, reject) => {
      const executable = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'taskkill.exe')
      const stop = spawn(executable, ['/PID', String(dev.pid), '/T', '/F'], { stdio: 'ignore' })
      stop.on('error', reject)
      stop.on('exit', code => code === 0 || code === 128 ? resolve() : reject(new Error(`Netlify Dev cleanup: exit ${code}`)))
    })
  }
  try {
    const deadline = Date.now() + 300000
    while (true) {
      if (devExited || Date.now() > deadline) throw new Error(`Netlify Dev failed to start: ${devOutput}`)
      try { if ((await fetch(origin + '/', { signal: AbortSignal.timeout(1000) })).status === 200) break } catch {}
      await new Promise(resolve => setTimeout(resolve, 500))
    }
    console.log('NETLIFY_DEV=READY offline=true fixture_functions=true')
  } catch (error) {
    await stopDev(); await new Promise<void>(resolve => server.close(() => resolve())); throw error
  }
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext()
  await context.route('**/*', route => {
    const request = route.request()
    if (new URL(request.url()).origin !== origin || request.method() !== 'GET') return route.abort()
    return route.continue()
  })
  const page = await context.newPage()
  const fatal: string[] = []
  page.on('pageerror', error => fatal.push(error.message))
  try {
    for (const row of [a, b, future, other, scholarship, listed.get('paged-0104')]) {
      const canonical = canonicalOpportunityPathForRow(row)
      const apiResponse = page.waitForResponse(response => response.url().includes('/.netlify/functions/public-opportunities?') && new URL(response.url()).searchParams.get('slug') === row.slug)
      const document = await page.goto(`${origin}${canonical}/`)
      assert.equal(document!.status(), 200)
      const hasStatic = fs.existsSync(path.join('dist', canonical, 'index.html'))
      assert.equal(document!.headers()['x-local-detail-function'], hasStatic ? undefined : 'native', 'static prerender wins; missing static uses native function')
      assert.equal((await apiResponse).status(), 200)
      await page.getByRole('heading', { name: row.title, exact: true }).waitFor()
      // Wait for the live component, not the pre-hydration snapshot.
      await page.getByText('Volver a empleos', { exact: true }).first().waitFor().catch(async () => {
        await page.getByText('Volver a oportunidades', { exact: true }).first().waitFor()
      })
      assert.equal(await page.getByText(/ya no est[áa] activ[oa] o no existe/).count(), 0)
      const canonicalUrls = await page.locator('link[rel="canonical"]').evaluateAll(elements => elements.map(element => element.getAttribute('href')))
      assert.ok(canonicalUrls.length > 0 && canonicalUrls.every(url => url === `https://cvitae.lat${canonical}`))
      for (const text of await page.locator('script[type="application/ld+json"]').allTextContents()) JSON.parse(text)
      if (row.id === b.id) assert.match(await page.locator('meta[name="robots"]').last().getAttribute('content') || '', /noindex/)
    }
    const missingApi = page.waitForResponse(response => response.url().includes('slug=missing-browser-role'))
    const missing = await page.goto(`${origin}/empleos/missing-browser-role/`)
    assert.equal(missing!.status(), 404); assert.equal((await missingApi).status(), 404)
    await page.getByText('Este empleo ya no está activo o no existe.').waitFor()
    assert.match(await page.locator('meta[name="robots"]').last().getAttribute('content') || '', /noindex/)
    assert.equal(await page.locator('script[type="application/ld+json"]').count(), 0)
    assert.equal(missing!.headers()['x-local-detail-function'], 'native')
    // Exercise actual deployed output/config, including unrelated route priority.
    for (const route of ['/empleos/', '/dashboard', '/auth/callback']) {
      const response = await fetch(origin + route)
      assert.equal(response.status, 200, route)
      assert.match(await response.text(), /<html/i)
      assert.equal(response.headers.get('x-local-detail-function'), null)
    }
    const rootXml = await fetch(origin + '/sitemap.xml')
    assert.equal(rootXml.status, 200); assert.match(await rootXml.text(), /<sitemapindex/)
    const childXml = await fetch(origin + '/sitemap-static.xml')
    assert.equal(childXml.status, 200); assert.match(await childXml.text(), /<urlset/)
    const asset = read('dist/index.html').match(/src="(\/assets\/[^" ]+\.js)"/)![1]
    const assetResponse = await fetch(origin + asset)
    assert.equal(assetResponse.status, 200); assert.equal(assetResponse.headers.get('x-local-detail-function'), null)
    // Negative control: the same prerendered 200 with the old Catalog-only 404
    // destroys its content during hydration. This test detects the PROD defect.
    reproduceOldFailure = true
    const oldApi = page.waitForResponse(response => response.url().includes(`slug=${a.slug}`))
    const oldDocument = await page.goto(`${origin}${canonicalOpportunityPathForRow(a)}/`)
    assert.equal(oldDocument!.status(), 200); assert.equal((await oldApi).status(), 404)
    await page.getByText('Este empleo ya no está activo o no existe.').waitFor()
    assert.equal(await page.getByRole('heading', { name: a.title, exact: true }).count(), 0)
    assert.deepEqual(fatal, [], 'no fatal browser errors')
    console.log('NATIVE_ROUTING=PASS static_precedence=PASS catalog_first=PASS catalog_page_2=PASS missing_404=PASS list=PASS spa=PASS sitemap=PASS auth=PASS assets=PASS')
    console.log('PRERENDER_HYDRATION=PASS canary_a=PASS canary_b=PASS future_source=PASS page_2=PASS missing_404=PASS old_contract_negative_control=REPRODUCED')
  } finally {
    await browser.close(); await stopDev(); await new Promise<void>(resolve => server.close(() => resolve()))
  }
}
await db.close()
