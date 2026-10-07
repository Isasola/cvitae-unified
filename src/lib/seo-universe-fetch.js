import { fetchPagesById } from './paged-fetch.js'

export const SEO_UNIVERSE_PAGE_SIZE = 250

/**
 * Shared build/runtime traversal of the existing canonical SEO projection.
 * Database order is solely id ASC; the build's canonical final sort is separate.
 * @param {any} db
 * @param {string} columns Must include id for the cursor guard.
 */
export function seoUniversePages(db, columns) {
  return fetchPagesById(SEO_UNIVERSE_PAGE_SIZE, async (cursor, size) => {
    let query = db.from('opportunity_seo_universe').select(columns)
      .not('slug', 'is', null).order('id', { ascending: true }).limit(size)
    if (cursor !== null) query = query.gt('id', cursor)
    const { data, error } = await query
    if (error) throw error
    if (!Array.isArray(data)) throw new Error('SEO_UNIVERSE_INVALID_PAGE')
    return data
  })
}
