import { canonicalCandidateProfile } from './candidate-profile'

/**
 * Deterministic operational fingerprint of the candidate fields consumed by
 * Matching V2. It is not an authentication or security primitive and
 * deliberately excludes account lifecycle, subscription,
 * analytics and UI state.
 */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value as Record<string, unknown>).sort().map((key) => [key, canonical((value as any)[key])]))
  }
  return value ?? null
}

function hash(value: string): string {
  let a = 0x811c9dc5
  let b = 0x01000193
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i)
    a = Math.imul(a ^ code, 16777619)
    b = Math.imul(b ^ (code + i), 2246822519)
  }
  return `${(a >>> 0).toString(16).padStart(8, '0')}${(b >>> 0).toString(16).padStart(8, '0')}`
}

export function matchingProfileSignature(profile: any): string {
  const candidate = canonicalCandidateProfile(profile)
  const data = candidate.profile_data
  const payload = canonical({
    professional_title: candidate.professional_title,
    summary: candidate.summary ?? '',
    cv_text: candidate.cv_text ?? '',
    skills: data.habilidades ?? [],
    education: data.education ?? [],
    experience: data.experience ?? [],
    languages: data.languages ?? [],
    location: data.location ?? '',
    seniority: data.seniority ?? '',
    career_route: data.career_route ?? '',
    modality: data.modality ?? '',
    candidate_truth: data.candidate_truth ?? {},
    candidate_eligibility: data.candidate_eligibility,
    desired_role_1y: data.desired_role_1y,
    career_interests: data.career_interests,
  })
  return hash(JSON.stringify(payload))
}
