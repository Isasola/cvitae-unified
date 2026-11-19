-- Data lifecycle: retention policy + pg_cron auto-cleanup.
-- Fixes: scraper_runs growing unbounded → query timeouts and disk IO.
-- Note: matching_retrieval_candidates already has prune_matching_retrieval_candidates()
-- so we only manage scraper_runs and stale opportunities here.

-- ── Extension ────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ── BRIN index on scraper_runs.started_at for fast range deletes ─────────────
CREATE INDEX IF NOT EXISTS idx_scraper_runs_started_at_brin
  ON public.scraper_runs USING brin (started_at);

-- ── Immediate cleanup — scraper_runs older than 60 days ──────────────────────
DELETE FROM public.scraper_runs
WHERE started_at < NOW() - INTERVAL '60 days';

-- ── Archive dead opportunities — never hard-delete ───────────────────────────
-- Hard deletion would break source deduplication.
UPDATE public.opportunities
SET archived_at = NOW()
WHERE archived_at IS NULL
  AND (
    (deleted_at IS NOT NULL AND deleted_at < NOW() - INTERVAL '30 days')
    OR
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

    UPDATE public.opportunities
    SET archived_at = NOW()
    WHERE archived_at IS NULL
      AND deleted_at IS NOT NULL
      AND deleted_at < NOW() - INTERVAL '30 days';
  $cron$
);
