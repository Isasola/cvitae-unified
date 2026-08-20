import { createHash } from 'node:crypto'
import { makeSupabaseAdmin } from './_supabase'
import { observeAiCall } from './lib/ai-telemetry'
import {
  authenticatedUser,
  consumeRateLimit,
  jsonResponse,
  rateLimitHeaders,
  rejectInvalidOrigin,
  securityHeaders,
} from './lib/b2c-security'

const MODEL_ID = 'gemini-3.5-flash-lite'
const ROUTE_LABELS: Record<string, string> = {
  'empleo-local': 'conseguir empleo en empresas de Paraguay',
  remoto: 'conseguir trabajo remoto con empresas internacionales',
  'beca-posgrado': 'acceder a una beca o posgrado',
  organismos: 'trabajar en organismos internacionales',
  emprendimiento: 'lanzar o hacer crecer un emprendimiento',
  'cambio-area': 'hacer una reconversión profesional',
}
const LEVELS = new Set(['Inicial', 'Intermedio', 'Avanzado'])

const PROVIDERS = {
  google_skills: {
    label: 'Google Skills',
    url: (_skill: string) => 'https://www.skills.google/catalog',
  },
  microsoft_learn: {
    label: 'Microsoft Learn',
    url: (skill: string) => `https://learn.microsoft.com/es-es/training/browse/?terms=${encodeURIComponent(skill)}`,
  },
  aws_skill_builder: {
    label: 'AWS Skill Builder',
    url: (_skill: string) => 'https://skillbuilder.aws/',
  },
  coursera: {
    label: 'Coursera',
    url: (skill: string) => `https://www.coursera.org/search?query=${encodeURIComponent(skill)}`,
  },
  edx: {
    label: 'edX',
    url: (skill: string) => `https://www.edx.org/search?q=${encodeURIComponent(skill)}`,
  },
  youtube: {
    label: 'YouTube',
    url: (skill: string) => `https://www.youtube.com/results?search_query=${encodeURIComponent(`${skill} curso español`)}`,
  },
} as const

type ProviderKey = keyof typeof PROVIDERS
type CorroboratedGap = {
  skill: string
  normalizedSkill: string
  sources: Array<{ id: string; slug: string; title: string; organization: string | null; updated_at: string }>
}

const COURSE_SCHEMA = {
  type: 'ARRAY',
  maxItems: 6,
  items: {
    type: 'OBJECT',
    required: ['skill', 'providerKey', 'learningFocus', 'level'],
    properties: {
      skill: { type: 'STRING' },
      providerKey: { type: 'STRING', enum: Object.keys(PROVIDERS) },
      learningFocus: { type: 'STRING' },
      level: { type: 'STRING', enum: [...LEVELS] },
    },
  },
}

function cleanText(value: unknown, maxLength = 240): string {
  return String(value ?? '').replace(/[\u0000-\u001f]/g, ' ').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength)
}

function cleanList(value: unknown, limit: number, itemLimit = 100): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.map((item) => cleanText(item, itemLimit)).filter(Boolean))].slice(0, limit)
}

function normalize(value: unknown): string {
  return cleanText(value, 2000).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9+#.]+/g, ' ').trim()
}

function sha(value: unknown): string {
  return createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex')
}

function recommendedProvider(skill: string): ProviderKey {
  const key = normalize(skill)
  if (/power bi|excel|azure|microsoft|c#|\.net|sql server/.test(key)) return 'microsoft_learn'
  if (/aws|amazon web services|cloud practitioner/.test(key)) return 'aws_skill_builder'
  if (/google cloud|gemini|vertex|bigquery|looker/.test(key)) return 'google_skills'
  if (/investigacion|research|academ|estadistica/.test(key)) return 'edx'
  if (/canva|redaccion|comunicacion|ventas|entrevista/.test(key)) return 'youtube'
  return 'coursera'
}

function allowedProvider(value: unknown, skill: string): ProviderKey {
  const proposed = String(value || '') as ProviderKey
  return proposed in PROVIDERS ? proposed : recommendedProvider(skill)
}

function parseGemini(value: string): unknown {
  try { return JSON.parse(value) } catch { return [] }
}

export function normalizeLearningRecommendations(raw: unknown, gaps: CorroboratedGap[]) {
  const rawItems = Array.isArray(raw) ? raw : []
  const bySkill = new Map(rawItems.map((item: any) => [normalize(item?.skill), item]))
  return gaps.slice(0, 6).map((gap, index) => {
    const model = bySkill.get(gap.normalizedSkill) as any
    const providerKey = allowedProvider(model?.providerKey, gap.skill)
    const provider = PROVIDERS[providerKey]
    const occurrence = gap.sources.length
    const deterministicWhy = `Esta brecha aparece en ${occurrence} ${occurrence === 1 ? 'oportunidad verificada' : 'oportunidades verificadas'} entre tus mejores coincidencias.`
    return {
      skill: gap.skill,
      normalized_skill: gap.normalizedSkill,
      priority: index + 1,
      title: `Ruta práctica de ${gap.skill}`,
      provider_key: providerKey,
      provider_label: provider.label,
      resource_url: provider.url(gap.skill),
      learning_focus: cleanText(model?.learningFocus, 300) || `Fundamentos y práctica aplicada de ${gap.skill}`,
      why: deterministicWhy,
      level: LEVELS.has(String(model?.level)) ? String(model.level) : 'Inicial',
      language: 'Español preferido',
      source_snapshot: gap.sources,
      fallback: !model,
    }
  })
}

function publicFields(row: any) {
  return {
    id: row.id,
    skill: row.skill,
    priority: row.priority,
    status: row.status,
    course: row.title,
    title: row.title,
    platform: row.provider_label,
    providerKey: row.provider_key,
    url: row.resource_url,
    learningFocus: row.learning_focus,
    why: row.why,
    level: row.level,
    language: row.language,
    sources: row.source_snapshot || [],
    fallback: Boolean(row.fallback),
    startedAt: row.started_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
  }
}

async function overview(supabase: any, userId: string) {
  const { data, error } = await supabase.from('learning_recommendations')
    .select('*').eq('user_id', userId).neq('status', 'stale')
    .order('created_at', { ascending: false }).order('priority', { ascending: true }).limit(30)
  if (error) throw error
  const rows = data || []
  const latestSignature = rows[0]?.profile_signature || null
  const current = latestSignature ? rows.filter((row: any) => row.profile_signature === latestSignature) : []
  const recommendations = current.map(publicFields)
  return {
    recommendations,
    courses: recommendations,
    stats: {
      total: current.length,
      suggested: current.filter((row: any) => row.status === 'suggested').length,
      inProgress: current.filter((row: any) => row.status === 'in_progress').length,
      completed: current.filter((row: any) => row.status === 'completed').length,
    },
  }
}

async function invokeGemini(profile: any, gaps: CorroboratedGap[]) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return []
  const careerGoal = ROUTE_LABELS[cleanText(profile.profile_data?.career_route, 50)] || 'mejorar su empleabilidad'
  const prompt = `Actuá como curador de aprendizaje para una persona de Paraguay y Latinoamérica.

Perfil guardado:
- Título: ${cleanText(profile.professional_title, 120) || 'Profesional'}
- Seniority: ${cleanText(profile.profile_data?.seniority, 50) || 'No especificado'}
- Objetivo: ${careerGoal}
- Habilidades confirmadas en el perfil: ${cleanList(profile.profile_data?.habilidades, 30).join(', ') || 'No especificadas'}

Brechas corroboradas en oportunidades verificadas:
${JSON.stringify(gaps.map((gap) => ({ skill: gap.skill, occurrences: gap.sources.length })), null, 2)}

Para cada brecha elegí un proveedor del catálogo permitido y proponé un foco de aprendizaje concreto.
No inventes un nombre de curso, URL, duración, precio, certificado, disponibilidad ni promesa de empleo.
No agregues habilidades fuera de la lista. El servidor construirá el título y el enlace.
El foco debe ser prudente y útil; no afirmes que completar un curso garantiza mejorar un score.`

  const response = await observeAiCall({ provider: 'gemini', model: MODEL_ID, feature: 'learning_plan_recommendations', trigger: 'user_action', actor: 'user' }, () => fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL_ID}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 1600, responseMimeType: 'application/json', responseSchema: COURSE_SCHEMA },
    }),
  }))
  if (!response.ok) {
    console.error(`Gemini learning plan failed with status ${response.status}`)
    return []
  }
  const data = await response.json()
  return parseGemini(data.candidates?.[0]?.content?.parts?.[0]?.text || '[]')
}

async function corroborateGaps(supabase: any, profile: any, requestedSkills: string[], opportunityIds: string[]) {
  if (!requestedSkills.length || !opportunityIds.length) return []
  const { data, error } = await supabase.from('opportunities')
    .select('id,slug,title,organization,description,tags,updated_at')
    .in('id', opportunityIds).eq('is_active', true).eq('verification_status', 'verified')
    .eq('match_eligible', true).is('deleted_at', null).is('archived_at', null)
  if (error) throw error
  const ownSkills = cleanList(profile.profile_data?.habilidades, 50).map(normalize)
  const opportunities = data || []
  const gaps: CorroboratedGap[] = []
  for (const skill of requestedSkills) {
    const normalizedSkill = normalize(skill)
    if (normalizedSkill.length < 2 || ownSkills.some((own) => own === normalizedSkill)) continue
    const sources = opportunities.filter((item: any) => {
      const searchable = normalize([...(item.tags || []), item.description || ''].join(' '))
      return searchable.includes(normalizedSkill)
    }).map((item: any) => ({
      id: item.id, slug: item.slug || item.id, title: item.title,
      organization: item.organization, updated_at: item.updated_at,
    }))
    if (sources.length) gaps.push({ skill, normalizedSkill, sources })
  }
  return gaps.sort((a, b) => b.sources.length - a.sources.length).slice(0, 6)
}

export const handler = async (event: any) => {
  const originError = rejectInvalidOrigin(event)
  if (originError) return originError
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: securityHeaders(event), body: '' }
  if (event.httpMethod !== 'POST') return jsonResponse(event, 405, { error: 'Método no permitido' })
  if (!event.body || event.body.length > 80_000) return jsonResponse(event, 413, { error: 'La solicitud supera el límite permitido' })

  try {
    const authResult = await authenticatedUser(event)
    if (!authResult.user) return jsonResponse(event, 401, { error: authResult.error, recommendations: [], courses: [] })
    const user = authResult.user
    const body = JSON.parse(event.body || '{}')
    const action = cleanText(body.action || 'recommend', 30)
    const supabase = makeSupabaseAdmin()

    if (action === 'overview') return jsonResponse(event, 200, await overview(supabase, user.id))

    if (action === 'status') {
      const recommendationId = cleanText(body.recommendationId, 80)
      const status = cleanText(body.status, 30)
      if (!recommendationId || !['suggested', 'in_progress', 'completed', 'dismissed'].includes(status)) {
        return jsonResponse(event, 400, { error: 'Cambio de estado inválido' })
      }
      const limit = await consumeRateLimit({ scope: 'b2c-learning-actions', subject: user.id, limit: 100, windowSeconds: 60 * 60 })
      if (!limit.allowed) return jsonResponse(event, 429, { error: 'Alcanzaste el límite temporal de cambios.' }, rateLimitHeaders(limit))
      const { error } = await supabase.rpc('update_learning_recommendation_status', {
        p_user_id: user.id, p_recommendation_id: recommendationId, p_status: status,
      })
      if (error) {
        if (String(error.message || '').includes('not found')) return jsonResponse(event, 404, { error: 'Recomendación no encontrada' })
        throw error
      }
      return jsonResponse(event, 200, await overview(supabase, user.id), rateLimitHeaders(limit))
    }

    if (action !== 'recommend') return jsonResponse(event, 400, { error: 'Acción desconocida' })
    const requestedSkills = cleanList(body.missingSkills, 6)
    const opportunityIds = cleanList(body.opportunityIds, 10, 220)
    if (!requestedSkills.length || !opportunityIds.length) return jsonResponse(event, 200, await overview(supabase, user.id))

    const { data: profile, error: profileError } = await supabase.from('user_master_profiles')
      .select('id,user_id,professional_title,profile_data,updated_at').eq('user_id', user.id).maybeSingle()
    if (profileError) throw profileError
    if (!profile) return jsonResponse(event, 404, { error: 'Completá tu perfil para crear un plan de aprendizaje', recommendations: [], courses: [] })

    const gaps = await corroborateGaps(supabase, profile, requestedSkills, opportunityIds)
    if (!gaps.length) return jsonResponse(event, 200, { ...(await overview(supabase, user.id)), notice: 'No encontramos brechas nuevas respaldadas por oportunidades activas.' })
    const profileSignature = sha({
      profileUpdatedAt: profile.updated_at,
      careerRoute: profile.profile_data?.career_route || '',
      gaps: gaps.map((gap) => ({ skill: gap.normalizedSkill, sources: gap.sources.map((source) => `${source.id}:${source.updated_at}`) })),
    })

    const { data: existing, error: existingError } = await supabase.from('learning_recommendations')
      .select('id').eq('user_id', user.id).eq('profile_signature', profileSignature).limit(1)
    if (existingError) throw existingError
    if (existing?.length) return jsonResponse(event, 200, { ...(await overview(supabase, user.id)), idempotent: true })

    const limit = await consumeRateLimit({ scope: 'b2c-course-recommendations', subject: user.id, limit: 8, windowSeconds: 24 * 60 * 60 })
    if (!limit.allowed) return jsonResponse(event, 429, { error: 'Alcanzaste el límite temporal de planes.', recommendations: [], courses: [] }, rateLimitHeaders(limit))
    const raw = await invokeGemini(profile, gaps)
    const normalizedRecommendations = normalizeLearningRecommendations(raw, gaps)

    const { error: insertError } = await supabase.from('learning_recommendations').insert(normalizedRecommendations.map((item) => ({
      ...item,
      user_id: user.id,
      profile_signature: profileSignature,
      analysis_model: MODEL_ID,
    })))
    if (insertError) {
      if (insertError.code === '23505') return jsonResponse(event, 200, { ...(await overview(supabase, user.id)), idempotent: true })
      throw insertError
    }
    const { error: staleError } = await supabase.from('learning_recommendations')
      .update({ status: 'stale', updated_at: new Date().toISOString() })
      .eq('user_id', user.id).neq('profile_signature', profileSignature).in('status', ['suggested', 'in_progress'])
    if (staleError) throw staleError
    return jsonResponse(event, 200, { ...(await overview(supabase, user.id)), idempotent: false }, rateLimitHeaders(limit))
  } catch (error: any) {
    console.error('gemini-courses error:', error?.message || error)
    const unavailable = String(error?.message || '').startsWith('Rate limit unavailable')
    return jsonResponse(event, unavailable ? 503 : 500, {
      error: unavailable ? 'El servicio está temporalmente ocupado. Intentá nuevamente en unos minutos.' : 'No pudimos actualizar tu plan de aprendizaje.',
      recommendations: [], courses: [],
    })
  }
}
