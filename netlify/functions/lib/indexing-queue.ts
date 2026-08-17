import type { SupabaseClient } from '@supabase/supabase-js'

export type IndexingEventType = 'URL_UPDATED' | 'URL_DELETED'

interface EnqueueOptions {
  url: string
  opportunityId?: string
  eventType: IndexingEventType
  supabase: SupabaseClient
  dryRun?: boolean
}

export async function enqueueIndexingEvent(opts: EnqueueOptions): Promise<void> {
  const { url, opportunityId, eventType, supabase } = opts
  const dryRun = opts.dryRun ?? (process.env.SEO_DRY_RUN !== 'false')
  const status = dryRun ? 'dry_run' : 'pending'

  const { error } = await supabase.from('google_indexing_queue').insert({
    url,
    opportunity_id: opportunityId ?? null,
    event_type: eventType,
    status,
    dry_run: dryRun,
    next_attempt_at: new Date().toISOString(),
  })

  if (error) {
    console.error('[indexing-queue] insert error', error.message)
    return
  }

  if (dryRun) {
    console.log(`[indexing-queue] DRY_RUN ${eventType} queued (not sent to Google): ${url}`)
  } else {
    console.log(`[indexing-queue] ${eventType} queued for processing: ${url}`)
  }
}
