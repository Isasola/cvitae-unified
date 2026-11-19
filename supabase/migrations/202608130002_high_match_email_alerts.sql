-- Consent-based, idempotent email delivery ledger for very high B2C matches.

ALTER TABLE public.user_master_profiles
  ADD COLUMN IF NOT EXISTS match_alerts_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE public.user_master_profiles
  ADD COLUMN IF NOT EXISTS match_alert_threshold integer NOT NULL DEFAULT 85
  CHECK (match_alert_threshold BETWEEN 70 AND 99);

CREATE TABLE IF NOT EXISTS public.match_alert_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  profile_id uuid NOT NULL REFERENCES public.user_master_profiles(id) ON DELETE CASCADE,
  opportunity_id text NOT NULL REFERENCES public.opportunities(id) ON DELETE CASCADE,
  recipient_email text NOT NULL,
  match_score integer NOT NULL CHECK (match_score BETWEEN 0 AND 100),
  matched_skills jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'suppressed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  provider_message_id text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  UNIQUE (user_id, opportunity_id)
);

CREATE INDEX IF NOT EXISTS match_alert_deliveries_status_idx
  ON public.match_alert_deliveries (status, updated_at);
CREATE INDEX IF NOT EXISTS match_alert_deliveries_created_idx
  ON public.match_alert_deliveries (created_at DESC);

ALTER TABLE public.match_alert_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.match_alert_deliveries FROM anon, authenticated;
GRANT ALL ON TABLE public.match_alert_deliveries TO service_role;

-- A single atomic claim prevents two scheduled invocations from emailing the
-- same user about the same opportunity. Failed rows can be retried up to 3x.
CREATE OR REPLACE FUNCTION public.claim_match_alert_delivery(
  p_user_id uuid,
  p_profile_id uuid,
  p_opportunity_id text,
  p_recipient_email text,
  p_match_score integer,
  p_matched_skills jsonb DEFAULT '[]'::jsonb
) RETURNS SETOF public.match_alert_deliveries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.match_alert_deliveries (
    user_id, profile_id, opportunity_id, recipient_email, match_score, matched_skills
  ) VALUES (
    p_user_id, p_profile_id, p_opportunity_id, lower(trim(p_recipient_email)),
    p_match_score, COALESCE(p_matched_skills, '[]'::jsonb)
  ) ON CONFLICT (user_id, opportunity_id) DO NOTHING;

  RETURN QUERY
  UPDATE public.match_alert_deliveries
  SET status = 'processing',
      attempts = attempts + 1,
      updated_at = now(),
      recipient_email = lower(trim(p_recipient_email)),
      match_score = p_match_score,
      matched_skills = COALESCE(p_matched_skills, '[]'::jsonb),
      last_error = NULL
  WHERE user_id = p_user_id
    AND opportunity_id = p_opportunity_id
    AND attempts < 3
    AND (
      status IN ('pending', 'failed')
      OR (status = 'processing' AND updated_at < now() - interval '20 minutes')
    )
  RETURNING *;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_match_alert_delivery(uuid, uuid, text, text, integer, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_match_alert_delivery(uuid, uuid, text, text, integer, jsonb) TO service_role;
