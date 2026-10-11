import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium } from '@playwright/test'
import { createServer as createViteServer } from 'vite'
import { state, reset, userA, userB, opportunity } from './b2c-application-boundary'

const require = createRequire(import.meta.url)
const { build } = createRequire(require.resolve('tsx/package.json'))('esbuild')
const baseline = process.argv.includes('--baseline')
const output = resolve('.cvitae-state/b2c-application-journey')
mkdirSync(output, { recursive: true })
const evidence: any = { status: 'RUNNING', baseline, runtime: process.version, cases: [], limits: ['LOCAL external-boundary adapter; no real Supabase/PostgreSQL/RLS/locks/SQL atomicity, Bedrock, email, deployment or PROD validation. PDF uses actual html2canvas/jsPDF in Chromium.'] }
const record = (name: string, details?: any) => { evidence.cases.push({ name, status: 'PASS', ...details }); console.log(`PASS ${name}`) }
process.env.CVITAE_RATE_LIMIT_SALT = 'local-fixture-only'
process.env.SITE_URL = 'http://127.0.0.1:5173'

const boundaryPath = resolve('scripts/b2c-application-boundary.ts')
await build({ entryPoints: ['netlify/functions/application-workspace.ts'], outfile: resolve(output, 'handler.mjs'), bundle: true, platform: 'node', format: 'esm', packages: 'external', plugins: [{ name: 'external-boundaries', setup(builder: any) {
  builder.onResolve({ filter: /\/\_supabase$|^\.\/_supabase$|^\.\.\/_supabase$/ }, () => ({ path: 'supabase', namespace: 'local-boundary' }))
  builder.onResolve({ filter: /^@aws-sdk\/client-bedrock-runtime$/ }, () => ({ path: 'bedrock', namespace: 'local-boundary' }))
  builder.onLoad({ filter: /.*/, namespace: 'local-boundary' }, (args: any) => ({ contents: args.path === 'supabase'
    ? `import {database,anonymous} from ${JSON.stringify(boundaryPath)}; export const makeSupabaseAdmin=()=>database;export const makeSupabaseAnon=()=>anonymous;`
    : `import {model} from ${JSON.stringify(boundaryPath)};export class BedrockRuntimeClient {send(command){return model(command)}};export class InvokeModelCommand{constructor(input){this.input=input}};`, loader: 'ts' }))
  // Preserve one shared adapter instance with the verifier, rather than bundling
  // a second state store into the handler.
  builder.onResolve({ filter: /b2c-application-boundary\.ts$/ }, () => ({ path: pathToFileURL(boundaryPath).href, external: true }))
} }] })
const { handler, normalizeApplicationResult } = await import(pathToFileURL(resolve(output, 'handler.mjs')).href)
async function call(body: any, token = 'token-a') {
  const result = await handler({ httpMethod: 'POST', headers: { origin: 'http://127.0.0.1:5173', authorization: `Bearer ${token}` }, body: JSON.stringify(body) })
  return { status: result.statusCode, payload: JSON.parse(result.body) }
}
const prepareBody = { action: 'prepare', opportunitySlug: opportunity.slug, sourceVersionId: 'source-a' }
async function prepared() { const result = await call(prepareBody); assert.equal(result.status, 200); return result.payload.workspaceId }
const sourceBefore = structuredClone(state.tables.generated_cvs)

try {
  assert.equal((await call({ action: 'overview' }, '')).status, 401)
  assert.equal((await call({ action: 'overview' }, 'invalid')).status, 401)
  record('auth missing/invalid 401')
  let result = await call({ action: 'overview', opportunitySlug: opportunity.slug })
  assert.deepEqual(result.payload.versions.map((row: any) => row.id), ['source-a', 'source-a-older'])
  record('existing source versions scoped to authenticated user')
  state.tables.cv_evidence_items[0].status = 'pending'
  assert.equal((await call(prepareBody)).status, 409); assert.equal(state.modelCalls, 0); assert.equal(state.tables.application_workspaces.length, 0)
  state.tables.cv_evidence_items[0].status = 'confirmed'
  record('pending evidence blocks prepare before provider/persistence')
  assert.equal((await call({ ...prepareBody, sourceVersionId: 'source-b' })).status, 404)
  state.canonical = false
  assert.equal((await call(prepareBody)).status, 404)
  state.canonical = true
  record('other user source CV and withdrawn canonical opportunity unavailable')
  state.fail.provider = true
  assert.equal((await call(prepareBody)).status, 500); assert.equal(state.tables.application_workspaces.length, 0)
  record('provider failure persists no document')
  state.fail.unbacked = true
  assert.equal((await call(prepareBody)).status, 422)
  assert.equal(state.tables.application_workspaces.length, 0); assert.deepEqual(state.tables.generated_cvs, sourceBefore)
  record('provider ungrounded candidate text returns 422 without workspace/version before valid retry')
  state.fail.insert = true
  assert.equal((await call(prepareBody)).status, 500); assert.equal(state.tables.application_workspaces.length, 0)
  const workspaceId = await prepared()
  const workspace = state.tables.application_workspaces[0]
  assert.equal(workspace.source_version_id, 'source-a'); assert.equal(workspace.source_content_hash, 'source-hash-a')
  assert.deepEqual(state.tables.generated_cvs, sourceBefore)
  assert.equal(workspace.requirement_analysis.length, 2)
  assert.equal(workspace.requirement_analysis[1].status, 'not_evidenced')
  assert.doesNotMatch(workspace.tailored_cv_markdown, /Inglés avanzado|99|OTRO_USUARIO|Requisito inventado/)
  assert.doesNotMatch(workspace.cover_message, /CEO inventado|Inglés avanzado/)
  record('persist failure retry, normalized factual requirements/document separation')
  const modelCalls = state.modelCalls
  assert.equal((await call(prepareBody)).payload.idempotent, true); assert.equal(state.modelCalls, modelCalls)
  assert.equal(state.tables.application_workspaces.length, 1)
  record('repeated prepare reuses exact workspace without provider or document duplication')
  assert.equal((await call({ action: 'accept', workspaceId })).status, 400)
  assert.equal((await call({ action: 'opened', workspaceId })).status, 409)
  assert.equal((await call({ action: 'accept', workspaceId, attested: true }, 'token-b')).status, 404)
    const otherWorkspace = { ...structuredClone(workspace), id: 'workspace-b', user_id: userB.id, source_version_id: 'source-b', tailored_cv_markdown: '# OTRO_USUARIO_SECRETO', cover_message: 'OTRO_USUARIO_SECRETO' }
    state.tables.application_workspaces.push(otherWorkspace)
    assert.deepEqual((await call({ action: 'overview' }, 'token-b')).payload.workspaces.map((row: any) => row.id), ['workspace-b'])
    assert.deepEqual((await call({ action: 'overview' }, 'token-a')).payload.workspaces.map((row: any) => row.id), [workspaceId])
    assert.equal((await call({ action: 'accept', workspaceId: 'workspace-b', attested: true }, 'token-a')).status, 404)
  record('attestation mandatory, draft cannot open, another user cannot accept/read workspace')
  state.fail.accept_application_workspace = true
  assert.equal((await call({ action: 'accept', workspaceId, attested: true })).status, 500)
  assert.equal(state.tables.generated_cvs.length, sourceBefore.length)
  result = await call({ action: 'accept', workspaceId, attested: true })
  const versionId = result.payload.accepted.prepared_version_id
  const version = state.tables.generated_cvs.find((row: any) => row.id === versionId)
  assert.equal(version.parent_version_id, 'source-a'); assert.equal(version.user_id, userA.id); assert.equal(version.vacancy_id, opportunity.id)
  assert.deepEqual(version.evidence_snapshot, workspace.evidence_snapshot); assert.equal(version.cv_markdown, workspace.tailored_cv_markdown); assert.equal(version.user_attested, true)
  const repeated = await call({ action: 'accept', workspaceId, attested: true })
  assert.equal(repeated.payload.accepted.prepared_version_id, versionId); assert.equal(state.tables.generated_cvs.length, sourceBefore.length + 1)
  const reloaded = await call({ action: 'overview', opportunitySlug: opportunity.slug })
  assert.equal(reloaded.payload.workspaces[0].id, workspaceId); assert.equal(reloaded.payload.workspaces[0].prepared_version_id, versionId)
  record('accept failure retry, exact generated version lineage, accept idempotency and persisted reload', { workspaceId, versionId })
  assert.equal((await call({ action: 'checklist', workspaceId, progress: { invented: true } })).status, 500)
  assert.equal((await call({ action: 'checklist', workspaceId, progress: { 'review-official': true } }, 'token-b')).status, 500)
  assert.deepEqual(workspace.checklist_progress, {})
  record('checklist invalid keys and other user updates fail without mutation')

  // Document the existing nonnumeric backing limit without widening this patch.
  const adversarialInput = { requirements: [
    { text: 'Análisis de datos', evidenceIds: ['summary-a'], status: 'supported' }, { text: 'Inglés avanzado', evidenceIds: [], status: 'not_evidenced' },
  ], cvBlocks: [
    { section: 'header', kind: 'name', text: 'Candidata Local A', evidenceIds: ['identity-a'] },
    { section: 'summary', kind: 'paragraph', text: 'Análisis de datos', evidenceIds: ['summary-a'] },
    { section: 'skills', kind: 'bullet', text: 'Inglés avanzado', evidenceIds: ['summary-a'] },
  ], coverBlocks: [{ evidenceIds: ['identity-a'] }, { evidenceIds: ['summary-a'] }] }
  if (baseline) {
    // The UI baseline uses historical source. The handler now contains the
    // separately reviewed grounding correction; preserved baseline evidence
    // documents the original unrelated-evidence acceptance.
    evidence.limits.push('UI baseline source is exact common base; handler uses current reviewed tree.')
  }
  assert.throws(() => normalizeApplicationResult(adversarialInput, workspace.evidence_snapshot, '# Candidata Local A', opportunity.description), /CV suficientemente respaldado/)
  record('unrelated valid evidence ID cannot authorize a nonnumeric candidate claim')
  evidence.semanticBoundary = 'Real pair construction/normalizer/cache/persistence/UI; semantic provider response fixture only, not production model accuracy.'
  assert.equal(workspace.requirement_analysis[0].status, 'supported')
  assert.equal(workspace.fit_summary.coverage_score, 50)
  assert.equal(workspace.safety_checks.requirement_semantic_verified, true)

  // Render the real component, layout, markdown, analytics, canvas and PDF.
  // Only its auth/Supabase boundary is local. No replacement handler/UI.
  await build({ stdin: { contents: `import React from 'react';import{createRoot}from'react-dom/client';import{HelmetProvider}from'react-helmet-async';import{Route}from'wouter';import*as pdfjs from'pdfjs-dist/legacy/build/pdf.mjs';import Workspace from './src/hub/ApplicationWorkspace';pdfjs.GlobalWorkerOptions.workerSrc='/pdf.worker.mjs';window.__inspectPdf=async()=>{const bytes=new Uint8Array(await(await fetch('/selected-workspace.pdf')).arrayBuffer());const pdf=await pdfjs.getDocument({data:bytes}).promise;const page=await pdf.getPage(1);const viewport=page.getViewport({scale:1});const canvas=document.createElement('canvas');canvas.width=viewport.width;canvas.height=viewport.height;const context=canvas.getContext('2d');await page.render({canvasContext:context,viewport}).promise;const pixels=context.getImageData(0,0,canvas.width,canvas.height).data;let dark=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]<100&&pixels[i+1]<100&&pixels[i+2]<100)dark++;return{pages:pdf.numPages,darkPixels:dark,png:canvas.toDataURL('image/png')}};createRoot(document.getElementById('root')).render(<HelmetProvider><Route path='/mi-carrera/postular/:slug'><Workspace/></Route></HelmetProvider>);`, resolveDir: process.cwd(), loader: 'tsx' }, outfile: resolve(output, 'ui.js'), bundle: true, platform: 'browser', format: 'esm', jsx: 'automatic', define: { 'import.meta.env': '{}' }, plugins: [{ name: 'auth-boundary', setup(builder: any) {
    builder.onResolve({ filter: /^@\// }, (args: any) => builder.resolve(resolve('src', args.path.slice(2)), { kind: args.kind, resolveDir: process.cwd() }))
    builder.onLoad({ filter: /src[\\/]lib[\\/]supabase\.ts$/ }, () => ({ contents: `const getUser=async()=>({id:'user-a',email:'candidate-a@example.invalid'});export const auth={getUser,signOut:async()=>{}};export const supabase={auth:{getSession:async()=>({data:{session:{access_token:window.__expired?'':'token-a'}}})}};` }))
    if (baseline) builder.onLoad({ filter: /src[\\/]hub[\\/]ApplicationWorkspace\.tsx$/ }, () => ({ contents: execFileSync('git', ['show', '9b8f6a899197e2795280fd1cb30484fb68f1bbc0:src/hub/ApplicationWorkspace.tsx'], { encoding: 'utf8' }), loader: 'tsx' }))
  } }] })
  const styleServer = await createViteServer({ configFile: resolve('vite.config.ts'), server: { middlewareMode: true }, logLevel: 'silent' })
  let css: string
  try {
    const transformed = await styleServer.transformRequest('/src/index.css')
    const encoded = transformed?.code.match(/const __vite__css = (".*")\n/)
    assert.ok(encoded, 'Vite transformed the real stylesheet')
    css = JSON.parse(encoded[1])
    writeFileSync(resolve(output, 'product.css'), css)
  } finally { await styleServer.close() }
  const server = createServer(async (req, res) => {
    try {
      if (req.url?.startsWith('/.netlify/functions/application-workspace')) {
        const buffers = []; for await (const chunk of req) buffers.push(chunk)
        const response = await handler({ httpMethod: req.method, headers: req.headers, body: Buffer.concat(buffers).toString() })
        res.writeHead(response.statusCode, response.headers); res.end(response.body); return
      }
      if (req.url?.startsWith('/.netlify/functions/cv-ats-workspace')) { res.setHeader('Content-Type', 'application/json'); res.end('{"openQuestionCount":0}'); return }
      if (req.url === '/ui.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(readFileSync(resolve(output, 'ui.js'))); return }
      if (req.url === '/pdf.worker.mjs') { res.setHeader('Content-Type', 'text/javascript'); res.end(readFileSync(require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs'))); return }
      if (req.url === '/selected-workspace.pdf') { res.setHeader('Content-Type', 'application/pdf'); res.end(readFileSync(resolve(output, 'selected-workspace.pdf'))); return }
      if (req.url === '/product.css') { res.setHeader('Content-Type', 'text/css'); res.end(css); return }
      res.setHeader('Content-Type', 'text/html'); res.end('<html><head><meta charset="utf-8"><link rel="stylesheet" href="/product.css"></head><body><div id="root"></div><script type="module" src="/ui.js"></script></body></html>')
    } catch (error: any) { res.statusCode = 500; res.end(error.message) }
  })
  await new Promise<void>((done, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', done) })
  const port = (server.address() as any).port
  const browserOrigin = `http://127.0.0.1:${port}`
  process.env.SITE_URL = browserOrigin
  const browser = await chromium.launch({ headless: true })
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 1000 }, acceptDownloads: true })
    const page = await context.newPage()
    const pageErrors: string[] = []; page.on('pageerror', error => pageErrors.push(error.message))
    await context.route('**/*', async route => {
      const url = new URL(route.request().url())
      if (url.hostname === '127.0.0.1') return route.continue()
      if (url.hostname === 'official.example.invalid') return route.fulfill({ contentType: 'text/html', body: '<title>Official local boundary</title><p>External form boundary only</p>' })
      throw new Error(`Unexpected external request: ${url.origin}`)
    })
    await page.addInitScript(() => {
      ;(window as any).__name = (fn: any) => fn
      localStorage.setItem('cvitae_guide_b2c_application_workspace_v1_completed', 'true')
      ;(window as any).__events = []
      ;(window as any).gtag = (...args: any[]) => (window as any).__events.push(args)
    })
    await page.goto(`${browserOrigin}/mi-carrera/postular/${opportunity.slug}`)
    await page.getByRole('button', { name: 'Abrir formulario oficial' }).waitFor()
    assert.deepEqual(await page.evaluate(() => (window as any).__events), [])
    record('browser persisted accepted workspace reload, no events before consent')
    await page.getByRole('button', { name: /^Requisitos/ }).click()
    const supported = page.getByRole('button').filter({ hasText: 'Análisis de datos' })
    const unsupported = page.getByRole('button').filter({ hasText: 'Inglés avanzado' })
    await supported.waitFor()
    assert.match(await supported.innerText(), /Respaldado/i)
    assert.match(await unsupported.innerText(), /Sin evidencia/i)
    assert.doesNotMatch(await unsupported.innerText(), /Respaldado/i)
    await page.reload()
    await page.getByRole('button', { name: /^Requisitos/ }).click()
    assert.match(await supported.innerText(), /Respaldado/i)
    assert.match(await unsupported.innerText(), /Sin evidencia/i)
    assert.equal(state.tables.application_workspaces.find((w: any) => w.id === workspaceId).fit_summary.coverage_score, 50)
    assert.doesNotMatch(state.tables.generated_cvs.find((v: any) => v.id === versionId).cv_markdown, /Inglés avanzado/)
    record('browser semantic supported/gap labels, coverage, accepted CV and reload preserve truth', { supported: 'Análisis de datos', unsupported: 'Inglés avanzado', unrelatedDraftId: 'summary-a', coverage: 50 })
    await page.evaluate(() => localStorage.setItem('cvitae_consent_v1', JSON.stringify({ version: 1, analytics: true, advertising: false, decidedAt: new Date().toISOString() })))
    await page.getByRole('button', { name: /^Checklist/ }).click()
    state.fail.update_application_checklist = true
    const failedChecklistResponse = page.waitForResponse(response => response.url().endsWith('application-workspace') && response.status() === 500)
    await page.getByRole('checkbox', { name: 'Revisar nuevamente las bases y la fecha en la fuente oficial' }).click()
    await failedChecklistResponse
    // Wait for mutation completion through actual server traffic/DOM rollback.
    await page.getByRole('checkbox', { name: 'Revisar nuevamente las bases y la fecha en la fuente oficial' }).waitFor()
    await page.waitForFunction(() => !(document.querySelector('input[type=checkbox]') as HTMLInputElement)?.checked)
    const checklistErrorVisible = await page.getByText('No pudimos preparar la postulación en este momento.', { exact: true }).isVisible()
    evidence.baselineChecklist = { errorVisible: checklistErrorVisible, rollback: true }
    if (baseline) {
      assert.equal(checklistErrorVisible, false)
      await page.screenshot({ path: resolve(output, 'baseline-checklist.png'), fullPage: true })
      record('baseline reproduces swallowed checklist error after rollback')
    } else {
      assert.equal(checklistErrorVisible, true)
      record('failed checklist stays visible and optimistic state rolls back')
    }
    const retryChecklistResponse = page.waitForResponse(response => response.url().endsWith('application-workspace') && response.status() === 200)
    await page.getByRole('checkbox', { name: 'Revisar nuevamente las bases y la fecha en la fuente oficial' }).check()
    await retryChecklistResponse
    assert.equal(workspace.checklist_progress['review-official'], true)
    await page.reload(); await page.getByRole('button', { name: /^Checklist/ }).click()
    assert.equal(await page.getByRole('checkbox', { name: 'Revisar nuevamente las bases y la fecha en la fuente oficial' }).isChecked(), true)
    record('checklist retry success persists and reload preserves progress')
    await page.evaluate(() => localStorage.setItem('cvitae_consent_v1', JSON.stringify({ version: 1, analytics: true, advertising: false, decidedAt: new Date().toISOString() })))
    if (!baseline) {
      await page.evaluate(() => { (window as any).__expired = true })
      await page.getByRole('checkbox', { name: 'Verificar que los datos de contacto del CV estén vigentes' }).click()
      await page.getByRole('alert').filter({ hasText: 'Tu sesión expiró. Volvé a ingresar.' }).waitFor()
      assert.equal(await page.getByRole('checkbox', { name: 'Verificar que los datos de contacto del CV estén vigentes' }).isChecked(), false)
      assert.equal(workspace.checklist_progress['verify-contact'], undefined)
      await page.evaluate(() => { (window as any).__expired = false })
      const callsBefore = state.calls.filter((call: any) => call.rpc === 'update_application_checklist').length
      let release!: () => void
      state.pause = { name: 'update_application_checklist', promise: new Promise<void>(done => { release = done }) }
      const response = page.waitForResponse(response => response.url().endsWith('application-workspace') && response.status() === 200)
      await page.getByRole('checkbox', { name: 'Verificar que los datos de contacto del CV estén vigentes' }).click()
      assert.equal(await page.getByRole('checkbox', { name: 'Revisar nuevamente las bases y la fecha en la fuente oficial' }).isDisabled(), true)
      assert.equal(await page.getByRole('checkbox', { name: 'Descargar y revisar la versión adaptada del CV' }).isDisabled(), true)
      assert.equal(state.calls.filter((call: any) => call.rpc === 'update_application_checklist').length, callsBefore + 1)
      release(); state.pause = null; await response
      assert.equal(workspace.checklist_progress['verify-contact'], true)
      record('expired session rolls back with visible error; retry blocks overlapping full-progress writes')
    }

    await page.getByRole('button', { name: 'Mensaje', exact: true }).click()
    await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('fixture clipboard denied') } } }))
    const clipboardError = baseline ? page.waitForEvent('pageerror') : null
    await page.getByRole('button', { name: 'Copiar', exact: true }).click()
    if (baseline) { await clipboardError; record('baseline clipboard rejection', { visibleError: await page.getByText('No pudimos copiar el mensaje.', { exact: true }).isVisible() }) }
    else { await page.getByText('No pudimos copiar el mensaje.', { exact: true }).waitFor(); record('clipboard failure visible') }
    await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text: string) => { (window as any).__copied = text } } }))
    await page.getByRole('button', { name: 'Copiar', exact: true }).click(); await page.getByRole('button', { name: 'Copiado', exact: true }).waitFor()
    assert.equal(await page.evaluate(() => (window as any).__copied), workspace.cover_message)
    record('clipboard retry copies selected workspace message')

    await page.getByRole('button', { name: 'CV adaptado', exact: true }).click()
    assert.equal(await page.getByRole('heading', { name: 'Candidata Local A', exact: true }).isVisible(), true)
    assert.equal(await page.getByText('OTRO_USUARIO_SECRETO', { exact: true }).count(), 0)
    await page.evaluate(() => { (window as any).__originalDataURL = HTMLCanvasElement.prototype.toDataURL; HTMLCanvasElement.prototype.toDataURL = () => { throw new Error('fixture canvas encoding failure') } })
    const pdfError = baseline ? page.waitForEvent('pageerror') : null
    await page.getByRole('button', { name: 'Descargar PDF' }).click()
    await page.waitForFunction(() => !Array.from(document.querySelectorAll('button')).find(button => button.textContent?.includes('Descargar PDF'))?.disabled)
    if (baseline) { await pdfError; record('baseline PDF rejection', { visibleError: await page.getByText('No pudimos descargar el PDF. Intentá nuevamente.', { exact: true }).isVisible() }) }
    else { await page.getByText('No pudimos descargar el PDF. Intentá nuevamente.', { exact: true }).waitFor(); record('PDF encoder failure visible and action recovers') }
    await page.evaluate(() => { HTMLCanvasElement.prototype.toDataURL = (window as any).__originalDataURL })
    if (baseline) {
      const actualStyleError = page.waitForEvent('pageerror')
      await page.getByRole('button', { name: 'Descargar PDF' }).click()
      const error = await actualStyleError
      evidence.actualStylePdfFailure = error.message
      record('baseline real product CSS PDF failure reproduced', { error: error.message })
      evidence.status = 'BASELINE_ERRORS_REPRODUCED; PRODUCT_PDF_CSS_GAP_OPEN'
      await page.screenshot({ path: resolve(output, 'baseline-real-css-pdf.png'), fullPage: true })
      await context.close()
      throw new Error('EXPECTED_BASELINE_STOP')
    }
    const cvPreview = page.getByRole('heading', { name: 'Candidata Local A', exact: true }).locator('..')
    const previewBefore = await cvPreview.screenshot()
    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Descargar PDF' }).click()
    const download = await downloadPromise; const pdfPath = resolve(output, 'selected-workspace.pdf'); await download.saveAs(pdfPath)
    const bytes = readFileSync(pdfPath); assert.ok(bytes.length > 5000); assert.equal(bytes.subarray(0, 5).toString(), '%PDF-')
    assert.match(bytes.toString('latin1'), /\/Subtype \/Image/); assert.match(bytes.toString('latin1'), /%%EOF/)
    assert.deepEqual(await cvPreview.screenshot(), previewBefore, 'PDF clone color conversion must not change visible document')
    const rendered = await page.evaluate(() => (window as any).__inspectPdf())
    assert.ok(rendered.pages >= 1); assert.ok(rendered.darkPixels > 300, 'rendered PDF contains readable dark content')
    writeFileSync(resolve(output, 'pdf-page-1.png'), Buffer.from(rendered.png.split(',')[1], 'base64'))
    record('real CSS html2canvas/jsPDF selected workspace PDF valid and PDF.js render legible; visible document unchanged', { bytes: bytes.length, filename: download.suggestedFilename(), pages: rendered.pages, darkPixels: rendered.darkPixels })
    const popupPromise = context.waitForEvent('page')
    await page.getByRole('button', { name: 'Abrir formulario oficial' }).click()
    const popup = await popupPromise; await popup.waitForURL(opportunity.application_url)
    assert.equal(await popup.evaluate(() => window.opener === null), true)
    assert.equal(workspace.status, 'opened'); assert.equal(workspace.submitted_self_reported_at, undefined)
    await popup.close()
    await page.getByRole('button', { name: 'Ya postulé' }).click(); await page.getByText('Informada por vos', { exact: true }).waitFor()
    assert.equal(workspace.status, 'submitted')
    record('user opens official popup with no opener; submission only explicit self-report')
    const events = await page.evaluate(() => (window as any).__events)
    evidence.analyticsObserved = { events, consent: await page.evaluate(() => localStorage.getItem('cvitae_consent_v1')) }
    const apply = events.filter((args: any[]) => args[1] === 'apply_clicked')
    assert.equal(apply.length, 1); assert.equal(apply[0][2].opportunity_id, opportunity.id)
    assert.doesNotMatch(JSON.stringify(events), /candidate-a|Candidata|OTRO_USUARIO|cover_message|cv_markdown|evidence_snapshot/)
    assert.equal(events.filter((args: any[]) => args[1] === 'preparation_completed').length, 0)
    record('existing analytics consent/no PII; reload emits no preparation completion; one apply per user action')
    // Future UI production through the real handler, with selection of an
    // existing source version, confirmation, reload and no effect duplication.
    const select = page.locator('select'); await select.selectOption('source-a-older')
    state.fail.provider = true
    const browserProviderFailure = page.waitForResponse(response => response.url().endsWith('application-workspace') && response.status() === 500)
    await page.getByRole('button', { name: 'Preparar expediente' }).click(); await browserProviderFailure
    await page.getByRole('alert').filter({ hasText: 'No pudimos preparar la postulación en este momento.' }).waitFor()
    assert.equal(state.tables.application_workspaces.some((row: any) => row.source_version_id === 'source-a-older'), false)
    state.fail.insert = true
    const browserPersistFailure = page.waitForResponse(response => response.url().endsWith('application-workspace') && response.status() === 500)
    await page.getByRole('button', { name: 'Preparar expediente' }).click(); await browserPersistFailure
    await page.getByRole('alert').filter({ hasText: 'No pudimos preparar la postulación en este momento.' }).waitFor()
    assert.equal(state.tables.application_workspaces.some((row: any) => row.source_version_id === 'source-a-older'), false)
    record('browser prepare provider/persist failures visible with no false document; same selection retry recovers')
    await page.getByRole('button', { name: 'Preparar expediente' }).click()
    await page.getByRole('button', { name: 'Guardar versión final' }).waitFor()
    await page.getByRole('checkbox', { name: /Revisé el CV y el mensaje/ }).check()
    const browserVersionCount = state.tables.generated_cvs.length
    state.fail.accept_application_workspace = true
    const browserAcceptFailure = page.waitForResponse(response => response.url().endsWith('application-workspace') && response.status() === 500)
    await page.getByRole('button', { name: 'Guardar versión final' }).click(); await browserAcceptFailure
    await page.getByRole('alert').filter({ hasText: 'No pudimos preparar la postulación en este momento.' }).waitFor()
    assert.equal(state.tables.generated_cvs.length, browserVersionCount)
    assert.equal(await page.getByRole('button', { name: 'Guardar versión final' }).isVisible(), true)
    record('browser accept failure leaves draft, preserves attestation for retry and creates no version')
    await page.getByRole('button', { name: 'Guardar versión final' }).click()
    await page.getByRole('button', { name: 'Abrir formulario oficial' }).waitFor()
    const futureWorkspace = state.tables.application_workspaces.find((row: any) => row.source_version_id === 'source-a-older')
    assert.ok(futureWorkspace.prepared_version_id)
    assert.equal(state.tables.generated_cvs.find((row: any) => row.id === futureWorkspace.prepared_version_id).parent_version_id, 'source-a-older')
    await page.getByRole('button', { name: /^Checklist/ }).click()
    await page.getByRole('checkbox', { name: 'Verificar que los datos de contacto del CV estén vigentes' }).check()
    await page.waitForFunction(() => (document.querySelector('input[type=checkbox]') as HTMLInputElement) !== null)
    const completionEvents = await page.evaluate(() => (window as any).__events.filter((args: any[]) => args[1] === 'preparation_completed'))
    assert.equal(completionEvents.length, 1)
    await page.reload(); await page.getByRole('button', { name: 'Abrir formulario oficial' }).waitFor()
    assert.equal(futureWorkspace.prepared_version_id, state.tables.application_workspaces.find((row: any) => row.id === futureWorkspace.id).prepared_version_id)
    assert.equal(await page.evaluate(() => (window as any).__events.filter((args: any[]) => args[1] === 'preparation_completed').length), 0)
    record('future browser prepare/choose source/attest/accept persists parent identity and reload; completion effect once')
    await page.screenshot({ path: resolve(output, baseline ? 'baseline-final.png' : 'fixed-final.png'), fullPage: true })
    if (!baseline) assert.deepEqual(pageErrors, [])
    evidence.browserErrors = pageErrors
    await context.close()
  } finally { await browser.close(); await new Promise<void>(done => server.close(() => done())) }
  evidence.status = 'PASS_LOCAL_ACTIONS_LITERAL_CV_AND_SEMANTIC_REQUIREMENTS'
} catch (error: any) {
  if (error.message !== 'EXPECTED_BASELINE_STOP') { evidence.status = 'FAIL'; evidence.failure = error.stack; throw error }
} finally {
  writeFileSync(resolve(output, baseline ? 'baseline-evidence.json' : 'evidence.json'), JSON.stringify(evidence, null, 2))
}
console.log(`verify_b2c_application_journey: ${evidence.status}; ${evidence.cases.length} cases; ${output}`)
