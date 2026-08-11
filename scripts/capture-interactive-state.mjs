import fs from 'node:fs'
import WebSocket from 'ws'

const [, , debugPort = '9223', url, expression = '', output = 'tmp/interactive-state.png'] = process.argv
if (!url) throw new Error('Uso: node capture-interactive-state.mjs <port> <url> <expression> <output>')

const targets = await fetch(`http://127.0.0.1:${debugPort}/json`).then(response => response.json())
const target = targets.find(item => item.type === 'page')
if (!target) throw new Error('No se encontró una pestaña de Chrome')

const socket = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject) })
let sequence = 0
const pending = new Map()
const runtimeErrors = []
socket.on('message', data => {
  const message = JSON.parse(String(data))
  if (message.method === 'Runtime.exceptionThrown') runtimeErrors.push(message.params?.exceptionDetails?.exception?.description || message.params?.exceptionDetails?.text || 'Runtime exception')
  if (!message.id || !pending.has(message.id)) return
  pending.get(message.id)(message)
  pending.delete(message.id)
})
const call = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++sequence
  pending.set(id, message => message.error ? reject(new Error(message.error.message)) : resolve(message.result))
  socket.send(JSON.stringify({ id, method, params }))
})
const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))

await call('Page.enable')
await call('Runtime.enable')
const adminScenario = expression === 'admin-moderation' || expression === 'admin-controls' || expression === 'admin-source'
await call('Emulation.setDeviceMetricsOverride', adminScenario
  ? { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false }
  : { width: 500, height: 1000, deviceScaleFactor: 1, mobile: true })
if (adminScenario) {
  await call('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.fetch = async (input, init = {}) => {
      const url = String(input);
      if (url.includes('/admin-auth')) return new Response(JSON.stringify({ authenticated: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      if (url.includes('/admin-data')) {
        const action = JSON.parse(init.body || '{}').action;
        const responses = {
          metrics: { usuarios: 48, oportunidades: 133, empresasActivas: 4 },
          list_content: { data: [] }, list_users: { data: [] }, list_skills: { data: [] }, list_tokens: { data: [] },
          list_beta: { betaList: [], leads: [] }, list_b2b_prospects: { data: [] },
          scraper_report: { totalOpportunities: 135, totalContentHub: 60, newLast24h: 0, newLast7d: 133, duplicates: 0, bySource: [], scraperRuns: [], runSummary: {}, telemetryAvailable: true },
          opportunity_review_summary: { summary: { pending: 12, in_review: 3, verified: 133, rejected: 4, quarantined: 57 }, inventory: { total: 209, published: 133, archived: 0, deleted: 0, deletion_pending: 1, by_type: { empleo: 151, beca: 31, pasantia: 15, concurso: 8, programa: 4 } } },
          list_control_center: { sourceStats: { computrabajo: { total: 133, verified: 133, pending: 0 }, clasipar: { total: 55, verified: 0, pending: 55 } }, controls: [
            { scraper_id: 'computrabajo_scraper', scraper_name: 'Computrabajo Paraguay', script_path: 'scrapers/computrabajo_scraper.py', collection_enabled: true, max_items_per_run: 800, max_runtime_seconds: 1200, consecutive_failures_before_pause: 3, auto_pause_on_failure: true, require_review: false, allowed_country_codes: ['PY'], paused_reason: null, audit_status: 'candidate', audit_found_count: 379, audit_valid_count: 379, audit_unique_count: 40, audit_sample_count: 20, audit_notes: 'Extracción paraguaya concreta confirmada; fuente previamente verificada y operativa.', last_audited_at: new Date().toISOString() },
            { scraper_id: 'buscojobs_scraper', scraper_name: 'BuscoJobs Paraguay', script_path: 'scrapers/buscojobs_scraper.py', collection_enabled: false, max_items_per_run: 250, max_runtime_seconds: 600, consecutive_failures_before_pause: 3, auto_pause_on_failure: true, require_review: true, allowed_country_codes: ['PY'], paused_reason: 'Requiere reparación', audit_status: 'empty', audit_found_count: 0, audit_valid_count: 0, audit_unique_count: 0, audit_sample_count: 0, audit_notes: 'Ejecución real aislada: no produjo oportunidades válidas. Mantener pausado y reparar.', last_audited_at: new Date().toISOString() }
          ], sources: [
            { source: 'computrabajo', display_name: 'Computrabajo Paraguay', trust_level: 'trusted', is_enabled: true, auto_verify: true, catalog_enabled: true, matching_enabled: true, alerts_enabled: true, seo_enabled: true, max_items_per_day: 800, retention_days: 30, allowed_country_codes: ['PY'] },
            { source: 'clasipar', display_name: 'Clasipar', trust_level: 'review', is_enabled: false, auto_verify: false, catalog_enabled: false, matching_enabled: false, alerts_enabled: false, seo_enabled: false, max_items_per_day: 100, retention_days: 14, allowed_country_codes: ['PY'] }
          ] },
          list_opportunity_reviews: { count: 2, sources: [{ source: 'computrabajo', display_name: 'Computrabajo Paraguay' }, { source: 'candidate_custom', display_name: 'Vacante aportada por candidato' }], data: [
            { id: '1', title: 'Analista de datos junior', organization: 'Empresa de tecnología', location: 'Asunción', source: 'candidate_custom', application_url: 'https://example.com/job/1', original_source_url: 'https://empresa.example/careers/analista', original_source_verified: true, source_authority: 'aggregator', opportunity_type: 'job', eligible_countries: ['PY'], deadline: '2026-09-30T23:59:00Z', description: 'Buscamos una persona con SQL, Excel y capacidad analítica. Postulación abierta hasta fin de mes.', rubro: 'Tecnología', verification_status: 'in_review', verification_score: null, verification_reasons: [], verification_note: null, deletion_review_status: 'pending', deletion_requested_at: new Date().toISOString(), reviewed_at: null, reviewed_by: null, created_at: new Date().toISOString() },
            { id: '2', title: 'Asistente administrativo', organization: null, location: 'San Lorenzo', source: 'scraper_nuevo', application_url: 'https://example.com/job/2', description: null, rubro: 'Administración', verification_status: 'pending', verification_score: 40, verification_reasons: ['La fuente y el enlace de postulación son accesibles'], verification_note: null, reviewed_at: null, reviewed_by: null, created_at: new Date().toISOString() }
          ] }
        };
        return new Response(JSON.stringify(responses[action] || { ok: true, data: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
  ` })
}
await call('Page.navigate', { url })
await wait(8000)
if (expression) {
  const action = expression === 'company-form'
    ? `new Promise(resolve => {
        const button = Array.from(document.querySelectorAll('button')).find(item => item.textContent.includes('Solicitar acceso verificado'));
        button?.click();
        setTimeout(() => {
          document.querySelector('input[placeholder="Nombre y apellido"]')?.scrollIntoView({ block: 'start' });
          resolve(true);
        }, 500);
      })`
    : adminScenario
      ? `new Promise(resolve => {
          const input = document.querySelector('input[type="password"]');
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
          setter.call(input, 'local-review');
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.closest('form').requestSubmit();
          setTimeout(() => {
            Array.from(document.querySelectorAll('button')).find(item => item.textContent.includes('${expression === 'admin-moderation' ? 'Verificación' : 'Fuentes y reglas'}'))?.click();
            setTimeout(() => {
              const candidates = Array.from(document.querySelectorAll('button')).filter(item => item.textContent.includes('${expression === 'admin-moderation' ? 'Analista de datos junior' : 'Computrabajo Paraguay'}'));
              candidates[${expression === 'admin-source' ? 'candidates.length - 1' : '0'}]?.click();
              resolve(true);
            }, 800);
          }, 1200);
        })`
      : expression
  await call('Runtime.evaluate', { expression: action, awaitPromise: true, returnByValue: true })
  await wait(1200)
}
const result = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
const diagnostic = await call('Runtime.evaluate', { expression: `({ url: location.href, title: document.title, text: document.body?.innerText?.slice(0, 500) || '', rootChildren: document.getElementById('root')?.childElementCount || 0 })`, returnByValue: true })
fs.mkdirSync(new URL('../tmp/', import.meta.url), { recursive: true })
fs.writeFileSync(output, Buffer.from(result.data, 'base64'))
socket.close()
console.log(output, JSON.stringify(diagnostic.result?.value || {}), JSON.stringify({ runtimeErrors }))
