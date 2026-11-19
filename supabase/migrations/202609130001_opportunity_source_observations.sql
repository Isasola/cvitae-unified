-- Durable, append-only source-detail observations for bounded enrichment runs.
-- This migration creates schema only: no opportunity rows are changed.

create table if not exists public.opportunity_source_observations (
  id uuid primary key default gen_random_uuid(),
  opportunity_id text not null,
  source text not null,
  adapter_version text null,
  identity_status text not null check (identity_status in (
    'IDENTITY_CONFIRMED', 'IDENTITY_UNRESOLVED', 'IDENTITY_MISMATCH', 'DEAD', 'REMOVED'
  )),
  identity_method text null,
  identity_reason text null,
  http_status integer null check (http_status is null or http_status >= 0),
  detail_url text null,
  canonical_url text null,
  run_id text null,
  observed_at timestamptz not null default now(),
  evidence jsonb not null default '{}'::jsonb
);

comment on table public.opportunity_source_observations is
  'Append-only, compact source-detail observations used for safe enrichment selection and retry TTLs.';
comment on column public.opportunity_source_observations.evidence is
  'Compact adapter evidence only; never store a full HTML snapshot or page body.';

create index if not exists opportunity_source_observations_opportunity_observed_idx
  on public.opportunity_source_observations (opportunity_id, observed_at desc);
create index if not exists opportunity_source_observations_source_identity_observed_idx
  on public.opportunity_source_observations (source, identity_status, observed_at desc);

alter table public.opportunity_source_observations enable row level security;

revoke all on table public.opportunity_source_observations from public, anon, authenticated, service_role;
grant select, insert on table public.opportunity_source_observations to service_role;
