-- Progressive, resumable B2B vacancy review.
-- Applications keep arriving independently from review capacity. Each operation
-- claims at most 30 pending CVs and compares its best candidates with the best
-- retained from previous batches. Triage never changes recruiter_action.

CREATE TABLE IF NOT EXISTS public.vacancy_review_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vacancy_id uuid NOT NULL REFERENCES public.recruiter_vacancies(id) ON DELETE CASCADE,
  recruiter_token_id uuid NOT NULL REFERENCES public.recruiter_tokens(id) ON DELETE CASCADE,
  operation_id text NOT NULL,
  batch_number integer NOT NULL CHECK (batch_number > 0),
  status text NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing', 'completed', 'refunded', 'needs_review')),
  candidate_count integer NOT NULL CHECK (candidate_count BETWEEN 1 AND 30),
  successful_count integer NOT NULL DEFAULT 0 CHECK (successful_count >= 0),
  failed_count integer NOT NULL DEFAULT 0 CHECK (failed_count >= 0),
  summary jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (recruiter_token_id, operation_id),
  UNIQUE (vacancy_id, batch_number)
);

ALTER TABLE public.vacancy_applications
  ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS review_batch_id uuid REFERENCES public.vacancy_review_batches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS review_batch_number integer,
  ADD COLUMN IF NOT EXISTS batch_selected boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS progressive_shortlist boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS progressive_rank integer,
  ADD COLUMN IF NOT EXISTS triage_tier text,
  ADD COLUMN IF NOT EXISTS selection_reason text,
  ADD COLUMN IF NOT EXISTS analysis_model text,
  ADD COLUMN IF NOT EXISTS analysis_version text;

ALTER TABLE public.vacancy_applications
  DROP CONSTRAINT IF EXISTS vacancy_applications_review_status_check;
ALTER TABLE public.vacancy_applications
  ADD CONSTRAINT vacancy_applications_review_status_check
  CHECK (review_status IN ('pending', 'processing', 'analyzed', 'manual_review', 'failed'));

ALTER TABLE public.vacancy_applications
  DROP CONSTRAINT IF EXISTS vacancy_applications_triage_tier_check;
ALTER TABLE public.vacancy_applications
  ADD CONSTRAINT vacancy_applications_triage_tier_check
  CHECK (triage_tier IS NULL OR triage_tier IN ('strong', 'priority', 'reviewed'));

UPDATE public.vacancy_applications
SET review_status = CASE
  WHEN analyzed_at IS NOT NULL THEN 'analyzed'
  WHEN cv_text IS NULL AND cv_parse_status = 'manual_review' THEN 'manual_review'
  ELSE 'pending'
END
WHERE review_status = 'pending';

-- Existing analyses enter the same neutral triage model. A previous low score
-- is relabelled as reviewed; it is not an automated instruction to reject.
UPDATE public.vacancy_applications
SET recommendation = 'Revisado'
WHERE analyzed_at IS NOT NULL AND recommendation = 'No llamar';

WITH existing_rank AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY vacancy_id
           ORDER BY fit_score DESC NULLS LAST, ats_score DESC NULLS LAST, applied_at, id
         ) AS overall_rank
  FROM public.vacancy_applications
  WHERE analyzed_at IS NOT NULL
)
UPDATE public.vacancy_applications a
SET progressive_rank = existing_rank.overall_rank,
    batch_selected = (a.fit_score >= 75 OR existing_rank.overall_rank <= 10),
    progressive_shortlist = (a.fit_score >= 75 OR existing_rank.overall_rank <= 10),
    triage_tier = CASE
      WHEN a.fit_score >= 75 THEN 'strong'
      WHEN existing_rank.overall_rank <= 10 THEN 'priority'
      ELSE 'reviewed'
    END,
    selection_reason = CASE
      WHEN a.fit_score >= 75 THEN 'Ajuste fuerte: conservar para decisión humana'
      WHEN existing_rank.overall_rank <= 10 THEN 'Mejor evidencia relativa entre los perfiles revisados'
      ELSE 'Revisado: disponible para evaluación manual'
    END
FROM existing_rank
WHERE a.id = existing_rank.id;

CREATE INDEX IF NOT EXISTS vacancy_applications_review_queue_idx
  ON public.vacancy_applications (vacancy_id, review_status, applied_at, id);
CREATE INDEX IF NOT EXISTS vacancy_applications_progressive_rank_idx
  ON public.vacancy_applications (vacancy_id, progressive_shortlist DESC, progressive_rank, applied_at);
CREATE INDEX IF NOT EXISTS vacancy_review_batches_vacancy_idx
  ON public.vacancy_review_batches (vacancy_id, batch_number DESC);

ALTER TABLE public.vacancy_review_batches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.vacancy_review_batches FROM anon, authenticated;
GRANT ALL ON TABLE public.vacancy_review_batches TO service_role;

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
    WHERE id = p_vacancy_id AND recruiter_token_id = token_record.id
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

CREATE OR REPLACE FUNCTION public.settle_vacancy_review_batch(
  p_recruiter_token_id text,
  p_operation_id text,
  p_results jsonb,
  p_response jsonb,
  p_summary jsonb DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  token_record public.recruiter_tokens%ROWTYPE;
  operation_record public.recruiter_credit_operations%ROWTYPE;
  batch_record public.vacancy_review_batches%ROWTYPE;
  successful integer;
  failed integer;
  refund_amount integer;
  before_balance integer;
  final_balance integer;
  review_state jsonb;
  final_result jsonb;
BEGIN
  IF jsonb_typeof(COALESCE(p_results, '[]'::jsonb)) <> 'array' THEN
    RETURN jsonb_build_object('status', 'invalid_results');
  END IF;

  SELECT * INTO token_record
  FROM public.recruiter_tokens
  WHERE id::text = p_recruiter_token_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'invalid_recruiter'); END IF;

  SELECT * INTO operation_record
  FROM public.recruiter_credit_operations
  WHERE recruiter_token_id = p_recruiter_token_id
    AND operation_id = p_operation_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'missing'); END IF;
  IF operation_record.status = 'completed' THEN
    RETURN jsonb_build_object(
      'status', 'completed', 'balance', operation_record.balance_after,
      'result', operation_record.result
    );
  END IF;
  IF operation_record.status <> 'reserved' THEN
    RETURN jsonb_build_object('status', operation_record.status, 'balance', token_record.token_balance);
  END IF;

  SELECT * INTO batch_record
  FROM public.vacancy_review_batches
  WHERE recruiter_token_id = token_record.id
    AND operation_id = p_operation_id
  FOR UPDATE;
  IF NOT FOUND OR batch_record.status <> 'processing' THEN
    RETURN jsonb_build_object('status', 'invalid_batch');
  END IF;

  WITH supplied AS (
    SELECT *
    FROM jsonb_to_recordset(p_results) AS x(
      applicant_id uuid,
      ats_score integer,
      fit_score integer,
      ai_summary text,
      strengths jsonb,
      key_matches jsonb,
      key_gaps jsonb
    )
  )
  UPDATE public.vacancy_applications a
  SET ats_score = LEAST(100, GREATEST(0, supplied.ats_score)),
      fit_score = LEAST(100, GREATEST(0, supplied.fit_score)),
      recommendation = CASE
        WHEN LEAST(100, GREATEST(0, supplied.fit_score)) >= 75 THEN 'Llamar'
        WHEN LEAST(100, GREATEST(0, supplied.fit_score)) >= 50 THEN 'Considerar'
        ELSE 'Revisado'
      END,
      ai_summary = left(supplied.ai_summary, 3000),
      strengths = CASE WHEN jsonb_typeof(supplied.strengths) = 'array' THEN supplied.strengths ELSE '[]'::jsonb END,
      key_matches = CASE WHEN jsonb_typeof(supplied.key_matches) = 'array' THEN supplied.key_matches ELSE '[]'::jsonb END,
      key_gaps = CASE WHEN jsonb_typeof(supplied.key_gaps) = 'array' THEN supplied.key_gaps ELSE '[]'::jsonb END,
      analyzed_at = now(),
      review_status = 'analyzed',
      analysis_model = 'global.anthropic.claude-sonnet-4-6',
      analysis_version = 'vacancy-fit-v2',
      updated_at = now()
  FROM supplied
  WHERE a.id = supplied.applicant_id
    AND a.review_batch_id = batch_record.id
    AND supplied.ats_score IS NOT NULL
    AND supplied.fit_score IS NOT NULL;

  SELECT count(*) INTO successful
  FROM public.vacancy_applications
  WHERE review_batch_id = batch_record.id AND review_status = 'analyzed';
  failed := batch_record.candidate_count - successful;

  UPDATE public.vacancy_applications
  SET review_status = 'failed', updated_at = now()
  WHERE review_batch_id = batch_record.id AND review_status = 'processing';

  -- Keep every strong fit plus the best ten from each batch. This is triage,
  -- never an automatic rejection and never changes recruiter_action.
  WITH batch_rank AS (
    SELECT id,
           row_number() OVER (ORDER BY fit_score DESC NULLS LAST, ats_score DESC NULLS LAST, applied_at, id) AS rn
    FROM public.vacancy_applications
    WHERE review_batch_id = batch_record.id AND review_status = 'analyzed'
  )
  UPDATE public.vacancy_applications a
  SET batch_selected = (a.fit_score >= 75 OR batch_rank.rn <= 10),
      updated_at = now()
  FROM batch_rank
  WHERE a.id = batch_rank.id;

  WITH ranked AS (
    SELECT id,
           row_number() OVER (ORDER BY fit_score DESC NULLS LAST, ats_score DESC NULLS LAST, applied_at, id) AS overall_rank,
           count(*) FILTER (WHERE batch_selected AND fit_score < 75)
             OVER (ORDER BY fit_score DESC NULLS LAST, ats_score DESC NULLS LAST, applied_at, id) AS retained_rank
    FROM public.vacancy_applications
    WHERE vacancy_id = batch_record.vacancy_id AND review_status = 'analyzed'
  )
  UPDATE public.vacancy_applications a
  SET progressive_rank = ranked.overall_rank,
      progressive_shortlist = CASE
        WHEN a.fit_score >= 75 THEN true
        WHEN a.batch_selected AND ranked.retained_rank <= 10 THEN true
        ELSE false
      END,
      triage_tier = CASE
        WHEN a.fit_score >= 75 THEN 'strong'
        WHEN a.batch_selected AND ranked.retained_rank <= 10 THEN 'priority'
        ELSE 'reviewed'
      END,
      selection_reason = CASE
        WHEN a.fit_score >= 75 THEN 'Ajuste fuerte: conservar para decisión humana'
        WHEN a.batch_selected AND ranked.retained_rank <= 10 THEN 'Mejor evidencia relativa entre las tandas revisadas'
        ELSE 'Revisado: disponible para evaluación manual'
      END,
      updated_at = now()
  FROM ranked
  WHERE a.id = ranked.id;

  refund_amount := operation_record.amount - successful;
  before_balance := COALESCE(token_record.token_balance, 0)::integer;
  final_balance := before_balance + refund_amount;

  IF refund_amount > 0 THEN
    UPDATE public.recruiter_tokens SET token_balance = final_balance WHERE id = token_record.id;
    INSERT INTO public.recruiter_credit_ledger (
      recruiter_token_id, operation_id, movement_type, amount,
      balance_before, balance_after, reason, metadata
    ) VALUES (
      p_recruiter_token_id, p_operation_id, 'refund', refund_amount,
      before_balance, final_balance, 'vacancy_progressive_review_partial_refund',
      jsonb_build_object('batch_id', batch_record.id, 'reserved', operation_record.amount, 'consumed', successful)
    ) ON CONFLICT (recruiter_token_id, operation_id, movement_type) DO NOTHING;
  END IF;

  SELECT jsonb_build_object(
    'total', count(*),
    'analyzed', count(*) FILTER (WHERE review_status = 'analyzed'),
    'pending', count(*) FILTER (WHERE review_status IN ('pending', 'failed', 'processing') AND cv_text IS NOT NULL),
    'manual_review', count(*) FILTER (WHERE cv_text IS NULL),
    'strong', count(*) FILTER (WHERE triage_tier = 'strong'),
    'shortlist', count(*) FILTER (WHERE progressive_shortlist),
    'batches_completed', (SELECT count(*) FROM public.vacancy_review_batches b WHERE b.vacancy_id = batch_record.vacancy_id AND b.status = 'completed') + 1,
    'last_batch_number', batch_record.batch_number
  ) INTO review_state
  FROM public.vacancy_applications
  WHERE vacancy_id = batch_record.vacancy_id;

  final_result := COALESCE(p_response, '{}'::jsonb) || jsonb_build_object('review', review_state);

  UPDATE public.vacancy_review_batches
  SET status = 'completed', successful_count = successful, failed_count = failed,
      summary = p_summary, completed_at = now(), updated_at = now()
  WHERE id = batch_record.id;

  UPDATE public.recruiter_credit_operations
  SET status = 'completed', balance_after = final_balance, result = final_result,
      completed_at = now(), updated_at = now()
  WHERE id = operation_record.id;

  RETURN jsonb_build_object(
    'status', 'completed', 'balance', final_balance,
    'charged', successful, 'refunded', refund_amount,
    'result', final_result
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.refund_vacancy_review_batch(
  p_recruiter_token_id text,
  p_operation_id text,
  p_error_summary text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  token_record public.recruiter_tokens%ROWTYPE;
  operation_record public.recruiter_credit_operations%ROWTYPE;
  batch_record public.vacancy_review_batches%ROWTYPE;
  before_balance integer;
  after_balance integer;
BEGIN
  SELECT * INTO token_record FROM public.recruiter_tokens
  WHERE id::text = p_recruiter_token_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'invalid_recruiter'); END IF;

  SELECT * INTO operation_record FROM public.recruiter_credit_operations
  WHERE recruiter_token_id = p_recruiter_token_id AND operation_id = p_operation_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'missing'); END IF;
  IF operation_record.status <> 'reserved' THEN
    RETURN jsonb_build_object('status', operation_record.status, 'balance', token_record.token_balance);
  END IF;

  SELECT * INTO batch_record FROM public.vacancy_review_batches
  WHERE recruiter_token_id = token_record.id AND operation_id = p_operation_id FOR UPDATE;
  before_balance := COALESCE(token_record.token_balance, 0)::integer;
  after_balance := before_balance + operation_record.amount;

  UPDATE public.recruiter_tokens SET token_balance = after_balance WHERE id = token_record.id;
  UPDATE public.recruiter_credit_operations
  SET status = 'refunded', balance_after = after_balance,
      error_summary = left(p_error_summary, 1000), completed_at = now(), updated_at = now()
  WHERE id = operation_record.id;

  INSERT INTO public.recruiter_credit_ledger (
    recruiter_token_id, operation_id, movement_type, amount,
    balance_before, balance_after, reason, metadata
  ) VALUES (
    p_recruiter_token_id, p_operation_id, 'refund', operation_record.amount,
    before_balance, after_balance, 'vacancy_progressive_review_failed',
    jsonb_build_object('batch_id', batch_record.id, 'error', left(p_error_summary, 1000))
  ) ON CONFLICT (recruiter_token_id, operation_id, movement_type) DO NOTHING;

  IF batch_record.id IS NOT NULL THEN
    UPDATE public.vacancy_review_batches
    SET status = 'refunded', failed_count = candidate_count,
        completed_at = now(), updated_at = now()
    WHERE id = batch_record.id;
    UPDATE public.vacancy_applications
    SET review_status = 'failed', updated_at = now()
    WHERE review_batch_id = batch_record.id AND review_status = 'processing';
  END IF;

  RETURN jsonb_build_object('status', 'refunded', 'balance', after_balance);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_vacancy_review_batch(text, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.settle_vacancy_review_batch(text, text, jsonb, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refund_vacancy_review_batch(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_vacancy_review_batch(text, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.settle_vacancy_review_batch(text, text, jsonb, jsonb, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.refund_vacancy_review_batch(text, text, text) TO service_role;
