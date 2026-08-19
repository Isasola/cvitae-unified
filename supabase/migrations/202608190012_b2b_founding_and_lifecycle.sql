-- Migration: 202608190012_b2b_founding_and_lifecycle
-- Purpose: Extend b2b_prospects for Founding Companies program and
--          add lifecycle tracking columns to user_master_profiles.
-- Purely additive — ADD COLUMN IF NOT EXISTS only. No DROP, no ALTER existing columns.

-- ============================================================
-- Part 1: Extend public.b2b_prospects
-- ============================================================

ALTER TABLE public.b2b_prospects
  ADD COLUMN IF NOT EXISTS pilot_interest boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS survey_source text,
  ADD COLUMN IF NOT EXISTS survey_date date,
  ADD COLUMN IF NOT EXISTS b2b_funnel_status text DEFAULT 'prospect'
    CHECK (b2b_funnel_status IN (
      'prospect', 'contacted', 'interested', 'demo_scheduled',
      'pilot', 'client', 'churned', 'disqualified'
    )),
  ADD COLUMN IF NOT EXISTS founding_company boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS next_action text,
  ADD COLUMN IF NOT EXISTS last_contact_at timestamptz;

-- ============================================================
-- Part 2: Extend public.user_master_profiles
-- ============================================================
-- lifecycle_state is a denormalized cache of the lifecycle derived
-- from user_events. Updated by server-side functions, NOT by DB triggers.
-- Source of truth remains user_events.

ALTER TABLE public.user_master_profiles
  ADD COLUMN IF NOT EXISTS lifecycle_state text DEFAULT 'signed_up'
    CHECK (lifecycle_state IN ('signed_up', 'activated', 'engaged', 'churned')),
  ADD COLUMN IF NOT EXISTS ttfv_seconds integer,
  ADD COLUMN IF NOT EXISTS first_value_event text;

-- ============================================================
-- Part 3: Index for lifecycle queries
-- ============================================================

CREATE INDEX IF NOT EXISTS user_master_profiles_lifecycle_idx
  ON public.user_master_profiles (lifecycle_state, created_at DESC);
