/**
 * matching-v2.ts — Shadow Matching V2
 *
 * SHADOW MODE: does NOT replace matching.ts. Run side-by-side for comparison.
 *
 * Architecture:
 *   LAYER 1: Hard eligibility (inherited from matching.ts — unchanged)
 *   LAYER 2: Professional compatibility (career family detection)
 *   LAYER 3: Evidence-aware skills + title
 *   LAYER 4: Semantic relevance (same as before)
 *   LAYER 5: Seniority + location
 *   LAYER 6: Evidence confidence
 *   LAYER 7: Final ranking
 *
 * Each fix is individually configurable via V2Config.
 *
 * Invariants (always apply, regardless of config):
 *   - match_eligible=false → excluded (no bypass)
 *   - isTender → excluded (no bypass)
 *   - isEligibleForProfile=false → excluded (no bypass)
 *   - UNKNOWN != ELIGIBLE
 *   - Remote != Worldwide
 *   - No source-specific logic
 *
 * Compatible with Node/tsx (no Deno imports).
 */

import {
  buildDefaultDictionary,
  calculateLocationScore,
  calculateSkillScore,
  careerBonus,
  extractSkills,
  isEligibleForProfile,
  isTender,
  normalize,
  toStrings,
} from './matching.ts'

// ─── Career Family ────────────────────────────────────────────────────────────

export const CareerFamily = {
  SOFTWARE_ENGINEERING: 'SOFTWARE_ENGINEERING',
  DATA_ANALYTICS: 'DATA_ANALYTICS',
  FINANCE_ACCOUNTING: 'FINANCE_ACCOUNTING',
  HEALTHCARE: 'HEALTHCARE',
  INTERNATIONAL_DEVELOPMENT: 'INTERNATIONAL_DEVELOPMENT',
  PROJECT_PROGRAM_MANAGEMENT: 'PROJECT_PROGRAM_MANAGEMENT',
  MARKETING_COMMUNICATIONS: 'MARKETING_COMMUNICATIONS',
  SALES_BUSINESS_DEV: 'SALES_BUSINESS_DEV',
  OPERATIONS: 'OPERATIONS',
  HR_PEOPLE: 'HR_PEOPLE',
  LEGAL: 'LEGAL',
  ENGINEERING_TECHNICAL: 'ENGINEERING_TECHNICAL',
  ADMIN_SUPPORT: 'ADMIN_SUPPORT',
  UNKNOWN: 'UNKNOWN',
} as const

export type CareerFamilyKey = keyof typeof CareerFamily

export interface FamilyDetection {
  family: CareerFamilyKey
  confidence: 'HIGH' | 'LOW' | 'NONE'
  signals: string[]
}

export type ProfessionalCompatibility = 'COMPATIBLE' | 'ADJACENT' | 'CONFLICT' | 'UNKNOWN'

// Vocabulary for family detection — ordered from most specific to most generic
const FAMILY_VOCABULARY: Record<CareerFamilyKey, string[]> = {
  SOFTWARE_ENGINEERING: [
    'developer', 'software', 'backend', 'frontend', 'fullstack', 'ingeniero software',
    'programador', 'python', 'javascript', 'typescript', 'react', 'node', 'nodejs',
    'java', 'spring', 'c#', '.net', 'php', 'ruby', 'golang', 'rust', 'mobile',
    'android', 'ios', 'devops', 'cloud', 'aws', 'kubernetes', 'docker', 'microservices',
    'api', 'rest', 'graphql', 'arquitecto software', 'tech lead',
  ],
  DATA_ANALYTICS: [
    'data analyst', 'analista de datos', 'data scientist', 'data engineer', 'bi developer',
    'business intelligence', 'machine learning', 'power bi', 'tableau', 'sql analyst',
    'data warehouse', 'etl', 'analytics', 'estadistica', 'modelado de datos',
    'ciencia de datos',
  ],
  FINANCE_ACCOUNTING: [
    'contador', 'contabilidad', 'finanzas', 'financiero', 'finance', 'accounting',
    'auditor', 'tesorero', 'presupuesto', 'cost analyst', 'analista financiero',
    'controller', 'tax', 'impuestos', 'sap', 'erp contabilidad',
  ],
  HEALTHCARE: [
    'enfermera', 'enfermero', 'medico', 'doctor', 'cirujano', 'farmaceutico',
    'fisioterapeuta', 'kinesiologo', 'nutricionista', 'psicologo clinico',
    'clinico', 'hospital', 'salud', 'healthcare', 'nurse', 'physician',
    'cuidado al paciente', 'atencion medica', 'odontologia',
  ],
  INTERNATIONAL_DEVELOPMENT: [
    'cooperacion internacional', 'international cooperation', 'programme coordinator',
    'programme officer', 'development officer', 'ong', 'ngo', 'naciones unidas',
    'united nations', 'bid', 'pnud', 'undp', 'desarrollo internacional',
    'international development', 'humanitarian', 'aid', 'partnerships coordinator',
    'coordinador de proyectos internacionales', 'gestion de proyectos internacionales',
    'organismos internacionales',
  ],
  PROJECT_PROGRAM_MANAGEMENT: [
    'project manager', 'program manager', 'gestor de proyectos', 'coordinador de proyectos',
    'scrum master', 'agile coach', 'pmo', 'project lead', 'project coordinator',
    'planificacion estrategica', 'metodologia agil', 'gestion de proyectos',
  ],
  MARKETING_COMMUNICATIONS: [
    'marketing', 'publicidad', 'advertising', 'social media', 'community manager',
    'content creator', 'seo specialist', 'sem specialist', 'branding', 'copywriter',
    'marketing digital', 'comunicaciones', 'relaciones publicas', 'pr manager',
    'growth hacker', 'email marketing',
  ],
  SALES_BUSINESS_DEV: [
    'ventas', 'sales', 'comercial', 'business development', 'account manager',
    'ejecutivo comercial', 'representante de ventas', 'key account', 'crm',
    'customer success', 'sdm', 'bdm',
  ],
  OPERATIONS: [
    'operaciones', 'operations manager', 'logistics', 'logistica', 'supply chain',
    'cadena de suministro', 'warehouse', 'almacen', 'production manager',
    'plant manager', 'quality manager', 'calidad', 'lean', 'six sigma',
  ],
  HR_PEOPLE: [
    'recursos humanos', 'rrhh', 'human resources', 'talent acquisition', 'recruiter',
    'headhunter', 'people manager', 'hr business partner', 'capacitacion', 'training',
    'compensation', 'nomina', 'payroll',
  ],
  LEGAL: [
    'abogado', 'lawyer', 'legal', 'juridico', 'derecho', 'compliance', 'contrato',
    'litigation', 'corporate counsel', 'attorney', 'notario', 'paralegal',
  ],
  ENGINEERING_TECHNICAL: [
    'ingeniero civil', 'ingeniero electrico', 'ingeniero mecanico', 'ingeniero industrial',
    'civil engineer', 'electrical engineer', 'mechanical engineer', 'industrial engineer',
    'arquitecto edificios', 'construction', 'obra civil', 'cad', 'autocad',
    'tecnico electricista', 'electromecánico',
  ],
  ADMIN_SUPPORT: [
    'asistente', 'secretaria', 'secretario', 'administrative', 'assistant',
    'recepcionista', 'soporte administrativo', 'auxiliar administrativo', 'office manager',
    'data entry', 'office coordinator',
  ],
  UNKNOWN: [],
}

// Adjacency: A can match B if listed
const CAREER_ADJACENCY: Partial<Record<CareerFamilyKey, CareerFamilyKey[]>> = {
  INTERNATIONAL_DEVELOPMENT: [
    'PROJECT_PROGRAM_MANAGEMENT',
    'ADMIN_SUPPORT',
    'HR_PEOPLE',
  ],
  PROJECT_PROGRAM_MANAGEMENT: [
    'INTERNATIONAL_DEVELOPMENT',
    'OPERATIONS',
    'SOFTWARE_ENGINEERING', // technical PM
  ],
  MARKETING_COMMUNICATIONS: [
    'SALES_BUSINESS_DEV',
    'ADMIN_SUPPORT',
  ],
  DATA_ANALYTICS: [
    'SOFTWARE_ENGINEERING',
    'FINANCE_ACCOUNTING',
  ],
  SOFTWARE_ENGINEERING: [
    'DATA_ANALYTICS',
    'PROJECT_PROGRAM_MANAGEMENT',
  ],
  SALES_BUSINESS_DEV: [
    'MARKETING_COMMUNICATIONS',
    'OPERATIONS',
  ],
  FINANCE_ACCOUNTING: [
    'DATA_ANALYTICS',
    'ADMIN_SUPPORT',
  ],
  HR_PEOPLE: [
    'ADMIN_SUPPORT',
    'INTERNATIONAL_DEVELOPMENT',
  ],
}

// Hard conflicts — CONFLICT if both sides have HIGH confidence
const CAREER_CONFLICTS: Array<[CareerFamilyKey, CareerFamilyKey]> = [
  ['HEALTHCARE', 'SOFTWARE_ENGINEERING'],
  ['HEALTHCARE', 'DATA_ANALYTICS'],
  ['HEALTHCARE', 'FINANCE_ACCOUNTING'],
  ['HEALTHCARE', 'MARKETING_COMMUNICATIONS'],
  ['HEALTHCARE', 'ENGINEERING_TECHNICAL'],
  ['LEGAL', 'SOFTWARE_ENGINEERING'],
  ['LEGAL', 'DATA_ANALYTICS'],
  ['ENGINEERING_TECHNICAL', 'HEALTHCARE'],
  ['ENGINEERING_TECHNICAL', 'FINANCE_ACCOUNTING'],
]

export function detectCareerFamily(title: string, skills: string[], rubro?: string): FamilyDetection {
  const text = normalize(`${title} ${skills.join(' ')} ${rubro ?? ''}`)

  const matchedFamilies: Map<CareerFamilyKey, string[]> = new Map()

  for (const [family, keywords] of Object.entries(FAMILY_VOCABULARY) as [CareerFamilyKey, string[]][]) {
    if (family === 'UNKNOWN') continue
    const matched = keywords.filter(kw => {
      const nkw = normalize(kw)
      return ` ${text} `.includes(` ${nkw} `) || (nkw.length >= 5 && text.includes(nkw))
    })
    if (matched.length > 0) {
      matchedFamilies.set(family, matched)
    }
  }

  if (matchedFamilies.size === 0) {
    return { family: 'UNKNOWN', confidence: 'NONE', signals: [] }
  }

  // Pick the family with most signal hits
  let bestFamily: CareerFamilyKey = 'UNKNOWN'
  let bestCount = 0
  for (const [fam, signals] of matchedFamilies) {
    if (signals.length > bestCount) {
      bestFamily = fam
      bestCount = signals.length
    }
  }

  const bestSignals = matchedFamilies.get(bestFamily) ?? []
  const confidence = bestCount >= 2 ? 'HIGH' : 'LOW'

  return { family: bestFamily, confidence, signals: bestSignals }
}

export function getProfessionalCompatibility(
  candidateFam: FamilyDetection,
  vacancyFam: FamilyDetection,
): ProfessionalCompatibility {
  // If either is UNKNOWN → cannot determine conflict or compatibility
  if (candidateFam.family === 'UNKNOWN' || vacancyFam.family === 'UNKNOWN') return 'UNKNOWN'
  if (candidateFam.confidence === 'NONE' || vacancyFam.confidence === 'NONE') return 'UNKNOWN'

  const cFam = candidateFam.family
  const vFam = vacancyFam.family

  // Same family → COMPATIBLE
  if (cFam === vFam) return 'COMPATIBLE'

  // Check adjacency
  const cAdj = CAREER_ADJACENCY[cFam] ?? []
  const vAdj = CAREER_ADJACENCY[vFam] ?? []
  if (cAdj.includes(vFam) || vAdj.includes(cFam)) return 'ADJACENT'

  // Check hard conflict (only if BOTH sides are HIGH confidence)
  if (candidateFam.confidence === 'HIGH' && vacancyFam.confidence === 'HIGH') {
    const isConflict = CAREER_CONFLICTS.some(
      ([a, b]) => (a === cFam && b === vFam) || (a === vFam && b === cFam),
    )
    if (isConflict) return 'CONFLICT'
  }

  // Low-confidence conflict → UNKNOWN (don't penalize uncertainty)
  return 'UNKNOWN'
}

// ─── V2 Config ────────────────────────────────────────────────────────────────

export interface V2Config {
  fixTitleFloor: boolean          // V2-A: titleScore 25→0 for zero-overlap
  fixSkillsUnknown: boolean       // V2-B: skillsScore 45→UNKNOWN when no vacancy skills
  fixSeniorityUnknown: boolean    // V2-C: seniority default rank2→UNKNOWN
  removeScoreFloor: boolean       // V2-D: remove max(20,...) floor
  addProfessionalCompat: boolean  // V2-E: apply career family compatibility multiplier
  dynamicWeights: boolean         // V2-F: redistribute weights for UNKNOWN signals
}

export const V2_PRESET_A: V2Config = { fixTitleFloor: true, fixSkillsUnknown: false, fixSeniorityUnknown: false, removeScoreFloor: false, addProfessionalCompat: false, dynamicWeights: false }
export const V2_PRESET_B: V2Config = { fixTitleFloor: false, fixSkillsUnknown: true, fixSeniorityUnknown: false, removeScoreFloor: false, addProfessionalCompat: false, dynamicWeights: false }
export const V2_PRESET_C: V2Config = { fixTitleFloor: false, fixSkillsUnknown: false, fixSeniorityUnknown: true, removeScoreFloor: false, addProfessionalCompat: false, dynamicWeights: false }
export const V2_PRESET_D: V2Config = { fixTitleFloor: false, fixSkillsUnknown: false, fixSeniorityUnknown: false, removeScoreFloor: true, addProfessionalCompat: false, dynamicWeights: false }
export const V2_PRESET_E: V2Config = { fixTitleFloor: false, fixSkillsUnknown: false, fixSeniorityUnknown: false, removeScoreFloor: false, addProfessionalCompat: true, dynamicWeights: false }
export const V2_PRESET_F: V2Config = { fixTitleFloor: false, fixSkillsUnknown: false, fixSeniorityUnknown: false, removeScoreFloor: false, addProfessionalCompat: false, dynamicWeights: true }
export const V2_PRESET_FULL: V2Config = { fixTitleFloor: true, fixSkillsUnknown: true, fixSeniorityUnknown: true, removeScoreFloor: true, addProfessionalCompat: true, dynamicWeights: true }

// ─── Evidence interfaces ──────────────────────────────────────────────────────

export interface MatchEvidence {
  skillsSignal: 'KNOWN' | 'UNKNOWN' | 'ABSENT'
  titleSignal: 'KNOWN' | 'UNKNOWN'
  senioritySignal: 'KNOWN' | 'UNKNOWN'
  locationSignal: 'KNOWN' | 'UNKNOWN'
  semanticSignal: 'KNOWN' | 'ABSENT'
  eligibilitySignal: 'ELIGIBLE' | 'INELIGIBLE' | 'UNKNOWN'
  professionalCompatSignal: ProfessionalCompatibility
  candidateFamily: FamilyDetection
  vacancyFamily: FamilyDetection
}

export interface V2ScoreBreakdown {
  finalScore: number
  oldFinalScore: number
  delta: number
  skillsScore: number | null   // null = UNKNOWN
  titleScore: number | null    // null = UNKNOWN
  seniorityScore: number | null
  locationScore: number
  semanticScore: number | null
  careerBonusValue: number
  evidence: MatchEvidence
  confidence: 'HIGH' | 'MEDIUM' | 'LOW'
  positiveReasons: string[]
  negativeReasons: string[]
  unknownSignals: string[]
  professionalCompatMultiplier: number
  weightsUsed: Record<string, number>
}

// ─── V2 Scoring ───────────────────────────────────────────────────────────────

import { SENIORITY_RANK, tokenSet } from './matching.ts'

function calculateTitleScoreV2(profileTitle: string, opp: any, cfg: V2Config): { score: number | null; unknown: boolean } {
  const profileTokens = tokenSet(profileTitle)
  if (!profileTokens.size) return { score: 45, unknown: false }

  const oppTokens = tokenSet(`${opp.title ?? ''} ${opp.rubro ?? ''} ${opp.type ?? ''}`)
  const hits = [...profileTokens].filter(t => oppTokens.has(t)).length

  if (!hits) {
    // V2-A: return 0 instead of 25 for zero-overlap
    return { score: cfg.fixTitleFloor ? 0 : 25, unknown: false }
  }
  return { score: Math.min(100, 45 + Math.round(hits / profileTokens.size * 55)), unknown: false }
}

function calculateSkillScoreV2(
  profileSkills: string[],
  vacancySkills: string[],
  dictionary: any,
  cfg: V2Config,
): { score: number | null; unknown: boolean } {
  if (!vacancySkills.length) {
    // V2-B: return null (UNKNOWN) instead of 45 when no vacancy skills
    if (cfg.fixSkillsUnknown) return { score: null, unknown: true }
    return { score: profileSkills.length ? 45 : 30, unknown: false }
  }
  if (!profileSkills.length) return { score: 15, unknown: false }

  // Normal calculation
  const score = calculateSkillScore(profileSkills, vacancySkills, dictionary)
  return { score, unknown: false }
}

function calculateSeniorityScoreV2(
  profileSeniority: string,
  vacancyText: string,
  cfg: V2Config,
): { score: number | null; unknown: boolean; profileRank: number | null; vacancyRank: number | null } {
  const normProfile = normalize(profileSeniority).replace(/\s/g, '')
  const normVacancy = normalize(vacancyText).replace(/\s/g, '')

  const profileRank = (SENIORITY_RANK as any)[normProfile] ?? null
  let vacancyRank: number | null = null
  for (const [key, rank] of Object.entries(SENIORITY_RANK) as [string, number][]) {
    if (normVacancy.includes(key)) {
      vacancyRank = rank
      break
    }
  }

  if (cfg.fixSeniorityUnknown) {
    // V2-C: if either is unknown, return null (UNKNOWN signal)
    if (profileRank === null || vacancyRank === null) {
      return { score: null, unknown: true, profileRank, vacancyRank }
    }
  } else {
    // OLD behavior: default to rank 2
    const pRank = profileRank ?? 2
    const vRank = vacancyRank ?? 2
    const diff = Math.abs(pRank - vRank)
    return { score: [100, 78, 52, 28, 12][Math.min(diff, 4)], unknown: false, profileRank, vacancyRank }
  }

  // Both known
  const diff = Math.abs(profileRank - vacancyRank)
  return { score: [100, 78, 52, 28, 12][Math.min(diff, 4)], unknown: false, profileRank, vacancyRank }
}

function computeDynamicWeights(
  evidence: MatchEvidence,
  hasEmbedding: boolean,
  cfg: V2Config,
): Record<string, number> {
  if (!cfg.dynamicWeights) {
    // Original weights
    if (hasEmbedding) {
      return { semantic: 0.30, skills: 0.32, title: 0.18, seniority: 0.10, location: 0.10 }
    }
    return { skills: 0.42, title: 0.25, seniority: 0.16, location: 0.17 }
  }

  // V2-F: Remove UNKNOWN signals from denominator and redistribute proportionally
  const baseWeights = hasEmbedding
    ? { semantic: 0.30, skills: 0.32, title: 0.18, seniority: 0.10, location: 0.10 }
    : { skills: 0.42, title: 0.25, seniority: 0.16, location: 0.17 }

  const activeWeights: Record<string, number> = { ...baseWeights }

  // Remove UNKNOWN signals
  if (evidence.skillsSignal === 'UNKNOWN' || evidence.skillsSignal === 'ABSENT') {
    delete activeWeights.skills
  }
  if (evidence.senioritySignal === 'UNKNOWN') {
    delete activeWeights.seniority
  }
  if (evidence.semanticSignal === 'ABSENT' || !hasEmbedding) {
    delete activeWeights.semantic
  }

  // Normalize remaining to sum to 1.0
  const totalActive = Object.values(activeWeights).reduce((a, b) => a + b, 0)
  if (totalActive <= 0) return baseWeights // fallback

  const normalized: Record<string, number> = {}
  for (const [key, w] of Object.entries(activeWeights)) {
    normalized[key] = w / totalActive
  }

  return normalized
}

function computeProfessionalCompatMultiplier(
  compat: ProfessionalCompatibility,
  candidateFam: FamilyDetection,
  vacancyFam: FamilyDetection,
  cfg: V2Config,
): number {
  if (!cfg.addProfessionalCompat) return 1.0

  switch (compat) {
    case 'CONFLICT':
      // Only penalize if BOTH HIGH confidence
      if (candidateFam.confidence === 'HIGH' && vacancyFam.confidence === 'HIGH') return 0.40
      if (candidateFam.confidence === 'LOW' || vacancyFam.confidence === 'LOW') return 0.75
      return 1.0
    case 'ADJACENT':
      return 1.05
    case 'COMPATIBLE':
    case 'UNKNOWN':
    default:
      return 1.0
  }
}

// ─── MAIN: rankOpportunitiesV2 ────────────────────────────────────────────────

export interface V2RankResult {
  opp: any
  oldScore: number
  v2Score: number
  delta: number
  breakdown: V2ScoreBreakdown
}

export function rankOpportunitiesV2(
  profile: any,
  opportunities: any[],
  dictionary: any,
  cfg: V2Config,
  semanticSimilarities?: Map<string, number>,
  now = new Date().toISOString(),
): { eligible: any[]; rankedOld: any[]; rankedV2: V2RankResult[] } {
  const profileSkills = toStrings(profile.profile_data.habilidades)
  const profileSeniority = String(profile.profile_data.seniority ?? '')
  const profileLocation = String(profile.profile_data.location ?? '')
  const careerRoute = String(profile.profile_data.career_route ?? '')
  const profileTitle = String(profile.professional_title ?? '')

  // LAYER 1: Hard eligibility (unchanged — non-bypassable)
  const eligible = opportunities.filter(opp =>
    opp.is_active !== false &&
    opp.verification_status === 'verified' &&
    opp.match_eligible !== false &&          // ← NON-BYPASSABLE
    opp.deleted_at == null &&
    opp.archived_at == null &&
    (opp.deadline == null || opp.deadline > now) &&
    !isTender(opp) &&                        // ← NON-BYPASSABLE
    isEligibleForProfile(opp, profileLocation), // ← NON-BYPASSABLE
  )

  const hasEmbedding = semanticSimilarities != null && semanticSimilarities.size > 0

  // Detect candidate family once
  const candidateFamily = detectCareerFamily(profileTitle, profileSkills, undefined)

  const results: V2RankResult[] = eligible.map(opp => {
    const vacancySkills = extractSkills(opp, dictionary)
    const locationScore = calculateLocationScore(profileLocation, opp.location ?? '')
    const cBonus = careerBonus(careerRoute, opp)

    // OLD score (always computed for delta)
    const oldSkillsScore = calculateSkillScore(profileSkills, vacancySkills, dictionary)
    const oldTitleScore = (() => {
      const profileTokens = tokenSet(profileTitle)
      if (!profileTokens.size) return 45
      const oppTokens = tokenSet(`${opp.title ?? ''} ${opp.rubro ?? ''} ${opp.type ?? ''}`)
      const hits = [...profileTokens].filter(t => oppTokens.has(t)).length
      if (!hits) return 25 // OLD floor
      return Math.min(100, 45 + Math.round(hits / profileTokens.size * 55))
    })()
    const oldSeniorityScore = (() => {
      const p = (SENIORITY_RANK as any)[normalize(profileSeniority).replace(/\s/g, '')] ?? 2
      const vacancyText = normalize(`${opp.title ?? ''} ${opp.rubro ?? ''} ${opp.description ?? ''}`).replace(/\s/g, '')
      let v = 2
      for (const [key, rank] of Object.entries(SENIORITY_RANK) as [string, number][]) {
        if (vacancyText.includes(key)) { v = rank; break }
      }
      return [100, 78, 52, 28, 12][Math.min(Math.abs(p - v), 4)]
    })()

    const semanticScore = semanticSimilarities?.get(String(opp.id))
    const semanticScoreNum = semanticScore != null ? Math.round(semanticScore * 100) : null

    let oldWeighted: number
    if (semanticScoreNum != null) {
      oldWeighted = semanticScoreNum * 0.30 + oldSkillsScore * 0.32 + oldTitleScore * 0.18 + oldSeniorityScore * 0.10 + locationScore * 0.10
    } else {
      oldWeighted = oldSkillsScore * 0.42 + oldTitleScore * 0.25 + oldSeniorityScore * 0.16 + locationScore * 0.17
    }
    const oldFinalScore = Math.max(20, Math.min(99, Math.round(oldWeighted + cBonus)))

    // V2 scoring
    const v2SkillsResult = calculateSkillScoreV2(profileSkills, vacancySkills, dictionary, cfg)
    const v2TitleResult = calculateTitleScoreV2(profileTitle, opp, cfg)
    const v2SeniorityResult = calculateSeniorityScoreV2(
      profileSeniority,
      `${opp.title ?? ''} ${opp.rubro ?? ''} ${opp.description ?? ''}`,
      cfg,
    )

    // Eligibility signal
    const eligibilitySignal: MatchEvidence['eligibilitySignal'] =
      (opp.eligible_countries?.length > 0 || opp.eligible_regions?.length > 0)
        ? 'ELIGIBLE'  // passed isEligibleForProfile, has declared countries
        : 'UNKNOWN'  // no declared countries — passed but unknown

    // Career family detection for vacancy
    const vacancyFamily = detectCareerFamily(
      opp.title ?? '',
      vacancySkills,
      opp.rubro ?? '',
    )
    const compat = getProfessionalCompatibility(candidateFamily, vacancyFamily)
    const compatMultiplier = computeProfessionalCompatMultiplier(compat, candidateFamily, vacancyFamily, cfg)

    // Evidence
    const evidence: MatchEvidence = {
      skillsSignal: v2SkillsResult.unknown ? 'UNKNOWN' : (v2SkillsResult.score === null ? 'ABSENT' : 'KNOWN'),
      titleSignal: v2TitleResult.score === 0 ? 'UNKNOWN' : 'KNOWN',
      senioritySignal: v2SeniorityResult.unknown ? 'UNKNOWN' : 'KNOWN',
      locationSignal: locationScore > 0 ? 'KNOWN' : 'UNKNOWN',
      semanticSignal: semanticScoreNum != null ? 'KNOWN' : 'ABSENT',
      eligibilitySignal,
      professionalCompatSignal: compat,
      candidateFamily,
      vacancyFamily,
    }

    // Dynamic weights
    const weights = computeDynamicWeights(evidence, hasEmbedding, cfg)

    // Compute weighted score with V2 values (null signals → excluded from sum)
    let v2Weighted = 0
    let assignedWeight = 0
    const addComponent = (key: string, value: number | null) => {
      const w = weights[key]
      if (w == null || value == null) return
      v2Weighted += value * w
      assignedWeight += w
    }

    addComponent('semantic', semanticScoreNum)
    addComponent('skills', v2SkillsResult.score)
    addComponent('title', v2TitleResult.score)
    addComponent('seniority', v2SeniorityResult.score)
    addComponent('location', locationScore)

    // If dynamic weights and some signals were excluded, re-normalize
    if (cfg.dynamicWeights && assignedWeight > 0 && assignedWeight < 0.999) {
      v2Weighted = v2Weighted / assignedWeight
    }

    v2Weighted += cBonus

    // Apply professional compat multiplier (before floor)
    v2Weighted *= compatMultiplier

    // V2-D: remove floor
    const floor = cfg.removeScoreFloor ? 0 : 20
    const v2FinalScore = Math.max(floor, Math.min(99, Math.round(v2Weighted)))

    // Evidence confidence
    const knownSignals = [
      evidence.skillsSignal === 'KNOWN',
      evidence.titleSignal === 'KNOWN',
      evidence.senioritySignal === 'KNOWN',
      evidence.semanticSignal === 'KNOWN',
      evidence.eligibilitySignal === 'ELIGIBLE',
    ].filter(Boolean).length

    const confidence: V2ScoreBreakdown['confidence'] =
      knownSignals >= 4 ? 'HIGH' : knownSignals >= 2 ? 'MEDIUM' : 'LOW'

    // Positive/negative/unknown reasons
    const positiveReasons: string[] = []
    const negativeReasons: string[] = []
    const unknownSignals: string[] = []

    if (evidence.skillsSignal === 'KNOWN' && v2SkillsResult.score != null && v2SkillsResult.score >= 50) {
      positiveReasons.push(`Skills overlap: ${v2SkillsResult.score}`)
    }
    if (evidence.skillsSignal === 'UNKNOWN') unknownSignals.push('skills_unknown')
    if (v2TitleResult.score === 0 && cfg.fixTitleFloor) negativeReasons.push('title_zero_overlap')
    if (v2SeniorityResult.unknown) unknownSignals.push('seniority_unknown')
    if (compat === 'CONFLICT') negativeReasons.push(`career_family_conflict:${candidateFamily.family}↔${vacancyFamily.family}`)
    if (compat === 'ADJACENT') positiveReasons.push(`career_adjacent:${candidateFamily.family}↔${vacancyFamily.family}`)
    if (evidence.eligibilitySignal === 'UNKNOWN') unknownSignals.push('eligibility_unknown')

    const breakdown: V2ScoreBreakdown = {
      finalScore: v2FinalScore,
      oldFinalScore,
      delta: v2FinalScore - oldFinalScore,
      skillsScore: v2SkillsResult.score,
      titleScore: v2TitleResult.score,
      seniorityScore: v2SeniorityResult.score,
      locationScore,
      semanticScore: semanticScoreNum,
      careerBonusValue: cBonus,
      evidence,
      confidence,
      positiveReasons,
      negativeReasons,
      unknownSignals,
      professionalCompatMultiplier: compatMultiplier,
      weightsUsed: weights,
    }

    return {
      opp,
      oldScore: oldFinalScore,
      v2Score: v2FinalScore,
      delta: v2FinalScore - oldFinalScore,
      breakdown,
    }
  })

  const rankedV2 = [...results].sort((a, b) => b.v2Score - a.v2Score).slice(0, 20)

  // Also compute OLD ranked for comparison
  const rankedOld = [...results]
    .sort((a, b) => b.oldScore - a.oldScore)
    .slice(0, 20)
    .map(r => ({ ...r.opp, finalScore: r.oldScore }))

  return { eligible, rankedOld, rankedV2 }
}

// ─── EXPORTS re-used by harness ───────────────────────────────────────────────

export { SENIORITY_RANK, tokenSet }
