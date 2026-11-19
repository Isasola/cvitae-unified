/**
 * Internal SEO Crawler.
 * Checks a batch of CVitae URLs for: HTTP status, title, meta description,
 * canonical, robots/noindex, JSON-LD presence, and basic render mismatch.
 *
 * POST /api/seo-crawler
 * Body: { urls: string[] }
 * Returns per-URL crawl results.
 *
 * Limit: 20 URLs per request (to stay within Netlify function timeout).
 */

import type { Handler } from '@netlify/functions'

const SITE_URL = 'https://cvitae.lat'
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD

interface CrawlResult {
  url: string
  status: number | null
  title: string | null
  metaDescription: string | null
  canonical: string | null
  noindex: boolean
  hasJsonLd: boolean
  jsonLdTypes: string[]
  jobPostingTitle: string | null  // @type:JobPosting title field value
  renderMismatch: boolean         // prerendered title != JSON-LD title
  error: string | null
}

function extractMeta(html: string): Omit<CrawlResult, 'url' | 'status' | 'error'> {
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
  const title = titleMatch ? titleMatch[1].trim() : null

  const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i)
  const metaDescription = descMatch ? descMatch[1].trim() : null

  const canonicalMatch = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)
    || html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i)
  const canonical = canonicalMatch ? canonicalMatch[1].trim() : null

  const noindex = /noindex/i.test(html)

  // Extract JSON-LD blocks
  const ldMatches = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
  const jsonLdTypes: string[] = []
  let jobPostingTitle: string | null = null

  for (const match of ldMatches) {
    try {
      const parsed = JSON.parse(match[1])
      const type = parsed['@type']
      if (type) jsonLdTypes.push(type)
      if (type === 'JobPosting') {
        jobPostingTitle = parsed.title || parsed.name || null
      }
    } catch { /* skip malformed */ }
  }

  const hasJsonLd = ldMatches.length > 0

  // Render mismatch: page title doesn't include the JobPosting title
  const renderMismatch = jobPostingTitle !== null && title !== null
    ? !title.toLowerCase().includes(jobPostingTitle.toLowerCase().substring(0, 20))
    : false

  return { title, metaDescription, canonical, noindex, hasJsonLd, jsonLdTypes, jobPostingTitle, renderMismatch }
}

async function crawlUrl(url: string): Promise<CrawlResult> {
  const base: CrawlResult = {
    url, status: null, title: null, metaDescription: null,
    canonical: null, noindex: false, hasJsonLd: false, jsonLdTypes: [],
    jobPostingTitle: null, renderMismatch: false, error: null,
  }
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'CVitae-SEO-Crawler/1.0' },
    })
    clearTimeout(timeout)
    base.status = res.status
    if (res.ok) {
      const html = await res.text()
      Object.assign(base, extractMeta(html))
    }
  } catch (err: any) {
    base.error = err?.name === 'AbortError' ? 'Timeout (10s)' : err?.message || 'Fetch failed'
  }
  return base
}

const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  const auth = event.headers['x-admin-password'] || event.headers['authorization']?.replace('Bearer ', '')
  if (auth !== ADMIN_PASSWORD) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) }
  }

  let urls: string[]
  try {
    const body = JSON.parse(event.body || '{}')
    urls = Array.isArray(body.urls) ? body.urls : []
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) }
  }

  // Only allow CVitae URLs — prevent SSRF
  const safe = urls
    .filter((u): u is string => typeof u === 'string')
    .filter(u => u.startsWith(SITE_URL + '/') || u === SITE_URL)
    .slice(0, 20)

  if (safe.length === 0) {
    return { statusCode: 400, body: JSON.stringify({ error: 'No valid CVitae URLs provided (max 20, must start with ' + SITE_URL + ')' }) }
  }

  const results = await Promise.all(safe.map(crawlUrl))
  return { statusCode: 200, body: JSON.stringify({ crawled: results.length, results }) }
}

export { handler }
