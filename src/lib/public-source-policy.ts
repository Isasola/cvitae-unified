import { supabase } from './supabase'
import { evaluateOpportunityDistribution, type SourcePolicyRow } from './effective-source-policy'
import { decodePublicOpportunityResponse } from './public-opportunity-response'

let policyPromise: Promise<SourcePolicyRow[]> | null = null

/** Public consumers receive only the minimal RPC projection, never opportunity_sources. */
export async function loadPublicSourcePolicies(): Promise<SourcePolicyRow[]> {
  if (!policyPromise) policyPromise = supabase.rpc('get_source_distribution_policy').then(({ data, error }) => {
    if (error) throw error
    return (data || []) as SourcePolicyRow[]
  })
  return policyPromise
}

export async function publicCatalogRows<T extends Record<string, any>>(rows: T[]): Promise<T[]> {
  const policies = await loadPublicSourcePolicies()
  return rows.filter(row => evaluateOpportunityDistribution(row, policies).catalog.allowed)
}

export async function publicCatalogRow<T extends Record<string, any>>(row: T | null): Promise<T | null> {
  if (!row) return null
  return (await publicCatalogRows([row]))[0] || null
}

export type PublicCatalogFilters = { q?: string; area?: string; types?: string[]; cursor?: string }
export async function loadPublicOpportunityPage<T = Record<string, any>>(mode: 'all' | 'jobs' | 'non_jobs' = 'all', filters: PublicCatalogFilters = {}) {
  const params = new URLSearchParams({ mode })
  if (filters.q) params.set('q', filters.q)
  if (filters.area) params.set('area', filters.area)
  if (filters.types?.length) params.set('types', JSON.stringify(filters.types))
  if (filters.cursor) params.set('cursor', filters.cursor)
  const response = await fetch(`/.netlify/functions/public-opportunities?${params.toString()}`)
  const rows = await decodePublicOpportunityResponse<T[]>(response)
  return { rows: (rows || []) as T[], nextCursor: response.headers.get('X-Next-Cursor') }
}

/** Detail stays exact-ID; lists page through the full canonical result set. */
export async function loadPublicOpportunities<T = Record<string, any>>(mode: 'all' | 'jobs' | 'non_jobs' = 'all', slug?: string): Promise<T[] | T | null> {
  if (!slug) return (await loadPublicOpportunityPage(mode)).rows as T[]
  const params = new URLSearchParams({ mode, slug })
  const response = await fetch(`/.netlify/functions/public-opportunities?${params.toString()}`)
  return decodePublicOpportunityResponse<T>(response, slug)
}
