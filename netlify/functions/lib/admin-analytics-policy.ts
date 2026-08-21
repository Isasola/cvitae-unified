export const CLOSED_ANALYTICS_RANGES = {
  current7d: { startDate: '7daysAgo', endDate: 'yesterday' },
  previous7d: { startDate: '14daysAgo', endDate: '8daysAgo' },
} as const

export const GEMINI_ANALYTICS_TIMEOUT_MS = 20_000

export function analyticsAiRequested(body: unknown): boolean {
  if (!body || typeof body !== 'object') return false
  const value = body as { includeAi?: unknown; question?: unknown }
  return value.includeAi === true
    || (typeof value.question === 'string' && value.question.trim().length > 0)
}

export function analyticsGeminiConfigured(apiKey: string | undefined): boolean {
  return Boolean(apiKey?.trim())
}
