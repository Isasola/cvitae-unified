import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { buildOpportunityEmbeddingText } from '../_shared/embedding.ts'
import { isServiceRoleRequest } from '../_shared/service-auth.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const supabase = createClient(supabaseUrl, serviceRoleKey)
let embeddingSession: any

function getEmbeddingSession() {
  // Reuse the model inside a warm worker. Recreating it on every scheduled
  // request accumulates native resources and eventually produces HTTP 546.
  // @ts-ignore Supabase Edge Runtime API
  embeddingSession ??= new Supabase.ai.Session('gte-small')
  return embeddingSession
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 })
  }

  if (!isServiceRoleRequest(req, serviceRoleKey)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  if (Deno.env.get('DISABLE_EMBEDDINGS') === 'true') {
    return new Response(JSON.stringify({ done: false, processed: 0, disabled: true }), { status: 200 })
  }

  const body = await req.json().catch(() => ({}))
  // gte-small is CPU intensive inside the Edge worker. Keeping each invocation
  // small avoids WORKER_RESOURCE_LIMIT while the scheduled job advances in batches.
  const limit = Math.min(5, Math.max(1, Number(body?.limit) || 5))
  const { data: opportunities, error } = await supabase
    .from('opportunities')
    .select('id,title,organization,rubro,type,opportunity_type,opportunity_kind,tags,location,country_code,eligible_countries,description')
    .eq('is_active', true)
    .eq('verification_status', 'verified')
    .eq('match_eligible', true)
    .is('deleted_at', null)
    .is('archived_at', null)
    .is('embedding', null)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  if (!opportunities?.length) {
    return new Response(JSON.stringify({ done: true, selected: 0, processed: 0, failed: 0 }), { status: 200 })
  }

  const session = getEmbeddingSession()
  let processed = 0
  const failures: Array<{ id: string; error: string }> = []

  for (const opportunity of opportunities) {
    try {
      const text = buildOpportunityEmbeddingText(opportunity)
      if (!text) throw new Error('No hay contenido indexable')
      const result = await session.run(text, { mean_pool: true, normalize: true })
      const { error: updateError } = await supabase
        .from('opportunities')
        .update({ embedding: Array.from(result) })
        .eq('id', opportunity.id)
        .is('embedding', null)
      if (updateError) throw updateError
      processed++
    } catch (embeddingError) {
      failures.push({
        id: String(opportunity.id),
        error: embeddingError instanceof Error ? embeddingError.message.slice(0, 240) : 'Error desconocido',
      })
    }
  }

  return new Response(JSON.stringify({
    done: opportunities.length < limit && failures.length === 0,
    selected: opportunities.length,
    processed,
    failed: failures.length,
    failures: failures.slice(0, 10),
  }), {
    status: failures.length === opportunities.length ? 500 : 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  })
})
