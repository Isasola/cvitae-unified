-- Data lifecycle: retention policy + pg_cron auto-cleanup.
-- Fixes: scraper_runs and match_results growing unbounded → query timeouts.
-- Strategy: delete old operational logs, archive (not delete) dead opportunities
-- so source deduplication stays intact.

-- ── Extension ────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ── BRIN index on scraper_runs.started_at for fast range deletes ─────────────
-- The existing (scraper_id, started_at DESC) index is for lookups by source.
-- A BRIN index on started_at alone accelerates time-range DELETE statements.
CREATE INDEX IF NOT EXISTS idx_scraper_runs_started_at_brin
  ON public.scraper_runs USING brin (started_at);

-- ── BRIN index on opportunity_match_results.created_at ───────────────────────
CREATE INDEX IF NOT EXISTS idx_match_results_created_at_brin
  ON public.opportunity_match_results USING brin (created_at);

-- ── Immediate cleanup — scraper_runs older than 60 days ──────────────────────
-- These rows are operational logs. Nothing outside this table references them
-- by FK. The maintenance script only reads the most recent run (LIMIT 1).
DELETE FROM public.scraper_runs
WHERE started_at < NOW() - INTERVAL '60 days';

-- ── Immediate cleanup — non-confirmed match results older than 30 days ────────
-- Confirmed matches are preserved. Non-confirmed old rows add no value
-- and prevent the index from staying lean.
DELETE FROM public.opportunity_match_results
WHERE created_at < NOW() - INTERVAL '30 days'
  AND (confirmed IS NULL OR confirmed = false);

-- ── Archive dead opportunities — never hard-delete ───────────────────────────
-- Hard deletion would break source deduplication: the scraper would re-insert
-- the same opportunity on the next run. Setting archived_at removes them from
-- all active views (which filter archived_at IS NULL) while keeping the row for
-- native_posting_id uniqueness checks.
UPDATE public.opportunities
SET archived_at = NOW()
WHERE archived_at IS NULL
  AND (
    -- Soft-deleted and old enough to archive
    (deleted_at IS NOT NULL AND deleted_at < NOW() - INTERVAL '30 days')
    OR
    -- Rejected, never active, and older than 90 days
    (
      verification_status = 'rejected'
      AND created_at < NOW() - INTERVAL '90 days'
      AND catalog_eligible = false
      AND match_eligible = false
    )
  );

-- ── pg_cron weekly job — every Sunday at 03:00 UTC ───────────────────────────
DO $$
BEGIN
  PERFORM cron.unschedule('cvitae-data-retention');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'cvitae-data-retention',
  '0 3 * * 0',
  $cron$
    DELETE FROM public.scraper_runs
    WHERE started_at < NOW() - INTERVAL '60 days';

    DELETE FROM public.opportunity_match_results
    WHERE created_at < NOW() - INTERVAL '30 days'
      AND (confirmed IS NULL OR confirmed = false);

    UPDATE public.opportunities
    SET archived_at = NOW()
    WHERE archived_at IS NULL
      AND deleted_at IS NOT NULL
      AND deleted_at < NOW() - INTERVAL '30 days';
  $cron$
);
