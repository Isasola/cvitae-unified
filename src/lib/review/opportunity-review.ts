import { classifyOpportunity, type ClassifyInput } from '../seo/classify'

export const REVIEW_BOT_VERSION = 'review-bot-v1'
export const REVIEW_RULES_VERSION = '2026-08-20.1'

export type ReviewRecommendation = 'approve' | 'review' | 'do_not_publish'
export type ReviewConfidence = 'high' | 'medium' | 'low'

export interface ReviewEvidence {
  check: string
  value: string
  source: 'record' | 'http' | 'html' | 'policy' | 'duplicate'
}

export interface ReviewIssue {
  code: string
  message: string
  severity: 'hard_block' | 'review' | 'info'
}

export interface ReviewFlag {
  recommended: boolean
  reason: string
}

export interface PageObservation {
  requestedUrl: string
  finalUrl: string
  redirects: string[]
  status: number
  canonical: string | null
  title: string | null
  organization: string | null
  hasStructuredData: boolean
  closedSignal: string | null
  pageKind: 'opportunity' | 'aggregator' | 'login' | 'error' | 'unknown'
}

export interface DuplicateSignal {
  id: string
  kind: 'exact_url' | 'normalized_url' | 'canonical' | 'source_id' | 'title_organization' | 'possible_duplicate'
  similarity?: number
}

export interface OpportunityReviewInput extends ClassifyInput {
  country_code?: string | null
  remote_scope?: string | null
  geo_confidence?: string | null
  geo_evidence?: unknown
  eligible_countries?: string[] | null
  eligible_regions?: string[] | null
  onsite_country?: string | null
  source_authority?: string | null
  original_source_url?: string | null
  original_source_verified?: boolean | null
}

export interface OpportunityReviewResult {
  recommendation: ReviewRecommendation
  confidence: ReviewConfidence
  evidence: ReviewEvidence[]
  issues: ReviewIssue[]
  missingFields: string[]
  flags: {
    catalog: ReviewFlag
    matching: ReviewFlag
    alerts: ReviewFlag
    seo: ReviewFlag
  }
  deterministic: {
    hardBlocks: string[]
    needsAi: boolean
    httpStatus: number | null
    finalUrl: string | null
    redirects: number
    duplicates: DuplicateSignal[]
  }
  ai: {
    used: boolean
    provider: null | 'gemini' | 'bedrock'
    reason: string | null
    cached: boolean
  }
  rulesVersion: string
  reviewBotVersion: string
  reviewedAt: string
}

const CLOSED_RECORD_RE = /(convocatoria|vacante|position|application).{0,35}(cerrad|closed|ended|conclu)/i
const PRIVATE_IPV4_RE = /^(127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/

export function normalizeReviewUrl(raw: string | null | undefined): string | null {
  if (!raw) return null
  try {
    const url = new URL(raw.trim())
    if (!['http:', 'https:'].includes(url.protocol)) return null
    url.hash = ''
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|fbclid$|gclid$)/i.test(key)) url.searchParams.delete(key)
    }
    if (url.pathname !== '/') url.pathname = url.pathname.replace(/\/+$/, '')
    return url.toString()
  } catch {
    return null
  }
}

export function isUnsafeReviewUrl(raw: string | null | undefined): boolean {
  const normalized = normalizeReviewUrl(raw)
  if (!normalized) return true
  const host = new URL(normalized).hostname.toLowerCase()
  return host === 'localhost' || host === '::1' || host.endsWith('.local') || PRIVATE_IPV4_RE.test(host)
}

function nonEmpty(value: unknown): boolean {
  return typeof value === 'string' ? value.trim().length > 0 : value != null
}

function explicitGeo(input: OpportunityReviewInput): boolean {
  if (input.geo_confidence === 'unknown') return false
  return Boolean(
    input.country_code || input.onsite_country ||
    input.eligible_countries?.length || input.eligible_regions?.length ||
    ['WORLDWIDE', 'LATAM', 'REGIONAL', 'COUNTRY_SPECIFIC'].includes(String(input.remote_scope || '').toUpperCase()),
  )
}

export function reviewOpportunityDeterministic(
  input: OpportunityReviewInput,
  page: PageObservation | null = null,
  duplicates: DuplicateSignal[] = [],
  now = new Date(),
): OpportunityReviewResult {
  const evidence: ReviewEvidence[] = []
  const issues: ReviewIssue[] = []
  const missingFields: string[] = []
  const hardBlocks: string[] = []
  const addIssue = (code: string, message: string, severity: ReviewIssue['severity']) => {
    issues.push({ code, message, severity })
    if (severity === 'hard_block') hardBlocks.push(code)
  }

  const normalizedUrl = normalizeReviewUrl(input.application_url)
  if (!normalizedUrl || isUnsafeReviewUrl(input.application_url)) addIssue('UNSAFE_OR_INVALID_URL', 'URL inválida o no segura', 'hard_block')
  else evidence.push({ check: 'application_url', value: normalizedUrl, source: 'record' })

  for (const field of ['title', 'organization', 'application_url', 'opportunity_type'] as const) {
    if (!nonEmpty(input[field])) missingFields.push(field)
  }
  if (!input.title || input.title.trim().length < 3) addIssue('MISSING_TITLE', 'Título ausente o demasiado corto', 'hard_block')
  if (!input.organization) addIssue('MISSING_ORGANIZATION', 'Organización ausente', 'review')
  if (!input.opportunity_type) addIssue('MISSING_TYPE', 'Tipo de oportunidad ausente', 'review')

  if (input.deadline) {
    const deadline = new Date(input.deadline)
    if (Number.isNaN(deadline.getTime())) addIssue('INVALID_DEADLINE', 'Fecha de cierre no interpretable', 'review')
    else if (deadline.getTime() < now.getTime()) addIssue('EXPIRED', 'Oportunidad vencida explícitamente', 'hard_block')
    else evidence.push({ check: 'deadline', value: input.deadline, source: 'record' })
  } else {
    missingFields.push('deadline')
    addIssue('MISSING_DEADLINE', 'No hay fecha explícita para confirmar vigencia', 'review')
  }

  const recordText = `${input.title || ''} ${input.description || ''}`
  if (CLOSED_RECORD_RE.test(recordText)) addIssue('CLOSED_RECORD_SIGNAL', 'El registro contiene una señal explícita de cierre', 'hard_block')

  const authority = input.source_authority || 'unknown'
  evidence.push({ check: 'source_authority', value: authority, source: 'policy' })
  if (authority !== 'original' && !input.original_source_verified) {
    addIssue('AGGREGATOR_WITHOUT_ORIGIN', 'Agregador o discovery sin origen verificable', 'hard_block')
  }

  if (!explicitGeo(input)) {
    missingFields.push('geo_evidence')
    addIssue('GEO_UNKNOWN', 'Geo/elegibilidad sin evidencia explícita', 'review')
  } else {
    evidence.push({ check: 'geo', value: input.country_code || input.remote_scope || input.eligible_regions?.join(', ') || 'explicit', source: 'record' })
  }

  if (duplicates.length) {
    for (const duplicate of duplicates) {
      const confirmed = duplicate.kind !== 'possible_duplicate'
      addIssue(
        confirmed ? 'DUPLICATE_CONFIRMED' : 'POSSIBLE_DUPLICATE',
        `${confirmed ? 'Duplicado confirmado' : 'Posible duplicado'}: ${duplicate.id} (${duplicate.kind})`,
        confirmed ? 'hard_block' : 'review',
      )
    }
  }

  if (page) {
    evidence.push({ check: 'http_status', value: String(page.status), source: 'http' })
    evidence.push({ check: 'final_url', value: page.finalUrl, source: 'http' })
    if (page.redirects.length) addIssue('REDIRECTED', `${page.redirects.length} redirección(es); revisar destino final`, 'review')
    if ([404, 410].includes(page.status)) addIssue(`HTTP_${page.status}`, `La página respondió ${page.status}`, 'hard_block')
    else if (page.status === 401 || page.status === 403 || page.status === 429) addIssue('HTTP_BLOCKED', `La auditoría recibió HTTP ${page.status}`, 'review')
    else if (page.status >= 400) addIssue('HTTP_ERROR', `La página respondió HTTP ${page.status}`, 'review')
    if (page.canonical) evidence.push({ check: 'canonical', value: page.canonical, source: 'html' })
    if (page.closedSignal) addIssue('PAGE_CLOSED', `La página indica cierre: ${page.closedSignal}`, 'hard_block')
    if (page.pageKind === 'login' || page.pageKind === 'error') addIssue('NOT_OPPORTUNITY_PAGE', `El destino es una página de ${page.pageKind}`, 'hard_block')
    if (page.pageKind === 'aggregator' && !input.original_source_verified) addIssue('AGGREGATOR_PAGE', 'La página observada sigue siendo un agregador', 'hard_block')
    if (page.title && input.title && !page.title.toLowerCase().includes(input.title.toLowerCase().slice(0, 24))) {
      addIssue('TITLE_CONTRADICTION', 'El título guardado no coincide claramente con la página', 'review')
    }
    evidence.push({ check: 'structured_data', value: page.hasStructuredData ? 'present' : 'absent', source: 'html' })
  } else if (normalizedUrl) {
    addIssue('URL_NOT_CHECKED', 'La URL todavía no fue comprobada por HTTP', 'review')
  }

  const classification = classifyOpportunity(input)
  for (const reason of classification.reasons.filter(reason => reason.severity !== 'info')) {
    if (!issues.some(issue => issue.code === reason.code)) {
      addIssue(`SEO_${reason.code}`, reason.message, reason.severity === 'block' ? 'hard_block' : 'review')
    }
  }

  const reviewIssues = issues.filter(issue => issue.severity === 'review')
  const recommendation: ReviewRecommendation = hardBlocks.length
    ? 'do_not_publish'
    : reviewIssues.length
      ? 'review'
      : 'approve'
  const verifiedHttp = page && page.status >= 200 && page.status < 400 && page.pageKind === 'opportunity'
  const confidence: ReviewConfidence = recommendation === 'approve' && verifiedHttp && evidence.length >= 6
    ? 'high'
    : evidence.length >= 4 && hardBlocks.length === 0
      ? 'medium'
      : 'low'
  const needsAi = hardBlocks.length === 0 && reviewIssues.some(issue =>
    ['TITLE_CONTRADICTION', 'MISSING_ORGANIZATION', 'MISSING_TYPE', 'GEO_UNKNOWN', 'NOT_OPPORTUNITY_PAGE'].includes(issue.code),
  )

  const catalog = recommendation === 'approve'
  const matching = catalog && explicitGeo(input) && Boolean(input.opportunity_type)
  const alerts = matching && Boolean(input.deadline)
  const seo = catalog && classification.seoDecision === 'ELIGIBLE' && Boolean(page?.canonical || page?.hasStructuredData)

  return {
    recommendation,
    confidence,
    evidence,
    issues,
    missingFields: [...new Set(missingFields)],
    flags: {
      catalog: { recommended: catalog, reason: catalog ? 'Registro vigente y comprobado' : 'Requiere resolver bloqueos/revisión' },
      matching: { recommended: matching, reason: matching ? 'Tipo y geo explícitos' : 'Geo o tipo insuficiente' },
      alerts: { recommended: alerts, reason: alerts ? 'Matching seguro y fecha explícita' : 'Vigencia/eligibilidad insuficiente' },
      seo: { recommended: seo, reason: seo ? 'Calidad y señales SEO suficientes' : 'SEO requiere evidencia más estricta' },
    },
    deterministic: {
      hardBlocks,
      needsAi,
      httpStatus: page?.status ?? null,
      finalUrl: page?.finalUrl ?? null,
      redirects: page?.redirects.length ?? 0,
      duplicates,
    },
    ai: { used: false, provider: null, reason: needsAi ? 'Ambigüedad no resuelta por reglas' : null, cached: false },
    rulesVersion: REVIEW_RULES_VERSION,
    reviewBotVersion: REVIEW_BOT_VERSION,
    reviewedAt: now.toISOString(),
  }
}
