-- P0.2: Allow 'scan' trigger_type + add scan_request_id column.
-- The old inline CHECK had auto-generated name scraper_runs_trigger_type_check.
-- Extending it to include 'scan' fixes the INSERT failure that kept admin
-- scans in QUEUED state forever.
alter table public.scraper_runs
  drop constraint if exists scraper_runs_trigger_type_check;

alter table public.scraper_runs
  add constraint scraper_runs_trigger_type_check
    check (trigger_type in ('schedule', 'manual', 'local', 'scan'));

-- Dedicated column for scan correlation (replaces the old scan:UUID encoding).
alter table public.scraper_runs
  add column if not exists scan_request_id text;

create index if not exists scraper_runs_scan_request_idx
  on public.scraper_runs (scan_request_id)
  where scan_request_id is not null;

comment on column public.scraper_runs.scan_request_id is
  'UUID issued by trigger_source_scan admin action. Used by source_scan_status to correlate run status without encoding into trigger_type.';
