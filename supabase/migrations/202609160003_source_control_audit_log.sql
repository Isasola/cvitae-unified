-- Migration: 202609160003_source_control_audit_log
-- Durable audit trail for source intelligence control-plane admin actions.
-- Covers: approve_search_indexing_policy, enable_seo_for_source, diagnose_source.
-- Additive only. NO backfill. NO data migration.

CREATE TABLE IF NOT EXISTS public.source_control_audit_log (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  action          text        NOT NULL,
  source          text        NOT NULL,
  actor           text        NOT NULL DEFAULT 'admin',
  admin_note      text,
  result_status   text        NOT NULL CHECK (result_status IN ('ok', 'blocked', 'error', 'no_change')),
  blockers        text[]      NOT NULL DEFAULT '{}',
  before_state    jsonb,
  after_state     jsonb,
  result_detail   text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS source_control_audit_log_source_created_idx
  ON public.source_control_audit_log (source, created_at DESC);

ALTER TABLE public.source_control_audit_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.source_control_audit_log FROM public, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.source_control_audit_log TO service_role;
