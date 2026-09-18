-- Minimal, append-only schema for Opportunity Intelligence Pipeline V2.
-- No backfill and no data mutation are performed by this migration.

alter table public.scraper_runs
  add column if not exists adapter_version text null,
  add column if not exists extraction_metrics jsonb null;

comment on column public.scraper_runs.adapter_version is
  'Version of the source-specific extraction adapter used by this run.';
comment on column public.scraper_runs.extraction_metrics is
  'Flexible per-run extraction metrics: detail attempts/success, parsing, coverage and classification counts.';

create table if not exists public.opportunity_enrichment_events (
  id uuid primary key default gen_random_uuid(),
  opportunity_id text not null,
  source text not null,
  adapter_version text null,
  source_url text null,
  canonical_url text null,
  changed_fields text[] not null default '{}'::text[],
  before_fields jsonb not null default '{}'::jsonb,
  after_fields jsonb not null default '{}'::jsonb,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.opportunity_enrichment_events is
  'Append-only audit events for deterministic opportunity enrichment by source adapters.';
comment on column public.opportunity_enrichment_events.evidence is
  'Compact extraction evidence only (method, fields, confidence, status); never store a full HTML snapshot.';

create index if not exists opportunity_enrichment_events_opportunity_created_idx
  on public.opportunity_enrichment_events (opportunity_id, created_at desc);
create index if not exists opportunity_enrichment_events_source_created_idx
  on public.opportunity_enrichment_events (source, created_at desc);

alter table public.opportunity_enrichment_events enable row level security;

revoke all on table public.opportunity_enrichment_events from public, anon, authenticated;
grant select, insert on table public.opportunity_enrichment_events to service_role;
