/**
 * Public HTML and sitemap observability checker.
 * Usage: node scripts/check-public-html.mjs [--live] [--url=https://cvitae.lat] [--json=path]
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { pathToFileURL } from 'url'
import { STATIC_PUBLIC_SITEMAP_ROUTES } from '../src/lib/static-sitemap-routes.js'

const args = process.argv.slice(2)
const isLive = args.includes('--live')
const baseArg = args.find(arg => arg.startsWith('--url='))
const BASE_URL = (baseArg ? baseArg.slice(6) : 'https://cvitae.lat').replace(/\/$/, '')
const jsonArg = args.find(arg => arg.startsWith('--json='))?.slice(7)
const distDir = join(process.cwd(), 'dist')
const HOME_TITLE = 'CVitae | Tu Agente de Carrera Inteligente para Paraguay'
const HOME_MARKERS = ['Analizá tu CV gratis', 'AnalizÃ¡ tu CV gratis', 'Tu score ATS real, en segundos']
const ROUTES = [['/', 'CVitae', true], ['/blog', 'Blog', true], ['/empleos', 'Empleo', true], ['/oportunidades', 'Oportunidades', true], ['/sobre-cvitae', 'Sobre CVitae', true], ['/privacy', 'Privacidad', false], ['/terminos', 'Términos', false], ['/cookies', 'Cookies', false]]

export function parseHtml(html) {
  const get = re => { const match = html.match(re); return match ? match[1].trim() : '' }
  const title = get(/<title[^>]*>([^<]*)<\/title>/i)
  const h1 = get(/<h1[^>]*>([^<]*)<\/h1>/i)
  const desc = get(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)
  const canonical = get(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']*)["']/i)
  const robots = get(/<meta[^>]+name=["']robots["'][^>]+content=["']([^"']*)["']/i)
  const jsonLdTypes = (html.match(/"@type"\s*:\s*"([^"]+)"/g) || []).map(value => value.match(/"([^"]+)"$/)[1])
  const text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  return { title, h1, desc, canonical, robots, jsonLdTypes, text, textLength: text.length, textSample: text.slice(0, 200) }
}

const marketPaths = new Set(['/oportunidades/paraguay', '/oportunidades/latam', '/oportunidades/peru', '/oportunidades/remoto-latam'])
const indexableMarketPaths = new Set(STATIC_PUBLIC_SITEMAP_ROUTES.filter(route => marketPaths.has(route.url)).map(route => route.url))
function isDetailRoute(routePath) { return /^\/(empleos|oportunidades|blog|vacante)\/[^/]+$/.test(routePath) && !marketPaths.has(routePath) }

export function validatePublicHtml(routePath, html, { expectedCanonical, expectedTitleFragment, shouldHaveContent = true } = {}) {
  const parsed = parseHtml(html); const issues = []; const detail = isDetailRoute(routePath)
  if (routePath !== '/' && (parsed.title === HOME_TITLE || HOME_MARKERS.some(marker => parsed.text.includes(marker)))) issues.push('HOME_BODY_CONTAMINATION')
  if (expectedTitleFragment && !parsed.title.toLowerCase().includes(expectedTitleFragment.toLowerCase())) issues.push(`TITLE_MISMATCH:${expectedTitleFragment}`)
  if (parsed.textLength < (shouldHaveContent ? 80 : 50)) issues.push(`THIN_CONTENT:${parsed.textLength}`)
  if (!parsed.canonical) issues.push('CANONICAL_MISSING')
  else if (expectedCanonical && parsed.canonical !== expectedCanonical) issues.push(`CANONICAL_MISMATCH:${parsed.canonical}`)
  const expectedNoindex = marketPaths.has(routePath) && !indexableMarketPaths.has(routePath)
  if (parsed.robots.toLowerCase().includes('noindex') && routePath !== '/admin' && !expectedNoindex) issues.push('UNEXPECTED_NOINDEX')
  if (detail && !parsed.h1) issues.push('DETAIL_H1_MISSING')
  if (detail && parsed.jsonLdTypes.length === 0) issues.push('DETAIL_STRUCTURED_DATA_MISSING')
  return { path: routePath, status: issues.length ? 'FAIL' : 'PASS', title: parsed.title, h1: parsed.h1 || '(none)', canonical: parsed.canonical || '(none)', jsonLd: parsed.jsonLdTypes.join(', ') || '(none)', textLength: parsed.textLength, issues, textSample: issues.length ? parsed.textSample : undefined }
}

async function getHtmlLive(pathOrUrl) {
  const target = pathOrUrl.startsWith('http') ? pathOrUrl : `${BASE_URL}${pathOrUrl}`
  const { default: https } = await import('https'); const { default: http } = await import('http')
  async function fetchUrl(url, depth = 0) {
    if (depth > 5) throw new Error('too_many_redirects')
    return new Promise((resolve, reject) => {
      const client = url.startsWith('https') ? https : http
      const request = client.get(url, { headers: { 'User-Agent': 'CVitaeHTMLChecker/1.0' } }, response => {
        if (response.statusCode >= 301 && response.statusCode <= 308 && response.headers.location) { const next = new URL(response.headers.location, url).toString(); response.resume(); resolve(fetchUrl(next, depth + 1)); return }
        let html = ''; response.on('data', chunk => { html += chunk }); response.on('end', () => resolve({ status: response.statusCode, html, url }))
      }); request.on('error', reject); request.setTimeout(10000, () => { request.destroy(); reject(new Error('timeout')) })
    })
  }
  return fetchUrl(target)
}

function getHtmlLocal(routePath) {
  const filePath = routePath === '/' ? join(distDir, 'index.html') : join(distDir, routePath.slice(1), 'index.html')
  return existsSync(filePath) ? { status: 200, html: readFileSync(filePath, 'utf8'), url: filePath } : { status: 404, html: '', url: filePath }
}

async function checkRoute(routePath, title, content) {
  try { const result = isLive ? await getHtmlLive(routePath) : getHtmlLocal(routePath); if (result.status !== 200) return { path: routePath, status: 'FAIL', issues: [`UNEXPECTED_HTTP_${result.status}`] }; const expectedCanonical = routePath === '/' ? BASE_URL : `${BASE_URL}${routePath}`; return validatePublicHtml(routePath, result.html, { expectedCanonical, expectedTitleFragment: title, shouldHaveContent: content }) } catch (error) { return { path: routePath, status: 'FAIL', issues: [`FETCH_ERROR:${error.message}`] } }
}

async function checkDetailRoute(routePath) {
  try { const result = isLive ? await getHtmlLive(routePath) : getHtmlLocal(routePath); if (result.status !== 200) return { path: routePath, status: 'FAIL', issues: [`UNEXPECTED_HTTP_${result.status}`] }; return validatePublicHtml(routePath, result.html, { expectedCanonical: `${BASE_URL}${routePath}` }) } catch (error) { return { path: routePath, status: 'FAIL', issues: [`FETCH_ERROR:${error.message}`] } }
}

const INVALID_DETAIL_ROUTES = ['/empleos/**cvitae-invalid-item53**', '/oportunidades/**cvitae-invalid-item53**', '/blog/**cvitae-invalid-item53**', '/vacante/**cvitae-invalid-item53**']
export function validateInvalidDetailResult(routePath, result, { live = false } = {}) {
  if (result.status === 404) return { path: routePath, status: 'PASS', issues: [] }
  return {
    path: routePath,
    status: 'FAIL',
    issues: [live ? `EXPECTED_HTTP_404_GOT_${result.status}` : `EXPECTED_LOCAL_404_GOT_${result.status}`],
  }
}
async function checkInvalidDetailRoute(routePath) {
    try {
      const result = isLive ? await getHtmlLive(routePath) : getHtmlLocal(routePath)
      return validateInvalidDetailResult(routePath, result, { live: isLive })
    } catch (error) { return { path: routePath, status: 'FAIL', issues: [`FETCH_ERROR:${error.message}`] }
    }
}

export function parseSitemapLocs(xml) { return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1].replace(/&amp;/g, '&')) }

async function discoverLiveDetailRoutes() {
  const root = await getHtmlLive('/sitemap.xml'); if (root.status !== 200) throw new Error(`sitemap_http_${root.status}`)
  const children = /<sitemapindex\b/i.test(root.html) ? parseSitemapLocs(root.html) : [root.url]; if (!children.length) throw new Error('sitemap_index_empty')
  const routes = []
  for (const child of children) { const response = child === root.url ? root : await getHtmlLive(child); if (response.status !== 200) throw new Error(`child_sitemap_http_${response.status}`); for (const url of parseSitemapLocs(response.html)) if (/\/(empleos|oportunidades|blog|vacante)\/[^/]+$/.test(url) && !marketPaths.has(new URL(url).pathname)) routes.push(new URL(url).pathname) }
  return [...new Set(routes)]
}

function discoverLocalDetailRoutes() {
  const routes = []
  for (const family of ['blog', 'empleos', 'oportunidades', 'vacante']) { const dir = join(distDir, family); if (!existsSync(dir)) continue; for (const entry of readdirSync(dir, { withFileTypes: true })) { const route = `/${family}/${entry.name}`; if (entry.isDirectory() && existsSync(join(dir, entry.name, 'index.html')) && !marketPaths.has(route)) routes.push(route) } }
  return routes
}

function checkLocalSitemap() {
  const file = join(distDir, 'sitemap.xml'); if (!existsSync(file)) return { status: 'FAIL', issues: ['SITEMAP_MISSING'] }
  const xml = readFileSync(file, 'utf8'); if (!/<sitemapindex\b/i.test(xml)) return { status: 'FAIL', issues: ['SITEMAP_NOT_INDEX'] }
  const missing = parseSitemapLocs(xml).map(url => new URL(url).pathname.slice(1)).filter(fileName => !existsSync(join(distDir, fileName)))
  return missing.length ? { status: 'FAIL', issues: [`SITEMAP_CHILD_MISSING:${missing.join(',')}`] } : { status: 'PASS', issues: [] }
}

async function main() {
  const results = []; for (const route of ROUTES) results.push(await checkRoute(route[0], route[1], route[2]))
  const sitemap = isLive ? { status: 'PASS', issues: [] } : checkLocalSitemap(); if (sitemap.status !== 'PASS') results.push({ path: '/sitemap.xml', ...sitemap })
  let dynamic = []
  try { dynamic = isLive ? await discoverLiveDetailRoutes() : discoverLocalDetailRoutes() } catch (error) { results.push({ path: '/sitemap.xml', status: 'FAIL', issues: [`SITEMAP_DISCOVERY_ERROR:${error.message}`] }) }
  const sampled = isLive
    ? ['empleos', 'oportunidades', 'blog', 'vacante'].flatMap(family => [...new Set(dynamic)].filter(route => route.startsWith(`/${family}/`)).slice(0, 2))
    : dynamic
  for (const family of ['empleos', 'oportunidades', 'blog', 'vacante']) {
    const available = [...new Set(dynamic)].filter(route => route.startsWith(`/${family}/`))
    const checked = sampled.filter(route => route.startsWith(`/${family}/`))
    if (isLive && available.length > 0 && checked.length === 0) results.push({ path: '/sitemap.xml', status: 'FAIL', issues: [`FAMILY_SAMPLE_MISSING:${family}`] })
  }
  for (const route of [...new Set(sampled)]) results.push(await checkDetailRoute(route))
  for (const route of INVALID_DETAIL_ROUTES) results.push(await checkInvalidDetailRoute(route))
  const notFound = isLive ? await getHtmlLive('/this-route-does-not-exist-xyz') : { status: existsSync(join(distDir, '404.html')) ? 404 : 200, html: '' }
  if (notFound.status === 200 && parseHtml(notFound.html).title === HOME_TITLE) results.push({ path: '/this-route-does-not-exist-xyz', status: 'FAIL', issues: ['UNEXPECTED_HOME_404'] })
  const pass = results.filter(result => result.status === 'PASS').length; const fail = results.length - pass
  const families = Object.fromEntries(['empleos', 'oportunidades', 'blog', 'vacante'].map(family => { const rows = results.filter(result => result.path?.startsWith(`/${family}/`)); return [family, { checked: rows.length, pass: rows.filter(row => row.status === 'PASS').length, fail: rows.filter(row => row.status !== 'PASS').length }] }))
  const summary = { timestamp: new Date().toISOString(), mode: isLive ? 'live' : 'local', total_routes_checked: results.length, pass_count: pass, fail_count: fail, families, anomaly_reasons: results.flatMap(result => result.issues || []), canonical_mismatches: results.filter(result => (result.issues || []).some(issue => issue.startsWith('CANONICAL_'))).map(result => result.path), home_body_contamination: results.filter(result => (result.issues || []).includes('HOME_BODY_CONTAMINATION')).map(result => result.path), thin_or_missing_content: results.filter(result => (result.issues || []).some(issue => issue.startsWith('THIN_CONTENT') || issue.includes('MISSING'))).map(result => result.path), sitemap_failures: results.filter(result => (result.issues || []).some(issue => issue.startsWith('SITEMAP_'))).map(result => result.path) }
  if (jsonArg) { mkdirSync(dirname(jsonArg), { recursive: true }); writeFileSync(jsonArg, JSON.stringify(summary, null, 2)) }
  for (const result of results) console.log(`${result.status} ${result.path} ${(result.issues || []).join(' ')}`)
  console.log(`PUBLIC_HTML_CHECK_SUMMARY ${JSON.stringify(summary)}`)
  if (fail) { console.error(`Public HTML check failed: ${pass} PASS / ${fail} FAIL`); process.exit(1) }
  console.log(`Public HTML check passed: ${pass} PASS / ${fail} FAIL`)
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(error => { console.error('check-public-html failed:', error); process.exit(1) })
