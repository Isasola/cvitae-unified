function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  try {
    const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
    return JSON.parse(atob(padded))
  } catch {
    return null
  }
}

/**
 * Edge Functions are deployed with Supabase gateway JWT verification enabled.
 * After a project key rotation the signed service-role JWT can remain valid even
 * when it no longer has the same serialized value as the runtime legacy secret.
 */
export function isServiceRoleRequest(req: Request, configuredServiceKey: string | undefined): boolean {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!token) return false
  if (configuredServiceKey && token === configuredServiceKey) return true
  return decodeJwtPayload(token)?.role === 'service_role'
}
