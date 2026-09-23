/** Canonical non-opportunity sitemap rows shared by build and runtime. */
export function canonicalSitemapRows(prefix, rows) {
  const seen = new Set()
  return rows.flatMap(row => {
    const slug = String(row.slug || '').trim()
    const canonical_path = slug ? `${prefix}/${slug}` : ''
    if (!canonical_path || seen.has(canonical_path)) return []
    seen.add(canonical_path)
    return [{ canonical_path, updated_at: row.updated_at || row.created_at || null }]
  })
}
export function sitemapIndexEntries(opportunityCount, blogCount = 0, vacancyCount = 0, pageSize = 1000) {
  return [
    'sitemap-static.xml',
    ...(blogCount ? ['sitemap-blog.xml'] : []),
    ...(vacancyCount ? ['sitemap-vacancies.xml'] : []),
    ...Array.from({ length: Math.ceil(opportunityCount / pageSize) }, (_, i) => `sitemap-opportunities-${i + 1}.xml`),
  ]
}
