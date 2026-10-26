import type { Handler } from '@netlify/functions'
import { makeSupabaseAdmin } from './_supabase'
import { observeAiCall } from './lib/ai-telemetry'

// Scheduled: runs every 6 hours. Processes a small batch of unenriched opportunities.
// 4 runs/day × 10 ops/run = 40 enrichments/day from cron.
// User-triggered lazy enrichment adds more. Total stays well under 500 RPD free tier.
export const config = { schedule: '0 */6 * * *' }

const MODEL_ID = 'gemini-3.5-flash-lite'
const GEMINI_API = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_ID}:generateContent`
const GEMINI_TIMEOUT_MS = 22_000
const BATCH_SIZE = 10
const IN_PROGRESS_TTL_MS = 5 * 60 * 1000 // 5 minutes — treat stale locks as available
const ENRICHMENT_TTL_DAYS = 90
const DAILY_CAP = 400

const ENRICHMENT_SCHEMA = {
  type: 'OBJECT',
  properties: {
    skills:           { type: 'ARRAY', items: { type: 'STRING' } },
    ideal_profile:    { type: 'STRING' },
    application_tips: { type: 'STRING' },
    sector_context:   { type: 'STRING' },
  },
  required: ['skills', 'ideal_profile', 'application_tips', 'sector_context'],
}

function cleanText(value: unknown, max = 800): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

async function enrichOne(row: Record<string, any>, apiKey: string): Promise<Record<string, any>> {
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
1. skills: Exactamente 5 a 7 habilidades CONCRETAS Y ESPECÍFICAS para ESTE rol. Ejemplo correcto: "Análisis de datos con Power BI". Ejemplo incorrecto: "Trabajo en equipo" o "Proactividad".
2. ideal_profile: 2-3 oraciones que describan con precisión al candidato ideal para ESTE puesto y ESTA organización. Incluí nivel de formación requerido, años de experiencia y una característica técnica o de personalidad clave para este rol específico.
3. application_tips: 2-3 oraciones con un consejo concreto y accionable para postularse a ESTA convocatoria en Paraguay o LATAM. Podés mencionar qué destacar en el CV, cómo preparar la carta de presentación o qué aspecto del perfil es más valorado para este tipo de puesto.
4. sector_context: 1-2 oraciones sobre la situación actual de ESTE sector u tipo de oportunidad en Paraguay. Si es una beca, describí su importancia o nivel de competitividad. Si es un empleo, describí la demanda del rubro.
5. PROHIBICIONES: No uses frases genéricas como "buen candidato", "proactivo", "orientado a resultados". No menciones nombres de empresas, universidades o programas que no aparezcan en la descripción. No inventés datos. Si no tenés información suficiente, respondé con lo que podés inferir razonablemente.`

  const res = await observeAiCall(
    { provider: 'gemini', model: MODEL_ID, feature: 'opportunity_enrichment_cron', trigger: 'system', actor: 'system' },
    () => fetch(`${GEMINI_API}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: ENRICHMENT_SCHEMA,
          maxOutputTokens: 600,
          temperature: 0.4,
        },
      }),
    }),
  )

  if (!res.ok) throw new Error(`gemini_http_${res.status}`)

  const data = await res.json()
  const parsed = JSON.parse(data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}')

  return {
    skills:           Array.isArray(parsed.skills) ? parsed.skills.slice(0, 8).map((s: any) => String(s).slice(0, 120)) : [],
    ideal_profile:    cleanText(parsed.ideal_profile, 500),
    application_tips: cleanText(parsed.application_tips, 500),
    sector_context:   cleanText(parsed.sector_context, 300),
    generated_at: new Date().toISOString(),
  }
}

export const handler: Handler = async () => {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    console.warn('[enrich-cron] GEMINI_API_KEY not set, skipping')
    return { statusCode: 200, body: 'skipped: no api key' }
  }

  const supabase = makeSupabaseAdmin()
  const now = Date.now()
  const ttlCutoff = new Date(now - ENRICHMENT_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString()
  const staleLockCutoff = new Date(now - IN_PROGRESS_TTL_MS).toISOString()

  // Daily cap: count enrichments done in last 24 hours
  const { count: todayCount } = await supabase
    .from('opportunities')
    .select('id', { count: 'exact', head: true })
    .not('ai_enrichment', 'is', null)
    .gte('ai_enrichment->>generated_at', new Date(now - 24 * 60 * 60 * 1000).toISOString())

  if ((todayCount ?? 0) >= DAILY_CAP) {
    console.log('[enrich-cron] daily cap reached', { todayCount })
    return { statusCode: 200, body: 'daily cap reached' }
  }

  const remaining = Math.min(BATCH_SIZE, DAILY_CAP - (todayCount ?? 0))

  // Pick opportunities that need enrichment:
  // - ai_enrichment is null (never enriched)
  // - OR ai_enrichment was set but has no generated_at (stale in-progress lock)
  // - OR enrichment is older than TTL
  // Exclude opportunities currently being enriched (in_progress lock < 5min old)
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

  if (error) {
    console.error('[enrich-cron] fetch error', error.message)
    return { statusCode: 500, body: 'fetch error' }
  }

  if (!candidates?.length) {
    console.log('[enrich-cron] nothing to enrich')
    return { statusCode: 200, body: 'nothing to enrich' }
  }

  // Lock all candidates immediately to prevent duplicate work from concurrent runs
  const candidateIds = candidates.map(r => r.id)
  await supabase
    .from('opportunities')
    .update({ ai_enrichment: { status: 'in_progress', started_at: new Date().toISOString() } })
    .in('id', candidateIds)

  let enriched = 0
  let failed = 0

  for (const row of candidates) {
    try {
      const enrichment = await enrichOne(row, apiKey)
      await supabase.from('opportunities').update({ ai_enrichment: enrichment }).eq('id', row.id)
      enriched++
    } catch (err: any) {
      console.error('[enrich-cron] failed', { slug: row.slug, error: err?.message })
      // Release lock so next run retries
      await supabase.from('opportunities').update({ ai_enrichment: null }).eq('id', row.id)
      failed++
    }
  }

  console.log('[enrich-cron] done', { enriched, failed, todayTotal: (todayCount ?? 0) + enriched })
  return { statusCode: 200, body: JSON.stringify({ enriched, failed }) }
}
