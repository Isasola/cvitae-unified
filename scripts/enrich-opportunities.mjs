/**
 * Standalone enrichment script — runs in GitHub Actions, replaces Netlify scheduled function.
 * Uses Gemini free tier to enrich unenriched opportunities in Supabase.
 *
 * Required env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY
 */
import { createClient } from '@supabase/supabase-js'

const MODEL_ID = 'gemini-3.5-flash-lite'
const GEMINI_API = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_ID}:generateContent`
const GEMINI_TIMEOUT_MS = 22_000
const BATCH_SIZE = 150
const IN_PROGRESS_TTL_MS = 5 * 60 * 1000
const ENRICHMENT_TTL_DAYS = 90
const DAILY_CAP = 1500

function cleanText(value, max = 800) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

async function enrichOne(row, apiKey) {
  const title = cleanText(row.title, 200)
  const org = cleanText(row.organization, 150)
  const rubro = cleanText(row.rubro || row.type, 100)
  const description = cleanText(row.description, 800)
  const location = cleanText([row.city, row.location].filter(Boolean).join(', '), 100)
  const kind = cleanText(row.opportunity_kind || row.opportunity_type, 60)

  const prompt = `Sos un asesor de carrera sénior con 10 años de experiencia en el mercado laboral de Paraguay y Latinoamérica.
Analizá esta oportunidad y generá contenido de alta calidad, específico y útil para quien quiera postularse.

DATOS DE LA OPORTUNIDAD:
Título: ${title}
Organización: ${org}
Sector / Rubro: ${rubro}
Tipo: ${kind}
Ubicación: ${location}
Descripción: ${description}

INSTRUCCIONES ESTRICTAS:
1. skills: Exactamente 5 a 7 habilidades CONCRETAS Y ESPECÍFICAS para ESTE rol.
2. ideal_profile: 2-3 oraciones que describan al candidato ideal para ESTE puesto.
3. application_tips: 2-3 oraciones con un consejo concreto para postularse a ESTA convocatoria.
4. sector_context: 1-2 oraciones sobre la situación actual de ESTE sector en Paraguay/LATAM.
5. PROHIBICIONES: No uses frases genéricas. No inventés datos.`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS)

  try {
    const res = await fetch(`${GEMINI_API}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'OBJECT',
            properties: {
              skills: { type: 'ARRAY', items: { type: 'STRING' } },
              ideal_profile: { type: 'STRING' },
              application_tips: { type: 'STRING' },
              sector_context: { type: 'STRING' },
            },
            required: ['skills', 'ideal_profile', 'application_tips', 'sector_context'],
          },
          maxOutputTokens: 600,
          temperature: 0.4,
        },
      }),
    })
    clearTimeout(timer)
    if (!res.ok) throw new Error(`gemini_http_${res.status}`)
    const data = await res.json()
    const parsed = JSON.parse(data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}')
    return {
      skills: Array.isArray(parsed.skills) ? parsed.skills.slice(0, 8).map(s => String(s).slice(0, 120)) : [],
      ideal_profile: cleanText(parsed.ideal_profile, 500),
      application_tips: cleanText(parsed.application_tips, 500),
      sector_context: cleanText(parsed.sector_context, 300),
      generated_at: new Date().toISOString(),
    }
  } finally {
    clearTimeout(timer)
  }
}

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const apiKey = process.env.GEMINI_API_KEY

  if (!supabaseUrl || !supabaseKey) { console.error('[enrich] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY'); process.exit(1) }
  if (!apiKey) { console.warn('[enrich] GEMINI_API_KEY not set, skipping'); process.exit(0) }

  const supabase = createClient(supabaseUrl, supabaseKey)
  const now = Date.now()
  const ttlCutoff = new Date(now - ENRICHMENT_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString()
  const staleLockCutoff = new Date(now - IN_PROGRESS_TTL_MS).toISOString()

  const { count: todayCount } = await supabase
    .from('opportunities')
    .select('id', { count: 'exact', head: true })
    .not('ai_enrichment', 'is', null)
    .gte('ai_enrichment->>generated_at', new Date(now - 24 * 60 * 60 * 1000).toISOString())

  if ((todayCount ?? 0) >= DAILY_CAP) {
    console.log('[enrich] daily cap reached', { todayCount }); process.exit(0)
  }

  const remaining = Math.min(BATCH_SIZE, DAILY_CAP - (todayCount ?? 0))

  const { data: candidates, error } = await supabase
    .from('opportunities')
    .select('id, slug, title, organization, rubro, type, opportunity_kind, opportunity_type, description, city, location, ai_enrichment')
    .eq('is_active', true)
    .eq('seo_eligible', true)
    .or(
      `ai_enrichment.is.null,` +
      `and(ai_enrichment->generated_at.is.null,ai_enrichment->>started_at.lt.${staleLockCutoff}),` +
      `ai_enrichment->>generated_at.lt.${ttlCutoff}`
    )
    .limit(remaining)

  if (error) { console.error('[enrich] fetch error', error.message); process.exit(1) }
  if (!candidates?.length) { console.log('[enrich] nothing to enrich'); process.exit(0) }

  const candidateIds = candidates.map(r => r.id)
  await supabase
    .from('opportunities')
    .update({ ai_enrichment: { status: 'in_progress', started_at: new Date().toISOString() } })
    .in('id', candidateIds)

  let enriched = 0, failed = 0

  for (const row of candidates) {
    try {
      const enrichment = await enrichOne(row, apiKey)
      await supabase.from('opportunities').update({ ai_enrichment: enrichment }).eq('id', row.id)
      enriched++
      if (enriched % 10 === 0) console.log(`[enrich] progress: ${enriched}/${candidates.length}`)
    } catch (err) {
      console.error('[enrich] failed', { slug: row.slug, error: err?.message })
      await supabase.from('opportunities').update({ ai_enrichment: null }).eq('id', row.id)
      failed++
    }
  }

  console.log('[enrich] done', { enriched, failed, todayTotal: (todayCount ?? 0) + enriched })
}

main()
