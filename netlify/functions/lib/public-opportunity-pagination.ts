export type PageFetcher<T> = (offset: number, pageSize: number) => Promise<T[]>

/**
 * Bounded by the requested public result count, not by an arbitrary raw-row
 * ceiling. The backend query remains paged and stops only at end-of-data.
 */
export async function collectAllowedPages<T>(options: {
  target: number
  pageSize: number
  fetchPage: PageFetcher<T>
  allowed: (row: T) => boolean
}): Promise<T[]> {
  const result: T[] = []
  for (let offset = 0; result.length < options.target; offset += options.pageSize) {
    const page = await options.fetchPage(offset, options.pageSize)
    result.push(...page.filter(options.allowed))
    if (page.length < options.pageSize) break
  }
  return result.slice(0, options.target)
}
