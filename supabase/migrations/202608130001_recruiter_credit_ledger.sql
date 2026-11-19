-- Idempotent B2B credit operations.
-- One operation_id represents one candidate analysis, including retries.

CREATE TABLE IF NOT EXISTS public.recruiter_credit_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recruiter_token_id text NOT NULL,
  operation_id text NOT NULL,
  status text NOT NULL DEFAULT 'reserved'
    CHECK (status IN ('reserved', 'completed', 'refunded', 'needs_review')),
  amount integer NOT NULL DEFAULT 1 CHECK (amount > 0),
  balance_before integer NOT NULL CHECK (balance_before >= 0),
  balance_after integer NOT NULL CHECK (balance_after >= 0),
  reason text NOT NULL DEFAULT 'candidate_analysis',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb,
  analysis_id text,
  error_summary text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (recruiter_token_id, operation_id),
  CHECK (char_length(operation_id) BETWEEN 8 AND 128)
);

CREATE TABLE IF NOT EXISTS public.recruiter_credit_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recruiter_token_id text NOT NULL,
  operation_id text NOT NULL,
  movement_type text NOT NULL CHECK (movement_type IN ('debit', 'refund', 'credit', 'adjustment')),
  amount integer NOT NULL CHECK (amount <> 0),
  balance_before integer NOT NULL CHECK (balance_before >= 0),
  balance_after integer NOT NULL CHECK (balance_after >= 0),
  reason text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (recruiter_token_id, operation_id, movement_type),
  CHECK (balance_after = balance_before + amount)
);

ALTER TABLE public.recruiter_analyses
  ADD COLUMN IF NOT EXISTS operation_id text;

CREATE UNIQUE INDEX IF NOT EXISTS recruiter_analyses_token_operation_uidx
  ON public.recruiter_analyses (token_id, operation_id)
  WHERE operation_id IS NOT NULL;

ALTER TABLE public.recruiter_credit_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recruiter_credit_ledger ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.recruiter_credit_operations FROM anon, authenticated;
REVOKE ALL ON TABLE public.recruiter_credit_ledger FROM anon, authenticated;
GRANT ALL ON TABLE public.recruiter_credit_operations TO service_role;
GRANT ALL ON TABLE public.recruiter_credit_ledger TO service_role;

CREATE OR REPLACE FUNCTION public.reserve_recruiter_credit(
  p_recruiter_token_id text,
  p_operation_id text,
  p_amount integer DEFAULT 1,
  p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  token_record public.recruiter_tokens%ROWTYPE;
  existing_operation public.recruiter_credit_operations%ROWTYPE;
  before_balance integer;
  after_balance integer;
BEGIN
  IF p_operation_id IS NULL
     OR char_length(p_operation_id) NOT BETWEEN 8 AND 128
     OR p_operation_id !~ '^[A-Za-z0-9._:-]+$' THEN
    RETURN jsonb_build_object('status', 'invalid_operation');
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('status', 'invalid_amount');
  END IF;

  SELECT * INTO token_record
  FROM public.recruiter_tokens
  WHERE id::text = p_recruiter_token_id
    AND is_active = true
    AND verification_status = 'verified'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'invalid_recruiter');
  END IF;

  SELECT * INTO existing_operation
  FROM public.recruiter_credit_operations
  WHERE recruiter_token_id = p_recruiter_token_id
    AND operation_id = p_operation_id
  FOR UPDATE;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'status', existing_operation.status,
      'balance', existing_operation.balance_after,
      'result', existing_operation.result,
      'analysis_id', existing_operation.analysis_id
    );
  END IF;

  before_balance := COALESCE(token_record.token_balance, 0)::integer;
  IF before_balance < p_amount THEN
    RETURN jsonb_build_object('status', 'insufficient', 'balance', before_balance);
  END IF;
  after_balance := before_balance - p_amount;

  UPDATE public.recruiter_tokens
  SET token_balance = after_balance
  WHERE id = token_record.id;

  INSERT INTO public.recruiter_credit_operations (
    recruiter_token_id, operation_id, status, amount,
    balance_before, balance_after, metadata
  ) VALUES (
    p_recruiter_token_id, p_operation_id, 'reserved', p_amount,
    before_balance, after_balance, COALESCE(p_metadata, '{}'::jsonb)
  );

  INSERT INTO public.recruiter_credit_ledger (
    recruiter_token_id, operation_id, movement_type, amount,
    balance_before, balance_after, reason, metadata
  ) VALUES (
    p_recruiter_token_id, p_operation_id, 'debit', -p_amount,
    before_balance, after_balance, 'candidate_analysis_reserved', COALESCE(p_metadata, '{}'::jsonb)
  );

  RETURN jsonb_build_object('status', 'reserved', 'balance', after_balance);
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_recruiter_credit_operation(
  p_recruiter_token_id text,
  p_operation_id text,
  p_analysis jsonb,
  p_result jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  token_record public.recruiter_tokens%ROWTYPE;
  operation_record public.recruiter_credit_operations%ROWTYPE;
  created_analysis_id text;
BEGIN
  SELECT * INTO operation_record
  FROM public.recruiter_credit_operations
  WHERE recruiter_token_id = p_recruiter_token_id
    AND operation_id = p_operation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'missing');
  END IF;
  IF operation_record.status = 'completed' THEN
    RETURN jsonb_build_object(
      'status', 'completed', 'balance', operation_record.balance_after,
      'result', operation_record.result, 'analysis_id', operation_record.analysis_id
    );
  END IF;
  IF operation_record.status <> 'reserved' THEN
    RETURN jsonb_build_object('status', operation_record.status, 'balance', operation_record.balance_after);
  END IF;

  SELECT * INTO token_record
  FROM public.recruiter_tokens
  WHERE id::text = p_recruiter_token_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'invalid_recruiter');
  END IF;

  INSERT INTO public.recruiter_analyses (
    token_id, candidate_name, file_name, ats_score, strengths,
    critical_improvements, vacancy_label, raw_cv_text, is_starred,
    created_at, operation_id
  )
  SELECT
    token_id, candidate_name, file_name, ats_score, strengths,
    critical_improvements, vacancy_label, raw_cv_text, is_starred,
    created_at, operation_id
  FROM jsonb_populate_record(
    NULL::public.recruiter_analyses,
    COALESCE(p_analysis, '{}'::jsonb) || jsonb_build_object(
      'token_id', token_record.id,
      'operation_id', p_operation_id,
      'is_starred', false,
      'created_at', now()
    )
  )
  ON CONFLICT (token_id, operation_id) WHERE operation_id IS NOT NULL
  DO UPDATE SET operation_id = EXCLUDED.operation_id
  RETURNING id::text INTO created_analysis_id;

  UPDATE public.recruiter_credit_operations
  SET status = 'completed',
      result = COALESCE(p_result, '{}'::jsonb),
      analysis_id = created_analysis_id,
      completed_at = now(),
      updated_at = now()
  WHERE id = operation_record.id;

  RETURN jsonb_build_object(
    'status', 'completed', 'balance', operation_record.balance_after,
    'result', COALESCE(p_result, '{}'::jsonb), 'analysis_id', created_analysis_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.refund_recruiter_credit_operation(
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
  before_balance integer;
  after_balance integer;
BEGIN
  SELECT * INTO token_record
  FROM public.recruiter_tokens
  WHERE id::text = p_recruiter_token_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'invalid_recruiter');
  END IF;

  SELECT * INTO operation_record
  FROM public.recruiter_credit_operations
  WHERE recruiter_token_id = p_recruiter_token_id
    AND operation_id = p_operation_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'missing');
  END IF;
  IF operation_record.status <> 'reserved' THEN
    RETURN jsonb_build_object('status', operation_record.status, 'balance', token_record.token_balance);
  END IF;

  before_balance := COALESCE(token_record.token_balance, 0)::integer;
  after_balance := before_balance + operation_record.amount;

  UPDATE public.recruiter_tokens
  SET token_balance = after_balance
  WHERE id = token_record.id;

  UPDATE public.recruiter_credit_operations
  SET status = 'refunded',
      error_summary = left(p_error_summary, 1000),
      updated_at = now(),
      completed_at = now()
  WHERE id = operation_record.id;

  INSERT INTO public.recruiter_credit_ledger (
    recruiter_token_id, operation_id, movement_type, amount,
    balance_before, balance_after, reason, metadata
  ) VALUES (
    p_recruiter_token_id, p_operation_id, 'refund', operation_record.amount,
    before_balance, after_balance, 'candidate_analysis_failed',
    jsonb_build_object('error', left(p_error_summary, 1000))
  ) ON CONFLICT (recruiter_token_id, operation_id, movement_type) DO NOTHING;

  RETURN jsonb_build_object('status', 'refunded', 'balance', after_balance);
END;
$$;

-- Settles a multi-candidate vacancy analysis atomically. The full batch is
-- reserved before calling the model; only successfully persisted candidates
-- are charged and the remainder is returned in the same transaction.
CREATE OR REPLACE FUNCTION public.settle_recruiter_credit_batch_operation(
  p_recruiter_token_id text,
  p_operation_id text,
  p_consumed integer,
  p_result jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  token_record public.recruiter_tokens%ROWTYPE;
  operation_record public.recruiter_credit_operations%ROWTYPE;
  refund_amount integer;
  before_balance integer;
  final_balance integer;
BEGIN
  SELECT * INTO token_record
  FROM public.recruiter_tokens
  WHERE id::text = p_recruiter_token_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'invalid_recruiter');
  END IF;

  SELECT * INTO operation_record
  FROM public.recruiter_credit_operations
  WHERE recruiter_token_id = p_recruiter_token_id
    AND operation_id = p_operation_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'missing');
  END IF;
  IF operation_record.status = 'completed' THEN
    RETURN jsonb_build_object(
      'status', 'completed', 'balance', operation_record.balance_after,
      'result', operation_record.result
    );
  END IF;
  IF operation_record.status <> 'reserved' THEN
    RETURN jsonb_build_object('status', operation_record.status, 'balance', token_record.token_balance);
  END IF;
  IF p_consumed IS NULL OR p_consumed < 0 OR p_consumed > operation_record.amount THEN
    RETURN jsonb_build_object('status', 'invalid_consumed');
  END IF;

  refund_amount := operation_record.amount - p_consumed;
  before_balance := COALESCE(token_record.token_balance, 0)::integer;
  final_balance := before_balance + refund_amount;

  IF refund_amount > 0 THEN
    UPDATE public.recruiter_tokens
    SET token_balance = final_balance
    WHERE id = token_record.id;

    INSERT INTO public.recruiter_credit_ledger (
      recruiter_token_id, operation_id, movement_type, amount,
      balance_before, balance_after, reason, metadata
    ) VALUES (
      p_recruiter_token_id, p_operation_id, 'refund', refund_amount,
      before_balance, final_balance, 'vacancy_batch_partial_refund',
      jsonb_build_object('reserved', operation_record.amount, 'consumed', p_consumed)
    ) ON CONFLICT (recruiter_token_id, operation_id, movement_type) DO NOTHING;
  END IF;

  UPDATE public.recruiter_credit_operations
  SET status = 'completed',
      balance_after = final_balance,
      result = COALESCE(p_result, '{}'::jsonb),
      completed_at = now(),
      updated_at = now()
  WHERE id = operation_record.id;

  RETURN jsonb_build_object(
    'status', 'completed', 'balance', final_balance,
    'charged', p_consumed, 'refunded', refund_amount,
    'result', COALESCE(p_result, '{}'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_recruiter_credit(text, text, integer, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_recruiter_credit_operation(text, text, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refund_recruiter_credit_operation(text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.settle_recruiter_credit_batch_operation(text, text, integer, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_recruiter_credit(text, text, integer, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_recruiter_credit_operation(text, text, jsonb, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.refund_recruiter_credit_operation(text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.settle_recruiter_credit_batch_operation(text, text, integer, jsonb) TO service_role;
