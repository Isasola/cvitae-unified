function cleanSegment(value: unknown, maxLength: number): string {
  return String(value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
}

function cleanStructuredList(value: unknown, maxItems: number, maxItemLength: number): string {
  if (!Array.isArray(value)) return ''
  return value
    .slice(0, maxItems)
    .map((item) => {
      if (typeof item === 'string') return cleanSegment(item, maxItemLength)
      if (!item || typeof item !== 'object') return ''
      return Object.values(item as Record<string, unknown>)
        .flatMap((part) => Array.isArray(part) ? part : [part])
        .map((part) => cleanSegment(part, maxItemLength))
        .filter(Boolean)
        .join(' — ')
    })
    .filter(Boolean)
    .join(' | ')
}

export function buildProfileEmbeddingText(profile: Record<string, any>): string {
  const data = profile.profile_data ?? {}
  const skills = Array.isArray(data.habilidades) ? data.habilidades.join(', ') : ''
  const interests = Array.isArray(data.career_interests) ? data.career_interests.join(', ') : ''
  const education = cleanStructuredList(data.education, 8, 180)
  const experience = cleanStructuredList(data.experience, 10, 260)
  const languages = cleanStructuredList(data.languages, 8, 100)
  const parts = [
    `Título: ${cleanSegment(profile.professional_title, 140)}`,
    `Skills: ${cleanSegment(skills, 320)}`,
    `Senioridad: ${cleanSegment(data.seniority, 60)}`,
    `Ruta: ${cleanSegment(data.career_route, 100)}`,
    `Meta a un año: ${cleanSegment(data.desired_role_1y, 300)}`,
    `Intereses: ${cleanSegment(interests, 240)}`,
    `Ubicación: ${cleanSegment(data.location, 120)}`,
    `Resumen: ${cleanSegment(profile.summary, 320)}`,
    `Educación: ${education}`,
    `Experiencia estructurada: ${experience}`,
    `Idiomas: ${languages}`,
    `Experiencia CV: ${cleanSegment(profile.cv_text, 900)}`,
  ]
  return parts.filter((part) => !part.endsWith(': ')).join(' | ').slice(0, 1_800)
}

export function buildOpportunityEmbeddingText(opportunity: Record<string, any>): string {
  const tags = Array.isArray(opportunity.tags) ? opportunity.tags.join(', ') : ''
  const eligible = Array.isArray(opportunity.eligible_countries) ? opportunity.eligible_countries.join(', ') : ''
  const parts = [
    `Cargo: ${cleanSegment(opportunity.title, 180)}`,
    `Organización: ${cleanSegment(opportunity.organization, 140)}`,
    `Área: ${cleanSegment(opportunity.rubro, 120)}`,
    `Tipo: ${cleanSegment(opportunity.type || opportunity.opportunity_type || opportunity.opportunity_kind, 100)}`,
    `Skills: ${cleanSegment(tags, 320)}`,
    `Ubicación: ${cleanSegment(opportunity.location, 140)}`,
    `Países elegibles: ${cleanSegment(eligible || opportunity.country_code, 100)}`,
    `Descripción: ${cleanSegment(opportunity.description, 1_000)}`,
  ]
  return parts.filter((part) => !part.endsWith(': ')).join(' | ').slice(0, 1_800)
}
