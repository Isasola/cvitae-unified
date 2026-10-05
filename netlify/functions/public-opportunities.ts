import type { Handler } from '@netlify/functions'
import { makeSupabaseAdmin } from './_supabase'
import { evaluateOpportunityDistribution, publicDistributionProjection, type SourcePolicyRow } from '../../src/lib/effective-source-policy'
import { matchesPublicOpportunityMode, type PublicOpportunityMode } from '../../src/lib/opportunity-truth'
import { publicCatalogQuery, publicCatalogPage } from './lib/public-opportunity-pagination'

const COLUMNS = 'id,slug,title,organization,location,city,department,country_code,onsite_country,remote,remote_scope,type,employment_type,rubro,description,tags,requirements,responsibilities,benefits,duration_text,start_date,start_date_text,opportunity_type,opportunity_kind,deadline,published_at,value,currency,funding_type,funding_amount,fully_funded,experience_required,education_level,citizenship_requirement,residency_requirement,sector,source,source_url,application_url,eligible_countries,eligible_regions,is_active,verification_status,catalog_eligible,match_eligible,alerts_eligible,seo_eligible,seo_status,deleted_at,archived_at,created_at,updated_at'

export function publicOpportunityResponse<T>(rows: T[], slug?: string) {
  if (slug && !rows[0]) return { statusCode: 404, body: { error:'not_found' } }
  return { statusCode: 200, body: slug ? rows[0] : rows }
}

/** Public projection: no opportunity is returned until canonical policy and row readiness pass. */
export function createPublicOpportunitiesHandler(makeDb = makeSupabaseAdmin): Handler {
return async (event) => {
  try {
    const db = makeDb()
    const mode = (['all', 'jobs', 'non_jobs'].includes(String(event.queryStringParameters?.mode || 'all')) ? String(event.queryStringParameters?.mode || 'all') : 'all') as PublicOpportunityMode
    const slug = event.queryStringParameters?.slug
    const { data: policyRows, error: policyError } = await db.rpc('get_source_distribution_policy')
    if (policyError) throw policyError
    let queryParams: ReturnType<typeof publicCatalogQuery>
    try { queryParams = publicCatalogQuery(event.queryStringParameters || {}) }
    catch { return { statusCode: 400, body: JSON.stringify({ error: 'invalid_public_page' }) } }
    const { data, error } = slug
      ? await db.from('opportunity_catalog_universe').select(COLUMNS).eq('slug', slug).limit(1)
      : await db.rpc('search_public_opportunities', queryParams)
    if (error) throw error
    const page = publicCatalogPage<any>(data || [])
    const publicRows = page.rows.filter(row => matchesPublicOpportunityMode(row, mode) && evaluateOpportunityDistribution(row, (policyRows || []) as SourcePolicyRow[]).catalog.allowed)
    const projected = publicRows.map(row => ({ ...Object.fromEntries(COLUMNS.split(',').map(field => [field,row[field]])), distribution: publicDistributionProjection(row, (policyRows || []) as SourcePolicyRow[]) }))
    const response = publicOpportunityResponse(projected, slug)
    return { statusCode: response.statusCode, headers: { 'Content-Type':'application/json', 'Cache-Control':'public, s-maxage=60', ...(page.nextCursor && !slug ? { 'X-Next-Cursor': page.nextCursor } : {}) }, body: JSON.stringify(response.body) }
  } catch (error) {
    console.error('[public-opportunities]', error)
    return { statusCode: 503, headers:{'Content-Type':'application/json'}, body: JSON.stringify({ error:'public_policy_unavailable' }) }
  }
}
}
export const handler = createPublicOpportunitiesHandler()
