-- Fix remaining lint errors after 202608140002 introduced wrong function rewrites.
-- Restores accept_application_workspace (from 008) and claim_vacancy_review_batch (from 012)
-- to their original bodies with the minimum necessary casts.

-- 1. Restore accept_application_workspace with correct signature and deadline cast.
--    Original sig: (uuid, uuid, boolean) RETURNS TABLE(workspace_id uuid, prepared_version_id uuid, status text)
--    202608140002 incorrectly replaced the signature — this restores it.
CREATE OR REPLACE FUNCTION public.accept_application_workspace(
  p_user_id uuid,
  p_workspace_id uuid,
  p_attested boolean
) RETURNS TABLE(workspace_id uuid, prepared_version_id uuid, status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  workspace public.application_workspaces%ROWTYPE;
  source_version public.generated_cvs%ROWTYPE;
  created_version public.generated_cvs%ROWTYPE;
BEGIN
  IF p_user_id IS NULL OR p_workspace_id IS NULL OR p_attested IS NOT TRUE THEN
    RAISE EXCEPTION 'explicit attestation is required';
  END IF;

  SELECT application.* INTO workspace
  FROM public.application_workspaces AS application
  WHERE application.id = p_workspace_id AND application.user_id = p_user_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'application workspace not found'; END IF;

  IF workspace.prepared_version_id IS NOT NULL THEN
    RETURN QUERY SELECT workspace.id, workspace.prepared_version_id, workspace.status;
    RETURN;
  END IF;
  IF workspace.status <> 'draft' THEN RAISE EXCEPTION 'application workspace is not available'; END IF;
  IF COALESCE((workspace.safety_checks->>'passed')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'application workspace did not pass safety checks';
  END IF;

  SELECT generated.* INTO source_version
  FROM public.generated_cvs AS generated
  WHERE generated.id = workspace.source_version_id AND generated.user_id = p_user_id;
  IF NOT FOUND OR source_version.content_hash <> workspace.source_content_hash THEN
    RAISE EXCEPTION 'source CV changed or is unavailable';
  END IF;
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
      AND opportunity.organization IS NOT DISTINCT FROM nullif(workspace.opportunity_snapshot->>'organization', '')
      AND opportunity.updated_at = (workspace.opportunity_snapshot->>'updated_at')::timestamptz
  ) THEN
    RAISE EXCEPTION 'opportunity is no longer available or changed';
  END IF;

  SELECT * INTO created_version
  FROM public.create_cv_version(
    p_user_id,
    workspace.opportunity_id,
    workspace.tailored_cv_markdown,
    'Postulación · ' || left(coalesce(workspace.opportunity_snapshot->>'title', 'Oportunidad'), 130),
    'adapted',
    workspace.source_version_id,
    workspace.evidence_snapshot,
    workspace.opportunity_snapshot,
    true
  );

  UPDATE public.application_workspaces AS application
  SET status = 'ready', prepared_version_id = created_version.id,
      accepted_at = now(), updated_at = now()
  WHERE application.id = workspace.id;

  RETURN QUERY SELECT workspace.id, created_version.id, 'ready'::text;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_application_workspace(uuid, uuid, boolean) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accept_application_workspace(uuid, uuid, boolean) TO service_role;

-- Drop the wrong overload created by 202608140002 (p_label text DEFAULT NULL signature).
DROP FUNCTION IF EXISTS public.accept_application_workspace(uuid, uuid, text);

-- 2. Restore claim_vacancy_review_batch to original body from 012.
--    Only change from original: line "recruiter_token_id = token_record.id"
--    → "recruiter_token_id = token_record.id::text"  (text = uuid type mismatch fix)
--    202608140002 introduced wrong signature and non-existent "token_id" column.
CREATE OR REPLACE FUNCTION public.claim_vacancy_review_batch(
  p_recruiter_token_id text,
  p_vacancy_id uuid,
  p_operation_id text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  token_record public.recruiter_tokens%ROWTYPE;
  existing_operation public.recruiter_credit_operations%ROWTYPE;
  existing_batch public.vacancy_review_batches%ROWTYPE;
  selected_ids uuid[];
  selected_count integer;
  next_batch integer;
  new_batch_id uuid;
  before_balance integer;
  after_balance integer;
BEGIN
  IF p_operation_id IS NULL
     OR char_length(p_operation_id) NOT BETWEEN 8 AND 128
     OR p_operation_id !~ '^[A-Za-z0-9._:-]+$' THEN
    RETURN jsonb_build_object('status', 'invalid_operation');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_vacancy_id::text));

  SELECT * INTO token_record
  FROM public.recruiter_tokens
  WHERE id::text = p_recruiter_token_id
    AND is_active = true
    AND verification_status = 'verified'
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'invalid_recruiter');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.recruiter_vacancies
    WHERE id = p_vacancy_id AND recruiter_token_id = token_record.id::text
  ) THEN
    RETURN jsonb_build_object('status', 'forbidden');
  END IF;

  SELECT * INTO existing_operation
  FROM public.recruiter_credit_operations
  WHERE recruiter_token_id = p_recruiter_token_id
    AND operation_id = p_operation_id
  FOR UPDATE;

  IF FOUND THEN
    IF existing_operation.status = 'completed' THEN
      RETURN jsonb_build_object(
        'status', 'completed',
        'balance', existing_operation.balance_after,
        'result', existing_operation.result
      );
    END IF;

    SELECT * INTO existing_batch
    FROM public.vacancy_review_batches
    WHERE recruiter_token_id = token_record.id
      AND operation_id = p_operation_id;

    IF existing_operation.status = 'reserved'
       AND existing_batch.status = 'processing'
       AND existing_batch.updated_at < now() - interval '10 minutes' THEN
      UPDATE public.vacancy_review_batches
      SET updated_at = now()
      WHERE id = existing_batch.id;
      RETURN jsonb_build_object(
        'status', 'claimed', 'resumed', true,
        'batch_id', existing_batch.id,
        'batch_number', existing_batch.batch_number,
        'candidate_ids', COALESCE((
          SELECT jsonb_agg(a.id ORDER BY a.applied_at, a.id)
          FROM public.vacancy_applications a
          WHERE a.review_batch_id = existing_batch.id
        ), '[]'::jsonb),
        'balance', existing_operation.balance_after
      );
    END IF;

    RETURN jsonb_build_object(
      'status', existing_operation.status,
      'balance', existing_operation.balance_after
    );
  END IF;

  SELECT array_agg(candidate.id ORDER BY candidate.applied_at, candidate.id)
  INTO selected_ids
  FROM (
    SELECT a.id, a.applied_at
    FROM public.vacancy_applications a
    WHERE a.vacancy_id = p_vacancy_id
      AND a.cv_text IS NOT NULL
      AND a.review_status IN ('pending', 'failed')
    ORDER BY a.applied_at, a.id
    LIMIT 30
    FOR UPDATE SKIP LOCKED
  ) candidate;

  selected_count := COALESCE(cardinality(selected_ids), 0);
  IF selected_count = 0 THEN
    RETURN jsonb_build_object('status', 'empty', 'balance', COALESCE(token_record.token_balance, 0));
  END IF;

  before_balance := COALESCE(token_record.token_balance, 0)::integer;
  IF before_balance < selected_count THEN
    RETURN jsonb_build_object(
      'status', 'insufficient',
      'required', selected_count,
      'balance', before_balance
    );
  END IF;
  after_balance := before_balance - selected_count;

  SELECT COALESCE(max(batch_number), 0) + 1 INTO next_batch
  FROM public.vacancy_review_batches
  WHERE vacancy_id = p_vacancy_id;

  INSERT INTO public.vacancy_review_batches (
    vacancy_id, recruiter_token_id, operation_id, batch_number,
    status, candidate_count
  ) VALUES (
    p_vacancy_id, token_record.id, p_operation_id, next_batch,
    'processing', selected_count
  ) RETURNING id INTO new_batch_id;

  UPDATE public.recruiter_tokens
  SET token_balance = after_balance
  WHERE id = token_record.id;

  INSERT INTO public.recruiter_credit_operations (
    recruiter_token_id, operation_id, status, amount,
    balance_before, balance_after, reason, metadata
  ) VALUES (
    p_recruiter_token_id, p_operation_id, 'reserved', selected_count,
    before_balance, after_balance, 'vacancy_progressive_review',
    jsonb_build_object(
      'mode', 'vacancy_progressive_review',
      'vacancy_id', p_vacancy_id,
      'batch_id', new_batch_id,
      'batch_number', next_batch,
      'candidates', selected_count
    )
  );

  INSERT INTO public.recruiter_credit_ledger (
    recruiter_token_id, operation_id, movement_type, amount,
    balance_before, balance_after, reason, metadata
  ) VALUES (
    p_recruiter_token_id, p_operation_id, 'debit', -selected_count,
    before_balance, after_balance, 'vacancy_progressive_review_reserved',
    jsonb_build_object('vacancy_id', p_vacancy_id, 'batch_id', new_batch_id, 'batch_number', next_batch)
  );

  UPDATE public.vacancy_applications
  SET review_status = 'processing',
      review_batch_id = new_batch_id,
      review_batch_number = next_batch,
      updated_at = now()
  WHERE id = ANY(selected_ids);

  RETURN jsonb_build_object(
    'status', 'claimed',
    'batch_id', new_batch_id,
    'batch_number', next_batch,
    'candidate_ids', to_jsonb(selected_ids),
    'candidate_count', selected_count,
    'balance', after_balance
  );
END;
$$;

-- Drop wrong overload introduced by 202608140002 (p_batch_size integer DEFAULT 30)
DROP FUNCTION IF EXISTS public.claim_vacancy_review_batch(text, uuid, integer);

REVOKE ALL ON FUNCTION public.claim_vacancy_review_batch(text, uuid, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_vacancy_review_batch(text, uuid, text) TO service_role;
