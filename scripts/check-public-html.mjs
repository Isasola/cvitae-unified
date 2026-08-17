/**
 * check-public-html.mjs
 *
 * Validates that public routes have real pre-rendered HTML content.
 * Usage:
 *   node scripts/check-public-html.mjs                  # checks dist/ locally
 *   node scripts/check-public-html.mjs --live           # checks production URLs
 *   node scripts/check-public-html.mjs --live --url https://cvitae.lat
 */

import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { createRequire } from 'module'

const args = process.argv.slice(2)
const isLive = args.includes('--live')
const baseUrlArg = args.find(a => a.startsWith('--url='))
const BASE_URL = baseUrlArg ? baseUrlArg.split('=')[1] : 'https://cvitae.lat'
const distDir = join(process.cwd(), 'dist')

const HOME_TITLE = 'CVitae | Tu Agente de Carrera Inteligente para Paraguay'

// Routes to check — format: [path, expectedTitleFragment, shouldHaveContent]
const ROUTES = [
  ['/', 'CVitae', true],
  ['/blog', 'Blog', true],
  ['/empleos', 'Empleo', true],
  ['/oportunidades', 'Oportunidades', true],
  ['/sobre-cvitae', 'Sobre CVitae', true],
  ['/privacy', 'Privacidad', false],
  ['/terminos', 'Términos', false],
]

function parseHtml(html) {
  const get = (re) => { const m = html.match(re); return m ? m[1].trim() : '' }
  const title = get(/<title[^>]*>([^<]*)<\/title>/i)
  const h1 = get(/<h1[^>]*>([^<]*)<\/h1>/i)
  const desc = get(/<meta[^>]+name=[\"']description[\"'][^>]+content=[\"']([^\"']*)[\"']/i)
  const canonical = get(/<link[^>]+rel=[\"']canonical[\"'][^>]+href=[\"']([^\"']*)[\"']/i)
  const robots = get(/<meta[^>]+name=[\"']robots[\"'][^>]+content=[\"']([^\"']*)[\"']/i)
  const jsonLdTypes = (html.match(/"@type"\s*:\s*"([^"]+)"/g) || []).map(s => s.match(/"([^"]+)"$/)[1])
  // Text content after stripping tags, remove script/style blocks
  const stripped = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return { title, h1, desc, canonical, robots, jsonLdTypes, textLength: stripped.length, textSample: stripped.slice(0, 200) }
}

async function getHtmlLive(path) {
  const { default: https } = await import('https')
  const { default: http } = await import('http')
  const url = `${BASE_URL}${path}`
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http
    const req = client.get(url, { headers: { 'User-Agent': 'CVitaeHTMLChecker/1.0' } }, (res) => {
      let data = ''
      res.on('data', chunk => { data += chunk })
      res.on('end', () => resolve({ status: res.statusCode, html: data, url }))
    })
    req.on('error', reject)
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('Timeout')) })
  })
}

function getHtmlLocal(path) {
  // Convert route path to file path: /blog → dist/blog/index.html
  const filePath = path === '/'
    ? join(distDir, 'index.html')
    : join(distDir, path.replace(/^\//, ''), 'index.html')
  if (!existsSync(filePath)) return { status: 404, html: '', url: filePath }
  return { status: 200, html: readFileSync(filePath, 'utf-8'), url: filePath }
}

async function checkRoute(routePath, expectedTitleFragment, shouldHaveContent) {
  let result
  try {
    result = isLive ? await getHtmlLive(routePath) : getHtmlLocal(routePath)
  } catch (e) {
    return { path: routePath, status: 'ERROR', error: e.message }
  }

  const { status, html, url } = result
  if (status === 404) {
    return { path: routePath, status: 404, issue: 'FILE_MISSING', url }
  }

  const parsed = parseHtml(html)
  const issues = []

  // Check: not returning home shell for non-home routes
  if (routePath !== '/' && parsed.title === HOME_TITLE) {
    issues.push('HOME_SHELL — title is same as home')
  }

  // Check: title contains expected fragment
  if (expectedTitleFragment && !parsed.title.toLowerCase().includes(expectedTitleFragment.toLowerCase())) {
    issues.push(`TITLE_MISMATCH — expected "${expectedTitleFragment}", got "${parsed.title}"`)
  }

  // Check: has real content (text length > threshold).
  // Index pages (empleos, oportunidades, blog) may be shells locally (no Supabase at build time)
  // but will have full listings in production. Use 80 chars as minimum to catch truly empty pages.
  const MIN_TEXT = shouldHaveContent ? 80 : 50
  if (parsed.textLength < MIN_TEXT) {
    issues.push(`THIN_CONTENT — text length ${parsed.textLength} < ${MIN_TEXT}`)
  }

  // Check: has canonical
  if (!parsed.canonical) {
    issues.push('NO_CANONICAL')
  }

  // Check: noindex on public pages (bad)
  if (parsed.robots && parsed.robots.includes('noindex') && routePath !== '/admin') {
    issues.push(`NOINDEX_ON_PUBLIC — robots: ${parsed.robots}`)
  }

  return {
    path: routePath,
    status: issues.length === 0 ? 'PASS' : 'FAIL',
    title: parsed.title,
    h1: parsed.h1 || '(none)',
    canonical: parsed.canonical || '(none)',
    jsonLd: parsed.jsonLdTypes.join(', ') || '(none)',
    textLength: parsed.textLength,
    issues,
    textSample: issues.length > 0 ? parsed.textSample : undefined,
  }
}

async function checkSlugRoute(path) {
  let result
  try {
    result = isLive ? await getHtmlLive(path) : getHtmlLocal(path)
  } catch (e) {
    return { path, status: 'ERROR', error: e.message }
  }

  const { status, html, url } = result
  if (status === 404) return { path, status: 404, note: 'Hard 404 — correct if route is invalid' }

  const parsed = parseHtml(html)
  const issues = []

  if (parsed.title === HOME_TITLE) issues.push('HOME_SHELL')
  if (parsed.textLength < 400) issues.push(`THIN_CONTENT — ${parsed.textLength} chars`)
  if (!parsed.canonical) issues.push('NO_CANONICAL')

  return {
    path,
    status: issues.length === 0 ? 'PASS' : 'FAIL',
    title: parsed.title,
    textLength: parsed.textLength,
    jsonLd: parsed.jsonLdTypes.join(', ') || '(none)',
    issues,
  }
}

async function main() {
  console.log(`\n🔍 CVitae Public HTML Check — ${isLive ? `LIVE (${BASE_URL})` : 'LOCAL (dist/)'}`)
  console.log('='.repeat(60))

  let pass = 0, fail = 0

  // Check static routes
  console.log('\n📄 STATIC ROUTES')
  for (const [path, titleFrag, hasContent] of ROUTES) {
    const r = await checkRoute(path, titleFrag, hasContent)
    const icon = r.status === 'PASS' ? '✅' : r.status === 404 ? '❌' : r.status === 'ERROR' ? '⚠️' : '❌'
    const statusLabel = r.status === 'PASS' ? 'PASS' : r.status === 404 ? 'MISSING' : r.status === 'ERROR' ? 'ERROR' : 'FAIL'
    console.log(`${icon} ${path.padEnd(20)} ${statusLabel.padEnd(8)} ${r.title || ''} [${r.textLength || 0} chars]`)
    if (r.issues?.length) r.issues.forEach(i => console.log(`   ⚠ ${i}`))
    if (r.status === 'PASS') pass++; else fail++
  }

  // Dynamic routes — get slugs from sitemap or dist files
  console.log('\n📝 DYNAMIC ROUTE SAMPLES')
  const dynamicRoutes = []

  if (!isLive) {
    // Check dist/ for generated files
    const { readdirSync } = await import('fs')
    for (const section of ['blog', 'empleos', 'oportunidades']) {
      const sectionDir = join(distDir, section)
      if (existsSync(sectionDir)) {
        const slugs = readdirSync(sectionDir).filter(f => !f.endsWith('.html')).slice(0, 3)
        slugs.forEach(slug => dynamicRoutes.push(`/${section}/${slug}`))
      }
    }
  } else {
    // Check sitemap for live slugs
    try {
      const sitemapResult = await getHtmlLive('/sitemap.xml')
      const slugMatches = sitemapResult.html.match(/<loc>(https:\/\/cvitae\.lat\/(?:blog|empleos|oportunidades)\/[^<]+)<\/loc>/g) || []
      slugMatches.slice(0, 6).forEach(m => {
        const url = m.replace(/<\/?loc>/g, '')
        dynamicRoutes.push(url.replace(BASE_URL, ''))
      })
    } catch (e) {
      console.log('  ⚠️ Could not fetch sitemap:', e.message)
    }
  }

  if (dynamicRoutes.length === 0) {
    console.log('  (no dynamic routes found to check)')
  }

  for (const path of dynamicRoutes) {
    const r = await checkSlugRoute(path)
    const icon = r.status === 'PASS' ? '✅' : r.status === 404 ? '⚠️' : '❌'
    console.log(`${icon} ${path.slice(0, 55).padEnd(55)} ${String(r.status).padEnd(6)} [${r.textLength || '404'} chars]`)
    if (r.issues?.length) r.issues.forEach(i => console.log(`   ⚠ ${i}`))
    if (r.status === 'PASS') pass++; else if (r.status !== 404) fail++
  }

  // Check invalid route (should be 404 or home-shell, depending on Netlify rules)
  console.log('\n🚫 404 BEHAVIOR')
  if (!isLive) {
    const notFoundPath = join(distDir, '404.html')
    console.log(`  dist/404.html: ${existsSync(notFoundPath) ? '✅ EXISTS' : '❌ MISSING'}`)
  } else {
    const badRoute = await getHtmlLive('/this-route-does-not-exist-xyz')
    const parsed = parseHtml(badRoute.html)
    const isHome = parsed.title === HOME_TITLE
    console.log(`  /nonexistent → STATUS:${badRoute.status} ${isHome ? '⚠️ HOME_SHELL (soft 404)' : '✅ ' + parsed.title}`)
  }

  console.log('\n' + '='.repeat(60))
  console.log(`RESULT: ${pass} PASS / ${fail} FAIL`)
  if (fail > 0) {
    console.log('❌ Some checks failed. Fix pre-render before pushing.')
    process.exit(1)
  } else {
    console.log('✅ All checks passed.')
  }
}

main().catch(err => { console.error('Check script error:', err); process.exit(1) })
