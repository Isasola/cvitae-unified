BEGIN;

DO $$
DECLARE
  token_id uuid := gen_random_uuid();
  test_vacancy_id uuid := gen_random_uuid();
  claim jsonb;
  duplicate_claim jsonb;
  settlement jsonb;
  batch_id uuid;
  results jsonb;
  batch_size integer;
  final_balance integer;
  total_analyzed integer;
  strong_count integer;
  shortlist_count integer;
  non_strong_shortlist integer;
  recruiter_decisions integer;
BEGIN
  INSERT INTO public.recruiter_tokens (
    id, email, company_name, access_token, token_balance,
    plan_type, is_active, verification_status
  ) VALUES (
    token_id, 'progressive-review-test@cvitae.local', 'Empresa QA',
    'progressive-review-test-token', 100, 'starter', true, 'verified'
  );

  INSERT INTO public.recruiter_vacancies (
    id, title, description, requirements, location, modality,
    company, slug, recruiter_token_id, is_active
  ) VALUES (
    test_vacancy_id, 'Analista QA', 'Vacante de prueba', 'Evidencia verificable',
    'Asunción', 'Híbrido', 'Empresa QA',
    'progressive-review-' || replace(test_vacancy_id::text, '-', ''), token_id, true
  );

  INSERT INTO public.vacancy_applications (
    vacancy_id, vacancy_slug, name, email, cv_text, cv_file_name,
    cv_parse_status, applied_at
  )
  SELECT test_vacancy_id,
         'progressive-review-' || replace(test_vacancy_id::text, '-', ''),
         'Candidato ' || number,
         'candidate-' || number || '-' || replace(test_vacancy_id::text, '-', '') || '@cvitae.local',
         'Experiencia verificable del candidato ' || number,
         'cv-' || number || '.pdf', 'parsed',
         now() + make_interval(secs => number)
  FROM generate_series(1, 65) number;

  FOR expected_batch IN 1..3 LOOP
    claim := public.claim_vacancy_review_batch(
      token_id::text, test_vacancy_id, 'progressive:test:' || expected_batch
    );
    IF claim->>'status' <> 'claimed' THEN
      RAISE EXCEPTION 'Tanda % no fue reclamada: %', expected_batch, claim;
    END IF;

    batch_size := (claim->>'candidate_count')::integer;
    IF batch_size <> (CASE WHEN expected_batch < 3 THEN 30 ELSE 5 END) THEN
      RAISE EXCEPTION 'Tamaño incorrecto en tanda %: %', expected_batch, batch_size;
    END IF;

    IF expected_batch = 1 THEN
      duplicate_claim := public.claim_vacancy_review_batch(
        token_id::text, test_vacancy_id, 'progressive:test:1'
      );
      IF duplicate_claim->>'status' <> 'reserved' THEN
        RAISE EXCEPTION 'El duplicado no conservó la reserva idempotente: %', duplicate_claim;
      END IF;
      SELECT token_balance INTO final_balance FROM public.recruiter_tokens WHERE id = token_id;
      IF final_balance <> 70 THEN
        RAISE EXCEPTION 'El duplicado cobró dos veces: saldo %', final_balance;
      END IF;
    END IF;

    batch_id := (claim->>'batch_id')::uuid;
    SELECT jsonb_agg(jsonb_build_object(
      'applicant_id', ranked.id,
      'ats_score', 55 + (ranked.rn % 40),
      'fit_score', 50 + (ranked.rn % 46),
      'ai_summary', 'Resultado verificable',
      'strengths', jsonb_build_array('Evidencia'),
      'key_matches', jsonb_build_array('Requisito'),
      'key_gaps', '[]'::jsonb
    )) INTO results
    FROM (
      SELECT id, row_number() OVER (ORDER BY applied_at, id)::integer AS rn
      FROM public.vacancy_applications
      WHERE review_batch_id = batch_id
    ) ranked;

    settlement := public.settle_vacancy_review_batch(
      token_id::text, 'progressive:test:' || expected_batch,
      results, jsonb_build_object('batchNumber', expected_batch), NULL
    );
    IF settlement->>'status' <> 'completed' THEN
      RAISE EXCEPTION 'Tanda % no se liquidó: %', expected_batch, settlement;
    END IF;
  END LOOP;

  SELECT token_balance INTO final_balance FROM public.recruiter_tokens WHERE id = token_id;
  IF final_balance <> 35 THEN
    RAISE EXCEPTION '65 análisis deben dejar saldo 35, quedó %', final_balance;
  END IF;

  SELECT count(*),
         count(*) FILTER (WHERE triage_tier = 'strong'),
         count(*) FILTER (WHERE progressive_shortlist),
         count(*) FILTER (WHERE progressive_shortlist AND fit_score < 75),
         count(*) FILTER (WHERE recruiter_action IS NOT NULL)
  INTO total_analyzed, strong_count, shortlist_count, non_strong_shortlist, recruiter_decisions
  FROM public.vacancy_applications
  WHERE vacancy_id = test_vacancy_id AND review_status = 'analyzed';

  IF total_analyzed <> 65 THEN RAISE EXCEPTION 'Se analizaron %, esperado 65', total_analyzed; END IF;
  IF shortlist_count < strong_count THEN RAISE EXCEPTION 'Se perdió un perfil fuerte'; END IF;
  IF non_strong_shortlist > 10 THEN RAISE EXCEPTION 'La comparación progresiva conservó más de 10 no fuertes'; END IF;
  IF recruiter_decisions <> 0 THEN RAISE EXCEPTION 'El ranking modificó decisiones humanas'; END IF;

  claim := public.claim_vacancy_review_batch(token_id::text, test_vacancy_id, 'progressive:test:empty');
  IF claim->>'status' <> 'empty' THEN RAISE EXCEPTION 'La cola final no quedó vacía: %', claim; END IF;
END;
$$;

ROLLBACK;

SELECT 'progressive-vacancy-review-database-ok' AS result;
