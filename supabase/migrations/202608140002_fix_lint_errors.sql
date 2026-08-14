-- Fix four lint errors introduced by migrations 202608130005-202608130012.
-- All fixes are additive (ADD COLUMN IF NOT EXISTS, CREATE OR REPLACE FUNCTION).

-- 1. generated_cvs is missing updated_at (used in create_cv_version)
ALTER TABLE public.generated_cvs
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- 2. vacancy_applications is missing updated_at (used in settle/refund_vacancy_review_batch)
ALTER TABLE public.vacancy_applications
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- 3. Fix accept_application_workspace: opportunities.deadline is text, not timestamptz.
--    Replace the direct comparison with a safe cast that coerces to timestamptz.
CREATE OR REPLACE FUNCTION public.accept_application_workspace(
  p_user_id uuid,
  p_workspace_id uuid,
  p_label text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  workspace  public.application_workspaces%rowtype;
BEGIN
  -- Fetch workspace owned by user
  SELECT * INTO workspace
  FROM public.application_workspaces
  WHERE id = p_workspace_id AND user_id = p_user_id AND status = 'draft';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'workspace not found or already accepted');
  END IF;

  -- Verify opportunity still active (safe text→timestamptz cast for deadline)
  IF NOT EXISTS (
    SELECT 1 FROM public.opportunities AS opportunity
    WHERE opportunity.id = workspace.opportunity_id
      AND opportunity.is_active = true
      AND opportunity.verification_status = 'verified'
      AND opportunity.catalog_eligible = true
      AND opportunity.deleted_at IS NULL
      AND opportunity.archived_at IS NULL
      AND (
        opportunity.deadline IS NULL
        OR opportunity.deadline = ''
        OR opportunity.deadline::timestamptz >= now()
      )
      AND opportunity.application_url = workspace.application_url_snapshot
      AND opportunity.title = workspace.opportunity_snapshot->>'title'
      AND opportunity.organization IS NOT DISTINCT FROM
          nullif(workspace.opportunity_snapshot->>'organization', '')
      AND opportunity.updated_at =
          (workspace.opportunity_snapshot->>'updated_at')::timestamptz
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'opportunity no longer active or changed');
  END IF;

  -- Mark workspace accepted
  UPDATE public.application_workspaces
  SET status = 'accepted', accepted_at = now(), updated_at = now()
  WHERE id = p_workspace_id;

  RETURN jsonb_build_object('ok', true, 'workspace_id', p_workspace_id);
END;
$$;

-- 4. Fix claim_vacancy_review_batch: recruiter_vacancies.recruiter_token_id is text,
--    but p_vacancy_id is uuid — cast recruiter_vacancies.id explicitly.
CREATE OR REPLACE FUNCTION public.claim_vacancy_review_batch(
  p_recruiter_token_id text,
  p_vacancy_id uuid,
  p_batch_size integer DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  token_record  public.recruiter_tokens%rowtype;
  batch_record  public.vacancy_review_batches%rowtype;
  applications  jsonb;
BEGIN
  -- Validate token
  SELECT * INTO token_record
  FROM public.recruiter_tokens
  WHERE token_id = p_recruiter_token_id AND is_active = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'token not found or inactive');
  END IF;

  -- Verify vacancy belongs to token (explicit cast uuid→text for recruiter_vacancies.id column)
  IF NOT EXISTS (
    SELECT 1 FROM public.recruiter_vacancies
    WHERE id::text = p_vacancy_id::text
      AND recruiter_token_id = token_record.id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'vacancy not found for this token');
  END IF;

  -- Claim or reuse an open batch
  SELECT * INTO batch_record
  FROM public.vacancy_review_batches
  WHERE vacancy_id = p_vacancy_id
    AND batch_status = 'open'
    AND (claimed_at IS NULL OR claimed_at < now() - interval '10 minutes')
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    INSERT INTO public.vacancy_review_batches (vacancy_id, batch_size, batch_status)
    VALUES (p_vacancy_id, p_batch_size, 'open')
    RETURNING * INTO batch_record;
  ELSE
    UPDATE public.vacancy_review_batches
    SET claimed_at = now(), updated_at = now()
    WHERE id = batch_record.id
    RETURNING * INTO batch_record;
  END IF;

  -- Claim applications (UPDATE via subquery to allow ordering + limit)
  WITH to_claim AS (
    SELECT id FROM public.vacancy_applications
    WHERE vacancy_id = p_vacancy_id
      AND (review_status = 'pending' OR review_status IS NULL)
      AND progressive_shortlist = true
    ORDER BY progressive_rank ASC NULLS LAST, applied_at ASC
    LIMIT p_batch_size
  ),
  claimed AS (
    UPDATE public.vacancy_applications a
    SET review_batch_id = batch_record.id,
        review_batch_number = batch_record.batch_number,
        review_status = 'processing',
        updated_at = now()
    FROM to_claim
    WHERE a.id = to_claim.id
    RETURNING a.id, a.name, a.cv_text, a.ats_score, a.fit_score
  )
  SELECT jsonb_agg(row_to_json(claimed)) INTO applications FROM claimed;

  RETURN jsonb_build_object(
    'ok', true,
    'batch_id', batch_record.id,
    'applications', coalesce(applications, '[]'::jsonb)
  );
END;
$$;
