import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  buildDictionary,
  careerBonus,
  calculateLocationScore,
  calculateSkillScore,
  calculateSeniorityScore,
  calculateTitleScore,
  extractSkills,
  isEligibleForProfile,
  isTender,
  normalize,
  rankOpportunities,
  sameSkill,
  toStrings,
} from '../_shared/matching.ts'

const DEFAULT_SITE_URL = 'https://cvitae.lat'
const LOCAL_ORIGINS = new Set([
  'http://127.0.0.1:5173', 'http://localhost:5173',
  'http://127.0.0.1:8888', 'http://localhost:8888',
  'http://127.0.0.1:3000', 'http://localhost:3000',
])

function configuredOrigins(): Set<string> {
  const origins = new Set(LOCAL_ORIGINS)
  origins.add(DEFAULT_SITE_URL)
  for (const value of [Deno.env.get('SITE_URL'), Deno.env.get('URL')]) {
    if (!value) continue
    try { origins.add(new URL(value).origin) } catch { /* ignore malformed values */ }
  }
  return origins
}

function requestCors(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') || ''
  const allowed = origin && configuredOrigins().has(origin) ? origin : DEFAULT_SITE_URL
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Cache-Control': 'private, no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'Vary': 'Origin',
    'X-Content-Type-Options': 'nosniff',
  }
}

function originAllowed(req: Request): boolean {
  const origin = req.headers.get('Origin') || ''
  return !origin || configuredOrigins().has(origin)
}

async function hashedRateLimitSubject(scope: string, subject: string): Promise<string> {
  const salt = Deno.env.get('CVITAE_RATE_LIMIT_SALT') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!salt) throw new Error('Rate limit salt is not configured')
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${scope}:${subject}`))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

async function getSkillDictionary() {
  const { data } = await supabase.from('skill_dictionary').select('canonical_name, variants')
  const extra: Array<[string, string[]]> = []
  for (const row of data ?? []) {
    const canonical = String(row.canonical_name ?? '').trim()
    if (!canonical) continue
    const variants = Array.isArray(row.variants) ? row.variants.map(String) : []
    extra.push([canonical, variants])
  }
  return buildDictionary(extra)
}

async function generateProfileEmbedding(profileText: string): Promise<number[] | null> {
  if (!profileText.trim()) return null
  // DISABLE_EMBEDDINGS=true permite correr la función local sin el modelo gte-small
  // (evita WORKER_LIMIT en el edge runtime de Docker con CPU restringida)
  if (Deno.env.get('DISABLE_EMBEDDINGS') === 'true') return null
  try {
    // @ts-ignore Supabase Edge Runtime API
    const session = new Supabase.ai.Session('gte-small')
    const result = await session.run(profileText.slice(0, 512), { mean_pool: true, normalize: true })
    return Array.from(result)
  } catch (error) {
    console.error('profile embedding unavailable:', error)
    return null
  }
}

Deno.serve(async (req) => {
  const cors = requestCors(req)
  if (!originAllowed(req)) {
    return new Response(JSON.stringify({ error: 'Origen no permitido' }), { status: 403, headers: cors })
  }
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: cors })
  }

  try {
    const requestBody = await req.json().catch(() => ({}))
    const requestMode = requestBody?.mode === 'alerts' ? 'alerts' : 'default'
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Sesión inválida o expirada' }), { status: 401, headers: cors })
    }

    const scope = 'b2c-opportunity-matching'
    const { data: rateRows, error: rateError } = await supabase.rpc('consume_api_rate_limit', {
      p_scope: scope,
      p_subject_hash: await hashedRateLimitSubject(scope, user.id),
      p_limit: 30,
      p_window_seconds: 60 * 60,
    })
    if (rateError) {
      console.error('match-batch rate limit unavailable:', rateError.message)
      return new Response(JSON.stringify({ error: 'El servicio está temporalmente ocupado.' }), { status: 503, headers: cors })
    }
    const rate = Array.isArray(rateRows) ? rateRows[0] : rateRows
    if (!rate?.allowed) {
      return new Response(JSON.stringify({ error: 'Alcanzaste el límite temporal de actualizaciones.' }), {
        status: 429,
        headers: { ...cors, 'Retry-After': String(rate?.retry_after_seconds || 60), 'X-RateLimit-Remaining': '0' },
      })
    }

    const { data: profile, error: profileError } = await supabase
      .from('user_master_profiles')
      .select('professional_title, profile_data, is_subscribed, match_alerts_enabled')
      .eq('user_id', user.id)
      .maybeSingle()

    if (profileError) throw profileError
    if (!profile) {
      return new Response(JSON.stringify({
        matches: [],
        profileSkills: [],
        missingSkills: [],
        is_subscribed: false,
        match_alerts_enabled: false,
        reason: 'profile_missing',
      }), { headers: cors })
    }

    const profileSkills = toStrings(profile.profile_data?.habilidades)
    const profileSeniority = String(profile.profile_data?.seniority ?? 'semi-senior')
    const profileLocation = String(profile.profile_data?.location ?? '')
    const careerRoute = String(profile.profile_data?.career_route ?? '')
    const profileTitle = String(profile.professional_title ?? '')
    const dictionary = await getSkillDictionary()

    let opportunitiesQuery = supabase
      .from('opportunities')
      .select('id, slug, title, organization, location, rubro, tags, description, application_url, type, opportunity_type, opportunity_kind, eligible_countries, eligible_regions, source, deadline, created_at, is_active, verification_status, match_eligible, archived_at, deleted_at')
      .eq('is_active', true)
      .eq('verification_status', 'verified')
      .eq('match_eligible', true)
      .is('deleted_at', null)
      .is('archived_at', null)
      .or(`deadline.is.null,deadline.gte.${new Date().toISOString()}`)
      .order('created_at', { ascending: false })
      .limit(300)

    if (requestMode === 'alerts') {
      opportunitiesQuery = opportunitiesQuery.eq('alerts_eligible', true)
    }

    const { data: opportunities, error: opportunitiesError } = await opportunitiesQuery
    if (opportunitiesError) throw opportunitiesError

    const profileInput = {
      professional_title: profileTitle,
      profile_data: { habilidades: profileSkills, seniority: profileSeniority, location: profileLocation, career_route: careerRoute },
    }

    const profileText = [profileTitle, profileSeniority, profileSkills.join(', '), careerRoute, profileLocation]
      .filter(Boolean).join(' | ')
    const embedding = await generateProfileEmbedding(profileText)
    const similarities = new Map<string, number>()

    if (embedding) {
      const { data: vectorMatches, error: vectorError } = await supabase.rpc('match_opportunities', {
        query_embedding: embedding,
        match_threshold: 0.10,
        match_count: 120,
      })
      if (vectorError) {
        console.error('vector matching unavailable:', vectorError.message)
      } else {
        for (const item of vectorMatches ?? []) {
          similarities.set(String(item.id), Number(item.similarity ?? 0))
        }
      }
      await supabase.from('user_master_profiles').update({ embedding }).eq('user_id', user.id)
    }

    const { eligible: eligibleOpportunities, ranked: baseRanked } = rankOpportunities(
      profileInput,
      opportunities ?? [],
      dictionary,
    )

    if (!eligibleOpportunities.length) {
      return new Response(JSON.stringify({
        matches: [],
        profileSkills,
        missingSkills: [],
        is_subscribed: profile.is_subscribed ?? false,
        match_alerts_enabled: profile.match_alerts_enabled ?? false,
        reason: 'no_active_opportunities',
      }), { headers: cors })
    }

    // Re-score with semantic similarity when available
    const ranked = baseRanked.map((item) => {
      const similarity = similarities.get(String(item.id))
      if (similarity == null) return { ...item, semanticScore: null }
      const semanticScore = Math.round(similarity * 100)
      const weighted = semanticScore * 0.30 + item.skillsScore * 0.32 + item.titleScore * 0.18 + item.seniorityScore * 0.10 + item.locationScore * 0.10
      const finalScore = Math.max(20, Math.min(99, Math.round(weighted + careerBonus(careerRoute, item))))
      return { ...item, semanticScore, finalScore }
    }).sort((a, b) => b.finalScore - a.finalScore).slice(0, 20).map((item) => ({
      id: item.id,
      slug: (item as any).slug ?? item.id,
      titulo: item.title ?? '',
      categoria: item.rubro ?? item.opportunity_type ?? item.type ?? 'Oportunidad',
      ubicacion: item.location ?? '',
      organization: item.organization ?? '',
      application_url: (item as any).application_url ?? '',
      skillsScore: item.skillsScore,
      titleScore: item.titleScore,
      seniorityScore: item.seniorityScore,
      locationScore: item.locationScore,
      semanticScore: (item as any).semanticScore ?? null,
      finalScore: item.finalScore,
      vacancySkills: item.vacancySkills,
      matchedSkills: item.matchedSkills,
      missingSkills: item.missingSkills,
      source: (item as any).source ?? '',
    }))

    const missingFrequency = new Map<string, { skill: string; count: number; score: number }>()
    ranked.slice(0, 10).forEach((match, index) => {
      match.missingSkills.forEach((skill) => {
        const key = normalize(skill)
        const current = missingFrequency.get(key) ?? { skill, count: 0, score: 0 }
        current.count += 1
        current.score += Math.max(1, 10 - index)
        missingFrequency.set(key, current)
      })
    })
    const missingSkills = [...missingFrequency.values()]
      .sort((a, b) => b.count - a.count || b.score - a.score)
      .slice(0, 6)
      .map(({ skill }) => skill)

    return new Response(JSON.stringify({
      matches: ranked,
      profileSkills,
      missingSkills,
      is_subscribed: profile.is_subscribed ?? false,
      match_alerts_enabled: profile.match_alerts_enabled ?? false,
      meta: {
        activeOpportunities: eligibleOpportunities.length,
        vectorCandidates: similarities.size,
        generatedAt: new Date().toISOString(),
      },
    }), { headers: cors })
  } catch (error) {
    console.error('match-batch error:', error)
    return new Response(JSON.stringify({
      error: 'No pudimos calcular tus matches en este momento.',
    }), { status: 500, headers: cors })
  }
})
