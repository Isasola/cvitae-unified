import { makeSupabaseAdmin } from './_supabase'
import { observeAiCall } from './lib/ai-telemetry'
import {
  clientIp,
  consumeRateLimit,
  jsonResponse,
  rateLimitHeaders,
  rejectInvalidOrigin,
  securityHeaders,
} from './lib/b2c-security'

const MODEL_ID = 'gemini-3.5-flash-lite'
const GEMINI_API = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_ID}:generateContent`
const ENRICHMENT_TTL_DAYS = 90
const GEMINI_TIMEOUT_MS = 25_000
// Soft daily cap — Gemini free tier is 1500 RPD; stay comfortably under
// Gemini 3.5 Flash-Lite observed free tier: ~500 RPD. Cap at 80% for safety.
const DAILY_ENRICHMENT_CAP = 400

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

async function dailyEnrichmentCount(supabase: ReturnType<typeof makeSupabaseAdmin>): Promise<number> {
  const { count } = await supabase
    .from('opportunities')
    .select('id', { count: 'exact', head: true })
    .not('ai_enrichment', 'is', null)
    .gte('ai_enrichment->>generated_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
  return count ?? 0
}

async function generateEnrichment(row: Record<string, any>, apiKey: string): Promise<Record<string, any>> {
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
    { provider: 'gemini', model: MODEL_ID, feature: 'opportunity_enrichment', trigger: 'system', actor: 'system' },
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

  if (!res.ok) {
    const err = await res.text()
    console.error(`[enrich-opportunity] Gemini HTTP ${res.status}`, err.slice(0, 300))
    throw new Error(`gemini_http_${res.status}`)
  }

  const data = await res.json()
  const parsed = JSON.parse(data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}')

  return {
    skills: Array.isArray(parsed.skills) ? parsed.skills.slice(0, 8).map((s: any) => String(s).slice(0, 120)) : [],
    ideal_profile:    cleanText(parsed.ideal_profile, 500),
    application_tips: cleanText(parsed.application_tips, 500),
    sector_context:   cleanText(parsed.sector_context, 300),
    generated_at: new Date().toISOString(),
  }
}

export const handler = async (event: any) => {
  const originError = rejectInvalidOrigin(event)
  if (originError) return originError

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: securityHeaders(event), body: '' }
  if (event.httpMethod !== 'POST') return jsonResponse(event, 405, { error: 'Método no permitido' })

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return jsonResponse(event, 503, { error: 'Servicio de enriquecimiento no configurado.' })

  try {
    const body = JSON.parse(event.body || '{}')
    const slug = String(body.slug || '').trim().slice(0, 200)
    if (!slug || !/^[a-z0-9][a-z0-9._-]*$/i.test(slug)) {
      return jsonResponse(event, 400, { error: 'Slug inválido' })
    }

    const supabase = makeSupabaseAdmin()

    const { data: row, error: fetchError } = await supabase
      .from('opportunities')
      .select('id, slug, title, organization, rubro, type, opportunity_kind, opportunity_type, description, city, location, ai_enrichment, is_active')
      .eq('slug', slug)
      .eq('is_active', true)
      .maybeSingle()

    if (fetchError) throw fetchError
    if (!row) return jsonResponse(event, 404, { error: 'Oportunidad no encontrada' })

    // Return cached enrichment if still fresh
    if (row.ai_enrichment?.generated_at) {
      const age = Date.now() - Date.parse(row.ai_enrichment.generated_at)
      if (age < ENRICHMENT_TTL_DAYS * 24 * 60 * 60 * 1000) {
        return jsonResponse(event, 200, { enrichment: row.ai_enrichment, cached: true })
      }
    }

    // Per-IP rate limit to prevent abuse
    const rateLimit = await consumeRateLimit({
      scope: 'opportunity-enrichment',
      subject: clientIp(event),
      limit: 60,
      windowSeconds: 60 * 60,
    })
    if (!rateLimit.allowed) {
      return jsonResponse(event, 429, { error: 'Demasiadas solicitudes' }, rateLimitHeaders(rateLimit))
    }

    // Daily soft cap — protect Gemini free tier
    const todayCount = await dailyEnrichmentCount(supabase)
    if (todayCount >= DAILY_ENRICHMENT_CAP) {
      console.warn('[enrich-opportunity] daily cap reached', { todayCount })
      return jsonResponse(event, 200, { enrichment: null, skipped: true })
    }

    const enrichment = await generateEnrichment(row, apiKey)

    await supabase
      .from('opportunities')
      .update({ ai_enrichment: enrichment })
      .eq('id', row.id)

    return jsonResponse(event, 200, { enrichment, cached: false })
  } catch (error: any) {
    const timedOut = error?.name === 'TimeoutError' || error?.name === 'AbortError'
    console.error('enrich-opportunity error', { message: error?.message, timedOut })
    if (timedOut) return jsonResponse(event, 503, { error: 'El servicio tardó demasiado.' })
    return jsonResponse(event, 500, { error: 'No se pudo generar el contenido.' })
  }
}
