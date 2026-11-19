/**
 * Runtime-neutral B2C matching contract.
 *
 * This module intentionally contains types only: Edge ranking, Netlify email
 * delivery, and browser consumers can agree on decision semantics without
 * importing one another's runtime code.
 */
export type ProfessionalCompatibility = 'COMPATIBLE' | 'ADJACENT' | 'TRANSFERABLE' | 'CONFLICT' | 'UNKNOWN'
export type MatchOutcome = 'MATCH' | 'ABSTAIN' | 'DENY'
export type EligibilityState = 'ELIGIBLE' | 'INELIGIBLE' | 'UNKNOWN'
export type WorkArrangementState = 'COMPATIBLE' | 'INCOMPATIBLE' | 'UNKNOWN'
export type HardRequirementsState = 'PASS' | 'FAIL' | 'UNKNOWN'
export type ProfessionalEvidenceState = 'SUFFICIENT' | 'INSUFFICIENT'

export interface MatchDecision {
  applicable: ProfessionalCompatibility
  eligibility: EligibilityState
  work_arrangement: WorkArrangementState
  hard_requirements: HardRequirementsState
  professional_evidence: ProfessionalEvidenceState
  confidence: 'HIGH' | 'MEDIUM' | 'LOW'
  outcome: MatchOutcome
  score: number | null
  positive_reasons: string[]
  negative_reasons: string[]
  unknown_reasons: string[]
  hard_denials: string[]
  matched_skills: string[]
  missing_skills: string[]
}
