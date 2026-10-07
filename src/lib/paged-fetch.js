/**
 * Fetches to end-of-data; callers choose deterministic ordering and fail closed on errors.
 * @template T
 * @param {number} pageSize
 * @param {(offset: number, size: number) => Promise<T[]>} fetchPage
 * @returns {Promise<T[]>}
 */
export async function fetchAllPages(pageSize, fetchPage) {
  const rows = []
  for (let offset = 0; ; offset += pageSize) {
    const page = await fetchPage(offset, pageSize)
    rows.push(...page)
    if (page.length < pageSize) return rows
  }
}

/**
 * Walks an id-ascending query to end-of-data, holding only the current page.
 * No total-row ceiling; a short/empty page is the only completion condition.
 * @template {{ id: string }} T
 * @param {number} pageSize
 * @param {(cursor: string | null, size: number) => Promise<T[]>} fetchPage
 * @returns {AsyncGenerator<T[]>}
 */
export async function* fetchPagesById(pageSize, fetchPage) {
  if (!Number.isSafeInteger(pageSize) || pageSize < 1) throw new Error('KEYSET_INVALID_PAGE_SIZE')
  let cursor = null
  for (;;) {
    const page = await fetchPage(cursor, pageSize)
    if (!Array.isArray(page) || page.length > pageSize) throw new Error('KEYSET_INVALID_PAGE')
    if (!page.length) return
    let lastId = cursor
    for (const row of page) {
      if (typeof row.id !== 'string' || !row.id.trim() || (lastId !== null && row.id <= lastId)) {
        throw new Error('KEYSET_CURSOR_NOT_ADVANCING')
      }
      lastId = row.id
    }
    cursor = lastId
    yield page
    if (page.length < pageSize) return
  }
}
