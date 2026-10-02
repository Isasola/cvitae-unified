/**
 * Canonical, read-only projection of the profile fields consumed by the
 * candidate-facing product. Empty values remain empty/UNKNOWN; this helper
 * must never invent a seniority or eligibility fact.
 */
import { canonicalCandidateEligibility } from './candidate-eligibility'
export type CandidateTruthState = 'USER_CONFIRMED' | 'EXTRACTED' | 'UNKNOWN'

export function cleanCandidateText(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

export function canonicalCandidateProfile(profile: any) {
  const data = profile?.profile_data ?? {}
  return {
    professional_title: cleanCandidateText(profile?.professional_title),
    summary: profile?.summary ?? null,
    cv_text: profile?.cv_text ?? null,
    profile_data: {
      habilidades: Array.isArray(data.habilidades) ? data.habilidades : [],
      education: Array.isArray(data.education) ? data.education : [],
      experience: Array.isArray(data.experience) ? data.experience : [],
      languages: Array.isArray(data.languages) ? data.languages : [],
      location: cleanCandidateText(data.location),
      seniority: cleanCandidateText(data.seniority),
      modality: cleanCandidateText(data.modality),
      career_route: cleanCandidateText(data.career_route),
      desired_role_1y: cleanCandidateText(data.desired_role_1y),
      career_interests: Array.isArray(data.career_interests) ? data.career_interests : [],
      candidate_truth: data.candidate_truth ?? {},
      candidate_eligibility: canonicalCandidateEligibility(data.candidate_eligibility),
      provenance: data.candidate_truth?.evidence ?? {},
    },
  }
}
