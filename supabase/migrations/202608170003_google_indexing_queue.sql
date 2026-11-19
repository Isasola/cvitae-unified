-- Google Indexing Queue: tracks URL_UPDATED and URL_DELETED events for Google Indexing API.
-- While SEO_DRY_RUN=true (default), rows are inserted with status='dry_run' and never sent to Google.
CREATE TABLE IF NOT EXISTS google_indexing_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  url text NOT NULL,
  opportunity_id text REFERENCES opportunities(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (event_type IN ('URL_UPDATED', 'URL_DELETED')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'success', 'failed', 'dead_letter', 'dry_run')),
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz DEFAULT now(),
  last_error text,
  google_response jsonb,
  dry_run boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_google_indexing_queue_status
  ON google_indexing_queue(status, next_attempt_at)
  WHERE status IN ('pending', 'failed');

CREATE INDEX IF NOT EXISTS idx_google_indexing_queue_opportunity
  ON google_indexing_queue(opportunity_id)
  WHERE opportunity_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_google_indexing_queue_url
  ON google_indexing_queue(url, event_type);
