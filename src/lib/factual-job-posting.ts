import {
  aggregatedJobPosting as aggregatedImplementation,
  factualJobPosting as factualImplementation,
} from './factual-job-posting.shared.js'

export type FactualJobPostingResult = {
  state: 'READY' | 'NOT_READY'
  reasons: string[]
  structuredData?: Record<string, unknown>
}

export function factualJobPosting(
  row: any,
  canonicalUrl: string
): FactualJobPostingResult {
  return factualImplementation(row, canonicalUrl)
}

export function aggregatedJobPosting(
  row: any,
  canonicalUrl: string
): FactualJobPostingResult {
  return aggregatedImplementation(row, canonicalUrl)
}
