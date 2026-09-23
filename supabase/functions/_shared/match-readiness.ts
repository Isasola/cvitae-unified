/**
 * Data confidence is deliberately separate from candidate fit/ranking.
 * It is a deterministic explanation layer for product and maintenance
 * observability; callers must not multiply a semantic match score by it.
 */
export type MatchReadiness = 'STRONG' | 'USABLE' | 'AMBIGUOUS' | 'BLOCKED'

/** Shared row-evidence gate: a stored/verified card is not automatically a match. */
export function hasProfessionalEvidence(opportunity: Record<string, any>): boolean {
  const titleSpecific = String(opportunity.title || '').trim().split(/\s+/).length >= 2
  const description = String(opportunity.description || '').trim().length >= 100
  const requirements = String(opportunity.requirements || '').trim().length >= 60
  const skills = Array.isArray(opportunity.tags) && opportunity.tags.filter(Boolean).length >= 2
  return titleSpecific && (description || requirements || skills || Boolean(opportunity.professional_family))
}

export function assessMatchReadiness(opportunity: Record<string, any>, observation?: Record<string, any>) {
  const reasons: string[] = []
  if (!opportunity.match_eligible || opportunity.deleted_at || opportunity.archived_at) {
    return { readiness: 'BLOCKED' as MatchReadiness, confidence: 0, reasons: ['not_match_eligible'] }
  }
  if (!hasProfessionalEvidence(opportunity)) {
    return { readiness: 'BLOCKED' as MatchReadiness, confidence: 0, reasons: ['insufficient_professional_evidence'] }
  }
  if (['DEAD', 'REMOVED'].includes(String(observation?.identity_status || '')) && [404, 410].includes(Number(observation?.http_status))) {
    return { readiness: 'BLOCKED' as MatchReadiness, confidence: 0, reasons: ['hard_dead_observation'] }
  }
  let confidence = 0
  if (String(opportunity.title || '').trim()) confidence += 15; else reasons.push('missing_title')
  if (String(opportunity.organization || '').trim()) confidence += 10; else reasons.push('missing_organization')
  if (String(opportunity.description || '').trim().length >= 80) confidence += 30; else reasons.push('weak_description')
  if (String(opportunity.application_url || '').trim()) confidence += 10; else reasons.push('missing_application_url')
  const jobGeo = String(opportunity.country_code || '').trim() && String(opportunity.country_code).toUpperCase() !== 'WW'
  const remoteEvidence = ['WORLDWIDE', 'LATAM', 'REGIONAL', 'COUNTRY_SPECIFIC', 'ONSITE', 'HYBRID'].includes(String(opportunity.remote_scope || ''))
  const eligibility = Array.isArray(opportunity.eligible_countries) && opportunity.eligible_countries.length > 0
  if (jobGeo || remoteEvidence) confidence += 20
  else if (eligibility) confidence += 12
  else reasons.push('ambiguous_geo')
  if (observation?.identity_status === 'IDENTITY_CONFIRMED') confidence += 15
  else if (observation) reasons.push('identity_not_confirmed')
  const readiness: MatchReadiness = confidence >= 75 ? 'STRONG' : confidence >= 50 ? 'USABLE' : 'AMBIGUOUS'
  return { readiness, confidence, reasons }
}
