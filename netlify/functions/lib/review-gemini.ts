import { createHash } from 'node:crypto'
import type { OpportunityReviewInput, OpportunityReviewResult } from '../../../src/lib/review/opportunity-review'
import { REVIEW_RULES_VERSION } from '../../../src/lib/review/opportunity-review'
import { observeAiCall } from './ai-telemetry'

const MODEL = 'gemini-3.5-flash-lite'
const PROMPT_VERSION = 'review-clarification-v1'
const CACHE_TTL_MS = 6 * 60 * 60 * 1000
const cache = new Map<string, { expires: number; value: GeminiClarification }>()

export interface GeminiClarification {
  pageRepresentsOpportunity: boolean | null
  organization: string | null
  opportunityType: string | null
  eligibilitySummary: string | null
  contradictions: string[]
  explanation: string
}

export interface GeminiReviewDependencies {
  fetchImpl?: typeof fetch
  apiKey?: string
}

function hashInput(input: OpportunityReviewInput, result: OpportunityReviewResult): string {
  return createHash('sha256').update(JSON.stringify({
    id: input.id,
    title: input.title,
    organization: input.organization,
    description: input.description,
    location: input.location,
    country_code: input.country_code,
    opportunity_type: input.opportunity_type,
    issues: result.issues.map(issue => issue.code),
    evidence: result.evidence,
    rules: REVIEW_RULES_VERSION,
    model: MODEL,
    prompt: PROMPT_VERSION,
  })).digest('hex')
}

export async function clarifyReviewWithGemini(
  input: OpportunityReviewInput,
  result: OpportunityReviewResult,
  dependencies: GeminiReviewDependencies = {},
): Promise<{ clarification: GeminiClarification; cached: boolean; model: string }> {
  if (!result.deterministic.needsAi || result.deterministic.hardBlocks.length > 0) {
    throw new Error('gemini_not_needed')
  }
  const key = hashInput(input, result)
  const cached = cache.get(key)
  if (cached && cached.expires > Date.now()) return { clarification: cached.value, cached: true, model: MODEL }

  const apiKey = dependencies.apiKey ?? process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('gemini_not_configured')
  const fetchImpl = dependencies.fetchImpl || fetch
  const publicExcerpt = String(input.description || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 5000)
  const prompt = `Analizá sólo la evidencia pública de esta oportunidad. No inventes campos faltantes.
Devolvé JSON estricto con pageRepresentsOpportunity, organization, opportunityType, eligibilitySummary, contradictions y explanation.
Registro: ${JSON.stringify({ title: input.title, organization: input.organization, opportunityType: input.opportunity_type, location: input.location, excerpt: publicExcerpt })}
Issues determinísticos: ${JSON.stringify(result.issues.map(issue => ({ code: issue.code, message: issue.message })))}`

  const response = await observeAiCall({
    provider: 'gemini', model: MODEL, feature: 'opportunity_review_clarification',
    trigger: 'user_action', actor: 'admin', cacheHit: false,
  }, () => fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.1 },
    }),
  }))
  if (!response.ok) throw new Error(`gemini_http_${response.status}`)
  const body: any = await response.json()
  const raw = body?.candidates?.[0]?.content?.parts?.[0]?.text
  if (!raw) throw new Error('gemini_empty_response')
  const clarification = JSON.parse(raw) as GeminiClarification
  cache.set(key, { value: clarification, expires: Date.now() + CACHE_TTL_MS })
  return { clarification, cached: false, model: MODEL }
}
