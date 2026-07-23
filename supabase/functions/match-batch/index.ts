import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
}

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

const STOP_WORDS = new Set([
  'para', 'como', 'desde', 'hasta', 'sobre', 'entre', 'empresa', 'empleo',
  'trabajo', 'puesto', 'vacante', 'buscamos', 'requiere', 'requisitos',
  'experiencia', 'conocimientos', 'paraguay', 'asuncion', 'remoto',
  'the', 'and', 'with', 'from', 'your', 'role', 'job', 'work',
])

const SKILL_ALIASES: Record<string, string[]> = {
  'JavaScript': ['javascript', 'js', 'ecmascript'],
  'TypeScript': ['typescript', 'ts'],
  'React': ['react', 'reactjs', 'react.js'],
  'Angular': ['angular', 'angularjs'],
  'Vue.js': ['vue', 'vuejs', 'vue.js'],
  'Node.js': ['node', 'nodejs', 'node.js'],
  'Python': ['python', 'django', 'flask', 'fastapi'],
  'Java': ['java', 'spring', 'spring boot'],
  'C# / .NET': ['c#', '.net', 'dotnet', 'asp.net'],
  'PHP': ['php', 'laravel', 'symfony'],
  'SQL': ['sql', 'postgresql', 'postgres', 'mysql', 'sql server', 'oracle'],
  'Excel': ['excel', 'microsoft excel', 'hojas de calculo'],
  'Power BI': ['power bi', 'powerbi', 'dax'],
  'Tableau': ['tableau'],
  'AWS': ['aws', 'amazon web services'],
  'Azure': ['azure', 'microsoft azure'],
  'Google Cloud': ['gcp', 'google cloud'],
  'Docker': ['docker', 'contenedores'],
  'Kubernetes': ['kubernetes', 'k8s'],
  'Git': ['git', 'github', 'gitlab', 'control de versiones'],
  'Linux': ['linux', 'ubuntu'],
  'Figma': ['figma'],
  'UX/UI': ['ux', 'ui', 'ux/ui', 'experiencia de usuario', 'interfaz de usuario'],
  'SEO': ['seo', 'search engine optimization'],
  'Google Ads': ['google ads', 'adwords', 'sem'],
  'Meta Ads': ['meta ads', 'facebook ads', 'instagram ads'],
  'Marketing digital': ['marketing digital', 'digital marketing'],
  'Ventas': ['ventas', 'sales', 'comercial'],
  'Atención al cliente': ['atencion al cliente', 'customer service', 'customer support'],
  'Contabilidad': ['contabilidad', 'contable', 'accounting'],
  'Finanzas': ['finanzas', 'financiero', 'finance'],
  'Recursos Humanos': ['recursos humanos', 'rrhh', 'human resources', 'talent acquisition'],
  'Gestión de proyectos': ['gestion de proyectos', 'project management', 'scrum', 'agile'],
  'Inglés': ['ingles', 'english'],
}

const SENIORITY_RANK: Record<string, number> = {
  pasante: 0, trainee: 0, becario: 0, junior: 1, jr: 1,
  semissenior: 2, ssr: 2, mid: 2, pleno: 2, senior: 3, sr: 3,
  lead: 4, techlead: 4, director: 5, gerente: 5, manager: 5,
}

let dictionaryCache: { loadedAt: number; entries: Array<[string, string[]]> } | null = null

function normalize(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9+#.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function stripHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(?:nbsp|amp|lt|gt);/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function toStrings(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean)
  if (typeof value === 'string') {
    return value.split(/[,;|]/).map((item) => item.trim()).filter(Boolean)
  }
  return []
}

function sameSkill(left: string, right: string): boolean {
  const a = normalize(left)
  const b = normalize(right)
  if (!a || !b) return false
  return a === b || (a.length >= 4 && b.length >= 4 && (a.includes(b) || b.includes(a)))
}

async function getSkillDictionary(): Promise<Array<[string, string[]]>> {
  if (dictionaryCache && Date.now() - dictionaryCache.loadedAt < 10 * 60_000) {
    return dictionaryCache.entries
  }

  const entries = new Map<string, string[]>()
  Object.entries(SKILL_ALIASES).forEach(([canonical, aliases]) => {
    entries.set(canonical, [canonical, ...aliases])
  })

  const { data } = await supabase.from('skill_dictionary').select('canonical_name, variants')
  for (const row of data ?? []) {
    const canonical = String(row.canonical_name ?? '').trim()
    if (!canonical) continue
    entries.set(canonical, [canonical, ...toStrings(row.variants), ...(entries.get(canonical) ?? [])])
  }

  dictionaryCache = { loadedAt: Date.now(), entries: [...entries.entries()] }
  return dictionaryCache.entries
}

function extractSkills(opp: any, dictionary: Array<[string, string[]]>): string[] {
  const explicit = toStrings(opp.tags)
    .filter((tag) => normalize(tag).length >= 2)
    .filter((tag) => !STOP_WORDS.has(normalize(tag)))

  const searchable = normalize([
    opp.title,
    opp.rubro,
    opp.type,
    stripHtml(opp.description),
    explicit.join(' '),
  ].filter(Boolean).join(' | '))

  const detected = dictionary
    .filter(([, aliases]) => aliases.some((alias) => {
      const term = normalize(alias)
      if (!term) return false
      return new RegExp(`(^|\\s)${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=\\s|$)`, 'i').test(searchable)
    }))
    .map(([canonical]) => canonical)

  const meaningfulExplicit = explicit.filter((tag) => {
    const words = normalize(tag).split(' ')
    return words.length <= 4 && words.every((word) => word.length > 1 && !STOP_WORDS.has(word))
  })

  return [...new Set([...detected, ...meaningfulExplicit])].slice(0, 16)
}

function calculateSkillScore(profileSkills: string[], vacancySkills: string[]): number {
  if (!vacancySkills.length) return profileSkills.length ? 45 : 30
  if (!profileSkills.length) return 15
  const matchedVacancy = vacancySkills.filter((skill) => profileSkills.some((own) => sameSkill(own, skill)))
  const matchedProfile = profileSkills.filter((skill) => vacancySkills.some((required) => sameSkill(skill, required)))
  const vacancyCoverage = matchedVacancy.length / vacancySkills.length
  const profileEvidence = matchedProfile.length / Math.min(Math.max(profileSkills.length, 1), 10)
  return Math.round(Math.min(1, vacancyCoverage * 0.75 + profileEvidence * 0.25) * 100)
}

function tokenSet(value: unknown): Set<string> {
  return new Set(normalize(value).split(' ').filter((word) => word.length >= 3 && !STOP_WORDS.has(word)))
}

function calculateTitleScore(profileTitle: string, opp: any): number {
  const profileTokens = tokenSet(profileTitle)
  if (!profileTokens.size) return 45
  const opportunityTokens = tokenSet(`${opp.title ?? ''} ${opp.rubro ?? ''} ${opp.type ?? ''}`)
  const hits = [...profileTokens].filter((token) => opportunityTokens.has(token)).length
  if (!hits) return 25
  return Math.min(100, 45 + Math.round((hits / profileTokens.size) * 55))
}

function calculateSeniorityScore(profileSeniority: string, vacancyText: string): number {
  const profileRank = SENIORITY_RANK[normalize(profileSeniority).replace(/\s/g, '')] ?? 2
  const normalizedVacancy = normalize(vacancyText).replace(/\s/g, '')
  let vacancyRank = 2
  for (const [key, rank] of Object.entries(SENIORITY_RANK)) {
    if (normalizedVacancy.includes(key)) {
      vacancyRank = rank
      break
    }
  }
  const difference = Math.abs(profileRank - vacancyRank)
  return [100, 78, 52, 28, 12][Math.min(difference, 4)]
}

function calculateLocationScore(profileLocation: string, vacancyLocation: string): number {
  const profile = normalize(profileLocation)
  const vacancy = normalize(vacancyLocation)
  if (!vacancy || !profile) return 65
  if (/(remoto|remote|hibrido|hybrid)/.test(vacancy)) return 95
  if (profile === vacancy || profile.includes(vacancy) || vacancy.includes(profile)) return 100
  const paraguay = ['paraguay', 'asuncion', 'central', 'san lorenzo', 'luque', 'capiata', 'py']
  if (paraguay.some((item) => profile.includes(item)) && paraguay.some((item) => vacancy.includes(item))) return 78
  return 35
}

function careerBonus(route: string, opp: any): number {
  const normalizedRoute = normalize(route).replace(/\s/g, '')
  const text = normalize(`${opp.title ?? ''} ${opp.type ?? ''} ${opp.rubro ?? ''} ${opp.location ?? ''}`)
  if (normalizedRoute === 'remoto' && /(remoto|remote)/.test(text)) return 8
  if (normalizedRoute === 'becaposgrado' && /(beca|posgrado|maestria|doctorado)/.test(text)) return 10
  if (normalizedRoute === 'organismos' && /(ong|organismo|naciones unidas|bid|oea|pnud)/.test(text)) return 8
  if (normalizedRoute === 'emprendimiento' && /(startup|emprendimiento|innovacion)/.test(text)) return 7
  if (normalizedRoute === 'empleolocal' && /(paraguay|asuncion|central)/.test(text)) return 5
  return 0
}

async function generateProfileEmbedding(profileText: string): Promise<number[] | null> {
  if (!profileText.trim()) return null
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
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: cors })
  }

  try {
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Sesión inválida o expirada' }), { status: 401, headers: cors })
    }

    const { data: profile, error: profileError } = await supabase
      .from('user_master_profiles')
      .select('professional_title, profile_data, is_subscribed')
      .eq('user_id', user.id)
      .maybeSingle()

    if (profileError) throw profileError
    if (!profile) {
      return new Response(JSON.stringify({
        matches: [],
        profileSkills: [],
        missingSkills: [],
        is_subscribed: false,
        reason: 'profile_missing',
      }), { headers: cors })
    }

    const profileSkills = toStrings(profile.profile_data?.habilidades)
    const profileSeniority = String(profile.profile_data?.seniority ?? 'semi-senior')
    const profileLocation = String(profile.profile_data?.location ?? '')
    const careerRoute = String(profile.profile_data?.career_route ?? '')
    const profileTitle = String(profile.professional_title ?? '')
    const dictionary = await getSkillDictionary()

    const { data: opportunities, error: opportunitiesError } = await supabase
      .from('opportunities')
      .select('id, title, organization, location, rubro, tags, description, application_url, type, source, created_at')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(300)

    if (opportunitiesError) throw opportunitiesError
    if (!opportunities?.length) {
      return new Response(JSON.stringify({
        matches: [],
        profileSkills,
        missingSkills: [],
        is_subscribed: profile.is_subscribed ?? false,
        reason: 'no_active_opportunities',
      }), { headers: cors })
    }

    const profileText = [
      profileTitle,
      profileSeniority,
      profileSkills.join(', '),
      careerRoute,
      profileLocation,
    ].filter(Boolean).join(' | ')
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

    const ranked = opportunities.map((opp) => {
      const vacancySkills = extractSkills(opp, dictionary)
      const skillsScore = calculateSkillScore(profileSkills, vacancySkills)
      const titleScore = calculateTitleScore(profileTitle, opp)
      const seniorityScore = calculateSeniorityScore(profileSeniority, `${opp.title ?? ''} ${opp.rubro ?? ''} ${opp.description ?? ''}`)
      const locationScore = calculateLocationScore(profileLocation, opp.location ?? '')
      const similarity = similarities.get(String(opp.id))
      const semanticScore = similarity == null ? 50 : Math.round(similarity * 100)
      const hasSemantic = similarity != null
      const weighted = hasSemantic
        ? semanticScore * 0.30 + skillsScore * 0.32 + titleScore * 0.18 + seniorityScore * 0.10 + locationScore * 0.10
        : skillsScore * 0.42 + titleScore * 0.25 + seniorityScore * 0.16 + locationScore * 0.17
      const finalScore = Math.max(20, Math.min(99, Math.round(weighted + careerBonus(careerRoute, opp))))
      const matchedSkills = vacancySkills.filter((skill) => profileSkills.some((own) => sameSkill(own, skill)))
      const missingSkills = vacancySkills.filter((skill) => !profileSkills.some((own) => sameSkill(own, skill)))

      return {
        id: opp.id,
        slug: opp.id,
        titulo: opp.title ?? '',
        categoria: opp.rubro ?? opp.type ?? 'Oportunidad',
        ubicacion: opp.location ?? '',
        organization: opp.organization ?? '',
        application_url: opp.application_url ?? '',
        skillsScore,
        titleScore,
        seniorityScore,
        locationScore,
        semanticScore: hasSemantic ? semanticScore : null,
        finalScore,
        vacancySkills,
        matchedSkills,
        missingSkills,
        source: opp.source ?? '',
      }
    })
      .sort((a, b) => b.finalScore - a.finalScore)
      .slice(0, 20)

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
      meta: {
        activeOpportunities: opportunities.length,
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
