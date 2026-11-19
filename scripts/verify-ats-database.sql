\set ON_ERROR_STOP on

begin;

create or replace function pg_temp.assert(condition boolean, message text)
returns void language plpgsql as $$
begin
  if not coalesce(condition, false) then raise exception '%', message; end if;
end;
$$;

insert into public.user_master_profiles (
  id, user_id, email, full_name, professional_title, profile_data
) values (
  '60000000-0000-4000-8000-000000000001',
  '60000000-0000-4000-8000-000000000002',
  'ats-test@example.test',
  'Persona ficticia ATS',
  'Analista de pruebas',
  '{}'::jsonb
);

select assessment_id, created
from public.create_cv_ats_assessment(
  '60000000-0000-4000-8000-000000000002',
  '60000000-0000-4000-8000-000000000001',
  'uploaded_cv',
  'cv-ficticio.pdf',
  null,
  repeat('a', 64),
  '[
    {"key":"parsing_structure","score":18,"max":20,"reason":"Estructura clara"},
    {"key":"essential_sections","score":16,"max":20,"reason":"Secciones visibles"},
    {"key":"clarity_concision","score":15,"max":20,"reason":"Texto conciso"},
    {"key":"evidence_impact","score":12,"max":20,"reason":"Faltan resultados"},
    {"key":"relevance_keywords","score":14,"max":20,"reason":"Vocabulario específico"}
  ]'::jsonb,
  '[{"title":"Claridad","evidence":"Analista de pruebas"}]'::jsonb,
  '[{"severity":"high","issue":"Faltan resultados","evidence":"No aparecen en el texto","whyItMatters":"Reduce evidencia","nextAction":"Responder preguntas"}]'::jsonb,
  '[{"action":"Aclarar resultados","expectedEffect":"Mayor precisión"}]'::jsonb,
  '[]'::jsonb,
  '[
    {"question":"¿Qué resultado concreto obtuviste en esta experiencia?","whyAsked":"El CV describe tareas sin resultados.","category":"achievement","priority":1},
    {"question":"¿Qué herramientas utilizaste de forma comprobable?","whyAsked":"No aparecen herramientas específicas.","category":"skill","priority":2}
  ]'::jsonb,
  'test-model'
) \gset ats_

select pg_temp.assert(:'ats_created'::boolean is true, 'first assessment was not created');
select pg_temp.assert(
  (select overall_score from public.cv_ats_assessments where id = :'ats_assessment_id') = 75,
  'overall score was not recomputed from rubric'
);
select pg_temp.assert(
  (select count(*) from public.cv_ats_questions where assessment_id = :'ats_assessment_id') = 2,
  'questions were not created atomically'
);
select pg_temp.assert(not has_table_privilege('anon', 'public.cv_ats_assessments', 'select'), 'anon can read ATS assessments');
select pg_temp.assert(not has_table_privilege('authenticated', 'public.cv_ats_questions', 'select'), 'authenticated browser can read ATS questions directly');

select assessment_id, created
from public.create_cv_ats_assessment(
  '60000000-0000-4000-8000-000000000002',
  '60000000-0000-4000-8000-000000000001',
  'uploaded_cv', 'cv-ficticio.pdf', null, repeat('a', 64),
  '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb,
  '[]'::jsonb, '[]'::jsonb, 'test-model'
) \gset duplicate_

select pg_temp.assert(:'duplicate_created'::boolean is false, 'duplicate assessment was created');
select pg_temp.assert(:'duplicate_assessment_id'::uuid = :'ats_assessment_id'::uuid, 'idempotency returned another assessment');

select id as question_id
from public.cv_ats_questions
where assessment_id = :'ats_assessment_id'
order by position
limit 1 \gset selected_

select id, status, evidence_id
from public.review_cv_ats_question(
  '60000000-0000-4000-8000-000000000002',
  :'selected_question_id',
  'answered',
  'Reduje el tiempo de revisión de 3 días a 1 día; dato ficticio usado solo en una transacción de prueba.'
) \gset reviewed_

select pg_temp.assert(:'reviewed_status' = 'answered', 'question was not answered');
select pg_temp.assert(
  exists (
    select 1 from public.cv_evidence_items
    where id = :'reviewed_evidence_id'
      and user_id = '60000000-0000-4000-8000-000000000002'
      and status = 'pending'
      and confirmed_value is null
      and source_label = 'Respuesta a diagnóstico ATS'
  ),
  'answer did not become pending evidence'
);

select public.delete_b2c_user_data(
  '60000000-0000-4000-8000-000000000002',
  'ats-test@example.test'
) as deletion_result \gset deleted_

select pg_temp.assert(
  not exists (select 1 from public.cv_ats_assessments where user_id = '60000000-0000-4000-8000-000000000002'),
  'account deletion kept ATS assessments'
);
select pg_temp.assert(
  not exists (select 1 from public.cv_evidence_items where user_id = '60000000-0000-4000-8000-000000000002'),
  'account deletion kept ATS evidence'
);

select
  :'ats_assessment_id' as assessment_id,
  75 as recomputed_score,
  2 as persisted_questions,
  'pending' as answer_evidence_status,
  :'deleted_deletion_result' as deletion_result;

rollback;
