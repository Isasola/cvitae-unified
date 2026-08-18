/**
 * audit-indexability.mjs
 *
 * Audits a URL (or a list of URLs) for all properties relevant to Google indexability.
 * No paid APIs. Uses only curl-equivalent HTTP requests.
 *
 * Usage:
 *   node scripts/audit-indexability.mjs https://cvitae.lat/empleos/some-job-slug
 *   node scripts/audit-indexability.mjs --file urls.txt
 *   node scripts/audit-indexability.mjs --sitemap    # audits all sitemap URLs
 *
 * Output per URL:
 *   HTTP status, redirect chain, robots.txt allowed/blocked, canonical,
 *   self-canonical, meta robots, title, H1, body text length,
 *   JSON-LD types, in-sitemap, home-shell, thin content indicators.
 */

import https from 'https'
import http from 'http'
import { readFileSync, existsSync } from 'fs'

const SITE_URL = 'https://cvitae.lat'
const ROBOTS_URL = `${SITE_URL}/robots.txt`
const SITEMAP_URL = `${SITE_URL}/sitemap.xml`
const USER_AGENT = 'CVitaeIndexAudit/1.0'
const HOME_TITLE = 'CVitae | Tu Agente de Carrera Inteligente para Paraguay'
const TIMEOUT_MS = 10000

// ── Fetch helpers ────────────────────────────────────────────────────────────

async function fetchText(url, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    function doFetch(targetUrl, redirectChain, depth) {
      if (depth > maxRedirects) {
        return resolve({ body: '', status: 999, redirectChain, finalUrl: targetUrl, error: 'Too many redirects' })
      }
      const client = targetUrl.startsWith('https') ? https : http
      const req = client.get(targetUrl, { headers: { 'User-Agent': USER_AGENT } }, res => {
        if (res.statusCode >= 301 && res.statusCode <= 308 && res.headers.location) {
          const next = res.headers.location.startsWith('http')
            ? res.headers.location
            : `${SITE_URL}${res.headers.location}`
          res.resume()
          redirectChain.push({ from: targetUrl, to: next, status: res.statusCode })
          return doFetch(next, redirectChain, depth + 1)
        }
        let body = ''
        res.on('data', c => { body += c })
        res.on('end', () => resolve({ body, status: res.statusCode, redirectChain, finalUrl: targetUrl, headers: res.headers }))
      })
      req.on('error', e => resolve({ body: '', status: 0, redirectChain, finalUrl: targetUrl, error: e.message }))
      req.setTimeout(TIMEOUT_MS, () => { req.destroy(); resolve({ body: '', status: 0, redirectChain, finalUrl: targetUrl, error: 'Timeout' }) })
    }
    doFetch(url, [], 0)
  })
}

// ── Robots.txt parser ────────────────────────────────────────────────────────

let robotsRules = null
async function getRobotsRules() {
  if (robotsRules) return robotsRules
  const { body } = await fetchText(ROBOTS_URL)
  const rules = { disallow: [], allow: [] }
  let activeAgent = false
  for (const rawLine of body.split('\n')) {
    const line = rawLine.trim()
    if (line.startsWith('User-agent:')) {
      const agent = line.replace('User-agent:', '').trim().toLowerCase()
      activeAgent = agent === '*' || agent === 'googlebot'
    } else if (activeAgent && line.startsWith('Disallow:')) {
      const path = line.replace('Disallow:', '').trim()
      if (path) rules.disallow.push(path)
    } else if (activeAgent && line.startsWith('Allow:')) {
      const path = line.replace('Allow:', '').trim()
      if (path && path !== '/') rules.allow.push(path)
    }
  }
  robotsRules = rules
  return rules
}

function isAllowedByRobots(pathname, rules) {
  // Check most-specific rule wins — allow takes priority over disallow for same-length
  const disallowed = rules.disallow.filter(d => pathname.startsWith(d))
  const allowed = rules.allow.filter(a => pathname.startsWith(a))
  if (disallowed.length === 0) return { allowed: true, matchedRule: null }
  const longestDisallow = disallowed.reduce((a, b) => a.length > b.length ? a : b, '')
  const longestAllow = allowed.reduce((a, b) => a.length > b.length ? a : b, '')
  if (longestAllow.length >= longestDisallow.length) {
    return { allowed: true, matchedRule: `Allow: ${longestAllow}` }
  }
  return { allowed: false, matchedRule: `Disallow: ${longestDisallow}` }
}

// ── Sitemap URL set ──────────────────────────────────────────────────────────

let sitemapUrls = null
async function getSitemapUrls() {
  if (sitemapUrls) return sitemapUrls
  const { body } = await fetchText(SITEMAP_URL)
  sitemapUrls = new Set((body.match(/<loc>([^<]+)<\/loc>/g) || []).map(s => s.replace(/<\/?loc>/g, '').trim()))
  return sitemapUrls
}

// ── HTML parser ──────────────────────────────────────────────────────────────

function parseHtml(html) {
  const get = re => { const m = html.match(re); return m ? m[1].trim() : '' }
  const title = get(/<title[^>]*>([^<]*)<\/title>/i)
  const h1 = get(/<h1[^>]*>([^<]*)<\/h1>/i)
  const desc = get(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)
  const canonical = get(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']*)["']/i)
  const robots = get(/<meta[^>]+name=["']robots["'][^>]+content=["']([^"']*)["']/i)
  const xRobots = '' // Could parse from headers if needed
  const jsonLdTypes = (html.match(/"@type"\s*:\s*"([^"]+)"/g) || []).map(s => s.match(/"([^"]+)"$/)[1])
  const stripped = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return { title, h1, desc, canonical, robots, jsonLdTypes, textLength: stripped.length, textSample: stripped.substring(0, 200) }
}

// ── Audit a single URL ───────────────────────────────────────────────────────

async function auditUrl(url) {
  const [robotsRules, sitemapUrls, result] = await Promise.all([
    getRobotsRules(),
    getSitemapUrls(),
    fetchText(url),
  ])

  const { body: html, status, redirectChain, finalUrl, error, headers } = result
  let urlObj
  try { urlObj = new URL(finalUrl || url) } catch { urlObj = { pathname: '/' } }
  const pathname = urlObj.pathname || '/'

  const robotsCheck = isAllowedByRobots(pathname, robotsRules)
  const inSitemap = sitemapUrls.has(finalUrl) || sitemapUrls.has(url) ||
    sitemapUrls.has(finalUrl?.replace(/\/$/, '')) || sitemapUrls.has(url.replace(/\/$/, ''))

  const parsed = html ? parseHtml(html) : null

  const canonical = parsed?.canonical || ''
  const selfCanonical = canonical === finalUrl || canonical === url ||
    canonical === finalUrl?.replace(/\/$/, '') || canonical === url.replace(/\/$/, '')

  const isHomeShell = parsed && parsed.title === HOME_TITLE && url !== SITE_URL && url !== `${SITE_URL}/`
  const thinContent = parsed && parsed.textLength < 200
  const hasNoindex = parsed?.robots?.toLowerCase().includes('noindex') || false

  return {
    url,
    finalUrl,
    status,
    redirectChain,
    error: error || null,
    robotsAllowed: robotsCheck.allowed,
    robotsRule: robotsCheck.matchedRule,
    inSitemap,
    title: parsed?.title || '',
    h1: parsed?.h1 || '',
    metaDesc: parsed?.desc || '',
    canonical,
    selfCanonical,
    metaRobots: parsed?.robots || '',
    hasNoindex,
    jsonLdTypes: parsed?.jsonLdTypes || [],
    textLength: parsed?.textLength || 0,
    textSample: parsed?.textSample?.substring(0, 120) || '',
    isHomeShell: !!isHomeShell,
    thinContent: !!thinContent,
    xRobotsTag: headers?.['x-robots-tag'] || '',
  }
}

// ── Report formatting ────────────────────────────────────────────────────────

function formatResult(r) {
  const flags = []
  if (!r.robotsAllowed) flags.push(`🚫 BLOCKED_ROBOTS (${r.robotsRule})`)
  if (r.hasNoindex) flags.push('⛔ NOINDEX')
  if (r.isHomeShell) flags.push('🏠 HOME_SHELL')
  if (r.thinContent) flags.push(`📄 THIN (${r.textLength} chars)`)
  if (!r.selfCanonical && r.canonical) flags.push(`↩ CANONICAL→${r.canonical}`)
  if (!r.inSitemap) flags.push('📍 NOT_IN_SITEMAP')
  if (r.status === 200 && r.redirectChain.length > 0) flags.push(`↪ ${r.redirectChain.length} redirect(s)`)
  if (r.status === 404 || r.status === 0) flags.push(`❌ STATUS_${r.status}`)
  if (r.error) flags.push(`⚠ ${r.error}`)

  const status = flags.length === 0 || (flags.length === 1 && flags[0].includes('NOT_IN_SITEMAP')) ? '✅' : '⚠'

  const lines = [
    `${status} ${r.url}`,
    `   Status: ${r.status} | Final: ${r.finalUrl}`,
    `   Title: ${r.title || '(none)'}`,
    `   H1: ${r.h1 || '(none)'}`,
    `   Canonical: ${r.canonical || '(none)'} ${r.selfCanonical ? '✓self' : r.canonical ? '(external)' : '(missing)'}`,
    `   Schema: ${r.jsonLdTypes.join(', ') || '(none)'}`,
    `   Text: ${r.textLength} chars`,
    `   Robots: ${r.robotsAllowed ? '✓ allowed' : '🚫 blocked'}`,
    `   Sitemap: ${r.inSitemap ? '✓ yes' : '✗ no'}`,
    ...(flags.length > 0 ? [`   Flags: ${flags.join(', ')}`] : []),
    ...(r.redirectChain.length > 0 ? [`   Redirects: ${r.redirectChain.map(rc => `${rc.status} ${rc.from} → ${rc.to}`).join(' → ')}`] : []),
  ]
  return lines.join('\n')
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2)
  let urls = []

  if (args.includes('--sitemap')) {
    console.log(`🔍 Fetching sitemap from ${SITEMAP_URL}...`)
    const { body } = await fetchText(SITEMAP_URL)
    urls = (body.match(/<loc>([^<]+)<\/loc>/g) || []).map(s => s.replace(/<\/?loc>/g, '').trim())
    console.log(`   Found ${urls.length} URLs in sitemap\n`)
  } else if (args.includes('--file')) {
    const filePath = args[args.indexOf('--file') + 1]
    if (!filePath || !existsSync(filePath)) { console.error('File not found:', filePath); process.exit(1) }
    urls = readFileSync(filePath, 'utf-8').split('\n').map(u => u.trim()).filter(u => u.startsWith('http'))
  } else {
    urls = args.filter(a => a.startsWith('http'))
    if (urls.length === 0) {
      console.log('Usage:')
      console.log('  node scripts/audit-indexability.mjs https://cvitae.lat/empleos/slug')
      console.log('  node scripts/audit-indexability.mjs --file urls.txt')
      console.log('  node scripts/audit-indexability.mjs --sitemap')
      process.exit(0)
    }
  }

  // Batch limit to avoid hammering the server
  const BATCH_SIZE = 5
  const results = []

  for (let i = 0; i < urls.length; i += BATCH_SIZE) {
    const batch = urls.slice(i, i + BATCH_SIZE)
    const batchResults = await Promise.all(batch.map(auditUrl))
    results.push(...batchResults)
    if (i + BATCH_SIZE < urls.length) {
      process.stdout.write(`\r   Audited ${Math.min(i + BATCH_SIZE, urls.length)}/${urls.length}...`)
    }
  }

  if (urls.length > 5) console.log('\n')

  // Print results
  results.forEach(r => { console.log(formatResult(r)); console.log('') })

  // Summary
  const blocked = results.filter(r => !r.robotsAllowed)
  const noindex = results.filter(r => r.hasNoindex)
  const thin = results.filter(r => r.thinContent)
  const homeShell = results.filter(r => r.isHomeShell)
  const notInSitemap = results.filter(r => !r.inSitemap)
  const nonSelfCanonical = results.filter(r => !r.selfCanonical && r.canonical)
  const errors = results.filter(r => r.status !== 200 || r.error)

  console.log('═══════════════════════════════════════════════════════════')
  console.log(`SUMMARY — ${results.length} URLs audited`)
  console.log('═══════════════════════════════════════════════════════════')
  console.log(`✅ Clean:            ${results.filter(r => r.robotsAllowed && !r.hasNoindex && !r.isHomeShell && !r.thinContent && r.selfCanonical).length}`)
  console.log(`🚫 Robots blocked:   ${blocked.length}`)
  console.log(`⛔ Noindex:          ${noindex.length}`)
  console.log(`📄 Thin content:     ${thin.length}`)
  console.log(`🏠 Home shell:       ${homeShell.length}`)
  console.log(`📍 Not in sitemap:   ${notInSitemap.length}`)
  console.log(`↩  Non-self canonical: ${nonSelfCanonical.length}`)
  console.log(`❌ Errors/404:       ${errors.length}`)
}

main().catch(err => { console.error(err); process.exit(1) })
