import { canonicalSource, publicDistributionProjection, type SourcePolicyRow } from './effective-source-policy'
import { canonicalOpportunityPathForRow } from './opportunity-truth'

export type PublicSeoRow = Record<string, any> & {
  canonical_source: string
  canonical_path: string
  distribution: ReturnType<typeof publicDistributionProjection>
}

/** Shared eligibility projection for inputs which have not crossed Universe. */
export function buildEffectiveSeoInventory(rows: Record<string, any>[], policies: SourcePolicyRow[], asOf = new Date()): PublicSeoRow[] {
  const paths = new Set<string>()
  return [...rows].sort((left, right) => String(right.updated_at || '').localeCompare(String(left.updated_at || '')) || String(left.id || '').localeCompare(String(right.id || ''))).flatMap(row => {
    const distribution = publicDistributionProjection(row, policies, asOf)
    if (!distribution.seo.allowed || !String(row.slug || '').trim()) return []
    const canonical_path = canonicalOpportunityPathForRow({ ...row, slug: String(row.slug) })
    if (paths.has(canonical_path)) return []
    paths.add(canonical_path)
    return [{ ...row, source: distribution.canonicalSource, canonical_source: distribution.canonicalSource, canonical_path, distribution }]
  })
}

/** Rows already authorized by opportunity_seo_universe. No second eligibility
 * decision: normalize aliases/routes, sort, then deduplicate canonical paths.
 * An operationally admitted future producer needs no reader source allowlist.
 */
export function buildSeoInventoryFromUniverse(rows: Record<string, any>[]): Array<Record<string, any> & { canonical_source: string; canonical_path: string }> {
  const paths = new Set<string>()
  return [...rows].sort((left, right) => String(right.updated_at || '').localeCompare(String(left.updated_at || '')) || String(left.id || '').localeCompare(String(right.id || ''))).flatMap(row => {
    if (!String(row.slug || '').trim()) return []
    const source = canonicalSource(row.source)
    const canonical_path = canonicalOpportunityPathForRow({ ...row, slug: String(row.slug) })
    if (paths.has(canonical_path)) return []
    paths.add(canonical_path)
    return [{ ...row, source, canonical_source: source, canonical_path }]
  })
}

export function seoCanonicalPaths(rows: Array<Pick<PublicSeoRow, 'canonical_path'>>): string[] {
  return Array.from(new Set(rows.map(row => row.canonical_path))).sort()
}
