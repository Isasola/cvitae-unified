import { publicDistributionProjection, type SourcePolicyRow } from './effective-source-policy'
import { canonicalOpportunityPathForRow } from './opportunity-truth'

export type PublicSeoRow = Record<string, any> & {
  canonical_source: string
  canonical_path: string
  distribution: ReturnType<typeof publicDistributionProjection>
}

/** The sole effective SEO selection. Static consumers use its generated JSON. */
export function buildEffectiveSeoInventory(rows: Record<string, any>[], policies: SourcePolicyRow[]): PublicSeoRow[] {
  const paths = new Set<string>()
  return [...rows].sort((left, right) => String(right.updated_at || '').localeCompare(String(left.updated_at || '')) || String(left.id || '').localeCompare(String(right.id || ''))).flatMap(row => {
    const distribution = publicDistributionProjection(row, policies)
    if (!distribution.seo.allowed || !String(row.slug || '').trim()) return []
    const canonical_path = canonicalOpportunityPathForRow({ ...row, slug: String(row.slug) })
    if (paths.has(canonical_path)) return []
    paths.add(canonical_path)
    return [{ ...row, source: distribution.canonicalSource, canonical_source: distribution.canonicalSource, canonical_path, distribution }]
  })
}

export function seoCanonicalPaths(rows: Array<Pick<PublicSeoRow, 'canonical_path'>>): string[] {
  return Array.from(new Set(rows.map(row => row.canonical_path))).sort()
}
