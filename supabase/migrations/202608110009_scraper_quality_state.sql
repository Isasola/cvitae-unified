ALTER TABLE public.scraper_controls
  ADD COLUMN IF NOT EXISTS quality_status text NOT NULL DEFAULT 'untested',
  ADD COLUMN IF NOT EXISTS last_run_status text,
  ADD COLUMN IF NOT EXISTS last_run_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_found_count integer,
  ADD COLUMN IF NOT EXISTS last_inserted_count integer,
  ADD COLUMN IF NOT EXISTS last_error_summary text,
  ADD COLUMN IF NOT EXISTS last_audited_at timestamptz;

ALTER TABLE public.scraper_controls DROP CONSTRAINT IF EXISTS scraper_controls_quality_status_check;
ALTER TABLE public.scraper_controls ADD CONSTRAINT scraper_controls_quality_status_check
  CHECK (quality_status IN ('untested', 'healthy', 'degraded', 'unproductive', 'broken'));

WITH latest AS (
  SELECT DISTINCT ON (scraper_id)
    scraper_id, status, finished_at, found_count, inserted_count, error_summary
  FROM public.scraper_runs
  ORDER BY scraper_id, started_at DESC
)
UPDATE public.scraper_controls controls
SET last_run_status = latest.status,
    last_run_at = latest.finished_at,
    last_found_count = latest.found_count,
    last_inserted_count = latest.inserted_count,
    last_error_summary = latest.error_summary,
    quality_status = CASE
      WHEN latest.status IN ('failed', 'timeout') THEN 'broken'
      WHEN latest.status = 'warning' THEN 'degraded'
      WHEN coalesce(latest.found_count, 0) = 0 THEN 'unproductive'
      WHEN coalesce(latest.inserted_count, 0) > 0 THEN 'healthy'
      ELSE 'degraded'
    END
FROM latest
WHERE controls.scraper_id = latest.scraper_id;
