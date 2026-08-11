CREATE TABLE IF NOT EXISTS public.recruiter_review_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recruiter_token_id text NOT NULL,
  previous_status text,
  new_status text NOT NULL,
  note text,
  actor text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.recruiter_review_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.recruiter_review_events FROM anon, authenticated;
GRANT ALL ON TABLE public.recruiter_review_events TO service_role;
