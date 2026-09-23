import type { Handler } from '@netlify/functions'
import { makeSupabaseAdmin } from './_supabase'
import { evaluateOpportunityDistribution, publicDistributionProjection, type SourcePolicyRow } from '../../src/lib/effective-source-policy'
import { matchesPublicOpportunityMode, type PublicOpportunityMode } from '../../src/lib/opportunity-truth'
import { collectAllowedPages } from './lib/public-opportunity-pagination'

const COLUMNS = 'id,slug,title,organization,location,city,department,country_code,type,rubro,description,opportunity_type,opportunity_kind,deadline,funding_type,fully_funded,source,source_url,application_url,eligible_countries,eligible_regions,education_level,remote_scope,is_active,verification_status,catalog_eligible,match_eligible,alerts_eligible,seo_eligible,seo_status,deleted_at,archived_at,created_at,updated_at'

export function publicOpportunityResponse<T>(rows: T[], slug?: string) {
  if (slug && !rows[0]) return { statusCode: 404, body: { error:'not_found' } }
  return { statusCode: 200, body: slug ? rows[0] : rows }
}

/** Public projection: no opportunity is returned until canonical policy and row readiness pass. */
export const handler: Handler = async (event) => {
  try {
    const db = makeSupabaseAdmin()
    const mode = (['all', 'jobs', 'non_jobs'].includes(String(event.queryStringParameters?.mode || 'all')) ? String(event.queryStringParameters?.mode || 'all') : 'all') as PublicOpportunityMode
    const slug = event.queryStringParameters?.slug
    const { data: policyRows, error: policyError } = await db.rpc('get_source_distribution_policy')
    if (policyError) throw policyError
    const target = slug ? 1 : 300; const pageSize = 200
    const publicRows = await collectAllowedPages<any>({
      target,
      pageSize,
      allowed: row => matchesPublicOpportunityMode(row, mode) && evaluateOpportunityDistribution(row, (policyRows || []) as SourcePolicyRow[]).catalog.allowed,
      fetchPage: async (offset, size) => {
      // The shared evaluator owns lifecycle, canonical policy and intrinsic
      // catalog truth. Pre-filtering by historical `catalog_eligible` would
      // permanently hide a newly-ready or reconciled row before that truth can
      // be applied.
      let query = db.from('opportunities').select(COLUMNS).order('updated_at', { ascending: false }).range(offset, offset + size - 1)
      if (slug) query = query.eq('slug', slug)
      const { data, error } = await query
      if (error) throw error
      return data || []
      },
    })
    const projected = publicRows.map(row => ({ ...row, distribution: publicDistributionProjection(row, (policyRows || []) as SourcePolicyRow[]) }))
    const response = publicOpportunityResponse(projected.slice(0, target), slug)
    return { statusCode: response.statusCode, headers: { 'Content-Type':'application/json', 'Cache-Control':'public, s-maxage=60' }, body: JSON.stringify(response.body) }
  } catch (error) {
    console.error('[public-opportunities]', error)
    return { statusCode: 503, headers:{'Content-Type':'application/json'}, body: JSON.stringify({ error:'public_policy_unavailable' }) }
  }
}
