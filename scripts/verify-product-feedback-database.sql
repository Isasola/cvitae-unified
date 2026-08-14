\set ON_ERROR_STOP on

begin;

create or replace function pg_temp.assert(condition boolean, message text)
returns void language plpgsql as $$
begin
  if not coalesce(condition, false) then raise exception '%', message; end if;
end;
$$;

insert into public.user_master_profiles (id, user_id, email, full_name, professional_title)
values ('73000000-0000-4000-8000-000000000001', '73000000-0000-4000-8000-000000000002', 'feedback-test@example.test', 'Persona Feedback', 'Analista');

insert into public.recruiter_tokens (id, email, company_name, access_token, token_balance, is_active)
values ('73000000-0000-4000-8000-000000000003', 'empresa-feedback@example.test', 'Empresa Feedback', 'feedback-token-test', 10, true);

insert into public.product_feedback (
  id, reference_code, audience, category, severity, feature, message, page_path,
  user_id, contact_email, context
) values (
  '73000000-0000-4000-8000-000000000004', 'CV-20260813-ABCDEF01', 'b2c', 'bug', 'major',
  'Plan de aprendizaje', 'El botón no guardó el avance después de completar el paso.', '/mi-carrera/aprender',
  '73000000-0000-4000-8000-000000000002', 'feedback-test@example.test', '{"viewport":{"width":1440,"height":1000}}'::jsonb
), (
  '73000000-0000-4000-8000-000000000005', 'CV-20260813-ABCDEF02', 'b2b', 'usability', 'minor',
  'Análisis masivo B2B', 'La comparación necesita explicar mejor cómo se ordenan los finalistas.', '/empresas/masivo',
  null, 'empresa-feedback@example.test', '{"viewport":{"width":500,"height":1000}}'::jsonb
);

update public.product_feedback set recruiter_token_id = '73000000-0000-4000-8000-000000000003'
where id = '73000000-0000-4000-8000-000000000005';

select * from public.update_product_feedback(
  '73000000-0000-4000-8000-000000000004', 'triaged', 'Reproducir en móvil.', 'Producto', 'admin-test'
);

select pg_temp.assert((
  select status = 'triaged' and admin_note = 'Reproducir en móvil.' and assigned_to = 'Producto' and triaged_at is not null
  from public.product_feedback where id = '73000000-0000-4000-8000-000000000004'
), 'La clasificación no quedó persistida');
select pg_temp.assert((
  select previous_status = 'new' and new_status = 'triaged' and actor = 'admin-test'
  from public.product_feedback_events where feedback_id = '73000000-0000-4000-8000-000000000004'
), 'El evento perdió el estado anterior o el actor');

do $$
begin
  begin
    perform public.update_product_feedback('73000000-0000-4000-8000-000000000004', 'invalid', null, null, 'admin-test');
    raise exception 'invalid status unexpectedly succeeded';
  exception when others then
    if sqlerrm = 'invalid status unexpectedly succeeded' then raise; end if;
  end;
end;
$$;

select pg_temp.assert(not has_table_privilege('anon', 'public.product_feedback', 'select'), 'anon puede leer reportes privados');
select pg_temp.assert(not has_table_privilege('authenticated', 'public.product_feedback', 'select'), 'authenticated puede evitar la API') ;
select pg_temp.assert(not has_function_privilege('authenticated', 'public.update_product_feedback(uuid,text,text,text,text)', 'execute'), 'authenticated puede cambiar estados directamente');

select public.delete_b2c_user_data('73000000-0000-4000-8000-000000000002', 'feedback-test@example.test') as deletion_result \gset deletion_
select pg_temp.assert((:'deletion_deletion_result'::jsonb->>'deleted_product_feedback')::integer = 1, 'El borrado B2C no eliminó su reporte');
select pg_temp.assert(not exists (select 1 from public.product_feedback where user_id = '73000000-0000-4000-8000-000000000002'), 'Sobrevivió el reporte del usuario eliminado');
select pg_temp.assert(exists (select 1 from public.product_feedback where id = '73000000-0000-4000-8000-000000000005'), 'El borrado B2C eliminó un reporte B2B ajeno');

select 'product-feedback-database-ok' as result, :'deletion_deletion_result'::jsonb as deletion_result;

rollback;
