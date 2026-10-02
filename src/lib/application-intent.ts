const KEY = 'cvitae_application_return_to_v1'

export function applicationReturnTo(slug: string) {
  return `/mi-carrera/postular/${encodeURIComponent(slug)}`
}

export function isSafeApplicationReturnTo(value: unknown): value is string {
  return typeof value === 'string' && /^\/mi-carrera\/postular\/[^/?#]+$/.test(value)
}

export function rememberApplicationReturnTo(value: string) {
  if (!isSafeApplicationReturnTo(value)) return
  try { sessionStorage.setItem(KEY, value) } catch { /* storage is optional */ }
}

export function consumeApplicationReturnTo(value?: string | null) {
  const candidate = value || (() => { try { return sessionStorage.getItem(KEY) } catch { return null } })()
  try { sessionStorage.removeItem(KEY) } catch { /* storage is optional */ }
  return isSafeApplicationReturnTo(candidate) ? candidate : null
}
