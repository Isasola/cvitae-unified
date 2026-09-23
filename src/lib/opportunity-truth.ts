/** Pure boundary: known source permission is required and never promotes rows. */
export type FieldState = 'EXTRACTED' | 'INFERRED' | 'UNKNOWN' | 'FAILED'
export type Readiness = 'CATALOG_READY' | 'MATCHING_READY' | 'SEO_READY' | 'JOBPOSTING_READY'
export type ReadinessState = 'READY' | 'NOT_READY' | 'UNKNOWN'
export interface ReadinessResult { state: ReadinessState; reasons: string[] }
export type FieldProvenance = 'EXTRACTED' | 'INFERRED' | 'FAILED' | null | undefined
export interface OpportunityTruthInput {
  title?: string | null; description?: string | null; organization?: string | null; source?: string | null
  opportunity_type?: string | null; opportunity_kind?: string | null; catalog_eligible?: boolean | null
  match_eligible?: boolean | null; alerts_eligible?: boolean | null; seo_eligible?: boolean | null; seo_status?: string | null; jobposting_validity?: string | null
  is_active?: boolean | null; verification_status?: string | null; deleted_at?: string | null; archived_at?: string | null; slug?: string | null
  deadline?: string | null
}
const JOB_TYPES = new Set(['job', 'internship', 'consultancy', 'empleo'])
const SCHOLARSHIP_TYPES = new Set(['scholarship', 'fellowship', 'grant', 'research_funding'])
export function canonicalOpportunityPath(slug: string, opportunityType?: string | null): string { return JOB_TYPES.has(String(opportunityType || '').toLowerCase()) ? `/empleos/${slug}` : `/oportunidades/${slug}` }
export function canonicalOpportunityUrl(slug: string, opportunityType?: string | null, origin = 'https://cvitae.lat'): string { return `${origin.replace(/\/$/, '')}${canonicalOpportunityPath(slug, opportunityType)}` }
export function isJobLike(row: OpportunityTruthInput): boolean { return JOB_TYPES.has(String(row.opportunity_type || row.opportunity_kind || '').toLowerCase()) }
export type PublicOpportunityMode = 'all' | 'jobs' | 'non_jobs'
export function matchesPublicOpportunityMode(row: OpportunityTruthInput, mode: PublicOpportunityMode): boolean { return mode === 'all' || (mode === 'jobs' ? isJobLike(row) : !isJobLike(row)) }
export function canonicalOpportunityPathForRow(row: OpportunityTruthInput & { slug: string }): string { return isJobLike(row) ? `/empleos/${row.slug}` : `/oportunidades/${row.slug}` }
export function canonicalOpportunityUrlForRow(row: OpportunityTruthInput & { slug: string }, origin = 'https://cvitae.lat'): string { return `${origin.replace(/\/$/, '')}${canonicalOpportunityPathForRow(row)}` }
export function isScholarshipLike(row: OpportunityTruthInput): boolean { return SCHOLARSHIP_TYPES.has(String(row.opportunity_type || row.opportunity_kind || '').toLowerCase()) }
/** Safe schema selection: only an allowed canonical job-like row is JobPosting. */
export function publicOpportunitySchemaType(row: OpportunityTruthInput, jobPostingAllowed: boolean): 'JobPosting' | 'Scholarship' | 'WebPage' {
  if (isJobLike(row) && jobPostingAllowed) return 'JobPosting'
  return isScholarshipLike(row) ? 'Scholarship' : 'WebPage'
}
export function fieldState(value: unknown, provenance?: FieldProvenance): FieldState {
  if (provenance === 'FAILED') return 'FAILED'
  if (value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0)) return 'UNKNOWN'
  return provenance === 'INFERRED' ? 'INFERRED' : 'EXTRACTED'
}
/** Row readiness only: catalog visibility does not imply professional evidence. */
export function matchingEvidenceReady(row: Pick<OpportunityTruthInput, 'title' | 'description'> & { tags?: unknown; requirements?: string | null; professional_family?: string | null }): boolean {
  const tags = Array.isArray(row.tags) ? row.tags.filter(tag => Boolean(String(tag || '').trim())).length : 0
  const titleSpecific = String(row.title || '').trim().split(/\s+/).length >= 2
  const richText = String(row.description || '').trim().length >= 100 || String(row.requirements || '').trim().length >= 60
  return titleSpecific && (richText || tags >= 2 || Boolean(row.professional_family))
}
const ready = (): ReadinessResult => ({ state:'READY', reasons:[] })
const notReady = (...reasons: string[]): ReadinessResult => ({ state:'NOT_READY', reasons })
export type DeadlineState = 'OPEN' | 'EXPIRED' | 'UNKNOWN' | 'INVALID'
export function deadlineLifecycle(deadline: string | null | undefined, now = new Date()): DeadlineState {
  const value = String(deadline || '').trim()
  if (!value) return 'UNKNOWN'
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (dateOnly) {
    const [year, month, day] = dateOnly.slice(1).map(Number)
    const parsed = new Date(Date.UTC(year, month - 1, day))
    if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) return 'INVALID'
    const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
    return Date.UTC(year, month - 1, day) < today ? 'EXPIRED' : 'OPEN'
  }
  // An instant is trustworthy only when its timezone is explicit. Local or
  // malformed strings remain unknown/invalid rather than becoming expired.
  if (!/(Z|[+-]\d\d:\d\d)$/i.test(value)) return 'INVALID'
  const instant = new Date(value)
  return Number.isNaN(instant.getTime()) ? 'INVALID' : instant.getTime() < now.getTime() ? 'EXPIRED' : 'OPEN'
}
export function catalogReadiness(row: OpportunityTruthInput, now = new Date()): ReadinessResult {
  if (!String(row.title || '').trim()) return notReady('MISSING_TITLE')
  if (!String(row.slug || '').trim()) return notReady('MISSING_CANONICAL_IDENTITY')
  if (row.deleted_at || row.archived_at || row.is_active === false) return notReady('ROW_DISABLED')
  if (row.verification_status && row.verification_status !== 'verified') return notReady('LIFECYCLE_NOT_VERIFIED')
  if (deadlineLifecycle(row.deadline, now) === 'EXPIRED') return notReady('DEADLINE_EXPIRED')
  return ready()
}
export function matchingReadiness(row: OpportunityTruthInput & { tags?: unknown; requirements?: string | null; professional_family?: string | null }): ReadinessResult {
  const catalog = catalogReadiness(row); if (catalog.state !== 'READY') return catalog
  return matchingEvidenceReady(row) ? ready() : notReady('INSUFFICIENT_PROFESSIONAL_EVIDENCE')
}
/**
 * Alerts are a separate consumer, even though their minimum factual evidence
 * is currently the same professional evidence used to create a safe match.
 * Keeping this as its own function prevents stored `alerts_eligible` or a
 * matching source switch from becoming the definition of alert truth.
 */
export function alertsReadiness(row: OpportunityTruthInput & { tags?: unknown; requirements?: string | null; professional_family?: string | null }): ReadinessResult {
  const matching = matchingReadiness(row)
  return matching.state === 'READY' ? ready() : { state: matching.state, reasons: [...matching.reasons] }
}
export function seoReadiness(row: OpportunityTruthInput): ReadinessResult {
  const catalog = catalogReadiness(row); if (catalog.state !== 'READY') return catalog
  if (String(row.description || '').trim().length < 100) return notReady('THIN_CONTENT')
  if (!String(row.organization || '').trim()) return notReady('MISSING_ORGANIZATION')
  return ready()
}
export function jobPostingReadiness(row: OpportunityTruthInput): ReadinessResult {
  if (!isJobLike(row)) return notReady('NOT_JOB_LIKE')
  const seo = seoReadiness(row); return seo.state === 'READY' ? ready() : { state:'NOT_READY', reasons:['STRUCTURED_DATA_INCOMPLETE', ...seo.reasons] }
}

/**
 * Single row-intrinsic persistence proposal used by historical repair and by
 * the future-ingestion trigger contract. It deliberately contains no source
 * capability or source switch: those are evaluated later per consumer.
 */
export function intrinsicRoutingGates(row: OpportunityTruthInput & { tags?: unknown; requirements?: string | null; professional_family?: string | null }) {
  const catalog = catalogReadiness(row)
  const matching = matchingReadiness(row)
  const alerts = alertsReadiness(row)
  const seo = seoReadiness(row)
  return {
    catalog, matching, alerts, seo,
    proposed: {
      catalog_eligible: catalog.state === 'READY',
      match_eligible: matching.state === 'READY',
      alerts_eligible: alerts.state === 'READY',
      seo_eligible: seo.state === 'READY',
    },
  }
}
