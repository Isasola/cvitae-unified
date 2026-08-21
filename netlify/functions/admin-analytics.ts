import { makeSupabaseAdmin } from './_supabase'
import { observeAiCall } from './lib/ai-telemetry'
import {
  analyticsAiRequested,
  analyticsGeminiConfigured,
  CLOSED_ANALYTICS_RANGES,
  GEMINI_ANALYTICS_TIMEOUT_MS,
} from './lib/admin-analytics-policy'
import { createSign } from 'crypto'

// ── Constants ─────────────────────────────────────────────────────────────────

const GEMINI_MODEL = 'gemini-3.5-flash-lite'
const GEMINI_API   = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`
const GA4_API      = 'https://analyticsdata.googleapis.com/v1beta/properties'
const GSC_API      = 'https://www.googleapis.com/webmasters/v3/sites'
const TOKEN_URL    = 'https://oauth2.googleapis.com/token'
const GA4_PROPERTY = process.env.GA4_PROPERTY_ID || '529848293'
const GSC_SITE     = 'https://cvitae.lat/'

// ── Types ─────────────────────────────────────────────────────────────────────

interface GeminiSignal {
  type: 'green' | 'yellow' | 'red' | 'blue' | 'purple'
  title: string
  detail: string
  confidence: 'high' | 'medium' | 'low'
  sources: string[]
}

interface GeminiRecommendation {
  priority: 'high' | 'medium' | 'low'
  title: string
  evidence: string
  impact: string
  effort: 'low' | 'medium' | 'high'
}

interface GeminiQuickWin {
  query: string
  position: number
  impressions: number
  ctr_pct: number
  recommendation: string
}

interface GeminiBlogInsight {
  identifier: string
  insight: string
  confidence: 'high' | 'medium' | 'low'
}

interface GeminiLinkedInPick {
  title: string
  reason: string
}

interface GeminiResult {
  executive_summary: string
  signals: GeminiSignal[]
  recommendations: GeminiRecommendation[]
  seo_quick_wins: GeminiQuickWin[]
  blog_insights: GeminiBlogInsight[]
  linkedin_picks: GeminiLinkedInPick[]
  answer: string
}

interface Anomaly {
  type: string
  message: string
  severity: 'high' | 'medium' | 'low'
  data?: Record<string, any>
}

// ── Google Service Account JWT auth ──────────────────────────────────────────

function base64url(data: Buffer | string): string {
  const b64 = Buffer.isBuffer(data)
    ? data.toString('base64')
    : Buffer.from(data as string).toString('base64')
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

async function getGoogleAccessToken(saJson: string): Promise<string | null> {
  let sa: any
  try { sa = JSON.parse(saJson) } catch { return null }

  const now     = Math.floor(Date.now() / 1000)
  const header  = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const payload = base64url(JSON.stringify({
    iss: sa.client_email,
    sub: sa.client_email,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
    scope: [
      'https://www.googleapis.com/auth/analytics.readonly',
      'https://www.googleapis.com/auth/webmasters.readonly',
    ].join(' '),
  }))

  const unsigned = `${header}.${payload}`
  const signer   = createSign('RSA-SHA256')
  signer.update(unsigned)
  const jwt = `${unsigned}.${base64url(signer.sign(sa.private_key))}`

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })
  if (!res.ok) return null
  return (await res.json()).access_token ?? null
}

// ── GA4 helpers ───────────────────────────────────────────────────────────────

async function ga4Report(token: string, body: object): Promise<any> {
  const res = await fetch(`${GA4_API}/${GA4_PROPERTY}:runReport`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res.ok ? res.json() : null
}

// When multiple dateRanges are used without other dimensions, GA4 auto-adds a
// `dateRange` dimension. Each row has dimensionValues[0].value = "date_range_N".
function findOverviewRow(report: any, rangeIndex: number): any {
  return (report?.rows ?? []).find(
    (r: any) => r.dimensionValues?.[0]?.value === `date_range_${rangeIndex}`,
  )
}

function parseOverviewRow(report: any, rangeIndex: number) {
  const row = findOverviewRow(report, rangeIndex)
  const v   = (i: number) => Number(row?.metricValues?.[i]?.value ?? 0)
  return {
    sessions:             v(0),
    active_users:         v(1),
    pageviews:            v(2),
    new_users:            v(3),
    bounce_rate:          Number((v(4) * 100).toFixed(1)),
    avg_session_duration: Number(v(5).toFixed(1)),
  }
}

// ── Search Console helpers ────────────────────────────────────────────────────

// Try URL-prefix property first, then domain property — whichever the user registered in GSC
const GSC_SITE_VARIANTS = [
  'https://cvitae.lat/',
  'sc-domain:cvitae.lat',
]

let _gscSite: string | null = null

async function gscQuery(token: string, body: object): Promise<any> {
  const candidates = _gscSite ? [_gscSite] : GSC_SITE_VARIANTS
  for (const site of candidates) {
    const res = await fetch(`${GSC_API}/${encodeURIComponent(site)}/searchAnalytics/query`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.status === 403 || res.status === 404) continue
    if (res.ok) {
      _gscSite = site
      return res.json()
    }
  }
  return { blocked: true }
}

// ── Anomaly detection ─────────────────────────────────────────────────────────

function detectAnomalies(params: {
  referenceSessions: number
  sessions7d: number
  countries7d: Array<{ country: string; sessions: number }>
  countriesPrev7d: Array<{ country: string; sessions: number }>
  sourcesCurr: Array<{ channel: string; sessions: number }>
  sourcesPrev: Array<{ channel: string; sessions: number }>
  gscRows: any[]
  topPages7d: Array<{ path: string; sessions: number }>
}): Anomaly[] {
  const anomalies: Anomaly[] = []
  const dailyAvg7d = params.sessions7d / 7

  // 1. Spike / drop: yesterday vs the closed 7-day daily average.
  // Never classify an incomplete current day as a traffic drop.
  if (dailyAvg7d > 0) {
    const ratio = params.referenceSessions / dailyAvg7d
    if (ratio > 1.5) {
      anomalies.push({
        type: 'spike',
        message: `Spike de tráfico ayer: ${params.referenceSessions} sesiones (${(ratio * 100).toFixed(0)}% del promedio 7d de ${dailyAvg7d.toFixed(0)})`,
        severity: 'high',
        data: { yesterday: params.referenceSessions, daily_avg_7d: Number(dailyAvg7d.toFixed(1)), ratio: Number(ratio.toFixed(2)) },
      })
    } else if (ratio < 0.4) {
      anomalies.push({
        type: 'drop',
        message: `Caída de tráfico ayer: ${params.referenceSessions} sesiones (${(ratio * 100).toFixed(0)}% del promedio 7d de ${dailyAvg7d.toFixed(0)})`,
        severity: 'high',
        data: { yesterday: params.referenceSessions, daily_avg_7d: Number(dailyAvg7d.toFixed(1)), ratio: Number(ratio.toFixed(2)) },
      })
    }
  }

  // 2. New country: in 7d but not in prev 7d, sessions >= 3
  const prevCountrySet = new Set(params.countriesPrev7d.map(c => c.country))
  for (const c of params.countries7d) {
    if (!prevCountrySet.has(c.country) && c.sessions >= 3) {
      anomalies.push({
        type: 'new_country',
        message: `Nuevo país en tráfico: ${c.country} con ${c.sessions} sesiones esta semana`,
        severity: 'medium',
        data: { country: c.country, sessions: c.sessions },
      })
    }
  }

  // 3. Organic growth: this week vs prev >30%
  const organicCurr = params.sourcesCurr.find(s => /organic/i.test(s.channel))?.sessions ?? 0
  const organicPrev = params.sourcesPrev.find(s => /organic/i.test(s.channel))?.sessions ?? 0
  if (organicPrev > 0 && organicCurr > organicPrev * 1.3) {
    const pct = (((organicCurr - organicPrev) / organicPrev) * 100).toFixed(0)
    anomalies.push({
      type: 'organic_growth',
      message: `Crecimiento orgánico: ${organicCurr} sesiones esta semana vs ${organicPrev} la anterior (+${pct}%)`,
      severity: 'medium',
      data: { curr: organicCurr, prev: organicPrev },
    })
  }

  // 4. Quick win SEO: position 4-15, impressions >=50, CTR <4% (max 2)
  let qwCount = 0
  for (const q of params.gscRows) {
    if (qwCount >= 2) break
    const pos = Number(q.position ?? 99)
    const imp = Number(q.impressions ?? 0)
    const ctr = Number(q.ctr ?? 0) * 100
    if (pos >= 4 && pos <= 15 && imp >= 50 && ctr < 4) {
      anomalies.push({
        type: 'quick_win_seo',
        message: `Quick win SEO: "${q.keys?.[0]}" — pos ${pos.toFixed(1)}, ${imp} imp., CTR ${ctr.toFixed(1)}%`,
        severity: 'low',
        data: { query: q.keys?.[0], position: Number(pos.toFixed(1)), impressions: imp, ctr: Number(ctr.toFixed(2)) },
      })
      qwCount++
    }
  }

  // 5. Blog receiving organic: /blog/ path with sessions >2
  for (const p of params.topPages7d) {
    if (p.path.includes('/blog/') && p.sessions > 2) {
      anomalies.push({
        type: 'blog_organic',
        message: `Página de blog con tráfico orgánico: ${p.path} — ${p.sessions} sesiones`,
        severity: 'low',
        data: { path: p.path, sessions: p.sessions },
      })
    }
  }

  return anomalies
}

// ── Gemini ────────────────────────────────────────────────────────────────────

interface GeminiFailure {
  code: 'http_error' | 'empty_response' | 'invalid_json' | 'exception'
  message: string
  httpStatus?: number
}

const GEMINI_SCHEMA = {
  type: 'OBJECT',
  properties: {
    executive_summary: { type: 'STRING' },
    signals: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          type:       { type: 'STRING', enum: ['green', 'yellow', 'red', 'blue', 'purple'] },
          title:      { type: 'STRING' },
          detail:     { type: 'STRING' },
          confidence: { type: 'STRING', enum: ['high', 'medium', 'low'] },
          sources:    { type: 'ARRAY', items: { type: 'STRING' } },
        },
        required: ['type', 'title', 'detail', 'confidence', 'sources'],
      },
    },
    recommendations: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          priority: { type: 'STRING', enum: ['high', 'medium', 'low'] },
          title:    { type: 'STRING' },
          evidence: { type: 'STRING' },
          impact:   { type: 'STRING' },
          effort:   { type: 'STRING', enum: ['low', 'medium', 'high'] },
        },
        required: ['priority', 'title', 'evidence', 'impact', 'effort'],
      },
    },
    seo_quick_wins: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          query:          { type: 'STRING' },
          position:       { type: 'NUMBER' },
          impressions:    { type: 'NUMBER' },
          ctr_pct:        { type: 'NUMBER' },
          recommendation: { type: 'STRING' },
        },
        required: ['query', 'position', 'impressions', 'ctr_pct', 'recommendation'],
      },
    },
    blog_insights: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          identifier: { type: 'STRING' },
          insight:    { type: 'STRING' },
          confidence: { type: 'STRING', enum: ['high', 'medium', 'low'] },
        },
        required: ['identifier', 'insight', 'confidence'],
      },
    },
    linkedin_picks: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          title:  { type: 'STRING' },
          reason: { type: 'STRING' },
        },
        required: ['title', 'reason'],
      },
    },
    answer: { type: 'STRING' },
  },
  required: ['executive_summary', 'signals', 'recommendations', 'seo_quick_wins', 'blog_insights', 'linkedin_picks', 'answer'],
}

export async function callGemini(
  apiKey: string,
  prompt: string,
  fetchImpl: typeof fetch = fetch,
): Promise<GeminiResult | GeminiFailure> {
  try {
    const res = await observeAiCall({ provider: 'gemini', model: GEMINI_MODEL, feature: 'admin_growth_analysis', trigger: 'user_action', actor: 'admin' }, () => fetchImpl(`${GEMINI_API}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(GEMINI_ANALYTICS_TIMEOUT_MS),
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: GEMINI_SCHEMA,
        },
      }),
    }))
    if (!res.ok) {
      const errText = await res.text()
      console.error(`[Gemini] HTTP ${res.status} model=${GEMINI_MODEL}:`, errText.substring(0, 400))
      return { code: 'http_error', message: `HTTP ${res.status}`, httpStatus: res.status }
    }
    const json = await res.json()
    const raw: string = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
    if (!raw) {
      console.error('[Gemini] respuesta vacía. finishReason:', json?.candidates?.[0]?.finishReason)
      return { code: 'empty_response', message: 'Gemini no devolvió contenido' }
    }
    try {
      return JSON.parse(raw) as GeminiResult
    } catch {
      const clean = raw.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim()
      try {
        return JSON.parse(clean) as GeminiResult
      } catch {
        console.error('[Gemini] JSON inválido:', raw.substring(0, 200))
        return { code: 'invalid_json', message: 'Respuesta de Gemini no es JSON válido' }
      }
    }
  } catch (e: any) {
    console.error('[Gemini] excepción:', e?.message)
    return { code: 'exception', message: e?.message ?? 'Error interno al llamar Gemini' }
  }
}

function computePct(curr: number, prev: number): number | null {
  if (prev <= 0) return null
  return Number((((curr - prev) / prev) * 100).toFixed(1))
}

function buildBlogPages(
  topPages: any[],
  posts: any[],
  gscPages: any[],
): any[] {
  return topPages
    .filter(p => String(p.path).includes('/blog/'))
    .map(p => {
      const slug  = String(p.path).replace(/^\/blog\//, '').replace(/\/$/, '')
      const post  = posts.find((b: any) => b.slug === slug)
      const gscPg = gscPages.find((g: any) =>
        String(g.keys?.[0] ?? '').endsWith(p.path) ||
        String(g.keys?.[0] ?? '').includes(p.path)
      )
      return {
        path:     p.path,
        sessions: p.sessions,
        ...(post ? { titulo: post.titulo, slug: post.slug } : {}),
        ...(gscPg ? {
          gsc_impressions: Number(gscPg.impressions ?? 0),
          gsc_clicks:      Number(gscPg.clicks ?? 0),
          gsc_ctr:         Number(gscPg.ctr ?? 0),
          gsc_position:    Number(Number(gscPg.position ?? 0).toFixed(1)),
        } : {}),
      }
    })
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req: Request) {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 })

  const adminPassword = process.env.ADMIN_PASSWORD
  if (!adminPassword || req.headers.get('Authorization') !== `Bearer ${adminPassword}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  const supabase  = makeSupabaseAdmin()
  const geminiKey = process.env.GEMINI_API_KEY
  const saJson    = process.env.GOOGLE_SERVICE_ACCOUNT_JSON ?? ''

  let body: any = {}
  try { body = await req.json() } catch { /* empty body */ }
  const question: string | null      = typeof body.question === 'string' ? body.question : null
  // Cost safety: metrics are deterministic. Gemini is opt-in and is also
  // enabled for an explicit operator question.
  const includeAi: boolean           = analyticsAiRequested(body)
  const mode: 'standard' | 'launch' = body.mode === 'launch' ? 'launch' : 'standard'
  const launchEvents: any[]          = body.launchEvents ?? []

  try {
    const now       = new Date()
    const today     = now.toISOString().split('T')[0]
    const weekAgo   = new Date(now.getTime() - 7  * 86400_000).toISOString()
    const gsc28dAgo = new Date(now.getTime() - 28 * 86400_000).toISOString().split('T')[0]

    // ── Supabase ──────────────────────────────────────────────────────────────
    const [
      usersTotal, usersWeek,
      opportunitiesActive, inReviewCount,
      opportunitiesBySource, opportunitiesByType,
      blogPosts, b2bTokens,
    ] = await Promise.all([
      supabase.from('user_master_profiles').select('id', { count: 'exact', head: true }),
      supabase.from('user_master_profiles').select('id', { count: 'exact', head: true }).gte('created_at', weekAgo),
      supabase.from('opportunities').select('id', { count: 'exact', head: true }).eq('is_active', true).eq('verification_status', 'verified'),
      supabase.from('opportunities').select('id', { count: 'exact', head: true }).eq('verification_status', 'in_review'),
      supabase.from('opportunities').select('source').eq('is_active', true).eq('verification_status', 'verified'),
      supabase.from('opportunities').select('opportunity_type, type').eq('is_active', true).eq('verification_status', 'verified'),
      supabase.from('content_hub').select('id, titulo, slug, categoria, created_at').eq('tipo', 'blog').eq('is_active', true).order('created_at', { ascending: false }).limit(10),
      supabase.from('recruiter_tokens').select('id, company_name, created_at, credits_remaining').order('created_at', { ascending: false }).limit(20),
    ])

    const bySource: Record<string, number> = {}
    for (const row of opportunitiesBySource.data ?? []) {
      const s = String(row.source || 'unknown')
      bySource[s] = (bySource[s] || 0) + 1
    }
    const topSources = Object.entries(bySource).sort((a, b) => b[1] - a[1]).slice(0, 8)

    const byType: Record<string, number> = {}
    for (const row of opportunitiesByType.data ?? []) {
      const t = String(row.opportunity_type || (row as any).type || 'other')
      byType[t] = (byType[t] || 0) + 1
    }

    // ── GA4 (all reports in parallel) ─────────────────────────────────────────
    let ga4Raw: any  = null
    let ga4Available = false
    const accessToken = saJson ? await getGoogleAccessToken(saJson) : null

    if (accessToken) {
      const [
        overviewReport,
        dailyTrendReport,
        countries7dReport,
        countriesPrev7dReport,
        topPages7dReport,
        sources7dReport,
        sourcesPrev7dReport,
      ] = await Promise.all([
        ga4Report(accessToken, {
          dateRanges: [
            { startDate: 'today',     endDate: 'today' },
            { startDate: 'yesterday', endDate: 'yesterday' },
            CLOSED_ANALYTICS_RANGES.current7d,
            CLOSED_ANALYTICS_RANGES.previous7d,
          ],
          metrics: [
            { name: 'sessions' }, { name: 'activeUsers' }, { name: 'screenPageViews' },
            { name: 'newUsers' }, { name: 'bounceRate' }, { name: 'averageSessionDuration' },
          ],
        }),
        ga4Report(accessToken, {
          dateRanges: [{ startDate: '30daysAgo', endDate: 'yesterday' }],
          dimensions: [{ name: 'date' }],
          metrics: [{ name: 'sessions' }, { name: 'activeUsers' }],
          orderBys: [{ dimension: { dimensionName: 'date' }, desc: false }],
          limit: 31,
        }),
        ga4Report(accessToken, {
          dateRanges: [CLOSED_ANALYTICS_RANGES.current7d],
          dimensions: [{ name: 'country' }],
          metrics: [{ name: 'sessions' }, { name: 'activeUsers' }, { name: 'newUsers' }],
          orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
          limit: 15,
        }),
        ga4Report(accessToken, {
          dateRanges: [CLOSED_ANALYTICS_RANGES.previous7d],
          dimensions: [{ name: 'country' }],
          metrics: [{ name: 'sessions' }],
          orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
          limit: 15,
        }),
        ga4Report(accessToken, {
          dateRanges: [CLOSED_ANALYTICS_RANGES.current7d],
          dimensions: [{ name: 'pagePath' }],
          metrics: [
            { name: 'sessions' }, { name: 'activeUsers' },
            { name: 'screenPageViews' }, { name: 'averageSessionDuration' },
          ],
          orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
          limit: 20,
        }),
        ga4Report(accessToken, {
          dateRanges: [CLOSED_ANALYTICS_RANGES.current7d],
          dimensions: [{ name: 'sessionDefaultChannelGrouping' }],
          metrics: [{ name: 'sessions' }, { name: 'activeUsers' }, { name: 'newUsers' }],
          orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
        }),
        ga4Report(accessToken, {
          dateRanges: [CLOSED_ANALYTICS_RANGES.previous7d],
          dimensions: [{ name: 'sessionDefaultChannelGrouping' }],
          metrics: [{ name: 'sessions' }],
          orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
        }),
      ])

      const countries7d = (countries7dReport?.rows ?? []).map((row: any) => ({
        country:      row.dimensionValues?.[0]?.value ?? '',
        sessions:     Number(row.metricValues?.[0]?.value ?? 0),
        active_users: Number(row.metricValues?.[1]?.value ?? 0),
        new_users:    Number(row.metricValues?.[2]?.value ?? 0),
      }))

      const countriesPrev7d = (countriesPrev7dReport?.rows ?? []).map((row: any) => ({
        country:  row.dimensionValues?.[0]?.value ?? '',
        sessions: Number(row.metricValues?.[0]?.value ?? 0),
      }))

      const topPages7d = (topPages7dReport?.rows ?? []).map((row: any) => ({
        path:         row.dimensionValues?.[0]?.value ?? '',
        sessions:     Number(row.metricValues?.[0]?.value ?? 0),
        active_users: Number(row.metricValues?.[1]?.value ?? 0),
        pageviews:    Number(row.metricValues?.[2]?.value ?? 0),
        avg_duration: Number(Number(row.metricValues?.[3]?.value ?? 0).toFixed(1)),
      }))

      const sources7d = (sources7dReport?.rows ?? []).map((row: any) => ({
        channel:      row.dimensionValues?.[0]?.value ?? '',
        sessions:     Number(row.metricValues?.[0]?.value ?? 0),
        active_users: Number(row.metricValues?.[1]?.value ?? 0),
        new_users:    Number(row.metricValues?.[2]?.value ?? 0),
      }))

      const sourcesPrev7d = (sourcesPrev7dReport?.rows ?? []).map((row: any) => ({
        channel:  row.dimensionValues?.[0]?.value ?? '',
        sessions: Number(row.metricValues?.[0]?.value ?? 0),
      }))

      const dailyTrend = (dailyTrendReport?.rows ?? []).map((row: any) => ({
        date:     row.dimensionValues?.[0]?.value ?? '',
        sessions: Number(row.metricValues?.[0]?.value ?? 0),
        users:    Number(row.metricValues?.[1]?.value ?? 0),
      }))

      ga4Raw       = { overviewReport, dailyTrend, countries7d, countriesPrev7d, topPages7d, sources7d, sourcesPrev7d }
      ga4Available = true
    }

    // ── Search Console ────────────────────────────────────────────────────────
    let gscRaw: any  = null
    let gscAvailable = false
    let gscBlocked   = false

    if (accessToken) {
      const [queriesResult, pagesResult] = await Promise.all([
        gscQuery(accessToken, { startDate: gsc28dAgo, endDate: today, dimensions: ['query'], rowLimit: 50 }),
        gscQuery(accessToken, { startDate: gsc28dAgo, endDate: today, dimensions: ['page'],  rowLimit: 20 }),
      ])

      if (queriesResult?.blocked || pagesResult?.blocked) {
        gscBlocked = true
      } else {
        const gscRows  = queriesResult?.rows ?? []
        const gscPages = pagesResult?.rows  ?? []
        const quickWins = gscRows.filter((q: any) => {
          const pos = Number(q.position ?? 99)
          const imp = Number(q.impressions ?? 0)
          return pos >= 4 && pos <= 15 && imp >= 30
        }).slice(0, 10)
        gscRaw       = { queries: gscRows, pages: gscPages, quickWins }
        gscAvailable = true
      }
    }

    // ── Anomaly detection ─────────────────────────────────────────────────────
    const anomalies: Anomaly[] = ga4Available
      ? detectAnomalies({
          referenceSessions: parseOverviewRow(ga4Raw.overviewReport, 1).sessions,
          sessions7d:      parseOverviewRow(ga4Raw.overviewReport, 2).sessions,
          countries7d:     ga4Raw.countries7d,
          countriesPrev7d: ga4Raw.countriesPrev7d,
          sourcesCurr:     ga4Raw.sources7d,
          sourcesPrev:     ga4Raw.sourcesPrev7d,
          gscRows:         gscAvailable ? (gscRaw.queries ?? []) : [],
          topPages7d:      ga4Raw.topPages7d,
        })
      : []

    // ── Build dataset matching frontend GrowthResponse type ───────────────────
    const todayM  = ga4Available ? parseOverviewRow(ga4Raw.overviewReport, 0) : null
    const ydayM   = ga4Available ? parseOverviewRow(ga4Raw.overviewReport, 1) : null
    const last7M  = ga4Available ? parseOverviewRow(ga4Raw.overviewReport, 2) : null
    const prev7M  = ga4Available ? parseOverviewRow(ga4Raw.overviewReport, 3) : null

    const ga4Section = ga4Available ? {
      today:         todayM!,
      yesterday:     ydayM!,
      last_7d:       last7M!,
      prev_7d:       prev7M!,
      vs_prev_7d_pct: computePct(last7M!.sessions, prev7M!.sessions),
      top_countries: ga4Raw.countries7d.slice(0, 10).map((c: any) => {
        const prev = ga4Raw.countriesPrev7d.find((p: any) => p.country === c.country)
        return {
          country:       c.country,
          sessions:      c.sessions,
          users:         c.active_users,
          new_users:     c.new_users,
          prev_sessions: prev?.sessions ?? 0,
          delta_pct:     computePct(c.sessions, prev?.sessions ?? 0),
        }
      }),
      traffic_sources: ga4Raw.sources7d.map((s: any) => {
        const prev = ga4Raw.sourcesPrev7d.find((p: any) => p.channel === s.channel)
        return {
          channel:       s.channel,
          sessions:      s.sessions,
          users:         s.active_users,
          new_users:     s.new_users,
          prev_sessions: prev?.sessions ?? 0,
          delta_pct:     computePct(s.sessions, prev?.sessions ?? 0),
        }
      }),
      top_pages: ga4Raw.topPages7d.slice(0, 15).map((p: any) => ({
        path:             p.path,
        sessions:         p.sessions,
        users:            p.active_users,
        pageviews:        p.pageviews,
        avg_duration_sec: p.avg_duration,
      })),
      blog_pages:        buildBlogPages(ga4Raw.topPages7d, blogPosts.data ?? [], gscRaw?.pages ?? []),
      daily_trend_last7: ga4Raw.dailyTrend.slice(-7),
    } : null

    const gscSection = gscBlocked
      ? { blocked: true }
      : gscAvailable
        ? {
            queries: (gscRaw.queries ?? []).slice(0, 30).map((q: any) => ({
              query:       q.keys?.[0] ?? '',
              clicks:      Number(q.clicks ?? 0),
              impressions: Number(q.impressions ?? 0),
              ctr:         Number(q.ctr ?? 0),
              position:    Number(Number(q.position ?? 0).toFixed(1)),
            })),
            quick_wins: (gscRaw.quickWins ?? []).map((q: any) => ({
              query:       q.keys?.[0] ?? '',
              clicks:      Number(q.clicks ?? 0),
              impressions: Number(q.impressions ?? 0),
              ctr:         Number(q.ctr ?? 0),
              position:    Number(Number(q.position ?? 0).toFixed(1)),
            })),
            top_pages_by_impressions: (gscRaw.pages ?? []).slice(0, 10).map((p: any) => ({
              page:        p.keys?.[0] ?? '',
              clicks:      Number(p.clicks ?? 0),
              impressions: Number(p.impressions ?? 0),
              ctr:         Number(p.ctr ?? 0),
              position:    Number(Number(p.position ?? 0).toFixed(1)),
            })),
          }
        : null

    const dataset = {
      date: today,
      mode,
      cvitae_db: {
        registered_users:     usersTotal.count    ?? 0,
        new_users_7d:         usersWeek.count     ?? 0,
        active_opportunities: opportunitiesActive.count ?? 0,
        in_review_count:      inReviewCount.count ?? 0,
        blog_posts: (blogPosts.data ?? []).map((p: any) => ({
          titulo: p.titulo, slug: p.slug, fecha: p.created_at,
        })),
        b2b_companies: b2bTokens.data?.length ?? 0,
        top_sources:   topSources,
      },
      ga4:            ga4Section,
      search_console: gscSection,
      anomalies,
      launch_events:  launchEvents,
    }

    // ── Gemini ────────────────────────────────────────────────────────────────
    let geminiResult: GeminiResult | null = null
    let geminiErrorCode: string | null = null
    let geminiErrorMessage: string | null = null

    if (!includeAi) {
      // Page load / ordinary refresh: intentionally no model call.
    } else if (!geminiKey) {
      geminiErrorCode = 'no_key'
      geminiErrorMessage = 'GEMINI_API_KEY no configurada en el servidor'
    } else {
      const ga4Summary = ga4Available ? {
        today_sessions:     todayM!.sessions,
        yesterday_sessions: ydayM!.sessions,
        last_7d:            last7M!,
        prev_7d_sessions:   prev7M!.sessions,
        top_pages:          ga4Raw.topPages7d.slice(0, 8).map((p: any) => ({ path: p.path, sessions: p.sessions })),
        sources:            ga4Raw.sources7d,
        top_countries:      ga4Raw.countries7d.slice(0, 5),
      } : null

      const gscSummary = gscAvailable
        ? {
            top_queries: (gscRaw.queries ?? []).slice(0, 20).map((q: any) => ({
              query:       q.keys?.[0],
              position:    Number(Number(q.position).toFixed(1)),
              impressions: q.impressions,
              ctr_pct:     Number((q.ctr * 100).toFixed(2)),
            })),
            quick_wins: (gscRaw.quickWins ?? []).slice(0, 5).map((q: any) => ({
              query:       q.keys?.[0],
              position:    Number(Number(q.position).toFixed(1)),
              impressions: q.impressions,
              ctr_pct:     Number((q.ctr * 100).toFixed(2)),
            })),
          }
        : (gscBlocked ? 'blocked' : null)

      const reducedDataset = {
        date: today,
        users:             { total: usersTotal.count ?? 0, new_this_week: usersWeek.count ?? 0 },
        opportunities:     {
          active_verified:  opportunitiesActive.count ?? 0,
          in_review:        inReviewCount.count ?? 0,
          top_sources:      topSources.slice(0, 6),
          by_type:          Object.entries(byType).sort((a, b) => b[1] - a[1]).slice(0, 6),
        },
        blog_titles:        (blogPosts.data ?? []).map((p: any) => p.titulo),
        b2b_active_tokens:  b2bTokens.data?.length ?? 0,
        ga4:                ga4Summary,
        gsc:                gscSummary,
        anomalies:          anomalies.map(a => ({ type: a.type, message: a.message, severity: a.severity })),
      }

      const answerRule = question
        ? `- answer: OBLIGATORIO responder la siguiente pregunta del operador con análisis detallado basado en los datos: "${question}"`
        : `- answer: DEJAR COMO STRING VACÍO "" (no hay pregunta del operador)`

      const prompt = `Sos el analista interno del Growth Intelligence Center de CVitae (plataforma de carrera para Paraguay y LatAm).
Fecha de análisis: ${today}. Modo: ${mode}.

Datos del sistema (JSON sin datos personales):
${JSON.stringify(reducedDataset, null, 2)}

Reglas de respuesta:
- Responder SIEMPRE en español
- signals: máximo 5. Verde=positivo, rojo=alerta, amarillo=atención, azul=informativo, morado=oportunidad
- recommendations: máximo 3, ordenadas de mayor a menor priority
- seo_quick_wins: máximo 3, solo si hay datos reales en gsc.quick_wins — si gsc es "blocked" o null, dejar array vacío
- linkedin_picks: 2-3 oportunidades del catálogo para publicar en el bot de LinkedIn de CVitae (título corto + razón de impacto)
- confidence bajo si la muestra es pequeña (menos de 100 sesiones o menos de 7 días de datos)
- No inventar causalidades sin evidencia en los datos
${answerRule}`

      const callResult = await callGemini(geminiKey, prompt)
      if ('code' in callResult) {
        geminiErrorCode = callResult.code
        geminiErrorMessage = callResult.message
      } else {
        geminiResult = callResult
      }
    }

    // ── Response ──────────────────────────────────────────────────────────────
    return new Response(
      JSON.stringify({
        dataset,
        gemini: geminiResult,
        meta: {
          ga4_available:        ga4Available,
          gsc_available:        gscAvailable,
          gemini_configured:    analyticsGeminiConfigured(geminiKey),
          gemini_available:     !!geminiResult,
          gemini_error_code:    geminiErrorCode,
          gemini_error_message: geminiErrorMessage,
          ai_requested:          includeAi,
          mode,
          generated_at:         now.toISOString(),
        },
      }),
      { headers: { 'Content-Type': 'application/json' } },
    )
  } catch (err: any) {
    console.error('admin-analytics error:', err)
    return new Response(JSON.stringify({ error: err?.message ?? 'Internal error' }), { status: 500 })
  }
}
