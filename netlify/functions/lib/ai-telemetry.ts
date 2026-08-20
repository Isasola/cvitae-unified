import { randomUUID } from 'node:crypto'

export interface AiTelemetry {
  provider: 'gemini' | 'bedrock'
  model: string
  feature: string
  trigger: 'user_action' | 'system' | 'background'
  actor: 'user' | 'admin' | 'system'
  cacheHit?: boolean
  requestId?: string
  inputTokens?: number | null
  outputTokens?: number | null
}

async function providerUsage(value: any): Promise<{ input: number | null; output: number | null }> {
  try {
    let body: any = null
    if (value instanceof Response) body = await value.clone().json()
    else if (value?.body) body = JSON.parse(new TextDecoder().decode(value.body))
    return {
      input: Number(body?.usage?.input_tokens ?? body?.usageMetadata?.promptTokenCount) || null,
      output: Number(body?.usage?.output_tokens ?? body?.usageMetadata?.candidatesTokenCount) || null,
    }
  } catch {
    return { input: null, output: null }
  }
}

/**
 * Minimal, metadata-only telemetry. It deliberately logs no prompt, CV,
 * opportunity HTML, user email, or model response.
 */
export async function observeAiCall<T>(meta: AiTelemetry, operation: () => Promise<T>): Promise<T> {
  const started = Date.now()
  const requestId = meta.requestId || randomUUID()
  try {
    const value = await operation()
    const usage = await providerUsage(value)
    const providerError = value instanceof Response && !value.ok
    const log = providerError ? console.error : console.info
    log('[ai_telemetry]', JSON.stringify({
      provider: meta.provider,
      model: meta.model,
      feature: meta.feature,
      timestamp: new Date().toISOString(),
      trigger: meta.trigger,
      actor: meta.actor,
      cache_hit: meta.cacheHit === true,
      request_id: requestId,
      input_tokens: meta.inputTokens ?? usage.input,
      output_tokens: meta.outputTokens ?? usage.output,
      duration_ms: Date.now() - started,
      status: providerError ? 'provider_error' : 'success',
      error: providerError ? `HTTP_${value.status}` : null,
    }))
    return value
  } catch (error: any) {
    console.error('[ai_telemetry]', JSON.stringify({
      provider: meta.provider,
      model: meta.model,
      feature: meta.feature,
      timestamp: new Date().toISOString(),
      trigger: meta.trigger,
      actor: meta.actor,
      cache_hit: meta.cacheHit === true,
      request_id: requestId,
      input_tokens: meta.inputTokens ?? null,
      output_tokens: meta.outputTokens ?? null,
      duration_ms: Date.now() - started,
      status: 'error',
      error: String(error?.name || 'Error').slice(0, 120),
    }))
    throw error
  }
}
