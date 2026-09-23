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
  sameSkill,
  toStrings,
} from './matching.ts'
import { hasProfessionalEvidence } from './match-readiness.ts'
import type {
  EligibilityState,
  HardRequirementsState,
  MatchDecision,
  MatchOutcome,
  ProfessionalCompatibility,
  ProfessionalEvidenceState,
  WorkArrangementState,
} from '../../../src/lib/match-decision.ts'
export type {
  EligibilityState,
  HardRequirementsState,
  MatchDecision,
  MatchOutcome,
  ProfessionalCompatibility,
  ProfessionalEvidenceState,
  WorkArrangementState,
} from '../../../src/lib/match-decision.ts'

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
  EDUCATION_ACADEMIC: 'EDUCATION_ACADEMIC',
  CUSTOMER_SERVICE: 'CUSTOMER_SERVICE',
  UNKNOWN: 'UNKNOWN',
} as const

export type CareerFamilyKey = keyof typeof CareerFamily

export interface FamilyDetection {
  family: CareerFamilyKey
  confidence: 'HIGH' | 'LOW' | 'NONE'
  signals: string[]
}


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
    'cooperacion internacional', 'international cooperation', 'relaciones internacionales', 'international relations', 'proyectos de desarrollo',
    'programme coordinator',
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
    'tecnico electricista', 'electromecánico', 'tecnico en reparaciones',
    'reparacion de televisores', 'televisores', 'equipos electronicos',
    'mantenimiento electronico', 'electronica',
  ],
  ADMIN_SUPPORT: [
    'asistente', 'secretaria', 'secretario', 'administrative', 'assistant',
    'recepcionista', 'soporte administrativo', 'auxiliar administrativo', 'office manager',
    'data entry', 'office coordinator',
  ],
  EDUCATION_ACADEMIC: [
    'education', 'academic', 'curriculum', 'teaching', 'teacher', 'lecturer',
    'profesor', 'docente', 'university', 'universidad', 'researcher', 'investigacion',
  ],
  CUSTOMER_SERVICE: [
    'customer service', 'customer support', 'atencion al cliente', 'call center',
    'soporte al cliente', 'support specialist', 'contact center',
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
  EDUCATION_ACADEMIC: [
    'PROJECT_PROGRAM_MANAGEMENT',
    'ADMIN_SUPPORT',
    'INTERNATIONAL_DEVELOPMENT',
  ],
  CUSTOMER_SERVICE: [
    'SALES_BUSINESS_DEV',
    'ADMIN_SUPPORT',
  ],
}

// Transferable is intentionally weaker than adjacent: a plausible bridge
// survives ranking, but cannot get the confidence/score of a same-family role.
const CAREER_TRANSFERABILITY: Partial<Record<CareerFamilyKey, CareerFamilyKey[]>> = {
  SOFTWARE_ENGINEERING: ['ENGINEERING_TECHNICAL', 'PROJECT_PROGRAM_MANAGEMENT'],
  ENGINEERING_TECHNICAL: ['SOFTWARE_ENGINEERING', 'OPERATIONS'],
  FINANCE_ACCOUNTING: ['DATA_ANALYTICS', 'OPERATIONS'],
  DATA_ANALYTICS: ['FINANCE_ACCOUNTING', 'OPERATIONS'],
  OPERATIONS: ['ADMIN_SUPPORT', 'PROJECT_PROGRAM_MANAGEMENT', 'FINANCE_ACCOUNTING'],
  ADMIN_SUPPORT: ['OPERATIONS', 'HR_PEOPLE', 'LEGAL'],
  HR_PEOPLE: ['ADMIN_SUPPORT', 'OPERATIONS'],
  LEGAL: ['ADMIN_SUPPORT'],
  EDUCATION_ACADEMIC: ['ADMIN_SUPPORT', 'PROJECT_PROGRAM_MANAGEMENT'],
  CUSTOMER_SERVICE: ['SALES_BUSINESS_DEV', 'ADMIN_SUPPORT'],
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

  const cTransfer = CAREER_TRANSFERABILITY[cFam] ?? []
  const vTransfer = CAREER_TRANSFERABILITY[vFam] ?? []
  if (cTransfer.includes(vFam) || vTransfer.includes(cFam)) return 'TRANSFERABLE'

  // Two well-evidenced, non-adjacent professions are a professional conflict.
  // This is deliberately general rather than a blacklist of occupation pairs.
  if (candidateFam.confidence === 'HIGH' && vacancyFam.confidence === 'HIGH') {
    return 'CONFLICT'
  }

  // Low-confidence conflict → UNKNOWN (don't penalize uncertainty)
  return 'UNKNOWN'
}

function calibrationFor(similarities?: Map<string, number>, mode: 'raw' | 'quantile' | 'none' = 'quantile'): Map<string, number> {
  const calibrated = new Map<string, number>()
  if (!similarities?.size || mode === 'none') return calibrated
  const values = [...similarities.values()].filter(Number.isFinite).sort((a, b) => b - a)
  if (!values.length) return calibrated
  for (const [id, value] of similarities) {
    if (!Number.isFinite(value)) continue
    if (mode === 'raw') {
      calibrated.set(id, Math.round(value * 100))
      continue
    }
    // Quantile rank is retrieval evidence, not probability and avoids fragile
    // min/max stretching when cosine values are compressed.
    const rank = values.findIndex((candidate) => candidate <= value) + 1
    const percentile = 1 - ((rank - 1) / Math.max(1, values.length - 1))
    calibrated.set(id, percentile >= .90 ? 80 : percentile >= .70 ? 70 : percentile >= .40 ? 60 : 50)
  }
  return calibrated
}

// ─── V2 Config ────────────────────────────────────────────────────────────────

export interface V2Config {
  fixTitleFloor: boolean          // V2-A: titleScore 25→0 for zero-overlap
  fixSkillsUnknown: boolean       // V2-B: skillsScore 45→UNKNOWN when no vacancy skills
  fixSeniorityUnknown: boolean    // V2-C: seniority default rank2→UNKNOWN
  removeScoreFloor: boolean       // V2-D: remove max(20,...) floor
  addProfessionalCompat: boolean  // V2-E: apply career family compatibility multiplier
  dynamicWeights: boolean         // V2-F: redistribute weights for UNKNOWN signals
  semanticMode?: 'raw' | 'quantile' | 'none'
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
  vacancySkills: string[]
  matchedSkills: string[]
  missingSkills: string[]
  visible: boolean
}

/**
 * Canonical candidate-to-opportunity decision.  Row/source routing has
 * already decided whether an opportunity may enter this boundary; this object
 * decides whether it fits one particular candidate.  Keep unknown evidence
 * visible instead of converting it into a positive score.
 */
/** A numeric score alone never makes a result visible to a B2C consumer. */
export function isVisibleMatchDecision(decision: Pick<MatchDecision, 'outcome'> | null | undefined): boolean {
  return decision?.outcome === 'MATCH'
}

/** Delivery is intentionally stricter than ordinary B2C match visibility. */
export function isHighMatchAlertDecision(
  decision: Pick<MatchDecision, 'outcome' | 'confidence' | 'eligibility'> | null | undefined,
): boolean {
  return isVisibleMatchDecision(decision)
    && decision?.confidence === 'HIGH'
    && decision.eligibility === 'ELIGIBLE'
}

type PreliminaryDecision = Omit<MatchDecision, 'confidence' | 'score' | 'matched_skills' | 'missing_skills'> & {
  candidateFamily: FamilyDetection
  vacancyFamily: FamilyDetection
}

function declaredEligibilityState(opp: any, profileLocation: string): EligibilityState {
  const declared = toStrings(opp.eligible_countries).concat(toStrings(opp.eligible_regions))
  if (!isEligibleForProfile(opp, profileLocation)) return 'INELIGIBLE'
  return declared.length ? 'ELIGIBLE' : 'UNKNOWN'
}

function normalizedArrangement(value: unknown): 'REMOTE' | 'HYBRID' | 'ONSITE' | '' {
  const text = normalize(String(value ?? ''))
  if (/\b(remote|remoto)\b/.test(text)) return 'REMOTE'
  if (/\b(hybrid|hibrido)\b/.test(text)) return 'HYBRID'
  if (/\b(onsite|presencial|on site)\b/.test(text)) return 'ONSITE'
  return ''
}

/** Work arrangement is a preference/constraint, never proof of eligibility. */
function workArrangementFor(profile: any, opp: any): WorkArrangementState {
  const candidate = normalizedArrangement(profile.profile_data?.modality)
  const opportunity = normalizedArrangement(opp.work_arrangement ?? opp.type ?? opp.location)
  if (!candidate || !opportunity) return 'UNKNOWN'
  if (candidate === opportunity || candidate === 'HYBRID' || opportunity === 'HYBRID') return 'COMPATIBLE'
  return 'INCOMPATIBLE'
}

/**
 * Current production schema does not provide a structured requirements field.
 * When a caller does provide an explicit `hard_requirements` list, compare it
 * deterministically against confirmed/known candidate skills.  Absent data is
 * intentionally UNKNOWN, never silently PASS.
 */
function hardRequirementsFor(profileSkills: string[], opp: any, dictionary: any): HardRequirementsState {
  const required = toStrings(opp.hard_requirements)
  if (!required.length) return 'UNKNOWN'
  return required.every((need) => profileSkills.some((skill) => sameSkill(skill, need, dictionary))) ? 'PASS' : 'FAIL'
}

/** Explicit Candidate Truth UNKNOWN is not silently promoted into fit evidence. */
function candidateTruthForMatching(profile: any): any {
  const evidence = profile.profile_data?.candidate_truth?.evidence ?? {}
  const usable = (field: string) => evidence[field] !== 'UNKNOWN'
  return {
    ...profile,
    professional_title: usable('professional_title') ? profile.professional_title : '',
    summary: usable('summary') ? profile.summary : '',
    profile_data: {
      ...(profile.profile_data ?? {}),
      habilidades: usable('skills') ? profile.profile_data?.habilidades : [],
      education: usable('education') ? profile.profile_data?.education : [],
      experience: usable('experience') ? profile.profile_data?.experience : [],
      languages: usable('languages') ? profile.profile_data?.languages : [],
      location: usable('location') ? profile.profile_data?.location : '',
      seniority: usable('seniority') ? profile.profile_data?.seniority : '',
      career_route: usable('career_route') ? profile.profile_data?.career_route : '',
    },
  }
}

function preliminaryDecision(profile: any, opp: any, dictionary: any, now: string): PreliminaryDecision {
  const profileSkills = toStrings(profile.profile_data?.habilidades)
  const candidateEvidence = [profile.summary, profile.cv_text, profile.profile_data?.education, profile.profile_data?.experience, profile.profile_data?.languages]
    .flatMap((value: any) => Array.isArray(value) ? value.map((item) => typeof item === 'string' ? item : Object.values(item || {}).join(' ')) : [value])
    .filter(Boolean).join(' ')
  const candidateFamily = detectCareerFamily(`${profile.professional_title ?? ''} ${candidateEvidence}`, profileSkills, undefined)
  const vacancySkills = extractSkills(opp, dictionary)
  const vacancyFamily = detectCareerFamily(opp.title ?? '', vacancySkills, opp.rubro ?? '')
  const applicable = getProfessionalCompatibility(candidateFamily, vacancyFamily)
  const eligibility = declaredEligibilityState(opp, String(profile.profile_data?.location ?? ''))
  const workArrangement = workArrangementFor(profile, opp)
  const hardRequirements = hardRequirementsFor(profileSkills, opp, dictionary)
  const professionalEvidence: ProfessionalEvidenceState = hasProfessionalEvidence(opp) ? 'SUFFICIENT' : 'INSUFFICIENT'
  const hard_denials: string[] = []
  const negative_reasons: string[] = []
  const unknown_reasons: string[] = []

  // The caller may annotate its source-policy boundary.  Undefined means the
  // opportunity was already admitted by that boundary; explicit UNKNOWN never
  // receives a fit decision.
  if (opp.source_match_state === 'DISABLED') hard_denials.push('SOURCE_DISABLED')
  if (opp.source_match_state === 'UNKNOWN') hard_denials.push('SOURCE_POLICY_UNKNOWN')
  if (opp.is_active !== true || opp.verification_status !== 'verified' || opp.deleted_at != null || opp.archived_at != null || (opp.deadline != null && opp.deadline <= now)) hard_denials.push('ROW_LIFECYCLE_NOT_ROUTABLE')
  if (opp.match_eligible !== true) hard_denials.push('ROW_MATCH_NOT_ELIGIBLE')
  if (isTender(opp)) hard_denials.push('NOT_APPLICABLE_TENDER')
  if (applicable === 'CONFLICT') hard_denials.push(`PROFESSIONAL_CONFLICT:${candidateFamily.family}->${vacancyFamily.family}`)
  if (eligibility === 'INELIGIBLE') hard_denials.push('CANDIDATE_INELIGIBLE')
  if (hardRequirements === 'FAIL') hard_denials.push('HARD_REQUIREMENTS_FAILED')
  if (workArrangement === 'INCOMPATIBLE') hard_denials.push('WORK_ARRANGEMENT_INCOMPATIBLE')

  if (professionalEvidence === 'INSUFFICIENT') unknown_reasons.push('INSUFFICIENT_PROFESSIONAL_EVIDENCE')
  if (applicable === 'UNKNOWN') unknown_reasons.push('PROFESSIONAL_APPLICABILITY_UNKNOWN')
  if (eligibility === 'UNKNOWN') unknown_reasons.push('CANDIDATE_ELIGIBILITY_UNKNOWN')
  if (workArrangement === 'UNKNOWN') unknown_reasons.push('WORK_ARRANGEMENT_UNKNOWN')
  if (hardRequirements === 'UNKNOWN') unknown_reasons.push('HARD_REQUIREMENTS_UNKNOWN')

  const outcome: MatchOutcome = hard_denials.length ? 'DENY'
    : professionalEvidence === 'INSUFFICIENT' || applicable === 'UNKNOWN' || eligibility === 'UNKNOWN'
      ? 'ABSTAIN'
      : 'MATCH'
  if (outcome === 'ABSTAIN') negative_reasons.push('INSUFFICIENT_EVIDENCE_FOR_RELIABLE_MATCH')
  return {
    applicable, eligibility, work_arrangement: workArrangement, hard_requirements: hardRequirements,
    professional_evidence: professionalEvidence, outcome, score: null,
    positive_reasons: [], negative_reasons, unknown_reasons, hard_denials,
    candidateFamily, vacancyFamily,
  }
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
    case 'TRANSFERABLE':
      return 0.86
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
  decision: MatchDecision
}

export function rankOpportunitiesV2(
  profile: any,
  opportunities: any[],
  dictionary: any,
  cfg: V2Config,
  semanticSimilarities?: Map<string, number>,
  now = new Date().toISOString(),
): { eligible: any[]; rankedOld: any[]; rankedV2: V2RankResult[]; decisions: Array<{ opp: any; decision: MatchDecision }> } {
  const candidate = candidateTruthForMatching(profile)
  const profileSkills = toStrings(candidate.profile_data.habilidades)
  const profileSeniority = String(candidate.profile_data.seniority ?? '')
  const profileLocation = String(candidate.profile_data.location ?? '')
  const careerRoute = String(candidate.profile_data.career_route ?? '')
  const profileTitle = String(candidate.professional_title ?? '')

  // LAYER 1: Hard eligibility (unchanged — non-bypassable)
  const legacyEligible = opportunities.filter(opp =>
    opp.is_active !== false &&
    opp.verification_status === 'verified' &&
    opp.match_eligible !== false &&          // ← NON-BYPASSABLE
    hasProfessionalEvidence(opp) &&          // row readiness: thin cards never reach ranking
    opp.deleted_at == null &&
    opp.archived_at == null &&
    (opp.deadline == null || opp.deadline > now) &&
    !isTender(opp) &&                        // ← NON-BYPASSABLE
    isEligibleForProfile(opp, profileLocation), // ← NON-BYPASSABLE
  )

  const preliminary = opportunities.map((opp) => ({ opp, decision: preliminaryDecision(candidate, opp, dictionary, now) }))
  const eligible = preliminary.filter(({ decision }) => decision.outcome === 'MATCH').map(({ opp }) => opp)
  void legacyEligible // retained only as a compatibility diagnostic while V2.1 uses MatchDecision.
  const hasEmbedding = semanticSimilarities != null && semanticSimilarities.size > 0

  // Detect candidate family once
  const candidateEvidence = [candidate.summary, candidate.cv_text, candidate.profile_data?.education, candidate.profile_data?.experience, candidate.profile_data?.languages]
    .flatMap((value: any) => Array.isArray(value) ? value.map((item) => typeof item === 'string' ? item : Object.values(item || {}).join(' ')) : [value])
    .filter(Boolean).join(' ')
  const candidateFamily = detectCareerFamily(`${profileTitle} ${candidateEvidence}`, profileSkills, undefined)
  const calibratedSemantics = calibrationFor(semanticSimilarities, cfg.semanticMode ?? 'quantile')

  const results: V2RankResult[] = eligible.map(opp => {
    const vacancySkills = extractSkills(opp, dictionary)
    const matchedSkills = vacancySkills.filter((skill) => profileSkills.some((own) => sameSkill(own, skill, dictionary)))
    const missingSkills = vacancySkills.filter((skill) => !profileSkills.some((own) => sameSkill(own, skill, dictionary)))
    const locationScore = calculateLocationScore(profileLocation, opp.location ?? '')
    const cBonus = careerBonus(careerRoute, opp)
    const pre = preliminary.find((item) => item.opp === opp)!.decision

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

    const semanticScoreNum = calibratedSemantics.get(String(opp.id)) ?? null

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
    const legacyEligibilitySignal: MatchEvidence['eligibilitySignal'] =
      (opp.eligible_countries?.length > 0 || opp.eligible_regions?.length > 0)
        ? 'ELIGIBLE'  // passed isEligibleForProfile, has declared countries
        : 'UNKNOWN'  // no declared countries — passed but unknown

    const eligibilitySignal: MatchEvidence['eligibilitySignal'] = pre.eligibility
    void legacyEligibilitySignal

    // Career family detection for vacancy
    const legacyVacancyFamily = detectCareerFamily(
      opp.title ?? '',
      vacancySkills,
      opp.rubro ?? '',
    )
    const legacyCompat = getProfessionalCompatibility(candidateFamily, legacyVacancyFamily)
    const vacancyFamily = pre.vacancyFamily
    const compat = pre.applicable
    void legacyCompat
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
    const outcome: MatchOutcome = confidence === 'LOW' || v2FinalScore < 45 ? 'ABSTAIN' : 'MATCH'
    const visible = outcome === 'MATCH'

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
    if (compat === 'TRANSFERABLE') unknownSignals.push(`career_transferable:${candidateFamily.family}↔${vacancyFamily.family}`)
    if (evidence.eligibilitySignal === 'UNKNOWN') unknownSignals.push('eligibility_unknown')

    const decision: MatchDecision = {
      applicable: pre.applicable,
      eligibility: pre.eligibility,
      work_arrangement: pre.work_arrangement,
      hard_requirements: pre.hard_requirements,
      professional_evidence: pre.professional_evidence,
      confidence,
      outcome,
      score: v2FinalScore,
      positive_reasons: positiveReasons,
      negative_reasons: [...pre.negative_reasons, ...negativeReasons],
      unknown_reasons: [...pre.unknown_reasons, ...unknownSignals],
      hard_denials: pre.hard_denials,
      matched_skills: matchedSkills,
      missing_skills: missingSkills,
    }

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
      vacancySkills,
      matchedSkills,
      missingSkills,
      visible,
    }

    return {
      opp,
      oldScore: oldFinalScore,
      v2Score: v2FinalScore,
      delta: v2FinalScore - oldFinalScore,
      breakdown,
      decision,
    }
  })

  const rankedV2 = results.filter((result) => result.breakdown.visible).sort((a, b) => b.v2Score - a.v2Score).slice(0, 20)

  // Also compute OLD ranked for comparison
  const rankedOld = [...results]
    .sort((a, b) => b.oldScore - a.oldScore)
    .slice(0, 20)
    .map(r => ({ ...r.opp, finalScore: r.oldScore }))

  const scored = new Map(results.map((result) => [result.opp, result.decision]))
  const decisions = preliminary.map(({ opp, decision }) => ({
    opp,
    decision: scored.get(opp) ?? {
      applicable: decision.applicable,
      eligibility: decision.eligibility,
      work_arrangement: decision.work_arrangement,
      hard_requirements: decision.hard_requirements,
      professional_evidence: decision.professional_evidence,
      confidence: 'LOW' as const,
      outcome: decision.outcome,
      score: null,
      positive_reasons: decision.positive_reasons,
      negative_reasons: decision.negative_reasons,
      unknown_reasons: decision.unknown_reasons,
      hard_denials: decision.hard_denials,
      matched_skills: [],
      missing_skills: [],
    },
  }))
  return { eligible, rankedOld, rankedV2, decisions }
}

// ─── EXPORTS re-used by harness ───────────────────────────────────────────────

export { SENIORITY_RANK, tokenSet }
