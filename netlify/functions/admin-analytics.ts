import { makeSupabaseAdmin } from './_supabase'

const GEMINI_API = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent'

async function callGemini(apiKey: string, prompt: string): Promise<string> {
  const res = await fetch(`${GEMINI_API}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
  })
  if (!res.ok) return ''
  const data = await res.json()
  return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
}

export default async function handler(req: Request) {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 })

  const adminPassword = process.env.ADMIN_PASSWORD
  const authHeader = req.headers.get('Authorization') || ''
  if (!adminPassword || authHeader !== `Bearer ${adminPassword}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  const supabase = makeSupabaseAdmin()
  const geminiKey = process.env.GEMINI_API_KEY

  try {
    const now = new Date()
    const today = now.toISOString().split('T')[0]
    const weekAgo = new Date(now.getTime() - 7 * 86400_000).toISOString()
    const monthAgo = new Date(now.getTime() - 30 * 86400_000).toISOString()

    // Parallel metric queries
    const [
      usersTotal,
      usersWeek,
      opportunitiesActive,
      opportunitiesBySource,
      opportunitiesByType,
      recentOpportunities,
      blogPosts,
      b2bTokens,
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

    // Count by source
    const bySource: Record<string, number> = {}
    for (const row of opportunitiesBySource.data ?? []) {
      const src = String(row.source || 'unknown')
      bySource[src] = (bySource[src] || 0) + 1
    }
    const topSources = Object.entries(bySource).sort((a, b) => b[1] - a[1]).slice(0, 8)

    // Count by type
    const byType: Record<string, number> = {}
    for (const row of opportunitiesByType.data ?? []) {
      const t = String(row.opportunity_type || row.type || 'other')
      byType[t] = (byType[t] || 0) + 1
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
    }

    // Generate AI insights if Gemini key available
    let insights: string | null = null
    let blogIdeas: string[] = []

    if (geminiKey) {
      const prompt = `Sos el analista interno de CVitae, una plataforma de carrera para Paraguay y LatAm.

Métricas actuales (fecha: ${today}):
- Usuarios registrados: ${metrics.users.total} total, ${metrics.users.week} nuevos esta semana
- Oportunidades activas verificadas: ${metrics.opportunities.active}
- Top fuentes de oportunidades: ${topSources.map(([s, n]) => `${s}(${n})`).join(', ')}
- Tipos: ${Object.entries(byType).map(([t, n]) => `${t}(${n})`).join(', ')}
- Blog posts activos: ${metrics.blog.posts.length}
- Empresas B2B registradas: ${metrics.b2b.tokens.length}

Posts de blog actuales: ${metrics.blog.posts.map(p => p.titulo).join('; ')}

Dá un análisis en 3 bullets cortos de:
1. Qué está funcionando bien
2. Qué mejorar urgente
3. Qué contenido de blog escribir para atraer más usuarios (3 títulos concretos, distintos a los que ya existen)

Respondé en español, tono directo y conciso. Formato:
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
