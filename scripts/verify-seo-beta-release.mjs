import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { chromium } from '@playwright/test'

const baseUrl = process.env.RELEASE_PREVIEW_URL || 'http://127.0.0.1:4174'
const isLocalPreview = /^http:\/\/127\.0\.0\.1(?::\d+)?$/.test(baseUrl)
const read = path => readFileSync(path, 'utf8')
const tags = (html, name) => html.match(new RegExp(`<${name}\\b[^>]*>`, 'gi')) || []
const attr = (tag, name) => tag.match(new RegExp(`\\b${name}=["']([^"']+)["']`, 'i'))?.[1] || ''
const canonicalLinks = html => tags(html, 'link').filter(tag => attr(tag, 'rel').toLowerCase() === 'canonical')
const normalizedCanonical = value => {
  const parsed = new URL(value)
  return `${parsed.origin}${parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/$/, '')}${parsed.search}`
}
const robotDirectives = html => tags(html, 'meta')
  .filter(tag => attr(tag, 'name').toLowerCase() === 'robots')
  .map(tag => attr(tag, 'content').toLowerCase())
const structuredData = html => [...html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
  .map(match => JSON.parse(match[1]))
const mapInBatches = async (values, batchSize, callback) => {
  const results = []
  for (let offset = 0; offset < values.length; offset += batchSize) {
    results.push(...await Promise.all(values.slice(offset, offset + batchSize).map(callback)))
  }
  return results
}

const sitemap = read('dist/sitemap.xml')
const sitemapChildren = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1])
assert.deepEqual(sitemapChildren, [
  'https://cvitae.lat/sitemap-static.xml',
  'https://cvitae.lat/sitemap-blog.xml',
  'https://cvitae.lat/sitemap-opportunities/1.xml',
])
assert.doesNotMatch(sitemap, /sitemap-vacancies/)
const sitemapUrls = ['dist/sitemap-static.xml', 'dist/sitemap-blog.xml', 'dist/sitemap-opportunities/1.xml']
  .flatMap(path => [...read(path).matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]))
assert.equal(sitemapUrls.length, 17)
assert.equal(new Set(sitemapUrls).size, sitemapUrls.length)
assert.ok(sitemapUrls.every(url => url.startsWith('https://cvitae.lat/')))
assert.ok(sitemapUrls.every(url => !url.includes('/vacante/')))

const jobHtml = read('dist/empleos/programme-officer/index.html')
const opportunityHtml = read('dist/oportunidades/regional-fellowship/index.html')
const vacancyHtml = read('dist/vacante/programme-assistant/index.html')
for (const [html, expected] of [
  [jobHtml, 'https://cvitae.lat/empleos/programme-officer'],
  [opportunityHtml, 'https://cvitae.lat/oportunidades/regional-fellowship'],
  [vacancyHtml, 'https://cvitae.lat/vacante/programme-assistant'],
]) {
  const canonicals = canonicalLinks(html)
  assert.equal(canonicals.length, 1, `${expected}: exactly one canonical`)
  assert.equal(attr(canonicals[0], 'href'), expected)
}
const jobStructuredData = structuredData(jobHtml)
assert.equal(jobStructuredData.length, 1)
assert.ok(['JobPosting', 'WebPage'].includes(jobStructuredData[0]['@type']))
if (jobStructuredData[0]['@type'] === 'JobPosting') {
  assert.equal(jobStructuredData[0].title, 'Programme Officer')
  assert.ok(jobStructuredData[0].description)
} else {
  assert.equal(jobStructuredData[0].name, 'Programme Officer', 'incomplete fixture fails closed to factual WebPage')
}
assert.equal(structuredData(vacancyHtml).filter(value => value['@type'] === 'JobPosting').length, 0)
assert.ok(robotDirectives(vacancyHtml).some(value => value.includes('noindex')))
const robots = read('dist/robots.txt')
for (const privatePath of ['/admin', '/auth/callback', '/mi-carrera/']) assert.match(robots, new RegExp(`Disallow: ${privatePath.replaceAll('/', '\\/')}`))
assert.match(robots, /Sitemap: https:\/\/cvitae\.lat\/sitemap\.xml/)

let runtimePublicRoutes = [
  ['/empleos/programme-officer', 'https://cvitae.lat/empleos/programme-officer'],
  ['/oportunidades/regional-fellowship', 'https://cvitae.lat/oportunidades/regional-fellowship'],
  ['/vacante/programme-assistant', 'https://cvitae.lat/vacante/programme-assistant'],
]
let runtimeSitemapUrls = sitemapUrls
if (!isLocalPreview) {
  const previewUrl = canonicalUrl => new URL(canonicalUrl).pathname
  const fetchText = async path => {
    let lastError
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const response = await fetch(`${baseUrl}${path}`, { signal: AbortSignal.timeout(20_000) })
        assert.ok(response.ok, `${path}: HTTP ${response.status}`)
        return await response.text()
      } catch (error) {
        lastError = error
        if (attempt < 3) await new Promise(resolve => setTimeout(resolve, attempt * 250))
      }
    }
    throw lastError
  }
  const runtimeSitemap = await fetchText('/sitemap.xml')
  const runtimeChildren = [...runtimeSitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1])
  assert.ok(runtimeChildren.length >= 2, 'runtime sitemap exposes child indexes')
  assert.ok(runtimeChildren.every(url => url.startsWith('https://cvitae.lat/sitemap-')))
  assert.ok(runtimeChildren.every(url => !url.includes('vacanc')))
  const childDocuments = await mapInBatches(runtimeChildren, 3, url => fetchText(previewUrl(url)))
  runtimeSitemapUrls = childDocuments.flatMap(html => [...html.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]))
  assert.ok(runtimeSitemapUrls.length > 0, 'runtime sitemap contains public URLs')
  assert.equal(new Set(runtimeSitemapUrls).size, runtimeSitemapUrls.length, 'runtime sitemap URLs are unique')
  assert.ok(runtimeSitemapUrls.every(url => url.startsWith('https://cvitae.lat/')))
  assert.ok(runtimeSitemapUrls.every(url => !url.includes('/vacante/')), 'direct vacancies remain outside public SEO')
  const sampledUrls = [...new Set(childDocuments.flatMap(html => {
    const urls = [...html.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1])
    return urls.length === 0 ? [] : [urls[0], urls[Math.floor(urls.length / 2)], urls.at(-1)]
  }))]
  const runtimePages = await mapInBatches(sampledUrls, 3, async canonicalUrl => ({
    canonicalUrl,
    html: await fetchText(previewUrl(canonicalUrl)),
  }))
  for (const { canonicalUrl, html } of runtimePages) {
    const canonicals = canonicalLinks(html)
    assert.equal(canonicals.length, 1, `${canonicalUrl}: exactly one runtime canonical`)
    assert.equal(normalizedCanonical(attr(canonicals[0], 'href')), normalizedCanonical(canonicalUrl))
    assert.ok(!robotDirectives(html).some(value => value.includes('noindex')), `${canonicalUrl}: sitemap page must be indexable`)
  }
  const runtimeRobots = await fetchText('/robots.txt')
  for (const privatePath of ['/admin', '/auth/callback', '/mi-carrera/']) assert.match(runtimeRobots, new RegExp(`Disallow: ${privatePath.replaceAll('/', '\\/')}`))
  assert.match(runtimeRobots, /Sitemap: https:\/\/cvitae\.lat\/sitemap\.xml/)
  const representativeRoutes = [
    runtimeSitemapUrls.find(url => url.includes('/empleos/')),
    runtimeSitemapUrls.find(url => url.includes('/oportunidades/')),
    runtimeSitemapUrls.find(url => new URL(url).pathname === '/'),
  ].filter(Boolean)
  runtimePublicRoutes = [...new Set(representativeRoutes)].map(url => [previewUrl(url), url])
}

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage()
const pageErrors = []
const consoleErrors = []
const failedRequests = []
page.on('pageerror', error => pageErrors.push(error.message))
page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()) })
page.on('requestfailed', request => failedRequests.push(`${request.url()}: ${request.failure()?.errorText || 'FAILED'}`))
try {
  const browserRoutes = ['/', '/mi-carrera', '/mi-carrera/perfil', '/mi-carrera/analizar', '/admin',
    ...runtimePublicRoutes.map(([route]) => route)]
  for (const route of [...new Set(browserRoutes)]) {
    const response = await page.goto(`${baseUrl}${route}`, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    assert.ok(response && response.status() < 400, `${route}: HTTP ${response?.status()}`)
    await page.locator('#root').waitFor({ state: 'attached' })
    try {
      await page.waitForFunction(() => (document.body?.innerText || '').trim().length > 20, undefined, { timeout: 15_000 })
    } catch (error) {
      throw new Error(`${route}: hydration failed; pageErrors=${JSON.stringify(pageErrors)}; consoleErrors=${JSON.stringify(consoleErrors)}; requests=${JSON.stringify(failedRequests)}`, { cause: error })
    }
  }
  await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' })
  const loginEntry = page.locator('a[href="/mi-carrera"]').filter({ visible: true }).first()
  await loginEntry.waitFor({ state: 'visible', timeout: 15_000 })
  assert.equal(await loginEntry.getAttribute('href'), '/mi-carrera', 'login entry targets the protected candidate flow')
  await page.goto(`${baseUrl}/admin`, { waitUntil: 'domcontentloaded' })
  await page.locator('input[type="password"]').waitFor({ state: 'visible', timeout: 15_000 })
  const unexpectedPageErrors = pageErrors.filter(value => !(isLocalPreview && value === 'public_policy_unavailable'))
  assert.deepEqual(unexpectedPageErrors, [], 'only the declared unavailable local public-policy boundary may fail')
  const expectedRequestBoundary = value => (isLocalPreview && (
    value.startsWith('http://127.0.0.1:54321/')
    || value.startsWith(`${baseUrl}/.netlify/functions/public-opportunities?`)
  )) || value.startsWith('https://www.google-analytics.com/g/collect?')
  const unexpectedFailedRequests = failedRequests.filter(value => !expectedRequestBoundary(value))
  assert.deepEqual(unexpectedFailedRequests, [], 'only the declared unavailable local Supabase fixture boundary may fail')
} finally {
  await browser.close()
}

console.log(JSON.stringify({
  status: 'PASS',
  evidence: isLocalPreview ? 'LOCAL_FIXTURE_ARTIFACT_AND_BROWSER_SHELLS' : 'NETLIFY_DEPLOY_PREVIEW_RUNTIME',
  baseUrl,
  sitemap_urls: runtimeSitemapUrls.length,
  public_routes: runtimePublicRoutes.length,
  runtime_page_sample: isLocalPreview ? 3 : 'first_middle_last_per_child_sitemap',
  protected_shells: ['/mi-carrera', '/mi-carrera/perfil', '/mi-carrera/analizar', '/admin'],
  direct_vacancies: 'reachable_noindex_not_in_sitemap_no_jobposting',
  runtime_data_boundary: isLocalPreview ? 'LOCAL_SUPABASE_UNAVAILABLE_DEPLOY_PREVIEW_REQUIRED' : 'NETLIFY_RUNTIME_VALIDATED',
}, null, 2))
