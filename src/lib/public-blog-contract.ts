export type PublicBlogRow = {
  tipo?: unknown
  is_active?: unknown
  slug?: unknown
  titulo?: unknown
  fecha_vencimiento?: unknown
  metadata?: unknown
}

const BLOG_SLUG = /^[a-z0-9][a-z0-9._-]{0,119}$/i

export function isValidPublicBlogSlug(value: unknown): value is string {
  return typeof value === 'string' && BLOG_SLUG.test(value) && value !== '.' && value !== '..'
}

export function publicBlogExclusionReason(row: PublicBlogRow | null | undefined, now = Date.now()): string | null {
  if (!row || row.tipo !== 'blog') return 'NOT_BLOG_CONTENT'
  if (row.is_active !== true) return 'BLOG_NOT_ACTIVE'
  if (!isValidPublicBlogSlug(row.slug)) return 'BLOG_SLUG_INVALID'
  if (typeof row.titulo !== 'string' || !row.titulo.trim()) return 'BLOG_TITLE_MISSING'
  if (row.fecha_vencimiento !== null && row.fecha_vencimiento !== undefined && row.fecha_vencimiento !== '') {
    const expiry = Date.parse(String(row.fecha_vencimiento))
    if (!Number.isFinite(expiry)) return 'BLOG_EXPIRY_INVALID'
    if (expiry <= now) return 'BLOG_EXPIRED'
  }
  const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata as Record<string, any> : {}
  if (metadata.auto_generated === true && metadata.approval?.status !== 'PUBLISHED') return 'GENERATED_BLOG_NOT_PUBLISHED'
  return null
}

/** content_hub is the publication authority; active manual posts retain the editorial transition. */
export function isCurrentPublicBlog(row: PublicBlogRow | null | undefined, now = Date.now()): row is PublicBlogRow & { tipo: 'blog'; is_active: true; slug: string; titulo: string } {
  return publicBlogExclusionReason(row, now) === null
}
