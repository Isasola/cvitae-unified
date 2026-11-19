/** Real ProfileBuilder + real b2c-profile/Supabase SDK; only external auth,
 * PostgREST and private storage use synthetic, file-persisted local transport.
 * No remote provider or production service is exercised. */
import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import { chromium, expect as baseExpect, type Page } from '@playwright/test'
const expect = baseExpect.configure({ timeout: 30_000 })

const root = process.cwd()
const artifact = resolve(root, '.cvitae-state/b2c-profile-journey')
mkdirSync(artifact, { recursive: true })
const baseline = process.argv.includes('--prove-baseline')
const users = [
  { id: '11111111-1111-4111-8111-111111111111', email: 'candidate-a@example.invalid' },
  { id: '22222222-2222-4222-8222-222222222222', email: 'candidate-b@example.invalid' },
]
const token = (index: number) => `${Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify({ sub: users[index].id, exp: 4102444800 })).toString('base64url')}.${Buffer.from('fixture-signature').toString('base64url')}`
const rows: any[] = []
const objects = new Map<string, Buffer>()
const calls: any[] = []
const checks: string[] = []
let failRead = false, failWrite = false, failStorage = false, expired = false
const seed = () => {
  rows.splice(0, rows.length, { id: 'profile-a', user_id: users[0].id, email: users[0].email, full_name: 'Fixture existing candidate', professional_title: 'Developer', summary: 'Explicit existing summary', profile_data: { habilidades: ['SQL'], location: '', experience: [], languages: [] } })
  objects.clear()
}
const persist = () => writeFileSync(resolve(artifact, 'synthetic-persistence.json'), JSON.stringify({ rows, objects: [...objects.keys()] }, null, 2))
const ok = (name: string) => { checks.push(name); console.log(`PASS ${name}`) }
const json = (data: any, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
const nativeFetch = globalThis.fetch
let origin = ''

async function external(request: Request): Promise<Response> {
  const url = new URL(request.url), path = url.pathname.replace('/fixture-supabase', '')
  const method = request.method
  calls.push({ path, method }) // Deliberately omit Authorization and request body.
  if (path === '/auth/v1/user') {
    const index = [0, 1].find(i => request.headers.get('authorization') === `Bearer ${token(i)}`)
    return index === undefined || expired ? json({ message: 'Invalid fixture session' }, 401) : json(users[index])
  }
  if (path === '/rest/v1/rpc/consume_api_rate_limit') return json([{ allowed: true, remaining: 39, retry_after_seconds: 0 }])
  if (path === '/functions/v1/embed-profile') return json({ fixture: 'external embedding boundary only' })
  if (path.startsWith('/rest/v1/')) {
    const table = path.split('/').pop()
    if (table === 'matching_diagnostic_snapshots') return json([])
    assert.equal(table, 'user_master_profiles', 'fixture refuses unexpected tables')
    if (method === 'GET' && failRead) return json({ message: 'Fixture read unavailable' }, 503)
    if (method !== 'GET' && failWrite) return json({ message: 'Fixture DB write unavailable' }, 503)
    let selected = rows.filter(row => [...url.searchParams].every(([key, value]) => {
      if (value.startsWith('eq.')) return String(row[key]) === value.slice(3)
      if (value === 'is.null') return row[key] == null
      return true
    }))
    if (method === 'POST') {
      const incoming = await request.json()
      const row = { id: `profile-${rows.length + 1}`, profile_data: {}, ...incoming }
      rows.push(row); selected = [row]; persist()
    }
    if (method === 'PATCH') {
      const incoming = await request.json()
      selected.forEach(row => Object.assign(row, incoming)); persist()
    }
    const fields = url.searchParams.get('select')?.split(',')
    const projected = selected.map(row => fields ? Object.fromEntries(fields.filter(field => field in row).map(field => [field, row[field]])) : row)
    return json(request.headers.get('accept')?.includes('vnd.pgrst.object') ? projected[0] ?? null : projected)
  }
  const bucket = '/storage/v1/object/'
  if (path.startsWith(bucket)) {
    if (failStorage) return json({ message: 'Fixture storage unavailable' }, 503)
    const name = path.slice(bucket.length)
    if (name === 'list/candidate-cvs') {
      const body = await request.json()
      return json([...objects.keys()].filter(key => key.startsWith(`${body.prefix}/`)).map(key => ({ name: key.split('/').pop() })))
    }
    if (name.startsWith('sign/candidate-cvs/')) {
      return json({ signedURL: `/object/sign/${name.slice(5)}?token=fixture-private-link` })
    }
    if (name === 'candidate-cvs' && method === 'DELETE') {
      const body = await request.json()
      body.prefixes.forEach((key: string) => objects.delete(key)); persist(); return json([])
    }
    assert(name.startsWith('candidate-cvs/'))
    const key = name.slice('candidate-cvs/'.length)
    objects.set(key, Buffer.from(await request.arrayBuffer())); persist()
    return json({ Key: name, Id: 'fixture-object' })
  }
  throw new Error(`Unsupported external fixture request ${method} ${path}`)
}

globalThis.fetch = async (input, init) => {
  const request = new Request(input, init)
  const url = new URL(request.url)
  if (!['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error(`Outbound network blocked: ${url.hostname}`)
  if (url.pathname.startsWith('/fixture-supabase')) return external(request)
  return nativeFetch(input, init)
}

const vite = await createServer({
  root, configFile: false, envFile: false, plugins: [react(), {
    name: 'b2c-profile-journey-entry',
    resolveId(id) { if (id === '/b2c-profile-journey-entry.tsx') return '\0b2c-profile-journey-entry' },
    load(id) {
      if (id !== '\0b2c-profile-journey-entry') return
      return `import React from 'react'; import {createRoot} from 'react-dom/client'; import {HelmetProvider} from 'react-helmet-async'; import ProfileBuilder from '${root.replace(/\\/g, '/')}/src/hub/ProfileBuilder.tsx'; createRoot(document.getElementById('root')).render(React.createElement(HelmetProvider,null,React.createElement(ProfileBuilder)));`
    },
  }],
  resolve: { alias: { '@': resolve(root, 'src') } },
  optimizeDeps: { entries: [], include: ['react', 'react-dom/client', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'react-helmet-async', 'framer-motion', 'lucide-react', 'wouter', '@supabase/supabase-js', 'heic-to/csp', 'mammoth'] },
  server: { host: '127.0.0.1', port: 0 },
  define: { 'import.meta.env.VITE_SUPABASE_URL': 'globalThis.__fixtureSupabaseUrl', 'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('fixture-anon-key') },
})
let handler: any
vite.middlewares.use(async (req, res, next) => {
  if (!req.url) return next()
  const pathname = req.url.split('?')[0]
  if (pathname === '/.netlify/functions/b2c-profile' || pathname.startsWith('/fixture-supabase')) {
    try {
      const chunks: Buffer[] = []
      for await (const chunk of req) chunks.push(Buffer.from(chunk))
      const body = Buffer.concat(chunks)
      if (pathname.startsWith('/fixture-supabase')) {
        const response = await external(new Request(`${origin}${req.url}`, { method: req.method, headers: req.headers as any, ...(body.length ? { body } : {}) }))
        res.statusCode = response.status; res.setHeader('Content-Type', 'application/json'); res.end(await response.text()); return
      }
      const result = await handler({ httpMethod: req.method, headers: req.headers, body: body.toString() })
      res.statusCode = result.statusCode
      Object.entries(result.headers).forEach(([key, value]) => res.setHeader(key, value as string))
      res.end(result.body); return
    } catch (error) { res.statusCode = 500; res.end(String(error)); return }
  }
  if (pathname.startsWith('/.netlify/functions/')) { res.statusCode = 503; res.end('{}'); return }
  if (pathname === '/mi-carrera/perfil' || pathname === '/mi-carrera/postular/fixture-opportunity') {
    const html = await vite.transformIndexHtml(req.url, `<html><head></head><body><div id="root"></div><script>globalThis.__fixtureSupabaseUrl=${JSON.stringify(origin + '/fixture-supabase')}</script><script type="module" src="/b2c-profile-journey-entry.tsx"></script></body></html>`)
    res.setHeader('Content-Type', 'text/html'); res.end(html); return
  }
  next()
})
// Connect's existing SPA fallback would otherwise serve the repository App.
const stack = (vite.middlewares as any).stack
stack.unshift(stack.pop())
await vite.listen()
origin = `http://127.0.0.1:${(vite.httpServer!.address() as any).port}`
Object.assign(process.env, { SUPABASE_URL: origin + '/fixture-supabase', SUPABASE_SERVICE_ROLE_KEY: 'fixture-service-key', SUPABASE_KEY: 'fixture-anon-key', SITE_URL: origin })
;({ handler } = await import('../netlify/functions/b2c-profile'))
const browser = await chromium.launch({ headless: true })
const api = async (action: string, body: any = {}, user = 0) => {
  const result = await handler({ httpMethod: 'POST', headers: { origin, authorization: `Bearer ${token(user)}` }, body: JSON.stringify({ action, ...body }) })
  return { status: result.statusCode, body: JSON.parse(result.body) }
}
const open = async (user = 0) => {
  const context = await browser.newContext()
  await context.route('**/*', route => ['localhost', '127.0.0.1'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort())
  await context.addInitScript(({ token, user }) => {
    localStorage.setItem('sb-127-auth-token', JSON.stringify({ access_token: token, refresh_token: 'fixture-refresh', expires_at: 4102444800, expires_in: 31536000, token_type: 'bearer', user }))
    sessionStorage.setItem('cvitae_application_return_to_v1', '/mi-carrera/postular/fixture-opportunity')
  }, { token: token(user), user: users[user] })
  const page = await context.newPage()
  page.on('pageerror', error => console.error('Browser error:', error.message))
  page.on('console', message => { if (message.type() === 'error') console.error('Browser console:', message.text().slice(0, 300)) })
  const initialStatus = page.waitForResponse(response => response.url().endsWith('/.netlify/functions/b2c-profile') && response.request().postDataJSON()?.action === 'status')
  await page.goto(origin + '/mi-carrera/perfil')
  await initialStatus
  return { context, page }
}
const nameInput = (page: Page) => page.getByPlaceholder(/Nombre completo/)
const review = async (page: Page) => {
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Siguiente' }).click()
}
try {
  seed()
  if (baseline) {
    failRead = true
    const { context, page } = await open()
    await expect(nameInput(page)).toBeVisible()
    await expect(nameInput(page)).toBeEnabled()
    await expect(nameInput(page)).toHaveValue('')
    failRead = false
    await review(page)
    await page.getByRole('button', { name: 'Finalizar y ver matches' }).click()
    await expect(page.getByRole('button', { name: '¡Perfil guardado!' })).toBeVisible()
    assert.equal(rows[0].full_name, '', 'baseline demonstrably overwrites existing profile after ignored status error')
    await page.screenshot({ path: resolve(artifact, 'baseline-overwrite.png') })
    ok('BASELINE_REGRESSION_DEMONSTRATED: status DB failure silently permits empty overwrite')
    await context.close()
  } else {
    // Existing data / failed initial load / honest recovery.
    failRead = true
    const recovery = await open()
    await expect(recovery.page.getByRole('alert')).toContainText('No pudimos')
    await expect(nameInput(recovery.page)).toHaveCount(0)
    assert.equal(rows[0].full_name, 'Fixture existing candidate')
    await recovery.page.screenshot({ path: resolve(artifact, 'load-error.png') })
    failRead = false
    await recovery.page.getByRole('button', { name: 'Reintentar' }).click()
    await expect(nameInput(recovery.page)).toHaveValue('Fixture existing candidate')
    ok('existing profile: failed status blocks blank editing; retry restores persisted values')
    await recovery.context.close()

    const network = await open()
    await expect(nameInput(network.page)).toHaveValue('Fixture existing candidate')
    await network.context.route('**/.netlify/functions/b2c-profile', route => route.abort())
    await network.page.reload()
    await expect(network.page.getByRole('alert')).toBeVisible()
    await expect(nameInput(network.page)).toHaveCount(0)
    await network.context.unroute('**/.netlify/functions/b2c-profile')
    await network.page.getByRole('button', { name: 'Reintentar' }).click()
    await expect(nameInput(network.page)).toHaveValue('Fixture existing candidate')
    ok('status network rejection visible and retryable')
    await network.context.close()

    expired = true
    const expiredLoad = await open()
    await expect(expiredLoad.page.getByRole('alert')).toContainText(/sesi[oó]n/i)
    await expect(nameInput(expiredLoad.page)).toHaveCount(0)
    expired = false
    await expiredLoad.page.getByRole('button', { name: 'Reintentar' }).click()
    await expect(nameInput(expiredLoad.page)).toHaveValue('Fixture existing candidate')
    await expiredLoad.context.close()
    ok('expired initial session cannot edit blank profile; session recovery retries real status')

    // Future draft: handler produces state; UI explicitly confirms then saves/reloads.
    rows.splice(0); persist()
    const extracted = { full_name: 'Fixture imported candidate', professional_title: 'Data analyst', skills: ['SQL', 'Python'], location: '', education: [], experience: [{ role: 'Analyst', company: 'Fixture Co', start_date: '2024' }], languages: [] }
    const draft = await api('save_import_draft', { extracted, source_file_name: 'fixture.pdf' })
    assert.equal(draft.status, 200)
    assert.equal(rows[0].profile_data.onboarding_status, 'needs_review')
    assert.equal(rows[0].profile_data.candidate_truth, undefined)
    const journey = await open()
    await expect(nameInput(journey.page)).toHaveValue(extracted.full_name)
    await nameInput(journey.page).fill('Fixture confirmed candidate')
    await review(journey.page)
    failWrite = true
    await journey.page.getByRole('button', { name: 'Finalizar y ver matches' }).click()
    await expect(journey.page.getByRole('alert')).toContainText('No pudimos')
    assert.equal(rows[0].profile_data.onboarding_status, 'needs_review')
    assert(journey.page.url().includes('/mi-carrera/perfil'))
    await expect(journey.page.getByRole('button', { name: '¡Perfil guardado!' })).toHaveCount(0)
    ok('save DB failure: no false success or redirect; draft survives')
    failWrite = false
    await journey.page.getByRole('button', { name: 'Finalizar y ver matches' }).click()
    await expect(journey.page.getByRole('button', { name: '¡Perfil guardado!' })).toBeVisible()
    assert.equal(rows[0].full_name, 'Fixture confirmed candidate')
    assert.equal(rows[0].profile_data.cv_import_draft, null)
    assert.equal(rows[0].profile_data.candidate_truth.evidence.skills, 'USER_CONFIRMED')
    assert.equal(rows[0].profile_data.candidate_truth.evidence.location, 'UNKNOWN')
    assert.equal(rows[0].profile_data.candidate_eligibility.evidence.residence_country, 'UNKNOWN')
    assert.deepEqual(rows[0].profile_data.experience, extracted.experience)
    assert.equal(JSON.parse(readFileSync(resolve(artifact, 'synthetic-persistence.json'), 'utf8')).rows[0].full_name, 'Fixture confirmed candidate')
    await expect(journey.page).toHaveURL(origin + '/mi-carrera/postular/fixture-opportunity')
    await journey.page.goto(origin + '/mi-carrera/perfil')
    await expect(nameInput(journey.page)).toHaveValue('Fixture confirmed candidate')
    await journey.page.reload()
    await expect(nameInput(journey.page)).toHaveValue('Fixture confirmed candidate')
    await journey.page.screenshot({ path: resolve(artifact, 'confirmed-reloaded.png') })
    ok('save_import_draft → explicit UI confirmation → save → return intent → real reload; factual provenance/UNKNOWN survive')

    expired = true
    await review(journey.page)
    await journey.page.getByRole('button', { name: 'Finalizar y ver matches' }).click()
    await expect(journey.page.getByRole('alert')).toContainText(/sesi[oó]n/i)
    assert.equal((await api('save', { profile: { full_name: 'Forbidden expired mutation' } })).status, 401)
    expired = false
    ok('expired server session: honest visible error and no mutation')
    await journey.context.close()

    const previous = JSON.stringify(rows[0])
    const otherStatus = await api('status', { user_id: users[0].id, profile_id: rows[0].id }, 1)
    assert.equal(otherStatus.body.profile, null)
    const otherSave = await api('save', { user_id: users[0].id, profile_id: rows[0].id, profile: { full_name: 'Second fixture candidate' } }, 1)
    assert.equal(otherSave.status, 200)
    assert.equal(JSON.stringify(rows[0]), previous)
    assert.equal(rows[1].user_id, users[1].id)
    const otherBrowser = await open(1)
    await expect(nameInput(otherBrowser.page)).toHaveValue('Second fixture candidate')
    await otherBrowser.context.close()
    ok('ownership: body spoof cannot read/write another profile; second user UI reload is isolated')

    // Delay a genuine A status response, switch the real browser auth client to
    // B, then deliver A's old response after B has loaded. No handler JSON stub.
    const stale = await open()
    let held!: () => void, release!: () => void
    const heldResponse = new Promise<void>(resolve => { held = resolve })
    const releasedResponse = new Promise<void>(resolve => { release = resolve })
    let delayed = false
    await stale.context.route('**/.netlify/functions/b2c-profile', async route => {
      if (!delayed && route.request().postDataJSON()?.action === 'status' && route.request().headers().authorization === `Bearer ${token(0)}`) {
        delayed = true
        const response = await route.fetch()
        held()
        await releasedResponse
        await route.fulfill({ response })
      } else await route.continue()
    })
    await stale.page.reload()
    await heldResponse
    await expect(stale.page.getByRole('status', { name: '' })).toContainText('Cargando tu perfil')
    await expect(nameInput(stale.page)).toHaveCount(0)
    await stale.page.evaluate(async credentials => {
      const modulePath = '/src/lib/supabase.ts'
      const { supabase } = await import(modulePath)
      const result = await supabase.auth.setSession(credentials)
      if (result.error) throw result.error
    }, { access_token: token(1), refresh_token: 'fixture-refresh-b' })
    await expect(nameInput(stale.page)).toHaveValue('Second fixture candidate')
    release()
    await stale.page.waitForResponse(response => response.url().endsWith('/.netlify/functions/b2c-profile') && response.request().headers().authorization === `Bearer ${token(0)}`)
    await expect(nameInput(stale.page)).toHaveValue('Second fixture candidate')
    await stale.context.close()
    ok('loading gate and auth switch: late old-user status cannot replace new-user profile')

    const pdf = Buffer.from('%PDF-1.4\nfixture private CV').toString('base64')
    failStorage = true
    assert.equal((await api('upload_cv', { file_name: 'fixture.pdf', file_base64: pdf })).status, 500)
    assert.equal(objects.size, 0)
    failStorage = false
    const uploaded = await api('upload_cv', { file_name: 'fixture.pdf', file_base64: pdf, cv_text: 'Fixture factual text' })
    assert.equal(uploaded.status, 200)
    assert.equal(uploaded.body.profile.has_cv, true)
    assert.equal(uploaded.body.profile.cv_storage_path, undefined)
    assert(rows[0].cv_storage_path.startsWith(`profiles/${users[0].id}/`))
    assert.equal(rows[0].cv_text, 'Fixture factual text')
    assert.equal(objects.size, 1)
    const download = await api('download_cv')
    assert.equal(download.status, 200)
    assert.equal(download.body.expires_in, 600)
    assert.equal((await api('download_cv', {}, 1)).status, 404)
    const storedPath = rows[0].cv_storage_path
    failWrite = true
    assert.equal((await api('upload_cv', { file_name: 'replacement.pdf', file_base64: pdf })).status, 500)
    failWrite = false
    assert.equal(objects.size, 1)
    assert.equal(rows[0].cv_storage_path, storedPath)
    assert(objects.has(storedPath))
    const uploadUI = await open()
    await expect(uploadUI.page.getByText('fixture.pdf', { exact: true })).toBeVisible()
    await uploadUI.context.close()
    objects.delete(storedPath)
    assert.equal((await api('download_cv')).body.code, 'CV_FILE_MISSING')
    delete rows[0].cv_storage_path; persist()
    assert.equal((await api('download_cv')).body.code, 'CV_REUPLOAD_REQUIRED')
    const legacyUI = await open()
    await expect(legacyUI.page.getByText(/El archivo anterior no se conservó/)).toBeVisible()
    await expect(legacyUI.page.getByRole('button', { name: 'Descargar', exact: true })).toHaveCount(0)
    await legacyUI.context.close()
    assert.equal((await api('upload_cv', { file_name: 'fixture.exe', file_base64: pdf })).status, 400)
    assert.equal((await api('upload_cv', { file_name: 'fixture.pdf', file_base64: Buffer.from('not a PDF').toString('base64') })).status, 400)
    ok('private CV: storage/DB failure compensation, metadata/reload, scoped download, missing original and invalid bytes')
  }
  writeFileSync(resolve(artifact, baseline ? 'baseline-regression.json' : 'result.json'), JSON.stringify({ status: 'PASS', evidence: 'LOCAL_FIXTURE', real: ['ProfileBuilder in Chromium', 'b2c-profile handler', 'Supabase SDK', 'browser auth SDK', 'file-persisted synthetic state', 'reload'], fakeExternalTransport: ['auth verification', 'PostgREST', 'private storage', 'embedding boundary'], checks, requests: calls, productionValidated: false }, null, 2))
  console.log(`verify_b2c_profile_journey: PASS ${checks.length} checks; artifacts ${artifact}; LOCAL_FIXTURE only`)
} finally {
  await browser.close()
  await vite.close()
  globalThis.fetch = nativeFetch
}
