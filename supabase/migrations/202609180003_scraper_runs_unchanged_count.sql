-- Expose unchanged_count so Source Intelligence dashboards can distinguish
-- INSERT/UPDATE/UNCHANGED/REJECTED without relying on log parsing.
ALTER TABLE public.scraper_runs
  ADD COLUMN IF NOT EXISTS unchanged_count integer
    CHECK (unchanged_count IS NULL OR unchanged_count >= 0);

COMMENT ON COLUMN public.scraper_runs.unchanged_count IS
  'Opportunities seen in this run whose content_fingerprint matched an existing DB row — skipped without write.';
