ALTER TABLE public.scraper_runs
  ADD COLUMN IF NOT EXISTS valid_count integer,
  ADD COLUMN IF NOT EXISTS unique_count integer,
  ADD COLUMN IF NOT EXISTS updated_count integer,
  ADD COLUMN IF NOT EXISTS duplicate_count integer,
  ADD COLUMN IF NOT EXISTS rejected_count integer;
