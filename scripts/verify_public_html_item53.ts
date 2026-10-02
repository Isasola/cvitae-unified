import assert from 'node:assert/strict'
import { validateInvalidDetailResult, validatePublicHtml } from './check-public-html.mjs'

for (const routePath of ['/empleos/**cvitae-invalid-item53**', '/oportunidades/**cvitae-invalid-item53**', '/blog/**cvitae-invalid-item53**', '/vacante/**cvitae-invalid-item53**']) {
  assert.equal(validateInvalidDetailResult(routePath, { status: 404 }, { live: false }).status, 'PASS')
  const existing = validateInvalidDetailResult(routePath, { status: 200 }, { live: false })
  assert.equal(existing.status, 'FAIL')
  assert.deepEqual(existing.issues, ['EXPECTED_LOCAL_404_GOT_200'])
}

const marketHtml = (path: string, robots: string) => `<html><head><title>Mercado</title><link rel="canonical" href="https://cvitae.lat${path}"><meta name="robots" content="${robots}"></head><body><h1>Mercado</h1><p>Contenido factual de mercado.</p></body></html>`
const paraguayNoindex = validatePublicHtml('/oportunidades/paraguay', marketHtml('/oportunidades/paraguay', 'noindex'), { expectedCanonical: 'https://cvitae.lat/oportunidades/paraguay' })
const latamNoindex = validatePublicHtml('/oportunidades/latam', marketHtml('/oportunidades/latam', 'noindex'), { expectedCanonical: 'https://cvitae.lat/oportunidades/latam' })
const peruNoindex = validatePublicHtml('/oportunidades/peru', marketHtml('/oportunidades/peru', 'noindex'), { expectedCanonical: 'https://cvitae.lat/oportunidades/peru' })
const remotoNoindex = validatePublicHtml('/oportunidades/remoto-latam', marketHtml('/oportunidades/remoto-latam', 'noindex'), { expectedCanonical: 'https://cvitae.lat/oportunidades/remoto-latam' })
assert.ok(paraguayNoindex.issues.includes('UNEXPECTED_NOINDEX'))
assert.ok(latamNoindex.issues.includes('UNEXPECTED_NOINDEX'))
assert.ok(!peruNoindex.issues.includes('UNEXPECTED_NOINDEX'))
assert.ok(!remotoNoindex.issues.includes('UNEXPECTED_NOINDEX'))

const homeBody = '<main><h1>Analizá tu CV gratis</h1><p>Tu score ATS real, en segundos.</p></main>'
const wrongBody = '<html><head><title>Monitor de asistencia</title><link rel="canonical" href="https://cvitae.lat/empleos/monitor"></head><body>' + homeBody + '</body></html>'
const wrong = validatePublicHtml('/empleos/monitor', wrongBody, { expectedCanonical: 'https://cvitae.lat/empleos/monitor' })
assert.equal(wrong.status, 'FAIL')
assert.ok(wrong.issues.includes('HOME_BODY_CONTAMINATION'))

const factual = '<html><head><title>Monitor de asistencia</title><link rel="canonical" href="https://cvitae.lat/empleos/monitor"></head><body><main><h1>Monitor de asistencia</h1><script type="application/ld+json">{"@type":"JobPosting"}</script><p>Descripción factual de la oportunidad y su organización.</p></main></body></html>'
const good = validatePublicHtml('/empleos/monitor', factual, { expectedCanonical: 'https://cvitae.lat/empleos/monitor' })
assert.equal(good.status, 'PASS')

const mismatch = validatePublicHtml('/empleos/monitor', factual, { expectedCanonical: 'https://cvitae.lat/empleos/other' })
assert.ok(mismatch.issues.some(issue => issue.startsWith('CANONICAL_MISMATCH')))
console.log('verify_public_html_item53: PASS head-body regression canonical detail structured-data')
