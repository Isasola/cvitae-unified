import { createSign } from "node:crypto"

interface ServiceAccount {
  client_email: string
  private_key: string
  token_uri?: string
}

interface CachedReport {
  expiresAt: number
  value: any
}

let reportCache: CachedReport | null = null

function base64url(value: string | Buffer): string {
  return Buffer.from(value).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_")
}

async function accessToken(account: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))
  const claims = base64url(JSON.stringify({
    iss: account.client_email,
    scope: "https://www.googleapis.com/auth/analytics.readonly https://www.googleapis.com/auth/webmasters.readonly",
    aud: account.token_uri || "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }))
  const unsigned = `${header}.${claims}`
  const signer = createSign("RSA-SHA256")
  signer.update(unsigned)
  signer.end()
  const assertion = `${unsigned}.${base64url(signer.sign(account.private_key))}`
  const response = await fetch(account.token_uri || "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  })
  const body = await response.json() as any
  if (!response.ok || !body.access_token) throw new Error(body.error_description || body.error || `Google OAuth ${response.status}`)
  return body.access_token
}

function dateDaysAgo(days: number): string {
  const value = new Date(Date.now() - days * 86400000)
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(value)
}

export function percentChange(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return null
  return Math.round(((current - previous) / previous) * 1000) / 10
}

function metricRecord(body: any, rowIndex = 0): Record<string, number> {
  const row = body?.rows?.[rowIndex]
  const result: Record<string, number> = {}
  for (let index = 0; index < (body?.metricHeaders || []).length; index++) {
    result[body.metricHeaders[index].name] = Number(row?.metricValues?.[index]?.value || 0)
  }
  return result
}

function dimensionRows(body: any): any[] {
  const dimensionNames = (body?.dimensionHeaders || []).map((item: any) => item.name)
  const metricNames = (body?.metricHeaders || []).map((item: any) => item.name)
  return (body?.rows || []).map((row: any) => ({
    ...Object.fromEntries(dimensionNames.map((name: string, index: number) => [name, row.dimensionValues?.[index]?.value || ""])),
    ...Object.fromEntries(metricNames.map((name: string, index: number) => [name, Number(row.metricValues?.[index]?.value || 0)])),
  }))
}

async function googlePost(url: string, authorization: Record<string, string>, body: unknown): Promise<any> {
  const response = await fetch(url, { method: "POST", headers: authorization, body: JSON.stringify(body) })
  const value = await response.json() as any
  if (!response.ok) throw new Error(value.error?.message || `Google API ${response.status}`)
  return value
}

async function analyticsReport(token: string, propertyId: string, request: any): Promise<any> {
  return googlePost(
    `https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(propertyId)}:runReport`,
    { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    request,
  )
}

async function getAnalytics(token: string, propertyId: string, errors: string[]): Promise<any> {
  try {
    const metricNames = ["activeUsers", "newUsers", "sessions", "screenPageViews", "eventCount"]
    const [currentBody, previousBody] = await Promise.all([
      analyticsReport(token, propertyId, { dateRanges: [{ startDate: "28daysAgo", endDate: "yesterday" }], metrics: metricNames.map(name => ({ name })) }),
      analyticsReport(token, propertyId, { dateRanges: [{ startDate: "56daysAgo", endDate: "29daysAgo" }], metrics: metricNames.map(name => ({ name })) }),
    ])
    const current = metricRecord(currentBody)
    const previous = metricRecord(previousBody)
    const enrichments = await Promise.allSettled([
      analyticsReport(token, propertyId, {
        dateRanges: [{ startDate: "28daysAgo", endDate: "yesterday" }], dimensions: [{ name: "sessionDefaultChannelGroup" }],
        metrics: [{ name: "sessions" }, { name: "activeUsers" }], orderBys: [{ metric: { metricName: "sessions" }, desc: true }], limit: 6,
      }),
      analyticsReport(token, propertyId, {
        dateRanges: [{ startDate: "28daysAgo", endDate: "yesterday" }], dimensions: [{ name: "landingPagePlusQueryString" }],
        metrics: [{ name: "sessions" }, { name: "activeUsers" }], orderBys: [{ metric: { metricName: "sessions" }, desc: true }], limit: 6,
      }),
      analyticsReport(token, propertyId, {
        dateRanges: [{ startDate: "14daysAgo", endDate: "yesterday" }], dimensions: [{ name: "date" }],
        metrics: [{ name: "activeUsers" }, { name: "sessions" }], orderBys: [{ dimension: { dimensionName: "date" } }], limit: 14,
      }),
    ])
    const enrichment = (index: number, label: string) => {
      const item = enrichments[index]
      if (item.status === "rejected") {
        errors.push(`Analytics ${label}: ${item.reason?.message || "consulta no disponible"}`)
        return []
      }
      return dimensionRows(item.value)
    }
    return {
      ...current,
      period: "28d",
      previous,
      changes: Object.fromEntries(metricNames.map(name => [name, percentChange(current[name] || 0, previous[name] || 0)])),
      topChannels: enrichment(0, "canales"),
      topLandingPages: enrichment(1, "landing pages"),
      daily: enrichment(2, "tendencia diaria"),
    }
  } catch (error: any) {
    errors.push(`Analytics: ${error.message}`)
    return null
  }
}

async function searchConsoleReport(token: string, siteUrl: string, request: any): Promise<any> {
  return googlePost(
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
    { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    request,
  )
}

function searchSummary(row: any): any {
  return {
    clicks: Number(row?.clicks || 0), impressions: Number(row?.impressions || 0),
    ctr: Number(row?.ctr || 0), position: Number(row?.position || 0),
  }
}

async function getSearchConsole(token: string, siteUrl: string, errors: string[]): Promise<any> {
  const currentRange = { startDate: dateDaysAgo(28), endDate: dateDaysAgo(1), type: "web", dataState: "final" }
  const previousRange = { startDate: dateDaysAgo(56), endDate: dateDaysAgo(29), type: "web", dataState: "final" }
  try {
    const [currentBody, previousBody] = await Promise.all([
      searchConsoleReport(token, siteUrl, currentRange),
      searchConsoleReport(token, siteUrl, previousRange),
    ])
    const current = searchSummary(currentBody.rows?.[0])
    const previous = searchSummary(previousBody.rows?.[0])
    const enrichments = await Promise.allSettled([
      searchConsoleReport(token, siteUrl, { ...currentRange, dimensions: ["query"], rowLimit: 10 }),
      searchConsoleReport(token, siteUrl, { ...currentRange, dimensions: ["page"], rowLimit: 10 }),
      searchConsoleReport(token, siteUrl, { ...currentRange, dimensions: ["date"], rowLimit: 31 }),
    ])
    const rows = (index: number, label: string) => {
      const item = enrichments[index]
      if (item.status === "rejected") {
        errors.push(`Search Console ${label}: ${item.reason?.message || "consulta no disponible"}`)
        return []
      }
      return item.value.rows || []
    }
    return {
      ...current,
      period: "28d",
      previous,
      changes: {
        clicks: percentChange(current.clicks, previous.clicks),
        impressions: percentChange(current.impressions, previous.impressions),
        ctrPoints: Math.round((current.ctr - previous.ctr) * 10000) / 100,
        position: Math.round((current.position - previous.position) * 10) / 10,
      },
      topQueries: rows(0, "consultas").map((row: any) => ({ query: row.keys?.[0] || "", ...searchSummary(row) })),
      topPages: rows(1, "páginas").map((row: any) => ({ page: row.keys?.[0] || "", ...searchSummary(row) })),
      daily: rows(2, "tendencia diaria").map((row: any) => ({ date: row.keys?.[0] || "", ...searchSummary(row) })),
    }
  } catch (error: any) {
    errors.push(`Search Console: ${error.message}`)
    return null
  }
}

export async function getGoogleReportingMetrics(): Promise<any> {
  if (reportCache && reportCache.expiresAt > Date.now()) return { ...reportCache.value, cached: true }

  const rawAccount = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  const propertyId = process.env.GA4_PROPERTY_ID
  const siteUrl = process.env.SEARCH_CONSOLE_SITE_URL
  const configured = Boolean(rawAccount && (propertyId || siteUrl))
  if (!configured) {
    return {
      configured: false, credentialsValid: false,
      analyticsConfigured: Boolean(propertyId), searchConsoleConfigured: Boolean(siteUrl),
      analytics: null, searchConsole: null, errors: [], fetchedAt: null, cached: false,
    }
  }

  let account: ServiceAccount
  try {
    account = JSON.parse(rawAccount || "{}")
    if (!account.client_email || !account.private_key) throw new Error("faltan client_email o private_key")
    account.private_key = account.private_key.replace(/\\n/g, "\n")
  } catch (error: any) {
    return {
      configured: true, credentialsValid: false,
      analyticsConfigured: Boolean(propertyId), searchConsoleConfigured: Boolean(siteUrl),
      analytics: null, searchConsole: null, errors: [`GOOGLE_SERVICE_ACCOUNT_JSON inválido: ${error.message}`], fetchedAt: null, cached: false,
    }
  }

  const errors: string[] = []
  let token: string
  try {
    token = await accessToken(account)
  } catch (error: any) {
    return {
      configured: true, credentialsValid: false,
      analyticsConfigured: Boolean(propertyId), searchConsoleConfigured: Boolean(siteUrl),
      analytics: null, searchConsole: null, errors: [`Google OAuth: ${error.message}`], fetchedAt: null, cached: false,
    }
  }

  const [analytics, searchConsole] = await Promise.all([
    propertyId ? getAnalytics(token, propertyId, errors) : Promise.resolve(null),
    siteUrl ? getSearchConsole(token, siteUrl, errors) : Promise.resolve(null),
  ])
  const value = {
    configured: true,
    credentialsValid: true,
    analyticsConfigured: Boolean(propertyId),
    searchConsoleConfigured: Boolean(siteUrl),
    analytics,
    searchConsole,
    errors,
    fetchedAt: new Date().toISOString(),
    cached: false,
  }
  reportCache = { expiresAt: Date.now() + (errors.length ? 60_000 : 5 * 60_000), value }
  return value
}
