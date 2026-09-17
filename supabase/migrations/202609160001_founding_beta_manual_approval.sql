-- supabase/migrations/202609160001_founding_beta_manual_approval.sql
-- Adds Admin-controlled approval flow for Founding Beta.
-- Users who accept now get status='accepted' (pending review).
-- Admin explicitly approves → status='active' + is_subscribed=true.
-- Admin rejects → status='declined'.
-- Cap: only 'active' and 'completed' rows count toward the 50-user limit.

-- Admin-only approve function (called from admin-data Netlify function via service role)
CREATE OR REPLACE FUNCTION public.admin_approve_founding_beta(
  p_user_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_active_count INT;
  v_enrollment public.founding_beta_enrollments%ROWTYPE;
  v_now TIMESTAMPTZ := now();
  v_benefit_end TIMESTAMPTZ := now() + INTERVAL '12 months';
BEGIN
  -- Serialize concurrent approvals to prevent two admins from exceeding the 50-slot cap
  -- (advisory lock is released automatically at transaction end)
  PERFORM pg_advisory_xact_lock(hashtext('founding_50_cap'));

  -- Count only truly granted slots (active + completed), not pending requests
  SELECT COUNT(*) INTO v_active_count
  FROM public.founding_beta_enrollments
  WHERE status IN ('active', 'completed')
    AND program = 'founding_50';

  IF v_active_count >= 50 THEN
    RETURN jsonb_build_object('status', 'full', 'active_count', v_active_count);
  END IF;

  SELECT * INTO v_enrollment
  FROM public.founding_beta_enrollments
  WHERE user_id = p_user_id AND program = 'founding_50';

  IF v_enrollment.id IS NULL THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;

  IF v_enrollment.status NOT IN ('accepted', 'offered') THEN
    RETURN jsonb_build_object('status', 'invalid_state', 'current_status', v_enrollment.status);
  END IF;

  UPDATE public.founding_beta_enrollments
  SET
    status = 'active',
    accepted_at = COALESCE(accepted_at, v_now),
    activated_at = v_now,
    benefit_start = v_now,
    benefit_end = v_benefit_end,
    updated_at = v_now
  WHERE user_id = p_user_id AND program = 'founding_50';

  UPDATE public.user_master_profiles
  SET
    is_subscribed = true,
    subscription_source = 'founding_beta',
    updated_at = v_now
  WHERE user_id = p_user_id;

  RETURN jsonb_build_object(
    'status', 'approved',
    'active_count', v_active_count + 1,
    'benefit_end', v_benefit_end,
    'full_after_this', (v_active_count + 1) >= 50
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_approve_founding_beta(UUID) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_approve_founding_beta(UUID) TO service_role;

-- Admin-only reject function
CREATE OR REPLACE FUNCTION public.admin_reject_founding_beta(
  p_user_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.founding_beta_enrollments
  SET status = 'declined', updated_at = now()
  WHERE user_id = p_user_id AND program = 'founding_50';

  -- Ensure not subscribed via founding
  UPDATE public.user_master_profiles
  SET is_subscribed = false, updated_at = now()
  WHERE user_id = p_user_id AND subscription_source = 'founding_beta' AND is_subscribed = true;

  RETURN jsonb_build_object('status', 'rejected');
END;
$$;

REVOKE ALL ON FUNCTION public.admin_reject_founding_beta(UUID) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reject_founding_beta(UUID) TO service_role;

COMMENT ON FUNCTION public.admin_approve_founding_beta IS
  'Admin-only: approve a Founding Beta request. Only active+completed rows count toward the 50-user cap.';
COMMENT ON FUNCTION public.admin_reject_founding_beta IS
  'Admin-only: reject a Founding Beta request. Sets status=declined.';
