/**
 * SEO Eligibility Validator.
 * Takes a normalized opportunity and returns structured eligibility results.
 *
 * States:
 *   seo_status:       'eligible' | 'review' | 'blocked'
 *   jobposting_validity: 'valid' | 'incomplete' | 'not_applicable'
 */

import type { NormalizedOpportunity } from './normalize'

export type SeoStatus = 'eligible' | 'review' | 'blocked'
export type JobPostingValidity = 'valid' | 'incomplete' | 'not_applicable'

export interface SeoIssue {
  field: string
  reason: string
  severity: 'blocking' | 'warning'
}

export interface EligibilityResult {
  seoStatus: SeoStatus
  jobpostingValidity: JobPostingValidity
  issues: SeoIssue[]
  missingFields: string[]  // required fields absent from the record
}

export function validateEligibility(opp: NormalizedOpportunity): EligibilityResult {
  const issues: SeoIssue[] = []
  const missingFields: string[] = []

  // ─── Blocking conditions (hard stops for SEO) ─────────────────────────────

  if (opp.deletedAt) {
    issues.push({ field: 'deleted_at', reason: 'Registro eliminado', severity: 'blocking' })
  }
  if (!opp.isActive) {
    issues.push({ field: 'is_active', reason: 'Oportunidad inactiva', severity: 'blocking' })
  }
  if (opp.verificationStatus !== 'verified') {
    issues.push({ field: 'verification_status', reason: `Estado de verificación: ${opp.verificationStatus}`, severity: 'blocking' })
  }
  if (opp.archivedAt) {
    issues.push({ field: 'archived_at', reason: 'Oportunidad archivada', severity: 'blocking' })
  }
  if (!opp.title) {
    issues.push({ field: 'title', reason: 'Título vacío o inválido', severity: 'blocking' })
    missingFields.push('title')
  } else if (opp.title.length < 3) {
    issues.push({ field: 'title', reason: 'Título demasiado corto (< 3 caracteres)', severity: 'blocking' })
  }
  if (!opp.slug) {
    issues.push({ field: 'slug', reason: 'Sin slug — no se puede generar URL canónica', severity: 'blocking' })
    missingFields.push('slug')
  } else if (!/^[a-z0-9][a-z0-9._-]*$/i.test(opp.slug)) {
    issues.push({ field: 'slug', reason: 'Slug contiene caracteres inseguros (coma, espacio, etc.)', severity: 'blocking' })
  }
  if (opp.applicationUrl === null) {
    issues.push({ field: 'application_url', reason: 'URL de postulación ausente o protocolo no permitido (solo https:/http:)', severity: 'blocking' })
    missingFields.push('application_url')
  }

  const blocking = issues.filter(i => i.severity === 'blocking')
  if (blocking.length > 0) {
    return {
      seoStatus: 'blocked',
      jobpostingValidity: computeJobPostingValidity(opp, issues, missingFields),
      issues,
      missingFields,
    }
  }

  // ─── Warning conditions (need human review) ───────────────────────────────

  if (!opp.description) {
    issues.push({ field: 'description', reason: 'Sin descripción — Google Jobs requiere descripción', severity: 'warning' })
    missingFields.push('description')
  } else if (opp.description.length < 100) {
    issues.push({ field: 'description', reason: 'Descripción muy corta (< 100 caracteres)', severity: 'warning' })
  }
  if (!opp.organization) {
    issues.push({ field: 'organization', reason: 'Sin organización / empresa', severity: 'warning' })
    missingFields.push('organization')
  }
  if (!opp.addressLocality) {
    issues.push({ field: 'location', reason: 'Sin ciudad/ubicación para jobLocation', severity: 'warning' })
    missingFields.push('location')
  }

  // ─── Determine final status ───────────────────────────────────────────────

  const warnings = issues.filter(i => i.severity === 'warning')
  const seoStatus: SeoStatus = warnings.length > 0 ? 'review' : 'eligible'

  return {
    seoStatus,
    jobpostingValidity: computeJobPostingValidity(opp, issues, missingFields),
    issues,
    missingFields,
  }
}

function computeJobPostingValidity(
  opp: NormalizedOpportunity,
  issues: SeoIssue[],
  missingFields: string[],
): JobPostingValidity {
  // Scholarship types use a different schema — JobPosting not applicable
  if (!opp.isJobPosting) return 'not_applicable'

  // Required Google Jobs fields for a valid JobPosting
  const hasTitle = !!opp.title
  const hasDescription = !!opp.description && opp.description.length >= 100
  const hasOrganization = !!opp.organization
  const hasLocation = !!opp.addressLocality

  if (hasTitle && hasDescription && hasOrganization && hasLocation) return 'valid'

  // title is the minimum — if missing, blocked already
  if (!hasTitle) return 'incomplete'

  return 'incomplete'
}
