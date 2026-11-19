-- supabase/migrations/202608190010_founding_beta.sql
-- Founding Beta enrollment ledger.
-- Tracks B2C Founding User acceptance, entitlement, and lifecycle.
-- Program limit: 50 real users. Benefit: 6 months Pro, no card required.
-- Idempotent: repeated accept calls are ignored via unique constraint.

CREATE TABLE IF NOT EXISTS public.founding_beta_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- User identity
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,

  -- Program
  program text NOT NULL DEFAULT 'founding_50'
    CHECK (program IN ('founding_50')),
  cohort text,  -- e.g. '2026-08' for grouping

  -- Offer lifecycle
  status text NOT NULL DEFAULT 'eligible'
    CHECK (status IN ('eligible','offered','accepted','active','completed','declined')),
  offer_version text NOT NULL DEFAULT 'v1',

  -- Key timestamps
  offered_at timestamptz,
  accepted_at timestamptz,
  declined_at timestamptz,
  activated_at timestamptz,
  completed_at timestamptz,

  -- Entitlement
  benefit text NOT NULL DEFAULT '6_months_pro',
  benefit_start timestamptz,
  benefit_end timestamptz,

  -- Dismissal tracking (frontend "Ahora no" — no status change, just count)
  dismissed_count integer NOT NULL DEFAULT 0,

  -- Metadata
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (user_id, program)
);

CREATE INDEX IF NOT EXISTS founding_beta_status_idx
  ON public.founding_beta_enrollments (status, created_at DESC);
CREATE INDEX IF NOT EXISTS founding_beta_user_idx
  ON public.founding_beta_enrollments (user_id);

ALTER TABLE public.founding_beta_enrollments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.founding_beta_enrollments FROM anon, authenticated;
GRANT ALL ON TABLE public.founding_beta_enrollments TO service_role;

-- Safe upsert: idempotent accept. Called by the Netlify function.
-- If user already accepted, returns existing row unchanged.
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
  -- Check if already accepted (idempotent)
  SELECT * INTO v_row FROM public.founding_beta_enrollments
  WHERE user_id = p_user_id AND program = 'founding_50';

  IF FOUND AND v_row.status IN ('accepted','active','completed') THEN
    RETURN NEXT v_row;
    RETURN;
  END IF;

  -- Check program limit
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

  -- Activate Pro in user_master_profiles
  UPDATE public.user_master_profiles
  SET is_subscribed = true, updated_at = v_now
  WHERE user_id = p_user_id;

  RETURN NEXT v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_founding_beta(uuid, text, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accept_founding_beta(uuid, text, text) TO service_role;

-- Record that the offer was shown (so we don't show it again on next login)
CREATE OR REPLACE FUNCTION public.mark_founding_beta_offered(
  p_user_id uuid,
  p_email text,
  p_offer_version text DEFAULT 'v1'
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.founding_beta_enrollments (
    user_id, email, program, status, offer_version, offered_at, updated_at
  ) VALUES (
    p_user_id, lower(trim(p_email)), 'founding_50', 'offered', p_offer_version, now(), now()
  )
  ON CONFLICT (user_id, program) DO UPDATE
    SET offered_at = COALESCE(public.founding_beta_enrollments.offered_at, now()),
        status = CASE
          WHEN public.founding_beta_enrollments.status = 'eligible' THEN 'offered'
          ELSE public.founding_beta_enrollments.status
        END,
        updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.mark_founding_beta_offered(uuid, text, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_founding_beta_offered(uuid, text, text) TO service_role;

COMMENT ON TABLE public.founding_beta_enrollments IS
  'B2C Founding Beta enrollment ledger. Max 50 accepted rows per program. Service-role only.';
