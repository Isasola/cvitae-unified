-- Durable, resumable Admin reconciliation control-plane state.
-- Local only: do not apply outside the coordinated deployment sequence.
create table if not exists public.inventory_reconciliation_jobs (
  reconciliation_id uuid primary key,
  source_scope text not null default 'all',
  mode text not null check (mode in ('DRY_RUN', 'APPLY')),
  status text not null check (status in ('QUEUED', 'RUNNING', 'PARTIAL', 'SUCCESS', 'WARNING', 'FAILED')),
  cursor_offset bigint not null default 0 check (cursor_offset >= 0),
  page_size integer not null default 250 check (page_size between 1 and 500),
  started_at timestamptz,
  updated_at timestamptz not null default now(),
  finished_at timestamptz,
  examined bigint not null default 0,
  would_change bigint not null default 0,
  changed bigint not null default 0,
  unchanged bigint not null default 0,
  failed bigint not null default 0,
  reason_counts jsonb not null default '{}'::jsonb,
  last_error text,
  actor text not null default 'admin',
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists inventory_reconciliation_jobs_status_updated_idx
  on public.inventory_reconciliation_jobs (status, updated_at desc);

alter table public.inventory_reconciliation_jobs enable row level security;
revoke all on table public.inventory_reconciliation_jobs from public, anon, authenticated;
grant select, insert, update on table public.inventory_reconciliation_jobs to service_role;

-- The table is the durable request/checkpoint record. Opportunity patches remain
-- owned by the server-side Admin boundary, which re-evaluates rows per chunk.
