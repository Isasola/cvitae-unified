export type MatchingRunStatus = 'NO_RUN' | 'SUCCESS' | 'ERROR' | 'STALE'

export type MatchingCoverageState =
  | 'HEALTHY'
  | 'LOW_RETRIEVAL_COVERAGE'
  | 'DATA_COVERAGE_GAP'
  | 'PROFESSIONAL_FIT_GAP'
  | 'ELIGIBILITY_UNKNOWN'
  | 'NO_CONFIRMED_MATCH'
  | 'ERROR'
  | 'NO_RUN'

export interface MatchingCoverageInput {
  runStatus: MatchingRunStatus
  uniquePolicyCandidates: number
  sourceAllowed: number
  professionalEvidenceReady: number
  professionalFitKnown: number
  eligibilityEligible: number
  eligibilityUnknown: number
  eligibilityIneligible: number
  match: number
  potential: number
}

/** One deterministic interpretation shared by matcher, Admin and UI. */
export function classifyMatchingCoverage(input: MatchingCoverageInput): MatchingCoverageState {
  if (input.runStatus === 'ERROR') return 'ERROR'
  if (input.runStatus === 'NO_RUN') return 'NO_RUN'
  if (input.match > 0) return 'HEALTHY'
  if (input.potential > 0 && input.eligibilityUnknown > 0) return 'ELIGIBILITY_UNKNOWN'
  if (input.uniquePolicyCandidates === 0 || input.sourceAllowed === 0) return 'LOW_RETRIEVAL_COVERAGE'
  if (input.professionalEvidenceReady === 0 || input.professionalFitKnown === 0) return 'PROFESSIONAL_FIT_GAP'
  if (input.eligibilityUnknown > 0) return 'DATA_COVERAGE_GAP'
  if (input.eligibilityEligible === 0 && input.eligibilityIneligible > 0) return 'NO_CONFIRMED_MATCH'
  return 'NO_CONFIRMED_MATCH'
}
