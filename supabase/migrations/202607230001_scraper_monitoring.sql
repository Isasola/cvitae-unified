create table if not exists public.scraper_runs (
  id uuid primary key default gen_random_uuid(),
  run_id text not null,
  scraper_id text not null check (scraper_id ~ '^[a-z0-9_]+$'),
  scraper_name text not null check (char_length(scraper_name) between 1 and 120),
  script_path text not null check (char_length(script_path) between 1 and 240),
  trigger_type text not null default 'schedule'
    check (trigger_type in ('schedule', 'manual', 'local')),
  status text not null
    check (status in ('running', 'healthy', 'warning', 'failed', 'timeout')),
  exit_code integer,
  found_count integer check (found_count is null or found_count >= 0),
  inserted_count integer check (inserted_count is null or inserted_count >= 0),
  warning_count integer not null default 0 check (warning_count >= 0),
  error_count integer not null default 0 check (error_count >= 0),
  error_summary text check (char_length(error_summary) <= 2000),
  log_excerpt text check (char_length(log_excerpt) <= 12000),
  github_run_url text check (github_run_url is null or char_length(github_run_url) <= 500),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists scraper_runs_scraper_started_idx
  on public.scraper_runs (scraper_id, started_at desc);
create index if not exists scraper_runs_status_started_idx
  on public.scraper_runs (status, started_at desc);
create unique index if not exists scraper_runs_run_scraper_idx
  on public.scraper_runs (run_id, scraper_id);

alter table public.scraper_runs enable row level security;

revoke all on table public.scraper_runs from anon, authenticated;
grant all on table public.scraper_runs to service_role;

drop policy if exists "service_role_only_scraper_runs" on public.scraper_runs;
create policy "service_role_only_scraper_runs"
  on public.scraper_runs
  for all
  to service_role
  using (true)
  with check (true);

comment on table public.scraper_runs is
  'Private execution telemetry for CVitae scrapers. Read through protected admin functions only.';
