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

/** The browser consumes this server projection for catalog data; it never receives denied rows. */
export async function loadPublicOpportunities<T = Record<string, any>>(mode: 'all' | 'jobs' | 'non_jobs' = 'all', slug?: string): Promise<T[] | T | null> {
  const params = new URLSearchParams({ mode }); if (slug) params.set('slug', slug)
  const response = await fetch(`/.netlify/functions/public-opportunities?${params.toString()}`)
  return decodePublicOpportunityResponse<T>(response, slug)
}
