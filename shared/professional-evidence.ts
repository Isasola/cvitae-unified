/** Convert the supported legacy/JSONB requirements shapes to factual prose.
 * Unsupported JSON contributes no evidence; never stringify arrays/objects. */
export function professionalRequirementsText(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (!Array.isArray(value)) return ''
  return value.flatMap(item => {
    if (typeof item === 'string') return [item.trim()]
    if (item && typeof item === 'object' && !Array.isArray(item) && typeof (item as Record<string, unknown>).text === 'string') {
      return [(item as Record<string, string>).text.trim()]
    }
    return []
  }).filter(Boolean).join(' ')
}

/** The single row-level professional evidence predicate used by Matching V2
 * and the opportunity-universe readiness contract. Generic tags are metadata,
 * not professional evidence. Keep this predicate scoring-neutral. */
export function hasProfessionalEvidence(opportunity: Record<string, any>): boolean {
  const titleSpecific = String(opportunity.title || '').trim().split(/\s+/).length >= 2
  const description = String(opportunity.description || '').trim().length >= 100
  const requirements = professionalRequirementsText(opportunity.requirements).length >= 60
  return titleSpecific && (description || requirements || Boolean(opportunity.professional_family))
}
