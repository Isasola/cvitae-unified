-- Migration: 202608190013_entitlement_and_idempotency
-- Purpose:
--   1. Explicit service_role grants for tables missing them (safe to re-run: IF NOT EXISTS on indexes)
--   2. subscription_source on user_master_profiles for source-aware Pro entitlement
--   3. idempotency_key on email_log for concurrency-safe dedup
--   4. survey_metadata + whatsapp on b2b_prospects for survey data
--   5. Updated accept_founding_beta() with subscription_source tracking
--   6. expire_founding_beta_subscriptions() — safe expiry that never touches paid subscriptions

-- ─── 1. Service-role SQL privileges ──────────────────────────────────────────
-- service_role bypasses RLS but still needs SQL-level privileges.
-- founding_beta_enrollments already has GRANT from migration 202608190010.

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_events TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.email_log TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.b2c_acquisition TO service_role;

-- Sequences (needed for INSERT on bigserial columns)
GRANT USAGE, SELECT ON SEQUENCE public.user_events_id_seq TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.email_log_id_seq TO service_role;

-- ─── 2. subscription_source on user_master_profiles ──────────────────────────
-- Source-aware entitlement: 'none', 'founding_beta', 'paid', 'manual'
-- Paid subscriptions (Stripe/Lemon Squeezy future) should set this to 'paid'.
-- expire_founding_beta_subscriptions() only disables is_subscribed when source='founding_beta'.

ALTER TABLE public.user_master_profiles
  ADD COLUMN IF NOT EXISTS subscription_source text DEFAULT 'none'
    CHECK (subscription_source IN ('none', 'founding_beta', 'paid', 'manual'));

-- ─── 3. idempotency_key on email_log ─────────────────────────────────────────
-- Pattern: '<template>:<user_id>:<version>'. NULL = no dedup required.
-- Unique index on non-null keys only — preserves historical ledger for re-sends
-- with different keys (e.g., 'founding_welcome:<user_id>:v2').

ALTER TABLE public.email_log
  ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS email_log_idempotency_key_idx
  ON public.email_log (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- ─── 4. B2B survey metadata columns ─────────────────────────────────────────
-- survey_metadata: full survey JSON blob (preserve all answers)
-- whatsapp: contact phone for manual outreach

ALTER TABLE public.b2b_prospects
  ADD COLUMN IF NOT EXISTS survey_metadata jsonb DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS whatsapp text;

-- ─── 5. Updated accept_founding_beta() ───────────────────────────────────────
-- Adds subscription_source = 'founding_beta' to the user_master_profiles update.
-- SET search_path = '' — fully qualified references only.

CREATE OR REPLACE FUNCTION public.accept_founding_beta(
  p_user_id uuid,
  p_email text,
  p_offer_version text DEFAULT 'v1'
) RETURNS SETOF public.founding_beta_enrollments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_limit integer := 50;
  v_active_count integer;
  v_row public.founding_beta_enrollments%rowtype;
  v_now timestamptz := now();
  v_benefit_end timestamptz := now() + interval '6 months';
BEGIN
  SELECT * INTO v_row FROM public.founding_beta_enrollments
  WHERE user_id = p_user_id AND program = 'founding_50';

  IF FOUND AND v_row.status IN ('accepted','active','completed') THEN
    RETURN NEXT v_row;
    RETURN;
  END IF;

  SELECT count(*) INTO v_active_count
  FROM public.founding_beta_enrollments
  WHERE program = 'founding_50' AND status IN ('accepted','active','completed');

  IF v_active_count >= v_limit THEN
    RAISE EXCEPTION 'founding_50_full: el programa Founding 50 ya alcanzó su límite';
  END IF;

  INSERT INTO public.founding_beta_enrollments (
    user_id, email, program, cohort, status, offer_version,
    accepted_at, activated_at, benefit_start, benefit_end, updated_at
  ) VALUES (
    p_user_id, lower(trim(p_email)), 'founding_50',
    to_char(v_now, 'YYYY-MM'),
    'active', p_offer_version,
    v_now, v_now, v_now, v_benefit_end, v_now
  )
  ON CONFLICT (user_id, program) DO UPDATE
    SET status = 'active',
        accepted_at = COALESCE(public.founding_beta_enrollments.accepted_at, v_now),
        activated_at = COALESCE(public.founding_beta_enrollments.activated_at, v_now),
        benefit_start = COALESCE(public.founding_beta_enrollments.benefit_start, v_now),
        benefit_end = COALESCE(public.founding_beta_enrollments.benefit_end, v_benefit_end),
        offer_version = p_offer_version,
        updated_at = v_now
  RETURNING * INTO v_row;

  -- Activate Pro + track source (subscription_source tracks entitlement origin)
  UPDATE public.user_master_profiles
  SET is_subscribed = true,
      subscription_source = 'founding_beta',
      updated_at = v_now
  WHERE user_id = p_user_id;

  RETURN NEXT v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_founding_beta(uuid, text, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accept_founding_beta(uuid, text, text) TO service_role;

-- ─── 6. expire_founding_beta_subscriptions() ─────────────────────────────────
-- SAFE: only disables is_subscribed when subscription_source = 'founding_beta'.
-- Paid subscriptions (subscription_source = 'paid' or 'manual') are NEVER touched.
-- Call manually or via scheduled job when benefit_end approaches.

CREATE OR REPLACE FUNCTION public.expire_founding_beta_subscriptions()
RETURNS TABLE(expired_count integer, expired_user_ids uuid[])
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_expired_ids uuid[];
BEGIN
  SELECT array_agg(fbe.user_id)
  INTO v_expired_ids
  FROM public.founding_beta_enrollments fbe
  JOIN public.user_master_profiles ump ON ump.user_id = fbe.user_id
  WHERE fbe.program = 'founding_50'
    AND fbe.status = 'active'
    AND fbe.benefit_end < now()
    AND ump.subscription_source = 'founding_beta';

  IF v_expired_ids IS NULL OR array_length(v_expired_ids, 1) IS NULL THEN
    RETURN QUERY SELECT 0::integer, '{}'::uuid[];
    RETURN;
  END IF;

  UPDATE public.founding_beta_enrollments
  SET status = 'completed', completed_at = now(), updated_at = now()
  WHERE user_id = ANY(v_expired_ids)
    AND program = 'founding_50'
    AND status = 'active';

  UPDATE public.user_master_profiles
  SET is_subscribed = false,
      subscription_source = 'none',
      updated_at = now()
  WHERE user_id = ANY(v_expired_ids)
    AND subscription_source = 'founding_beta';

  RETURN QUERY SELECT array_length(v_expired_ids, 1)::integer, v_expired_ids;
END;
$$;

REVOKE ALL ON FUNCTION public.expire_founding_beta_subscriptions() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_founding_beta_subscriptions() TO service_role;

COMMENT ON COLUMN public.user_master_profiles.subscription_source IS
  'Source of Pro access: none=free, founding_beta=Founding 50 program, paid=active paid subscription, manual=admin override. expire_founding_beta_subscriptions() only disables founding_beta sources.';
