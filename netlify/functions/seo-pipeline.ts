/**
 * SEO Pipeline HTTP endpoint.
 * POST /api/seo-pipeline
 * Body: { opportunityId: string }
 * Validates admin auth, then runs the pipeline via the shared runner.
 */

import type { Handler } from '@netlify/functions'
import { runSeoPipeline } from './lib/seo-pipeline-runner'
import { serverSeoFlags } from './lib/seo-flags'
import { makeSupabaseAdmin } from './_supabase'

const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  const flags = serverSeoFlags()

  if (!flags.SEO_PIPELINE_V2) {
    return {
      statusCode: 200,
      body: JSON.stringify({ skipped: true, reason: 'SEO_PIPELINE_V2 flag is off' }),
    }
  }

  let opportunityId: string
  try {
    const body = JSON.parse(event.body || '{}')
    opportunityId = body.opportunityId
    if (!opportunityId || typeof opportunityId !== 'string') {
      return { statusCode: 400, body: JSON.stringify({ error: 'opportunityId required' }) }
    }
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) }
  }

  const supabase = makeSupabaseAdmin()

  const result = await runSeoPipeline(supabase, opportunityId, flags.SEO_DRY_RUN)
  return { statusCode: 200, body: JSON.stringify(result) }
}

export { handler }
