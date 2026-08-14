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
  '72000000-0000-4000-8000-000000000001',
  '72000000-0000-4000-8000-000000000002',
  'learning-test@example.test',
  'Persona ficticia Learning',
  'Analista de datos',
  '{"habilidades":["SQL"]}'::jsonb
);

insert into public.learning_recommendations (
  id, user_id, profile_signature, skill, normalized_skill, priority, status,
  title, provider_key, provider_label, resource_url, learning_focus, why,
  level, language, source_snapshot, analysis_model, fallback
) values
(
  '72000000-0000-4000-8000-000000000003',
  '72000000-0000-4000-8000-000000000002', repeat('a', 64),
  'Power BI', 'power bi', 1, 'suggested', 'Ruta práctica de Power BI',
  'microsoft_learn', 'Microsoft Learn',
  'https://learn.microsoft.com/es-es/training/browse/?terms=Power%20BI',
  'Modelado y tableros aplicados.', 'Brecha observada en dos oportunidades.',
  'Intermedio', 'Español preferido',
  '[{"id":"job-1","slug":"analista-power-bi","title":"Analista Power BI"}]'::jsonb,
  'test-model', false
),
(
  '72000000-0000-4000-8000-000000000004',
  '72000000-0000-4000-8000-000000000002', repeat('a', 64),
  'AWS', 'aws', 2, 'suggested', 'Ruta práctica de AWS',
  'aws_skill_builder', 'AWS Skill Builder', 'https://skillbuilder.aws/',
  'Fundamentos de nube.', 'Brecha observada en una oportunidad.',
  'Inicial', 'Español preferido',
  '[{"id":"job-2","slug":"cloud-junior","title":"Cloud Junior"}]'::jsonb,
  'fallback', true
);

do $$
begin
  begin
    update public.learning_recommendations
    set resource_url = 'https://evil.example/'
    where id = '72000000-0000-4000-8000-000000000003';
    raise exception 'immutable recommendation update unexpectedly succeeded';
  exception when others then
    if sqlerrm = 'immutable recommendation update unexpectedly succeeded' then raise; end if;
  end;
end;
$$;

select * from public.update_learning_recommendation_status(
  '72000000-0000-4000-8000-000000000002',
  '72000000-0000-4000-8000-000000000003', 'in_progress'
);
select pg_temp.assert((
  select status = 'in_progress' and started_at is not null
  from public.learning_recommendations
  where id = '72000000-0000-4000-8000-000000000003'
), 'El inicio del curso no quedó persistido');

select * from public.update_learning_recommendation_status(
  '72000000-0000-4000-8000-000000000002',
  '72000000-0000-4000-8000-000000000003', 'completed'
);
select pg_temp.assert((
  select status = 'completed' and completed_at is not null
  from public.learning_recommendations
  where id = '72000000-0000-4000-8000-000000000003'
), 'La finalización no quedó persistida');

do $$
begin
  begin
    perform public.update_learning_recommendation_status(
      '72000000-0000-4000-8000-000000000099',
      '72000000-0000-4000-8000-000000000003', 'dismissed'
    );
    raise exception 'foreign owner update unexpectedly succeeded';
  exception when others then
    if sqlerrm = 'foreign owner update unexpectedly succeeded' then raise; end if;
  end;
end;
$$;

select pg_temp.assert(not has_table_privilege('anon', 'public.learning_recommendations', 'select'), 'anon puede leer planes privados');
select pg_temp.assert(not has_table_privilege('authenticated', 'public.learning_recommendations', 'select'), 'authenticated puede evitar la API protegida');
select pg_temp.assert(not has_function_privilege('authenticated', 'public.update_learning_recommendation_status(uuid,uuid,text)', 'execute'), 'authenticated puede cambiar el avance directamente');

select public.delete_b2c_user_data(
  '72000000-0000-4000-8000-000000000002', 'learning-test@example.test'
) as deletion_result \gset deletion_

select pg_temp.assert((:'deletion_deletion_result'::jsonb->>'deleted_learning_recommendations')::integer = 2, 'El borrado de cuenta no eliminó todo el plan');
select pg_temp.assert(not exists (
  select 1 from public.learning_recommendations
  where user_id = '72000000-0000-4000-8000-000000000002'
), 'Sobrevivieron recomendaciones al borrado de cuenta');

select
  :'deletion_deletion_result'::jsonb as deletion_result,
  'learning-plan-database-ok' as result;

rollback;
