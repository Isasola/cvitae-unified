import { createHash } from "node:crypto"
import { makeSupabaseAdmin, makeSupabaseAnon } from "../_supabase"

const DEFAULT_SITE_URL = "https://cvitae.lat"
const LOCAL_ORIGINS = new Set([
  "http://127.0.0.1:5173",
  "http://localhost:5173",
  "http://127.0.0.1:8888",
  "http://localhost:8888",
])

function header(event: any, name: string): string {
  const headers = event?.headers || {}
  return String(headers[name.toLowerCase()] || headers[name] || "").trim()
}

function configuredOrigins(): Set<string> {
  const origins = new Set(LOCAL_ORIGINS)
  origins.add(DEFAULT_SITE_URL)
  for (const value of [process.env.SITE_URL, process.env.URL, process.env.DEPLOY_PRIME_URL]) {
    if (!value) continue
    try {
      origins.add(new URL(value).origin)
    } catch {
      // Ignore malformed environment values instead of reflecting them.
    }
  }
  return origins
}

export function requestOrigin(event: any): string {
  return header(event, "origin")
}

export function isAllowedOrigin(event: any): boolean {
  const origin = requestOrigin(event)
  return !origin || configuredOrigins().has(origin)
}

export function securityHeaders(event: any, extra: Record<string, string> = {}): Record<string, string> {
  const origin = requestOrigin(event)
  const allowedOrigin = origin && configuredOrigins().has(origin) ? origin : DEFAULT_SITE_URL
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Cache-Control": "private, no-store",
    "Content-Type": "application/json; charset=utf-8",
    "Vary": "Origin",
    "X-Content-Type-Options": "nosniff",
    ...extra,
  }
}

export function jsonResponse(event: any, statusCode: number, body: unknown, extraHeaders: Record<string, string> = {}) {
  return {
    statusCode,
    headers: securityHeaders(event, extraHeaders),
    body: JSON.stringify(body),
  }
}

export function rejectInvalidOrigin(event: any) {
  if (isAllowedOrigin(event)) return null
  return jsonResponse(event, 403, { error: "Origen no permitido" })
}

export function bearerToken(event: any): string {
  return header(event, "authorization").replace(/^Bearer\s+/i, "").trim()
}

export async function authenticatedUser(event: any): Promise<{ user: any | null; error: string | null }> {
  const token = bearerToken(event)
  if (!token) return { user: null, error: "Sesión requerida" }
  const { data: { user }, error } = await makeSupabaseAnon().auth.getUser(token)
  if (error || !user) return { user: null, error: "Sesión inválida o expirada" }
  return { user, error: null }
}

export function clientIp(event: any): string {
  const direct = header(event, "x-nf-client-connection-ip") || header(event, "client-ip")
  const forwarded = header(event, "x-forwarded-for").split(",")[0]?.trim()
  return String(direct || forwarded || "unknown").slice(0, 128)
}

function subjectHash(scope: string, subject: string): string {
  const salt = process.env.CVITAE_RATE_LIMIT_SALT || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!salt) throw new Error("Rate limit salt is not configured")
  return createHash("sha256").update(`${salt}:${scope}:${subject}`).digest("hex")
}

export async function consumeRateLimit(options: {
  scope: string
  subject: string
  limit: number
  windowSeconds: number
}): Promise<{ allowed: boolean; remaining: number; retryAfter: number }> {
  // Pure handler tests do not have a database. This value is set only inside
  // the repository test process; HTTP input cannot influence environment vars.
  if (process.env.CVITAE_TEST_RATE_LIMIT_MODE === "bypass-unit-tests") {
    return { allowed: true, remaining: options.limit - 1, retryAfter: 0 }
  }
  const { data, error } = await makeSupabaseAdmin().rpc("consume_api_rate_limit", {
    p_scope: options.scope,
    p_subject_hash: subjectHash(options.scope, options.subject),
    p_limit: options.limit,
    p_window_seconds: options.windowSeconds,
  })
  if (error) throw new Error(`Rate limit unavailable: ${error.message}`)
  const result = Array.isArray(data) ? data[0] : data
  if (!result) throw new Error("Rate limit returned no result")
  return {
    allowed: Boolean(result.allowed),
    remaining: Number(result.remaining || 0),
    retryAfter: Number(result.retry_after_seconds || 0),
  }
}

export function rateLimitHeaders(limit: { remaining: number; retryAfter: number }): Record<string, string> {
  return {
    "X-RateLimit-Remaining": String(Math.max(0, limit.remaining)),
    ...(limit.retryAfter > 0 ? { "Retry-After": String(limit.retryAfter) } : {}),
  }
}
