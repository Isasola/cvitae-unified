/**
 * Opportunity Classification Engine.
 *
 * Deterministic, rule-based quality gate for every opportunity record.
 * Designed to be reusable by: scraper ingestion, manual approval, Admin,
 * backfill scripts, and post-publish QA.
 *
 * Rules: block conditions override everything. Review conditions prevent
 * AUTO_APPROVE but still allow the record to be published manually.
 * AUTO_APPROVE requires all required fields + no blocking/review issues.
 *
 * Never infers or fabricates: organization, salary, deadline, or description.
 */

export type PublicationDecision = 'AUTO_APPROVE' | 'REVIEW' | 'BLOCK'
export type SeoDecision = 'ELIGIBLE' | 'REVIEW' | 'EXCLUDE'
export type JobPostingDecision = 'EMIT' | 'SKIP'

export interface ClassificationReason {
  code: string
  message: string
  evidence?: string
  severity: 'block' | 'review' | 'info'
}

export interface ClassificationResult {
  publicationDecision: PublicationDecision
  seoDecision: SeoDecision
  jobPostingDecision: JobPostingDecision
  reasons: ClassificationReason[]
  safeAutoActions: string[]
}

/** Minimal input type — compatible with RawOpportunity + content_hub records */
export interface ClassifyInput {
  id?: string
  slug?: string | null
  title?: string | null
  description?: string | null
  organization?: string | null
  location?: string | null
  city?: string | null
  type?: string | null
  opportunity_type?: string | null
  opportunity_kind?: string | null
  application_url?: string | null
  deadline?: string | null
  source?: string | null
  is_active?: boolean
  verification_status?: string | null
  deleted_at?: string | null
  archived_at?: string | null
  created_at?: string | null
}

// Sources with known consistent data quality (still require field checks)
const TRUSTED_SOURCES = new Set([
  'computrabajo', 'arbeitnow', 'eu_delegation_paraguay', 'mic_portal_emprendedor',
  'oas_scholarships', 'one_young_world_scholarships', 'coimbra_group',
  'santander_open_academy', 'erasmus_mundus',
])

// Sources known to produce low-quality records
const WEAK_SOURCES = new Set(['clasipar', 'ucom_job_board'])

const JOB_TYPES = new Set(['job', 'internship', 'consultancy'])
const SCHOLARSHIP_TYPES = new Set(['scholarship', 'fellowship', 'grant', 'research_funding'])

function cleanStr(s: string | null | undefined): string {
  if (!s) return ''
  return s.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

function isValidUrl(url: string | null | undefined): boolean {
  if (!url) return false
  try {
    const u = new URL(url.trim())
    return u.protocol === 'https:' || u.protocol === 'http:'
  } catch { return false }
}

function isExpired(deadline: string | null | undefined): boolean {
  if (!deadline) return false
  try {
    return new Date(deadline) < new Date()
  } catch { return false }
}

function isGarbageDescription(desc: string): boolean {
  if (desc.length < 10) return true
  // Detect "title repeated + Más información" pattern
  const words = desc.split(/\s+/).filter(Boolean)
  const uniqueWords = new Set(words.map(w => w.toLowerCase()))
  // If fewer than 40% of words are unique — very repetitive content
  if (words.length > 6 && uniqueWords.size / words.length < 0.4) return true
  // Only HTML entities or markup
  if (/^(&[a-z]+;|\s)+$/.test(desc)) return true
  return false
}

export function classifyOpportunity(input: ClassifyInput): ClassificationResult {
  const reasons: ClassificationReason[] = []
  const safeAutoActions: string[] = []

  const title = cleanStr(input.title)
  const description = cleanStr(input.description)
  const organization = cleanStr(input.organization)
  const applicationUrl = input.application_url?.trim() || null
  const slug = input.slug?.trim() || null
  const source = input.source || null
  const oppType = input.opportunity_type || ''
  const oppKind = input.opportunity_kind || ''
  const isJob = JOB_TYPES.has(oppType) || oppKind === 'empleo'
  const isScholarship = SCHOLARSHIP_TYPES.has(oppType)

  // ── BLOCK conditions ────────────────────────────────────────────────────────

  if (input.deleted_at) {
    reasons.push({ code: 'DELETED', message: 'Registro eliminado', severity: 'block' })
  }
  if (input.archived_at) {
    reasons.push({ code: 'ARCHIVED', message: 'Registro archivado', severity: 'block' })
  }
  if (!title || title.length < 3) {
    reasons.push({ code: 'NO_TITLE', message: 'Título ausente o muy corto (< 3 chars)', severity: 'block' })
  }
  if (!slug) {
    reasons.push({ code: 'NO_SLUG', message: 'Sin slug — URL canónica no generable', severity: 'block' })
  }
  if (applicationUrl && !isValidUrl(applicationUrl)) {
    reasons.push({ code: 'INVALID_URL', message: 'URL de postulación inválida', evidence: applicationUrl, severity: 'block' })
  }
  if (isExpired(input.deadline)) {
    reasons.push({ code: 'EXPIRED', message: 'Deadline vencido', evidence: input.deadline!, severity: 'block' })
  }
  if (description && isGarbageDescription(description)) {
    reasons.push({ code: 'GARBAGE_DESC', message: 'Descripción identificada como contenido basura (repetitivo o markup)', evidence: description.substring(0, 80), severity: 'block' })
  }
  if (WEAK_SOURCES.has(source || '') && !description) {
    reasons.push({ code: 'WEAK_SOURCE_NO_DESC', message: `Fuente débil (${source}) sin descripción`, severity: 'block' })
  }

  const hasBlock = reasons.some(r => r.severity === 'block')
  if (hasBlock) {
    return {
      publicationDecision: 'BLOCK',
      seoDecision: 'EXCLUDE',
      jobPostingDecision: 'SKIP',
      reasons,
      safeAutoActions: [],
    }
  }

  // ── REVIEW conditions ───────────────────────────────────────────────────────

  if (!description || description.length < 100) {
    reasons.push({
      code: 'SHORT_DESC',
      message: `Descripción ${description ? `muy corta (${description.length} chars, mínimo 100)` : 'ausente'}`,
      severity: 'review',
    })
  }
  if (!organization) {
    reasons.push({ code: 'NO_ORG', message: 'Sin organización / empresa', severity: 'review' })
  }
  if (!applicationUrl) {
    reasons.push({ code: 'NO_URL', message: 'Sin URL de postulación', severity: 'review' })
  }
  if (isJob && !input.type) {
    reasons.push({ code: 'NO_EMPLOYMENT_TYPE', message: 'Sin tipo de empleo (FULL_TIME, PART_TIME, etc.)', severity: 'review' })
  }
  if (!input.city && !input.location) {
    reasons.push({ code: 'NO_LOCATION', message: 'Sin ciudad o ubicación', severity: 'review' })
  }
  if (WEAK_SOURCES.has(source || '')) {
    reasons.push({ code: 'WEAK_SOURCE', message: `Fuente de baja calidad histórica: ${source}`, severity: 'review' })
  }
  if (!source) {
    reasons.push({ code: 'NO_SOURCE', message: 'Sin fuente registrada', severity: 'review' })
  }

  const hasReview = reasons.some(r => r.severity === 'review')

  // ── Safe auto actions (normalizations that are deterministic) ────────────────
  if (input.type === '') safeAutoActions.push('normalize_type_to_null')

  // ── SEO and JobPosting decisions ─────────────────────────────────────────────
  const canBeEligible = !hasBlock && !hasReview
  const canEmitJobPosting = isJob && !isScholarship
    && (description?.length || 0) >= 100
    && !!organization
    && !!(input.city || input.location)

  const seoDecision: SeoDecision = canBeEligible ? 'ELIGIBLE' : hasBlock ? 'EXCLUDE' : 'REVIEW'
  const jobPostingDecision: JobPostingDecision = canEmitJobPosting ? 'EMIT' : 'SKIP'

  // ── Publication decision ─────────────────────────────────────────────────────
  const isTrustedSource = TRUSTED_SOURCES.has(source || '')
  const publicationDecision: PublicationDecision = hasReview
    ? 'REVIEW'
    : (isTrustedSource && canBeEligible) ? 'AUTO_APPROVE' : 'REVIEW'

  if (!hasReview) {
    reasons.push({ code: 'ALL_REQUIRED_FIELDS', message: 'Todos los campos requeridos presentes', severity: 'info' })
  }

  return {
    publicationDecision,
    seoDecision,
    jobPostingDecision,
    reasons,
    safeAutoActions,
  }
}

/**
 * Returns a human-readable summary for the Admin UI "WHY" column.
 * Shows only the most relevant 2-3 reasons.
 */
export function classificationSummary(result: ClassificationResult): string {
  const actionable = result.reasons.filter(r => r.severity !== 'info')
  if (actionable.length === 0) return 'Todos los campos OK'
  return actionable
    .slice(0, 3)
    .map(r => r.message)
    .join(' · ')
}
