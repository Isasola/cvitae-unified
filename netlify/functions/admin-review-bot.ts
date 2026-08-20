import type { Handler } from '@netlify/functions'
import { createHash } from 'node:crypto'
import { makeSupabaseAdmin } from './_supabase'
import {
  REVIEW_RULES_VERSION,
  normalizeReviewUrl,
  reviewOpportunityDeterministic,
  type DuplicateSignal,
  type OpportunityReviewInput,
  type OpportunityReviewResult,
} from '../../src/lib/review/opportunity-review'
import { fetchOpportunityPage } from './lib/safe-opportunity-fetch'
import { clarifyReviewWithGemini } from './lib/review-gemini'

const CACHE_TTL_MS = 30 * 60 * 1000
const reviewCache = new Map<string, { expires: number; result: OpportunityReviewResult }>()
const MAX_BATCH = 25

function authorized(event: Parameters<Handler>[0]): boolean {
  const supplied = event.headers['x-admin-password'] || event.headers.authorization?.replace('Bearer ', '')
  return Boolean(process.env.ADMIN_PASSWORD && supplied === process.env.ADMIN_PASSWORD)
}

function cacheKey(row: any, allowAi: boolean): string {
  return createHash('sha256').update(JSON.stringify({
    id: row.id, updated_at: row.updated_at, application_url: row.application_url,
    deadline: row.deadline, source_authority: row.source_authority,
    original_source_verified: row.original_source_verified,
    rules: REVIEW_RULES_VERSION, allowAi,
  })).digest('hex')
}

function duplicateSignals(row: any, allRows: any[]): DuplicateSignal[] {
  const normalized = normalizeReviewUrl(row.application_url)
  const title = String(row.title || '').trim().toLocaleLowerCase()
  const organization = String(row.organization || '').trim().toLocaleLowerCase()
  const signals: DuplicateSignal[] = []
  for (const other of allRows) {
    if (String(other.id) === String(row.id)) continue
    if (other.application_url === row.application_url) {
      signals.push({ id: String(other.id), kind: 'exact_url' })
      continue
    }
    if (normalized && normalizeReviewUrl(other.application_url) === normalized) {
      signals.push({ id: String(other.id), kind: 'normalized_url' })
      continue
    }
    if (title && organization && String(other.title || '').trim().toLocaleLowerCase() === title && String(other.organization || '').trim().toLocaleLowerCase() === organization) {
      signals.push({ id: String(other.id), kind: 'title_organization' })
    }
  }
  return signals.slice(0, 10)
}

async function reviewOne(row: OpportunityReviewInput & { updated_at?: string }, duplicates: DuplicateSignal[], allowAi: boolean) {
  const key = cacheKey(row, allowAi)
  const cached = reviewCache.get(key)
  if (cached && cached.expires > Date.now()) {
    return { ...cached.result, ai: { ...cached.result.ai, cached: cached.result.ai.used } }
  }

  let page = null
  let fetchIssue: string | null = null
  if (row.application_url) {
    try { page = await fetchOpportunityPage(row.application_url) }
    catch (error: any) { fetchIssue = String(error?.message || 'url_check_failed').slice(0, 160) }
  }
  let result = reviewOpportunityDeterministic(row, page, duplicates)
  if (fetchIssue) {
    result.issues.push({ code: 'URL_CHECK_FAILED', message: `No se pudo comprobar la URL: ${fetchIssue}`, severity: 'review' })
    if (result.recommendation === 'approve') result.recommendation = 'review'
    result.confidence = 'low'
  }

  if (allowAi && result.deterministic.needsAi && result.deterministic.hardBlocks.length === 0) {
    try {
      const ai = await clarifyReviewWithGemini(row, result)
      result = {
        ...result,
        evidence: [...result.evidence, { check: 'ai_clarification', value: ai.clarification.explanation.slice(0, 1000), source: 'html' }],
        ai: { used: true, provider: 'gemini', reason: 'Ambigüedad no resuelta por Stage A', cached: ai.cached },
      }
    } catch (error: any) {
      result.issues.push({ code: 'AI_PROVIDER_FAILED', message: `Gemini no disponible: ${String(error?.message || 'error').slice(0, 120)}`, severity: 'info' })
    }
  }

  reviewCache.set(key, { result, expires: Date.now() + CACHE_TTL_MS })
  return result
}

const handler: Handler = async event => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) }
  if (!authorized(event)) return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) }
  let body: any = {}
  try { body = JSON.parse(event.body || '{}') } catch { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) } }
  const ids = Array.isArray(body.opportunityIds) ? [...new Set(body.opportunityIds.map(String))] : []
  if (!ids.length || ids.length > MAX_BATCH) {
    return { statusCode: 400, body: JSON.stringify({ error: `opportunityIds debe contener entre 1 y ${MAX_BATCH} IDs` }) }
  }
  const allowAi = body.allowAi === true
  const supabase = makeSupabaseAdmin()
  const select = 'id,slug,title,description,organization,location,city,type,opportunity_type,opportunity_kind,application_url,deadline,source,is_active,verification_status,deleted_at,archived_at,created_at,updated_at,country_code,remote_scope,geo_confidence,geo_evidence,eligible_countries,eligible_regions,onsite_country,source_authority,original_source_url,original_source_verified'
  const { data: rows, error } = await supabase.from('opportunities').select(select).in('id', ids)
  if (error) return { statusCode: 500, body: JSON.stringify({ error: error.message }) }
  if ((rows || []).length !== ids.length) return { statusCode: 409, body: JSON.stringify({ error: 'El snapshot contiene IDs inexistentes o ya no accesibles' }) }

  // Reuse DB exact-match signals without loading the whole opportunity table.
  const urls = [...new Set((rows || []).map((row: any) => row.application_url).filter(Boolean))]
  const titles = [...new Set((rows || []).map((row: any) => row.title).filter(Boolean))]
  const [{ data: sameUrls }, { data: sameTitles }] = await Promise.all([
    urls.length ? supabase.from('opportunities').select('id,title,organization,application_url').in('application_url', urls).is('deleted_at', null) : Promise.resolve({ data: [] as any[] }),
    titles.length ? supabase.from('opportunities').select('id,title,organization,application_url').in('title', titles).is('deleted_at', null).limit(500) : Promise.resolve({ data: [] as any[] }),
  ])
  const comparisonRows = [...(sameUrls || []), ...(sameTitles || [])]
  const results = []
  for (const row of rows || []) {
    results.push({ id: row.id, result: await reviewOne(row as any, duplicateSignals(row, comparisonRows), allowAi) })
  }
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify({ results, readOnly: true, rulesVersion: REVIEW_RULES_VERSION }),
  }
}

export { handler }
