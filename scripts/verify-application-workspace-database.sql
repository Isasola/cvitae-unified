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
  '71000000-0000-4000-8000-000000000001',
  '71000000-0000-4000-8000-000000000002',
  'application-test@example.test',
  'Persona ficticia Application',
  'Analista de pruebas',
  '{}'::jsonb
);

insert into public.cv_evidence_items (
  id, user_id, profile_id, fingerprint, category, claim, source_kind,
  source_label, status, confirmed_value, active, reviewed_at
) values (
  '71000000-0000-4000-8000-000000000003',
  '71000000-0000-4000-8000-000000000002',
  '71000000-0000-4000-8000-000000000001',
  repeat('c', 64), 'identity', 'Persona ficticia Application', 'manual',
  'Prueba local', 'confirmed', 'Persona ficticia Application', true, now()
);

select id as source_id, content_hash as source_hash
from public.create_cv_version(
  '71000000-0000-4000-8000-000000000002', 'base_cv',
  '# Persona ficticia Application\n\n## Resumen Profesional\n\nAnalista de pruebas con evidencia confirmada.',
  'CV general de prueba', 'base', null,
  '[{"id":"71000000-0000-4000-8000-000000000003","category":"identity","value":"Persona ficticia Application"}]'::jsonb,
  '{}'::jsonb, true
) \gset source_

insert into public.opportunities (
  id, title, slug, organization, location, description, application_url,
  source, verification_status, is_active, opportunity_kind, opportunity_type, deadline
) values (
  'application-test-opportunity', 'Analista de pruebas', 'application-test-opportunity',
  'Empresa ficticia', 'Asunción', 'Buscamos experiencia en pruebas de software y comunicación.',
  'https://example.test/application-test', 'computrabajo', 'pending', true,
  'empleo', 'job', now() + interval '10 days'
);

insert into public.application_workspaces (
  id, user_id, opportunity_id, source_version_id, source_content_hash,
  evidence_hash, opportunity_fingerprint, status, opportunity_snapshot,
  application_url_snapshot, requirement_analysis, fit_summary,
  tailored_cv_markdown, cover_message, evidence_snapshot, checklist,
  safety_checks, analysis_model
) values (
  '71000000-0000-4000-8000-000000000004',
  '71000000-0000-4000-8000-000000000002',
  'application-test-opportunity', :'source_source_id', :'source_source_hash',
  repeat('d', 64), repeat('e', 64), 'draft',
  jsonb_build_object(
    'id', 'application-test-opportunity', 'title', 'Analista de pruebas',
    'slug', 'application-test-opportunity', 'organization', 'Empresa ficticia',
    'updated_at', (select updated_at from public.opportunities where id = 'application-test-opportunity')
  ),
  'https://example.test/application-test',
  '[{"id":"requirement-1","text":"experiencia en pruebas de software","importance":"essential","status":"supported"}]'::jsonb,
  '{"coverage_score":100,"supported":1,"partial":0,"not_evidenced":0,"total":1}'::jsonb,
  '# Persona ficticia Application\n\n## Resumen Profesional\n\nAnalista de pruebas con evidencia confirmada.',
  'Presento mi candidatura como analista de pruebas con información confirmada.',
  '[{"id":"71000000-0000-4000-8000-000000000003","category":"identity","value":"Persona ficticia Application"}]'::jsonb,
  '[{"id":"review-official","label":"Revisar la fuente","kind":"official"}]'::jsonb,
  '{"passed":true}'::jsonb, 'test-model'
);

do $$
begin
  begin
    update public.application_workspaces
    set cover_message = 'Contenido alterado que no debe persistir.'
    where id = '71000000-0000-4000-8000-000000000004';
    raise exception 'immutable content update unexpectedly succeeded';
  exception when others then
    if sqlerrm = 'immutable content update unexpectedly succeeded' then raise; end if;
  end;
end;
$$;

select * from public.accept_application_workspace(
  '71000000-0000-4000-8000-000000000002',
  '71000000-0000-4000-8000-000000000004', true
) \gset accepted_

select * from public.accept_application_workspace(
  '71000000-0000-4000-8000-000000000002',
  '71000000-0000-4000-8000-000000000004', true
) \gset repeated_

select pg_temp.assert(:'accepted_prepared_version_id' = :'repeated_prepared_version_id', 'repeated acceptance created another version');
select pg_temp.assert((
  select count(*) = 2 from public.generated_cvs
  where user_id = '71000000-0000-4000-8000-000000000002'
), 'acceptance must leave exactly source plus one adapted version');
select pg_temp.assert((
  select generation_kind = 'adapted'
    and parent_version_id = :'source_source_id'::uuid
    and user_attested = true
  from public.generated_cvs where id = :'accepted_prepared_version_id'::uuid
), 'prepared version lost lineage or attestation');

insert into public.application_workspaces (
  id, user_id, opportunity_id, source_version_id, source_content_hash,
  evidence_hash, opportunity_fingerprint, status, opportunity_snapshot,
  application_url_snapshot, requirement_analysis, fit_summary,
  tailored_cv_markdown, cover_message, evidence_snapshot, checklist,
  safety_checks, analysis_model
) values (
  '71000000-0000-4000-8000-000000000005',
  '71000000-0000-4000-8000-000000000002',
  'application-test-opportunity', :'source_source_id', :'source_source_hash',
  repeat('d', 64), repeat('f', 64), 'draft',
  jsonb_build_object(
    'id', 'application-test-opportunity', 'title', 'Analista de pruebas',
    'slug', 'application-test-opportunity', 'organization', 'Empresa ficticia',
    'updated_at', (select updated_at from public.opportunities where id = 'application-test-opportunity')
  ),
  'https://example.test/application-test',
  '[{"id":"requirement-1","text":"experiencia en pruebas de software","importance":"essential","status":"supported"}]'::jsonb,
  '{"coverage_score":100,"supported":1,"partial":0,"not_evidenced":0,"total":1}'::jsonb,
  '# Persona ficticia Application\n\n## Resumen Profesional\n\nAnalista de pruebas con evidencia confirmada.',
  'Presento mi candidatura como analista de pruebas con información confirmada.',
  '[{"id":"71000000-0000-4000-8000-000000000003","category":"identity","value":"Persona ficticia Application"}]'::jsonb,
  '[{"id":"review-official","label":"Revisar la fuente","kind":"official"}]'::jsonb,
  '{"passed":true}'::jsonb, 'test-model'
);

update public.opportunities
set description = description || ' Contenido modificado después de preparar.', updated_at = now() + interval '1 second'
where id = 'application-test-opportunity';

do $$
begin
  begin
    perform public.accept_application_workspace(
      '71000000-0000-4000-8000-000000000002',
      '71000000-0000-4000-8000-000000000005', true
    );
    raise exception 'changed opportunity acceptance unexpectedly succeeded';
  exception when others then
    if sqlerrm = 'changed opportunity acceptance unexpectedly succeeded' then raise; end if;
  end;
end;
$$;

select pg_temp.assert((
  select prepared_version_id is null and status = 'draft'
  from public.application_workspaces where id = '71000000-0000-4000-8000-000000000005'
), 'changed opportunity created or accepted a prepared version');

select public.update_application_checklist(
  '71000000-0000-4000-8000-000000000002',
  '71000000-0000-4000-8000-000000000004',
  '{"review-official":true}'::jsonb
);

do $$
begin
  begin
    perform public.update_application_checklist(
      '71000000-0000-4000-8000-000000000002',
      '71000000-0000-4000-8000-000000000004',
      '{"unknown-item":true}'::jsonb
    );
    raise exception 'unknown checklist item unexpectedly succeeded';
  exception when others then
    if sqlerrm = 'unknown checklist item unexpectedly succeeded' then raise; end if;
  end;
end;
$$;

select * from public.advance_application_workspace(
  '71000000-0000-4000-8000-000000000002',
  '71000000-0000-4000-8000-000000000004', 'opened'
);
select * from public.advance_application_workspace(
  '71000000-0000-4000-8000-000000000002',
  '71000000-0000-4000-8000-000000000004', 'submitted'
);

select pg_temp.assert((
  select status = 'submitted' and opened_at is not null and submitted_self_reported_at is not null
  from public.application_workspaces where id = '71000000-0000-4000-8000-000000000004'
), 'self-reported submission state was not preserved');
select pg_temp.assert(not has_table_privilege('anon', 'public.application_workspaces', 'select'), 'anon can read private applications');
select pg_temp.assert(not has_table_privilege('authenticated', 'public.application_workspaces', 'select'), 'authenticated can bypass the protected API');
select pg_temp.assert(not has_function_privilege('authenticated', 'public.accept_application_workspace(uuid,uuid,boolean)', 'execute'), 'authenticated can invoke acceptance directly');

select public.delete_b2c_user_data(
  '71000000-0000-4000-8000-000000000002', 'application-test@example.test'
) as deletion_result \gset deletion_

select pg_temp.assert((:'deletion_deletion_result'::jsonb->>'deleted_application_workspaces')::integer = 2, 'account deletion did not remove every application workspace');
select pg_temp.assert(not exists (
  select 1 from public.application_workspaces where user_id = '71000000-0000-4000-8000-000000000002'
), 'application workspace survived account deletion');

select
  :'accepted_prepared_version_id' as prepared_version_id,
  (select count(*) from public.generated_cvs where user_id = '71000000-0000-4000-8000-000000000002') as versions_after_deletion,
  :'deletion_deletion_result'::jsonb as deletion_result;

rollback;
