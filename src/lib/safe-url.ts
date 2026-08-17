/**
 * URL sanitization to prevent javascript:/data: XSS in href and window.open calls.
 * Only http:// and https:// are allowed. Anything else returns '#'.
 */

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:'])

export function safeExternalUrl(raw: string | null | undefined): string {
  if (!raw || typeof raw !== 'string') return '#'
  const trimmed = raw.trim()
  if (!trimmed) return '#'
  try {
    const url = new URL(trimmed)
    return ALLOWED_PROTOCOLS.has(url.protocol) ? trimmed : '#'
  } catch {
    // Relative URL or malformed — not a valid external link
    return '#'
  }
}
