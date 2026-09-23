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
