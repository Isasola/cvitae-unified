import { makeSupabaseAdmin } from './_supabase'
import { createSign } from 'crypto'

const GEMINI_API = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent'
const GA4_API = 'https://analyticsdata.googleapis.com/v1beta/properties'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GA4_PROPERTY = '529848293'

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

  const now = Math.floor(Date.now() / 1000)
  const header  = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const payload = base64url(JSON.stringify({
    iss: sa.client_email,
    sub: sa.client_email,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
    scope: 'https://www.googleapis.com/auth/analytics.readonly',
  }))

  const unsigned = `${header}.${payload}`
  const signer = createSign('RSA-SHA256')
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

async function ga4Report(token: string, body: object): Promise<any> {
  const res = await fetch(`${GA4_API}/${GA4_PROPERTY}:runReport`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res.ok ? res.json() : null
}

function extractGA4Value(report: any, rowIndex: number, metricIndex: number): number {
  return Number(report?.rows?.[rowIndex]?.metricValues?.[metricIndex]?.value ?? 0)
}

// ── Gemini ────────────────────────────────────────────────────────────────────

async function callGemini(apiKey: string, prompt: string): Promise<string> {
  const res = await fetch(`${GEMINI_API}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
  })
  if (!res.ok) return ''
  return (await res.json())?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req: Request) {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 })

  const adminPassword = process.env.ADMIN_PASSWORD
  if (!adminPassword || req.headers.get('Authorization') !== `Bearer ${adminPassword}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  const supabase = makeSupabaseAdmin()
  const geminiKey = process.env.GEMINI_API_KEY
  const saJson    = process.env.GOOGLE_SERVICE_ACCOUNT_JSON ?? ''

  try {
    const now = new Date()
    const today   = now.toISOString().split('T')[0]
    const weekAgo = new Date(now.getTime() - 7  * 86400_000).toISOString()

    // ── Supabase metrics ──────────────────────────────────────────────────────
    const [
      usersTotal, usersWeek,
      opportunitiesActive, opportunitiesBySource, opportunitiesByType,
      recentOpportunities, blogPosts, b2bTokens,
    ] = await Promise.all([
      supabase.from('user_master_profiles').select('id', { count: 'exact', head: true }),
      supabase.from('user_master_profiles').select('id', { count: 'exact', head: true }).gte('created_at', weekAgo),
      supabase.from('opportunities').select('id', { count: 'exact', head: true }).eq('is_active', true).eq('verification_status', 'verified'),
      supabase.from('opportunities').select('source').eq('is_active', true).eq('verification_status', 'verified'),
      supabase.from('opportunities').select('opportunity_type, type').eq('is_active', true).eq('verification_status', 'verified'),
      supabase.from('opportunities').select('title, source, created_at, opportunity_type').eq('is_active', true).gte('created_at', weekAgo).order('created_at', { ascending: false }).limit(10),
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
      const t = String(row.opportunity_type || row.type || 'other')
      byType[t] = (byType[t] || 0) + 1
    }

    // ── GA4 metrics ───────────────────────────────────────────────────────────
    let ga4: any = null
    const accessToken = saJson ? await getGoogleAccessToken(saJson) : null

    if (accessToken) {
      const [overviewReport, pagesReport, sourcesReport] = await Promise.all([
        // Overview: 3 date ranges × 5 metrics (returns 3 rows, one per range)
        ga4Report(accessToken, {
          dateRanges: [
            { startDate: '30daysAgo', endDate: 'today' },
            { startDate: '7daysAgo',  endDate: 'today' },
            { startDate: 'today',     endDate: 'today' },
          ],
          metrics: [
            { name: 'sessions' },
            { name: 'activeUsers' },
            { name: 'screenPageViews' },
            { name: 'newUsers' },
            { name: 'bounceRate' },
          ],
        }),
        // Top pages last 30 days
        ga4Report(accessToken, {
          dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
          dimensions: [{ name: 'pagePath' }],
          metrics: [{ name: 'screenPageViews' }, { name: 'activeUsers' }],
          orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
          limit: 10,
        }),
        // Traffic sources last 30 days
        ga4Report(accessToken, {
          dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
          dimensions: [{ name: 'sessionDefaultChannelGrouping' }],
          metrics: [{ name: 'sessions' }, { name: 'activeUsers' }],
          orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
          limit: 8,
        }),
      ])

      const parseOverviewRow = (rowIdx: number) => ({
        sessions:   extractGA4Value(overviewReport, rowIdx, 0),
        users:      extractGA4Value(overviewReport, rowIdx, 1),
        pageviews:  extractGA4Value(overviewReport, rowIdx, 2),
        new_users:  extractGA4Value(overviewReport, rowIdx, 3),
        bounce_rate: Number((extractGA4Value(overviewReport, rowIdx, 4) * 100).toFixed(1)),
      })

      const topPages = (pagesReport?.rows ?? []).map((row: any) => ({
        path:      row.dimensionValues?.[0]?.value ?? '',
        pageviews: Number(row.metricValues?.[0]?.value ?? 0),
        users:     Number(row.metricValues?.[1]?.value ?? 0),
      }))

      const trafficSources = (sourcesReport?.rows ?? []).map((row: any) => ({
        channel:  row.dimensionValues?.[0]?.value ?? '',
        sessions: Number(row.metricValues?.[0]?.value ?? 0),
        users:    Number(row.metricValues?.[1]?.value ?? 0),
      }))

      ga4 = {
        last_30_days: parseOverviewRow(0),
        last_7_days:  parseOverviewRow(1),
        today:        parseOverviewRow(2),
        top_pages:    topPages,
        traffic_sources: trafficSources,
      }
    }

    const metrics = {
      users: { total: usersTotal.count ?? 0, week: usersWeek.count ?? 0 },
      opportunities: {
        active: opportunitiesActive.count ?? 0,
        by_source: topSources,
        by_type: Object.entries(byType).sort((a, b) => b[1] - a[1]).slice(0, 8),
        recent: recentOpportunities.data ?? [],
      },
      blog: { posts: blogPosts.data ?? [] },
      b2b: { tokens: b2bTokens.data ?? [] },
      ga4,
    }

    // ── Gemini insights ───────────────────────────────────────────────────────
    let insights: string | null = null
    let blogIdeas: string[] = []

    if (geminiKey) {
      const ga4Summary = ga4
        ? `Tráfico real GA4 (últimos 30 días): ${ga4.last_30_days.sessions} sesiones, ${ga4.last_30_days.users} usuarios activos, ${ga4.last_30_days.pageviews} pageviews, ${ga4.last_30_days.new_users} usuarios nuevos, bounce rate ${ga4.last_30_days.bounce_rate}%.
Últimos 7 días: ${ga4.last_7_days.sessions} sesiones, ${ga4.last_7_days.users} usuarios.
Hoy: ${ga4.today.sessions} sesiones.
Top páginas: ${ga4.top_pages.slice(0, 5).map((p: any) => `${p.path}(${p.pageviews}pv)`).join(', ')}.
Fuentes de tráfico: ${ga4.traffic_sources.map((s: any) => `${s.channel}(${s.sessions})`).join(', ')}.`
        : 'GA4 no disponible.'

      const prompt = `Sos el analista interno de CVitae, una plataforma de carrera para Paraguay y LatAm.

Métricas actuales (fecha: ${today}):
- Usuarios registrados en BD: ${metrics.users.total} total, ${metrics.users.week} nuevos esta semana
- Oportunidades activas verificadas: ${metrics.opportunities.active}
- Top fuentes: ${topSources.map(([s, n]) => `${s}(${n})`).join(', ')}
- Tipos: ${Object.entries(byType).map(([t, n]) => `${t}(${n})`).join(', ')}
- Blog posts: ${metrics.blog.posts.length}
- Empresas B2B: ${metrics.b2b.tokens.length}
${ga4Summary}

Posts actuales: ${metrics.blog.posts.map((p: any) => p.titulo).join('; ')}

Dá un análisis en 3 puntos:
1. Qué está funcionando bien
2. Qué mejorar urgente (basado en datos reales si hay GA4)
3. Qué contenido de blog escribir para atraer más usuarios (3 títulos concretos, distintos a los que ya existen)

Respondé en español, tono directo. Formato exacto:
ESTADO: [un párrafo]
URGENTE: [bullet 1] | [bullet 2] | [bullet 3]
BLOG IDEAS: [título 1] | [título 2] | [título 3]`

      const raw = await callGemini(geminiKey, prompt)
      if (raw) {
        insights = raw
        const blogLine = raw.split('\n').find(l => l.startsWith('BLOG IDEAS:'))
        if (blogLine) {
          blogIdeas = blogLine.replace('BLOG IDEAS:', '').trim().split('|').map(s => s.trim()).filter(Boolean)
        }
      }
    }

    return new Response(JSON.stringify({ metrics, insights, blogIdeas, generatedAt: now.toISOString() }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    console.error('admin-analytics error:', err)
    return new Response(JSON.stringify({ error: err?.message ?? 'Internal error' }), { status: 500 })
  }
}
