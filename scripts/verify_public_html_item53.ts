import assert from 'node:assert/strict'
import { publicDetailHtml } from '../netlify/functions/public-opportunity-detail.ts'
import { publicDetailDescription } from '../src/lib/public-detail-head.js'
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

// Initial crawler-visible detail metadata is owned, singleton and free of Home tags.
const templateHead = '<html><head><title>Home</title><meta name="description" content="Home"><meta name="robots" content="index,follow"><link rel="canonical" href="https://cvitae.lat"><meta property="og:url" content="https://cvitae.lat"><meta property="og:title" content="Home"><meta property="og:description" content="Home"><meta property="og:type" content="website"><meta name="twitter:card" content="summary"><meta name="twitter:title" content="Home"><script type="application/ld+json">{"@type":"WebSite"}</script><script type="module" src="/assets/app.js"></script><link rel="stylesheet" href="/assets/app.css"></head><body><div id="root"></div></body></html>'
const row = { id: 'head-fixture', slug: 'head-fixture', title: 'Factual title', description: '<p>Factual description.</p> '.repeat(12), source: 'fixture', opportunity_type: 'job', distribution: { seo: { allowed: false } } }
const detailHtml = publicDetailHtml(templateHead, row)
for (const pattern of [/<title\b/g, /rel="canonical"/g, /name="description"/g, /name="robots"/g, ...['url', 'title', 'description', 'type', 'image'].map(name => new RegExp(`property="og:${name}"`, 'g'))]) assert.equal((detailHtml.match(pattern) || []).length, 1)
assert.doesNotMatch(detailHtml, /twitter:|content="Home"|@type":"WebSite"/)
assert.match(detailHtml, /<title data-rh="true">Factual title \| CVitae<\/title>/)
assert.match(detailHtml, /<meta data-rh="true" name="robots" content="noindex,follow">/)
assert.match(detailHtml, /src="\/assets\/app.js"/)
assert.match(detailHtml, /href="\/assets\/app.css"/)
assert.equal(publicDetailDescription(row.description).length, 160)
assert.doesNotMatch(publicDetailDescription(row.description), /<p>/)
const missingHtml = publicDetailHtml(templateHead, null)
assert.equal((missingHtml.match(/name="robots"/g) || []).length, 1)
assert.match(missingHtml, /noindex,follow/)
assert.doesNotMatch(missingHtml, /rel="canonical"|property="og:url"|JobPosting|twitter:/)
console.log('PUBLIC_DETAIL_INITIAL_HEAD=PASS ownership=data-rh singleton=PASS home_metadata_removed=PASS assets_preserved=PASS')
