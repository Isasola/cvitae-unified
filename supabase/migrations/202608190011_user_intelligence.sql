-- Migration: 202608190011_user_intelligence
-- Purpose: Create user intelligence tables for event tracking, email logging, and B2C acquisition
-- Purely additive — no DROP, no ALTER existing columns, no TRUNCATE

-- ============================================================
-- Table 1: public.user_events
-- Event log for tracking user activity and lifecycle milestones.
-- No FK constraint on user_id — events may be written before
-- profile creation completes (soft reference only).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.user_events (
  id            bigserial    PRIMARY KEY,
  user_id       uuid         NOT NULL,
  event_type    text         NOT NULL,
  event_data    jsonb        NOT NULL DEFAULT '{}',
  occurred_at   timestamptz  NOT NULL DEFAULT now(),
  session_id    text,
  created_at    timestamptz  NOT NULL DEFAULT now()
);

-- Primary lookup: events by user ordered by time
CREATE INDEX IF NOT EXISTS user_events_user_id_occurred_at_idx
  ON public.user_events (user_id, occurred_at DESC);

-- Analytics: events by type ordered by time
CREATE INDEX IF NOT EXISTS user_events_event_type_occurred_at_idx
  ON public.user_events (event_type, occurred_at DESC);

-- Admin: time-based listing across all users
CREATE INDEX IF NOT EXISTS user_events_occurred_at_idx
  ON public.user_events (occurred_at DESC);

ALTER TABLE public.user_events ENABLE ROW LEVEL SECURITY;

-- Revoke from anon and authenticated; service_role retains bypass-RLS access
REVOKE ALL ON public.user_events FROM anon;
REVOKE ALL ON public.user_events FROM authenticated;


-- ============================================================
-- Table 2: public.email_log
-- Tracks emails sent via Resend.
-- NO UNIQUE constraint — dedup is handled at application layer
-- by querying before insert.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.email_log (
  id               bigserial   PRIMARY KEY,
  user_id          uuid,                          -- nullable: some emails have no associated user
  template         text        NOT NULL,
  recipient_email  text        NOT NULL,
  subject          text,
  status           text        NOT NULL DEFAULT 'sent'
                                 CHECK (status IN ('sent', 'failed', 'bounced')),
  resend_id        text,                          -- Resend delivery ID for tracking
  metadata         jsonb       NOT NULL DEFAULT '{}',
  sent_at          timestamptz NOT NULL DEFAULT now()
);

-- Dedup queries: check if a template was already sent to a user
CREATE INDEX IF NOT EXISTS email_log_user_id_template_sent_at_idx
  ON public.email_log (user_id, template, sent_at DESC);

-- Admin: chronological listing of all sent emails
CREATE INDEX IF NOT EXISTS email_log_sent_at_idx
  ON public.email_log (sent_at DESC);

-- Admin: per-template counts and analytics
CREATE INDEX IF NOT EXISTS email_log_template_sent_at_idx
  ON public.email_log (template, sent_at DESC);

ALTER TABLE public.email_log ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.email_log FROM anon;
REVOKE ALL ON public.email_log FROM authenticated;


-- ============================================================
-- Table 3: public.b2c_acquisition
-- Tracks where each B2C user came from (UTM parameters at signup).
-- One record per user enforced by UNIQUE(user_id).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.b2c_acquisition (
  id            uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source        text,                   -- UTM source (e.g. 'google', 'linkedin', 'organic')
  medium        text,                   -- UTM medium (e.g. 'cpc', 'social', 'email')
  campaign      text,                   -- UTM campaign name
  landing_page  text,                   -- First page they landed on
  referrer      text,                   -- HTTP referrer
  created_at    timestamptz  NOT NULL DEFAULT now(),
  UNIQUE (user_id)                      -- One acquisition record per user
);

-- Acquisition channel analysis
CREATE INDEX IF NOT EXISTS b2c_acquisition_source_created_at_idx
  ON public.b2c_acquisition (source, created_at DESC);

-- Admin listing
CREATE INDEX IF NOT EXISTS b2c_acquisition_created_at_idx
  ON public.b2c_acquisition (created_at DESC);

ALTER TABLE public.b2c_acquisition ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.b2c_acquisition FROM anon;
REVOKE ALL ON public.b2c_acquisition FROM authenticated;
