import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { isUnsafeReviewUrl, normalizeReviewUrl, type PageObservation } from '../../../src/lib/review/opportunity-review'

const MAX_REDIRECTS = 5
const MAX_HTML_BYTES = 250_000
const CLOSED_RE = /(position has been filled|job (?:is )?closed|vacancy closed|application period (?:has )?ended|convocatoria cerrada|ya no est[aá] disponible|la convocatoria ha concluido)/i
const LOGIN_RE = /\/(login|signin|sign-in|auth)(?:\/|$)/i
const AGGREGATOR_HOSTS = /(linkedin|indeed|glassdoor|computrabajo|opportunitydesk|remotive|weworkremotely|himalayas|unjobs)\./i

export interface SafeFetchDependencies {
  fetchImpl?: typeof fetch
  resolveHost?: (hostname: string) => Promise<string[]>
}

function privateIp(address: string): boolean {
  if (address === '::1' || address === '::') return true
  if (address.startsWith('fc') || address.startsWith('fd') || address.startsWith('fe80:')) return true
  if (isIP(address) === 4) {
    const [a, b] = address.split('.').map(Number)
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
  }
  return false
}

async function defaultResolve(hostname: string): Promise<string[]> {
  const rows = await lookup(hostname, { all: true, verbatim: true })
  return rows.map(row => row.address)
}

async function assertPublicUrl(raw: string, resolveHost: (hostname: string) => Promise<string[]>): Promise<URL> {
  if (isUnsafeReviewUrl(raw)) throw new Error('unsafe_url')
  const url = new URL(raw)
  const addresses = await resolveHost(url.hostname)
  if (!addresses.length || addresses.some(privateIp)) throw new Error('unsafe_dns_target')
  return url
}

function absoluteUrl(value: string | null, base: string): string | null {
  if (!value) return null
  try { return new URL(value, base).toString() } catch { return null }
}

function cleanText(value: unknown, limit = 4000): string | null {
  if (typeof value !== 'string') return null
  const text = value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, limit)
  return text || null
}

function jsonLdJobPosting(html: string): Record<string, any> | null {
  const scripts = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi) || []
  for (const script of scripts) {
    const raw = script.replace(/^.*?>/s, '').replace(/<\/script>$/i, '')
    try {
      const parsed = JSON.parse(raw); const values = Array.isArray(parsed) ? parsed : [parsed, ...(parsed['@graph'] || [])]
      const job = values.find((value: any) => value && (value['@type'] === 'JobPosting' || value['@type']?.includes?.('JobPosting')))
      if (job) return job
    } catch { /* invalid publisher JSON-LD is non-fatal */ }
  }
  return null
}

function extract(html: string, finalUrl: string, status: number, redirects: string[]): PageObservation {
  const job = jsonLdJobPosting(html)
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || null
  const canonicalRaw = html.match(/<link[^>]+rel=["'][^"']*canonical[^"']*["'][^>]+href=["']([^"']+)["']/i)?.[1]
    || html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["'][^"']*canonical[^"']*["']/i)?.[1]
    || null
  const organization = cleanText(job?.hiringOrganization?.name, 240) || html.match(/"hiringOrganization"\s*:\s*\{[\s\S]{0,1500}?"name"\s*:\s*"([^"]+)"/i)?.[1]
    || html.match(/"organization"\s*:\s*"([^"]+)"/i)?.[1]
    || null
  const closedSignal = html.match(CLOSED_RE)?.[0] || null
  const host = new URL(finalUrl).hostname
  const pageKind: PageObservation['pageKind'] = status >= 500 || status === 404 || status === 410
    ? 'error'
    : LOGIN_RE.test(new URL(finalUrl).pathname)
      ? 'login'
      : AGGREGATOR_HOSTS.test(host)
        ? 'aggregator'
        : title || /application\/ld\+json/i.test(html)
          ? 'opportunity'
          : 'unknown'
  return {
    requestedUrl: redirects[0] || finalUrl,
    finalUrl,
    redirects: redirects.slice(1),
    status,
    canonical: absoluteUrl(canonicalRaw, finalUrl),
    title,
    organization,
    description: cleanText(job?.description) || cleanText(html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)/i)?.[1]) || cleanText(html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)/i)?.[1]),
    salary: cleanText(job?.baseSalary?.value?.value ?? job?.baseSalary?.value ?? job?.baseSalary, 160),
    salaryCurrency: cleanText(job?.baseSalary?.currency, 12),
    datePosted: cleanText(job?.datePosted, 64),
    validThrough: cleanText(job?.validThrough, 64),
    employmentType: cleanText(Array.isArray(job?.employmentType) ? job.employmentType.join(', ') : job?.employmentType, 160),
    jobLocation: cleanText(job?.jobLocation?.address?.addressCountry ?? job?.jobLocation?.address?.addressLocality ?? job?.jobLocation, 240),
    applicantLocationRequirements: cleanText(job?.applicantLocationRequirements?.name ?? job?.applicantLocationRequirements, 240),
    hasStructuredData: /<script[^>]+type=["']application\/ld\+json["']/i.test(html),
    closedSignal,
    pageKind,
  }
}

export async function fetchOpportunityPage(
  rawUrl: string,
  dependencies: SafeFetchDependencies = {},
): Promise<PageObservation> {
  const fetchImpl = dependencies.fetchImpl || fetch
  const resolveHost = dependencies.resolveHost || defaultResolve
  let current = normalizeReviewUrl(rawUrl)
  if (!current) throw new Error('invalid_url')
  const chain = [current]

  for (let count = 0; count <= MAX_REDIRECTS; count++) {
    await assertPublicUrl(current, resolveHost)
    const response = await fetchImpl(current, {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(10_000),
      headers: { 'User-Agent': 'CVitaeReviewBot/1.0 (+https://cvitae.lat)' },
    })
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location')
      if (!location) return extract('', current, response.status, chain)
      if (count === MAX_REDIRECTS) throw new Error('too_many_redirects')
      current = new URL(location, current).toString()
      chain.push(current)
      continue
    }
    const contentType = response.headers.get('content-type') || ''
    const html = /html|text\//i.test(contentType) ? (await response.text()).slice(0, MAX_HTML_BYTES) : ''
    return extract(html, current, response.status, chain)
  }
  throw new Error('too_many_redirects')
}
