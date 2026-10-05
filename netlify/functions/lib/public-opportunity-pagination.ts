export const PUBLIC_CATALOG_PAGE_SIZE = 100
export type CatalogCursor = { at: string | null; id: string }
export function publicCatalogQuery(params: Record<string, string | undefined> = {}) {
  let cursor: CatalogCursor | null = null
  if (params.cursor) {
    if (params.cursor.length > 500) throw new Error('INVALID_CURSOR')
    cursor = JSON.parse(params.cursor)
    if (!cursor || typeof cursor.id !== 'string' || cursor.id.length > 100 ||
      (cursor.at !== null && (typeof cursor.at !== 'string' || !Number.isFinite(Date.parse(cursor.at))))) throw new Error('INVALID_CURSOR')
  }
  const types = params.types ? JSON.parse(params.types) : null
  if (types !== null && (!Array.isArray(types) || types.length > 20 || types.some(v => typeof v !== 'string' || v.length > 60))) throw new Error('INVALID_TYPES')
  if ((params.q || '').length > 200 || (params.area || '').length > 120) throw new Error('INVALID_FILTER')
  return {
    p_query: params.q || '', p_area: params.area || null, p_types: types,
    p_mode: ['all','jobs','non_jobs'].includes(params.mode || '') ? params.mode : 'all',
    p_after_updated_at: cursor?.at || null, p_after_id: cursor?.id || null,
    p_limit: PUBLIC_CATALOG_PAGE_SIZE + 1,
  }
}
export function publicCatalogPage<T extends { id: string; updated_at?: string | null }>(rows: T[]) {
  const page = rows.slice(0, PUBLIC_CATALOG_PAGE_SIZE)
  const last = page.at(-1)
  return { rows: page, nextCursor: rows.length > PUBLIC_CATALOG_PAGE_SIZE && last
    ? JSON.stringify({ at: last.updated_at || null, id: last.id } satisfies CatalogCursor) : null }
}
