import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { chromium } from '@playwright/test'

const baseUrl = process.env.RELEASE_PREVIEW_URL || 'http://127.0.0.1:4174'
const read = path => readFileSync(path, 'utf8')
const tags = (html, name) => html.match(new RegExp(`<${name}\\b[^>]*>`, 'gi')) || []
const attr = (tag, name) => tag.match(new RegExp(`\\b${name}=["']([^"']+)["']`, 'i'))?.[1] || ''
const canonicalLinks = html => tags(html, 'link').filter(tag => attr(tag, 'rel').toLowerCase() === 'canonical')
const robotDirectives = html => tags(html, 'meta')
  .filter(tag => attr(tag, 'name').toLowerCase() === 'robots')
  .map(tag => attr(tag, 'content').toLowerCase())
const structuredData = html => [...html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
  .map(match => JSON.parse(match[1]))

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

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage()
const pageErrors = []
const consoleErrors = []
const failedRequests = []
page.on('pageerror', error => pageErrors.push(error.message))
page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()) })
page.on('requestfailed', request => failedRequests.push(`${request.url()}: ${request.failure()?.errorText || 'FAILED'}`))
try {
  for (const route of ['/', '/mi-carrera', '/mi-carrera/perfil', '/mi-carrera/analizar', '/admin',
    '/empleos/programme-officer', '/oportunidades/regional-fellowship', '/vacante/programme-assistant']) {
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
  const localFixtureBoundary = /^http:\/\/127\.0\.0\.1(?::\d+)?$/.test(baseUrl)
  const unexpectedPageErrors = pageErrors.filter(value => !(localFixtureBoundary && value === 'public_policy_unavailable'))
  assert.deepEqual(unexpectedPageErrors, [], 'only the declared unavailable local public-policy boundary may fail')
  const expectedLocalRequestBoundary = value => localFixtureBoundary && (
    value.startsWith('http://127.0.0.1:54321/')
    || value.startsWith(`${baseUrl}/.netlify/functions/public-opportunities?`)
    || value.startsWith('https://www.google-analytics.com/g/collect?')
  )
  const unexpectedFailedRequests = failedRequests.filter(value => !expectedLocalRequestBoundary(value))
  assert.deepEqual(unexpectedFailedRequests, [], 'only the declared unavailable local Supabase fixture boundary may fail')
} finally {
  await browser.close()
}

console.log(JSON.stringify({
  status: 'PASS',
  evidence: 'LOCAL_FIXTURE_ARTIFACT_AND_BROWSER_SHELLS',
  baseUrl,
  sitemap_urls: sitemapUrls.length,
  public_routes: 3,
  protected_shells: ['/mi-carrera', '/mi-carrera/perfil', '/mi-carrera/analizar', '/admin'],
  direct_vacancies: 'reachable_noindex_not_in_sitemap_no_jobposting',
  runtime_data_boundary: 'LOCAL_SUPABASE_UNAVAILABLE_DEPLOY_PREVIEW_REQUIRED',
}, null, 2))
