-- Migration: 202608190014_founding_rollout_gate
-- Purpose: Sequential rollout gate for Founding Beta offer.
-- Default true = all new users continue normal auto-flow.
-- Set false for existing users to defer until manually re-enabled.

ALTER TABLE public.user_master_profiles
  ADD COLUMN IF NOT EXISTS founding_offer_enabled boolean DEFAULT true;

-- Belt-and-suspenders: ensure no NULLs on existing rows
UPDATE public.user_master_profiles
  SET founding_offer_enabled = true
  WHERE founding_offer_enabled IS NULL;

-- Defer Marcelo's offer — founder will set to true after 24-48h of observing Rosarito
-- To enable: UPDATE public.user_master_profiles SET founding_offer_enabled = true
--            WHERE user_id = '49ae16ef-2680-4cb2-a709-1deab4a328f3';
UPDATE public.user_master_profiles
  SET founding_offer_enabled = false
  WHERE user_id = '49ae16ef-2680-4cb2-a709-1deab4a328f3';
