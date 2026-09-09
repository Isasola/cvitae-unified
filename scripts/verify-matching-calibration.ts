/**
 * Punto 13 — Calibración B2C de matching y calidad de recomendaciones.
 *
 * Importa las funciones exactas que usa match-batch en producción desde
 * supabase/functions/_shared/matching.ts. No replica código inline.
 *
 * Mide por perfil: precision@5, precision@10, recall@10
 * Verifica: 8 filtros de servidor, normalización, regresiones de false positives,
 * recalibración, latencia, loop learning sin auto-confirm.
 */

import { performance } from 'node:perf_hooks'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  buildDefaultDictionary,
  extractSkills,
  isEligibleForProfile,
  isTender,
  normalize,
  rankOpportunities,
  sameSkill,
  toStrings,
  type MatchOpportunity,
  type ProfileInput,
} from '../supabase/functions/_shared/matching.ts'
import { parsePgVector } from '../supabase/functions/_shared/vector.ts'
import { buildOpportunityEmbeddingText, buildProfileEmbeddingText } from '../supabase/functions/_shared/embedding.ts'

const __filename = fileURLToPath(import.meta.url)
const __dir = dirname(__filename)

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`FALLA: ${message}`)
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const FUTURE = '2027-01-01T00:00:00Z'
const PAST   = '2025-01-01T00:00:00Z'

function makeOpp(
  overrides: Partial<MatchOpportunity> & { id: string; title: string },
): MatchOpportunity & { slug: string; application_url: string; alerts_eligible: boolean } {
  return {
    organization: 'Empresa Ficticia S.A.',
    location: 'Asunción, Paraguay',
    rubro: 'Tecnología e IT',
    tags: [],
    description: '',
    application_url: `https://example.com/apply/${overrides.id}`,
    type: 'Presencial',
    opportunity_type: 'job',
    opportunity_kind: 'empleo',
    eligible_countries: [],
    eligible_regions: [],
    source: 'test_fixture',
    deadline: null,
    created_at: '2026-08-13T00:00:00Z',
    is_active: true,
    verification_status: 'verified',
    match_eligible: true,
    archived_at: null,
    deleted_at: null,
    alerts_eligible: true,
    slug: overrides.id,
    ...overrides,
  } as any
}

// ─── Fixtures: 25+ elegibles + 8 bloqueantes ─────────────────────────────────

const ELIGIBLE_FIXTURES: MatchOpportunity[] = [
  // === TECH ===
  makeOpp({
    id: 'dev-node-senior',
    title: 'Desarrollador Node.js Senior',
    tags: ['Node.js', 'TypeScript', 'PostgreSQL'],
    description: 'Node con TypeScript y SQL. Equipo distribuido.',
    rubro: 'Tecnología e IT', type: 'Remoto', location: 'Remoto', deadline: FUTURE,
  }),
  makeOpp({
    id: 'dev-node-alias',
    title: 'Backend Developer',
    tags: ['node', 'js', 'git'],
    description: 'Experiencia con nodejs y control de versiones.',
    rubro: 'Tecnología e IT', type: 'Remoto', location: 'Remoto', deadline: FUTURE,
  }),
  makeOpp({
    id: 'react-frontend',
    title: 'Frontend Developer React',
    tags: ['react', 'typescript', 'javascript'],
    description: 'React.js y TypeScript para aplicaciones web modernas.',
    rubro: 'Tecnología e IT', type: 'Híbrido', location: 'Asunción, Paraguay', deadline: FUTURE,
  }),
  makeOpp({
    id: 'fullstack-py-asuncion',
    title: 'Fullstack Developer Junior',
    tags: ['Python', 'JavaScript', 'PostgreSQL'],
    description: 'Posición junior en Asunción. Python backend, JS frontend.',
    rubro: 'Tecnología e IT', type: 'Presencial', location: 'Asunción, Paraguay', deadline: FUTURE,
  }),
  makeOpp({
    id: 'aws-cloud-engineer',
    title: 'Cloud Engineer AWS',
    tags: ['AWS', 'Docker', 'Python'],
    description: 'Amazon Web Services y contenedores Docker.',
    rubro: 'Cloud', type: 'Remoto', location: 'Remote', deadline: FUTURE,
  }),
  makeOpp({
    id: 'devops-docker',
    title: 'DevOps Engineer',
    tags: ['Docker', 'Git', 'AWS'],
    description: 'CI/CD con Docker y pipelines en AWS.',
    rubro: 'Tecnología e IT', type: 'Remoto', location: 'Remoto', deadline: FUTURE,
  }),
  makeOpp({
    id: 'backend-python',
    title: 'Backend Python Developer',
    tags: ['Python', 'PostgreSQL', 'Git'],
    description: 'FastAPI y Postgres para sistema de pagos.',
    rubro: 'Tecnología e IT', type: 'Remoto', location: 'Remote', deadline: FUTURE,
  }),
  makeOpp({
    id: 'ts-node-microservices',
    title: 'Ingeniero de Microservicios',
    tags: ['TypeScript', 'Node.js', 'Docker'],
    description: 'Arquitectura de microservicios en Node y TypeScript.',
    rubro: 'Tecnología e IT', type: 'Remoto', location: 'Remoto', deadline: FUTURE,
  }),
  makeOpp({
    id: 'vue-frontend',
    title: 'Frontend Vue.js Developer',
    tags: ['Vue.js', 'JavaScript', 'TypeScript'],
    description: 'Aplicaciones SPA con Vue 3 y TypeScript.',
    rubro: 'Tecnología e IT', type: 'Híbrido', location: 'Asunción, Paraguay', deadline: FUTURE,
  }),
  makeOpp({
    id: 'react-native-mobile',
    title: 'Desarrollador Mobile React Native',
    tags: ['React', 'JavaScript', 'TypeScript'],
    description: 'Apps mobile con React Native.',
    rubro: 'Tecnología e IT', type: 'Remoto', location: 'Remoto', deadline: FUTURE,
  }),
  makeOpp({
    id: 'scrum-master',
    title: 'Scrum Master y Coach Ágil',
    tags: ['Gestión de proyectos', 'Scrum', 'Agile'],
    description: 'Facilitación de ceremonias ágiles en equipo distribuido.',
    rubro: 'Gestión', type: 'Híbrido', location: 'Asunción, Paraguay', deadline: FUTURE,
  }),
  // === DATA ===
  makeOpp({
    id: 'data-powerbi',
    title: 'Analista de Datos Power BI',
    tags: ['powerbi', 'excel', 'sql'],
    description: 'Modelado de datos con DAX y tableros ejecutivos.',
    rubro: 'Análisis de Datos', type: 'Presencial', location: 'Asunción, Paraguay', deadline: FUTURE,
  }),
  makeOpp({
    id: 'data-sql-analyst',
    title: 'Analista de SQL y Bases de Datos',
    tags: ['SQL', 'PostgreSQL', 'Excel'],
    description: 'Consultas SQL complejas y mantenimiento de BD.',
    rubro: 'Análisis de Datos', type: 'Presencial', location: 'Asunción, Paraguay', deadline: FUTURE,
  }),
  makeOpp({
    id: 'data-scientist',
    title: 'Data Scientist',
    tags: ['Python', 'SQL', 'Power BI'],
    description: 'Machine learning y análisis estadístico con Python.',
    rubro: 'Análisis de Datos', type: 'Remoto', location: 'Remoto', deadline: FUTURE,
  }),
  makeOpp({
    id: 'data-analyst-latam',
    title: 'Analista de Datos Latam',
    tags: ['Power BI', 'Excel', 'SQL'],
    description: 'Reportes ejecutivos para clientes latinoamericanos.',
    rubro: 'Análisis de Datos', type: 'Remoto', location: 'Remoto',
    eligible_countries: ['latam'], deadline: FUTURE,
  }),
  makeOpp({
    id: 'bi-developer',
    title: 'BI Developer Tableau',
    tags: ['Tableau', 'SQL', 'Python'],
    description: 'Desarrollo de dashboards en Tableau y extracción con SQL.',
    rubro: 'Análisis de Datos', type: 'Remoto', location: 'Remoto', deadline: FUTURE,
  }),
  // === MARKETING ===
  makeOpp({
    id: 'marketing-digital',
    title: 'Especialista en Marketing Digital',
    tags: ['Marketing digital', 'Google Ads'],
    description: 'Campañas digitales y SEO.',
    rubro: 'Marketing', type: 'Presencial', location: 'Asunción, Paraguay', deadline: FUTURE,
  }),
  makeOpp({
    id: 'seo-specialist',
    title: 'Especialista SEO',
    tags: ['SEO', 'Marketing digital', 'Google Ads'],
    description: 'Posicionamiento orgánico y estrategia de contenido.',
    rubro: 'Marketing', type: 'Híbrido', location: 'Asunción, Paraguay', deadline: FUTURE,
  }),
  makeOpp({
    id: 'social-media-manager',
    title: 'Social Media Manager',
    tags: ['Marketing digital', 'Meta Ads'],
    description: 'Gestión de redes sociales y campañas pagadas.',
    rubro: 'Marketing', type: 'Presencial', location: 'Asunción, Paraguay', deadline: FUTURE,
  }),
  // === OTROS ===
  makeOpp({
    id: 'beca-tec-latam',
    title: 'Beca de Innovación Tecnológica LatAm',
    tags: ['Python', 'Gestión de proyectos'],
    description: 'Beca para jóvenes profesionales de América Latina.',
    rubro: 'Becas', opportunity_type: 'scholarship', eligible_countries: ['latam'],
    type: 'Remoto', location: 'Remoto', deadline: FUTURE,
  }),
  makeOpp({
    id: 'no-match-finanzas',
    title: 'Analista de Finanzas Corporativas',
    tags: ['Finanzas', 'Excel', 'SAP'],
    description: 'Análisis financiero y elaboración de informes ejecutivos.',
    rubro: 'Finanzas', type: 'Presencial', location: 'Asunción, Paraguay', deadline: FUTURE,
  }),
  makeOpp({
    id: 'finanzas-excel',
    title: 'Analista de Gestión y Costos',
    tags: ['Excel', 'Finanzas', 'Contabilidad'],
    description: 'Control de costos y presupuesto con Excel avanzado.',
    rubro: 'Finanzas', type: 'Presencial', location: 'Asunción, Paraguay', deadline: FUTURE,
  }),
  makeOpp({
    id: 'marketing-content',
    title: 'Redactor de Contenido Digital',
    tags: ['Marketing digital', 'SEO'],
    description: 'Producción de contenido para blog y redes sociales.',
    rubro: 'Marketing', type: 'Remoto', location: 'Remoto', deadline: FUTURE,
  }),
  makeOpp({
    id: 'pm-agile',
    title: 'Project Manager Ágil',
    tags: ['Gestión de proyectos', 'Scrum', 'Git'],
    description: 'Gestión de proyectos tecnológicos con metodologías ágiles.',
    rubro: 'Gestión', type: 'Remoto', location: 'Remoto', deadline: FUTURE,
  }),
  makeOpp({
    id: 'soporte-ti',
    title: 'Técnico de Soporte TI',
    tags: ['Linux', 'Git'],
    description: 'Soporte de infraestructura interna y helpdesk.',
    rubro: 'Tecnología e IT', type: 'Presencial', location: 'Asunción, Paraguay', deadline: FUTURE,
  }),
]

const BLOCKING_FIXTURES: MatchOpportunity[] = [
  makeOpp({ id: 'inactive', title: 'Inactiva', tags: ['Node.js'], is_active: false, deadline: FUTURE }),
  makeOpp({ id: 'not-verified', title: 'Sin verificar', tags: ['React'], verification_status: 'pending', match_eligible: false, deadline: FUTURE }),
  makeOpp({ id: 'not-match-eligible', title: 'No elegible matching', tags: ['Python'], match_eligible: false, deadline: FUTURE }),
  makeOpp({ id: 'archived', title: 'Archivada', tags: ['TypeScript'], archived_at: '2026-01-01T00:00:00Z', deadline: FUTURE }),
  makeOpp({ id: 'deleted', title: 'Borrada', tags: ['AWS'], deleted_at: '2026-01-01T00:00:00Z', deadline: FUTURE }),
  makeOpp({ id: 'expired', title: 'Vencida', tags: ['Node.js', 'React'], deadline: PAST }),
  makeOpp({ id: 'tender', title: 'Licitación TI', tags: ['Node.js'], opportunity_type: 'tender', deadline: FUTURE }),
  makeOpp({
    id: 'ineligible-country', title: 'Solo EE.UU.', tags: ['React', 'Node.js'],
    eligible_countries: ['us', 'usa', 'united states'], deadline: FUTURE,
  }),
]

const ALL_FIXTURES = [...ELIGIBLE_FIXTURES, ...BLOCKING_FIXTURES]

// ─── Perfiles de prueba ───────────────────────────────────────────────────────

const PROFILE_FULLSTACK: ProfileInput = {
  professional_title: 'Desarrollador Fullstack',
  profile_data: {
    habilidades: ['Node.js', 'React', 'TypeScript', 'Python', 'PostgreSQL', 'Git'],
    seniority: 'semi-senior',
    location: 'Asunción, Paraguay',
    career_route: 'empleo-local',
  },
}

const PROFILE_DATA_ANALYST: ProfileInput = {
  professional_title: 'Analista de Datos',
  profile_data: {
    habilidades: ['Power BI', 'SQL', 'Excel', 'Python'],
    seniority: 'semi-senior',
    location: 'Asunción, Paraguay',
    career_route: 'empleo-local',
  },
}

const PROFILE_MARKETING_JUNIOR: ProfileInput = {
  professional_title: 'Coordinador de Marketing',
  profile_data: {
    habilidades: ['Marketing digital', 'Google Ads', 'Excel', 'SEO'],
    seniority: 'junior',
    location: 'Asunción, Paraguay',
    career_route: 'empleo-local',
  },
}

const PROFILE_FULLSTACK_WITH_POWERBI: ProfileInput = {
  professional_title: 'Desarrollador Fullstack y Analista de Datos',
  profile_data: {
    habilidades: ['Node.js', 'React', 'TypeScript', 'Power BI', 'PostgreSQL', 'Git'],
    seniority: 'semi-senior',
    location: 'Asunción, Paraguay',
    career_route: 'empleo-local',
  },
}

// Relevancia por perfil (ground truth manual)
const RELEVANT: Record<string, Set<string>> = {
  fullstack: new Set([
    'dev-node-senior', 'dev-node-alias', 'react-frontend', 'fullstack-py-asuncion',
    'aws-cloud-engineer', 'devops-docker', 'backend-python', 'ts-node-microservices',
    'react-native-mobile', 'beca-tec-latam', 'pm-agile',
  ]),
  data: new Set([
    'data-powerbi', 'data-sql-analyst', 'data-scientist', 'data-analyst-latam',
    'bi-developer', 'no-match-finanzas', 'finanzas-excel',
  ]),
  marketing: new Set([
    'marketing-digital', 'seo-specialist', 'social-media-manager', 'marketing-content',
  ]),
}

function precisionAt(ranked: MatchOpportunity[], k: number, relevant: Set<string>): number {
  const top = ranked.slice(0, k)
  const hits = top.filter((m) => relevant.has(m.id)).length
  return top.length ? hits / top.length : 0
}

function recallAt(ranked: MatchOpportunity[], k: number, relevant: Set<string>, eligible: MatchOpportunity[]): number {
  const top = ranked.slice(0, k)
  const hitsInTop = top.filter((m) => relevant.has(m.id)).length
  const relevantInEligible = eligible.filter((o) => relevant.has(o.id)).length
  return relevantInEligible ? hitsInTop / relevantInEligible : 0
}

// ─── Ejecución ────────────────────────────────────────────────────────────────

console.log('\n=== PUNTO 13 — Calibración B2C de matching ===\n')

// ── 1. Filtros de servidor ────────────────────────────────────────────────────

console.log('[1/7] Verificando 8 condiciones de filtro del servidor...')

const dictionary = buildDefaultDictionary()
const { eligible: eligibleBase, ranked: rankedFullstack } = rankOpportunities(PROFILE_FULLSTACK, ALL_FIXTURES, dictionary)

assert(!eligibleBase.some((o) => o.id === 'inactive'),            'is_active=false debe excluirse')
assert(!eligibleBase.some((o) => o.id === 'not-verified'),        'verification_status!=verified debe excluirse')
assert(!eligibleBase.some((o) => o.id === 'not-match-eligible'),  'match_eligible=false debe excluirse')
assert(!eligibleBase.some((o) => o.id === 'archived'),            'archived_at!=null debe excluirse')
assert(!eligibleBase.some((o) => o.id === 'deleted'),             'deleted_at!=null debe excluirse')
assert(!eligibleBase.some((o) => o.id === 'expired'),             'deadline vencido debe excluirse')
assert(!eligibleBase.some((o) => o.id === 'tender'),              'opportunity_type=tender debe excluirse')
assert(!eligibleBase.some((o) => o.id === 'ineligible-country'),  'país inelegible EE.UU. debe excluirse para perfil PY')

assert(eligibleBase.length === ELIGIBLE_FIXTURES.length,
  `Deben pasar exactamente ${ELIGIBLE_FIXTURES.length} oportunidades; pasaron: ${eligibleBase.length}`)

console.log(`  ✓ 8/8 condiciones verificadas (${eligibleBase.length} elegibles, ${BLOCKING_FIXTURES.length} bloqueadas)`)

// ── 2. Normalización y regresiones de false positives ────────────────────────

console.log('\n[2/7] Verificando normalización y regresiones de falsos positivos...')
assert(JSON.stringify(parsePgVector('[0.1,-0.2,0.3]')) === JSON.stringify([0.1, -0.2, 0.3]), 'pgvector serializado debe convertirse a number[]')
assert(JSON.stringify(parsePgVector([0.1, 0.2])) === JSON.stringify([0.1, 0.2]), 'pgvector ya materializado debe conservarse')
assert(parsePgVector('[0.1,nope]') === null, 'pgvector inválido debe degradar a fallback')
const profileEmbeddingText = buildProfileEmbeddingText({
  professional_title: 'Analista de datos',
  summary: 'Experiencia en inteligencia de negocio',
  cv_text: 'Python SQL Power BI y modelos predictivos',
  profile_data: { habilidades: ['Python', 'SQL'], location: 'Asunción' },
})
assert(profileEmbeddingText.includes('Experiencia CV: Python SQL Power BI'), 'embedding de perfil debe incluir evidencia del CV')
const opportunityEmbeddingText = buildOpportunityEmbeddingText({
  title: 'Data Analyst',
  description: '<p>Python &amp; SQL</p>',
  tags: ['Power BI'],
})
assert(!opportunityEmbeddingText.includes('<p>'), 'embedding de oportunidad debe eliminar HTML')
assert(opportunityEmbeddingText.includes('Python & SQL'), 'embedding de oportunidad debe conservar texto normalizado')

// Variantes legítimas
assert(sameSkill('Node',    'Node.js',  dictionary), 'Node ↔ Node.js')
assert(sameSkill('nodejs',  'Node.js',  dictionary), 'nodejs ↔ Node.js')
assert(sameSkill('PowerBI', 'Power BI', dictionary), 'PowerBI ↔ Power BI')
assert(sameSkill('powerbi', 'power bi', dictionary), 'powerbi ↔ power bi')
assert(sameSkill('js',      'JavaScript', dictionary), 'js ↔ JavaScript (vía diccionario)')
assert(sameSkill('ts',      'TypeScript',  dictionary), 'ts ↔ TypeScript (vía diccionario)')

// Regresiones de false positives — NINGUNO debe ser true
assert(!sameSkill('Java',    'JavaScript', dictionary), 'REGRESIÓN: Java ≠ JavaScript')
assert(!sameSkill('Power',   'Power BI',   dictionary), 'REGRESIÓN: Power ≠ Power BI')
assert(!sameSkill('React',   'Reactive',   dictionary), 'REGRESIÓN: React ≠ Reactive')
assert(!sameSkill('SQL',     'NoSQL',      dictionary), 'REGRESIÓN: SQL ≠ NoSQL')
assert(!sameSkill('C',       'C++',        dictionary), 'REGRESIÓN: C ≠ C++')

// extractSkills: alias → canonical, sin emitir el alias crudo
const nodeAliasOpp = ALL_FIXTURES.find((o) => o.id === 'dev-node-alias')!
const nodeSkills = extractSkills(nodeAliasOpp, dictionary)
assert(nodeSkills.includes('Node.js'),    '"node" → canonical "Node.js"')
assert(nodeSkills.includes('JavaScript'), '"js" → canonical "JavaScript"')
assert(nodeSkills.includes('Git'),        '"control de versiones" → canonical "Git"')
assert(!nodeSkills.includes('node'),      'alias crudo "node" no debe aparecer en vacancySkills')
assert(!nodeSkills.includes('js'),        'alias crudo "js" no debe aparecer en vacancySkills')

const powerbiOpp = ALL_FIXTURES.find((o) => o.id === 'data-powerbi')!
const powerbiSkills = extractSkills(powerbiOpp, dictionary)
assert(powerbiSkills.includes('Power BI'), '"powerbi" → canonical "Power BI"')
assert(!powerbiSkills.includes('powerbi'), 'alias crudo "powerbi" no debe aparecer')

console.log('  ✓ 6 variantes legítimas verificadas')
console.log('  ✓ 5 regresiones de falsos positivos: Java≠JS, Power≠PowerBI, React≠Reactive, SQL≠NoSQL, C≠C++')
console.log('  ✓ extractSkills no emite alias crudos cuando detecta el canonical')

// ── 3. Métricas por perfil ────────────────────────────────────────────────────

console.log('\n[3/7] Midiendo precision@5 / precision@10 / recall@10 por perfil...')

const profiles: Array<{ key: string; profile: ProfileInput; label: string }> = [
  { key: 'fullstack', profile: PROFILE_FULLSTACK,       label: 'Fullstack Senior' },
  { key: 'data',      profile: PROFILE_DATA_ANALYST,    label: 'Analista de Datos' },
  { key: 'marketing', profile: PROFILE_MARKETING_JUNIOR, label: 'Marketing Junior' },
]

const metrics: Record<string, { p5: number; p10: number; r10: number }> = {}

for (const { key, profile, label } of profiles) {
  const { eligible, ranked } = rankOpportunities(profile, ALL_FIXTURES, dictionary)
  const relevant = RELEVANT[key]
  const p5  = precisionAt(ranked, 5,  relevant)
  const p10 = precisionAt(ranked, 10, relevant)
  const r10 = recallAt(ranked, 10, relevant, eligible)
  metrics[key] = { p5, p10, r10 }

  console.log(`\n  ── ${label} (${eligible.length} elegibles) ──`)
  ranked.slice(0, 10).forEach((m, i) => {
    const mark = relevant.has(m.id) ? '✓' : '✗'
    console.log(`    ${String(i + 1).padStart(2)}. [${mark}] ${m.title} — score=${m.finalScore} skills=${m.skillsScore}`)
  })
  console.log(`    precision@5=${(p5 * 100).toFixed(0)}%  precision@10=${(p10 * 100).toFixed(0)}%  recall@10=${(r10 * 100).toFixed(0)}%`)
}

assert(metrics.fullstack.p10 >= 0.6,
  `Fullstack: precision@10 debe ser >=60%; obtenida: ${(metrics.fullstack.p10 * 100).toFixed(0)}%`)
assert(metrics.data.p10 >= 0.6,
  `Data: precision@10 debe ser >=60%; obtenida: ${(metrics.data.p10 * 100).toFixed(0)}%`)
assert(metrics.marketing.p5 >= 0.6,
  `Marketing: precision@5 debe ser >=60%; obtenida: ${(metrics.marketing.p5 * 100).toFixed(0)}%`)

// ── 4. Falsos positivos de score alto ────────────────────────────────────────

console.log('\n[4/7] Verificando falsos positivos de score alto (>=80)...')

const { ranked: rankedFs } = rankOpportunities(PROFILE_FULLSTACK, ALL_FIXTURES, dictionary)
const fpHighFs = rankedFs.slice(0, 10).filter((m) => m.finalScore >= 80 && !RELEVANT.fullstack.has(m.id))
console.log(`  Fullstack: ${fpHighFs.length} falso(s) positivo(s) con score>=80`)
fpHighFs.forEach((m) => console.log(`    ⚠ ${m.title} score=${m.finalScore}`))
assert(fpHighFs.length <= 1, `Máximo 1 falso positivo score>=80 para fullstack; encontrados: ${fpHighFs.length}`)

// ── 5. Cobertura del catálogo ─────────────────────────────────────────────────

console.log('\n[5/7] Verificando cobertura del catálogo...')

const top20IdsFs = new Set(rankedFs.map((m) => m.id))
const { eligible: eligibleFs } = rankOpportunities(PROFILE_FULLSTACK, ALL_FIXTURES, dictionary)
const relevantEligibleFs = eligibleFs.filter((o) => RELEVANT.fullstack.has(o.id))
const coveredFs = relevantEligibleFs.filter((o) => top20IdsFs.has(o.id)).length
const coverageFs = coveredFs / relevantEligibleFs.length
const coverageNote = ELIGIBLE_FIXTURES.length <= 25
  ? ' [AVISO: fixture pequeño (<=25), cobertura no es representativa de producción]'
  : ''
console.log(`  Fullstack: ${coveredFs}/${relevantEligibleFs.length} relevantes en top-20 (${(coverageFs * 100).toFixed(0)}%)${coverageNote}`)
assert(coverageFs >= 0.7, `Cobertura catálogo fullstack debe ser >=70%; obtenida: ${(coverageFs * 100).toFixed(0)}%`)

// ── 6. Recalibración al cambiar perfil ───────────────────────────────────────

console.log('\n[6/7] Verificando recalibración tras cambio de perfil...')

const { ranked: rankedWithPBI } = rankOpportunities(PROFILE_FULLSTACK_WITH_POWERBI, ALL_FIXTURES, dictionary)

const pbiRankBefore = rankedFs.findIndex((m) => m.id === 'data-powerbi')
const pbiRankAfter  = rankedWithPBI.findIndex((m) => m.id === 'data-powerbi')
console.log(`  data-powerbi: rank ${pbiRankBefore + 1} → ${pbiRankAfter + 1} (menor=mejor)`)
assert(
  pbiRankBefore === -1 || pbiRankAfter < pbiRankBefore,
  `Agregar Power BI debe mejorar rank de data-powerbi (antes=${pbiRankBefore + 1}, después=${pbiRankAfter + 1})`,
)

const { ranked: rankedMarketing } = rankOpportunities(PROFILE_MARKETING_JUNIOR, ALL_FIXTURES, dictionary)
const top1Marketing = rankedMarketing[0]
console.log(`  Marketing top-1: ${top1Marketing?.title} (score=${top1Marketing?.finalScore})`)
assert(
  top1Marketing?.id === 'marketing-digital' || top1Marketing?.id === 'seo-specialist',
  `Top-1 marketing debe ser marketing-digital o seo-specialist; obtenido: '${top1Marketing?.id}'`,
)
assert(
  !rankedMarketing.slice(0, 5).some((m) => m.id === 'dev-node-senior'),
  'dev-node-senior no debe aparecer en top-5 de perfil Marketing Junior',
)
console.log('  ✓ Recalibración coherente')

// ── 7. Latencia ───────────────────────────────────────────────────────────────

console.log('\n[7/7] Midiendo latencia con 300 oportunidades...')

const bulk300 = Array.from({ length: 300 }, (_, i) =>
  makeOpp({
    id: `bulk-${i}`,
    title: `Oportunidad bulk ${i}`,
    tags: i % 3 === 0 ? ['Node.js', 'Python'] : i % 3 === 1 ? ['React', 'TypeScript'] : ['Power BI', 'Excel'],
    description: `Posición ${i} en empresa ficticia.`,
    deadline: FUTURE,
  }),
)

const t0 = performance.now()
rankOpportunities(PROFILE_FULLSTACK, bulk300, dictionary)
const latencyMs = performance.now() - t0
console.log(`  Latencia (in-memory, sin embeddings): ${latencyMs.toFixed(1)} ms`)
assert(latencyMs < 3000, `Ranking 300 oportunidades no debe superar 3000 ms; obtenido: ${latencyMs.toFixed(1)} ms`)

// ── 8. Loop learning sin auto-confirm ────────────────────────────────────────

console.log('\nVerificando loop learning sin auto-confirm de habilidades...')

const migration9 = readFileSync(join(__dir, '../supabase/migrations/202608130009_learning_recommendations.sql'), 'utf8')

const fnStart = migration9.indexOf('create or replace function public.update_learning_recommendation_status')
const fnEnd   = migration9.indexOf('create or replace function public.delete_b2c_user_data')
assert(fnStart !== -1 && fnEnd !== -1, 'Migracion 202608130009 debe tener ambas funciones')
const updateFnBody = migration9.slice(fnStart, fnEnd)
assert(
  !updateFnBody.includes('user_master_profiles'),
  'update_learning_recommendation_status NO debe tocar user_master_profiles',
)
console.log('  ✓ completar curso no toca user_master_profiles (migración verificada)')

// ── Brechas frecuentes ────────────────────────────────────────────────────────

console.log('\n── Brechas más frecuentes en top-10 para Fullstack Senior ──')
const missingFreq = new Map<string, { skill: string; count: number }>()
rankedFs.slice(0, 10).forEach((m) => {
  m.missingSkills.forEach((skill) => {
    const key = normalize(skill)
    const cur = missingFreq.get(key) ?? { skill, count: 0 }
    cur.count += 1
    missingFreq.set(key, cur)
  })
})
;[...missingFreq.values()].sort((a, b) => b.count - a.count).slice(0, 5)
  .forEach((g) => console.log(`  "${g.skill}" faltante en ${g.count}/10 top oportunidades`))

// ── Resumen ───────────────────────────────────────────────────────────────────

const fs_p10 = (metrics.fullstack.p10 * 100).toFixed(0)
const da_p10 = (metrics.data.p10 * 100).toFixed(0)
const mk_p5  = (metrics.marketing.p5 * 100).toFixed(0)

console.log('\n╔════════════════════════════════════════════════════════════════════╗')
console.log('║  PUNTO 13 — CALIBRACIÓN B2C COMPLETADA                            ║')
console.log('╠════════════════════════════════════════════════════════════════════╣')
console.log(`║  Fixtures: ${String(ELIGIBLE_FIXTURES.length).padEnd(2)} elegibles + ${String(BLOCKING_FIXTURES.length).padEnd(2)} bloqueantes = ${String(ALL_FIXTURES.length).padEnd(3)} total           ║`)
console.log(`║  Filtros de servidor: 8/8 ✓                                        ║`)
console.log(`║  Normalización (Node/PowerBI/js/ts): ✓                             ║`)
console.log(`║  Regresiones FP (Java≠JS, Power≠BI, React≠Reactive...): 5/5 ✓     ║`)
console.log(`║  extractSkills sin alias crudos: ✓                                 ║`)
console.log(`║  precision@10 Fullstack:      ${fs_p10.padStart(3)}%                              ║`)
console.log(`║  precision@10 Data Analyst:   ${da_p10.padStart(3)}%                              ║`)
console.log(`║  precision@5  Marketing:      ${mk_p5.padStart(3)}%                              ║`)
console.log(`║  Falsos positivos score>=80:  ${String(fpHighFs.length).padEnd(2)}                               ║`)
console.log(`║  Cobertura catálogo fullstack: ${(coverageFs * 100).toFixed(0).padStart(3)}%                             ║`)
console.log(`║  Recalibración coherente: ✓                                        ║`)
console.log(`║  Latencia 300 ops: ${latencyMs.toFixed(0).padStart(4)} ms                                    ║`)
console.log(`║  Loop learning sin auto-confirm: ✓                                 ║`)
console.log('╚════════════════════════════════════════════════════════════════════╝')
