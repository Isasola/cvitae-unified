/**
 * PostgREST serializes pgvector columns as strings ("[0.1,0.2,...]").
 * Supabase clients may also return a numeric array depending on the transport.
 */
export function parsePgVector(value: unknown): number[] | null {
  let candidate: unknown = value

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) return null
    try {
      candidate = JSON.parse(trimmed)
    } catch {
      return null
    }
  }

  if (!Array.isArray(candidate) || candidate.length === 0) return null
  const vector = candidate.map(Number)
  return vector.every(Number.isFinite) ? vector : null
}
