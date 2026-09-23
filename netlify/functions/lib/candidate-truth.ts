export type CandidateTruthEvidence = 'USER_CONFIRMED' | 'EXTRACTED' | 'UNKNOWN'

function text(value: unknown): string {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function evidence(value: unknown, extracted: unknown): CandidateTruthEvidence {
  if (Array.isArray(value)) return value.length ? 'USER_CONFIRMED' : (Array.isArray(extracted) && extracted.length ? 'EXTRACTED' : 'UNKNOWN')
  return text(value) ? 'USER_CONFIRMED' : (text(extracted) ? 'EXTRACTED' : 'UNKNOWN')
}

/** Creates provenance only at the explicit profile-save confirmation boundary. */
export function confirmedCandidateTruth(incoming: Record<string, any>, draft: Record<string, any> = {}) {
  return {
    version: 1,
    evidence: {
      professional_title: evidence(incoming.professional_title, draft.professional_title),
      summary: evidence(incoming.summary, null),
      skills: evidence(incoming.skills, draft.skills),
      education: evidence(incoming.education, draft.education),
      experience: evidence(incoming.experience, draft.experience),
      languages: evidence(incoming.languages, draft.languages),
      location: evidence(incoming.location, draft.location),
      seniority: evidence(incoming.seniority, draft.seniority),
      career_route: evidence(incoming.career_route, null),
      desired_role_1y: evidence(incoming.desired_role_1y, null),
      career_interests: evidence(incoming.career_interests, null),
    },
    confirmed_at: new Date().toISOString(),
  }
}
