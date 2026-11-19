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
  '70000000-0000-4000-8000-000000000001',
  '70000000-0000-4000-8000-000000000002',
  'rewrite-test@example.test',
  'Persona ficticia Rewrite',
  'Analista de pruebas',
  '{}'::jsonb
);

insert into public.cv_evidence_items (
  id, user_id, profile_id, fingerprint, category, claim, source_kind,
  source_label, status, confirmed_value, active, reviewed_at
) values (
  '70000000-0000-4000-8000-000000000003',
  '70000000-0000-4000-8000-000000000002',
  '70000000-0000-4000-8000-000000000001',
  repeat('b', 64), 'identity', 'Persona ficticia Rewrite', 'manual',
  'Prueba local', 'confirmed', 'Persona ficticia Rewrite', true, now()
);

select id as source_id, content_hash as source_hash, version_number as source_number
from public.create_cv_version(
  '70000000-0000-4000-8000-000000000002',
  'base_cv',
  '# Persona ficticia Rewrite\n\n## Resumen Profesional\n\nAnalista de pruebas con experiencia ficticia para QA local.',
  'CV ficticio de origen',
  'manual', null,
  '[{"id":"70000000-0000-4000-8000-000000000003","category":"identity","value":"Persona ficticia Rewrite"}]'::jsonb,
  '{}'::jsonb, true
) \gset source_

insert into public.cv_rewrite_proposals (
  id, user_id, source_version_id, source_content_hash, evidence_hash,
  objective, status, proposal_markdown, changes, evidence_snapshot,
  diagnostic_snapshot, safety_checks, analysis_model
) values (
  '70000000-0000-4000-8000-000000000004',
  '70000000-0000-4000-8000-000000000002',
  :'source_source_id', :'source_source_hash', repeat('c', 64),
  'ats_clarity', 'draft',
  '# Persona ficticia Rewrite\n\n## Resumen Profesional\n\nAnalista de pruebas. Contenido ficticio usado únicamente para QA local.',
  '[{"id":"change-1","after":"Persona ficticia Rewrite","evidence":[{"id":"70000000-0000-4000-8000-000000000003"}]}]'::jsonb,
  '[{"id":"70000000-0000-4000-8000-000000000003","category":"identity","value":"Persona ficticia Rewrite"}]'::jsonb,
  '{}'::jsonb,
  '{"passed":true,"valid_evidence_references":true,"numeric_claims_backed":true}'::jsonb,
  'test-model'
);

do $$
declare
  blocked boolean := false;
begin
  begin
    update public.cv_rewrite_proposals
    set proposal_markdown = proposal_markdown || ' alterado'
    where id = '70000000-0000-4000-8000-000000000004';
  exception when others then
    blocked := position('immutable' in sqlerrm) > 0;
  end;
  if not blocked then raise exception 'rewrite proposal content was mutable'; end if;
end;
$$;

select proposal_id, version_id, version_number, status
from public.accept_cv_rewrite_proposal(
  '70000000-0000-4000-8000-000000000002',
  '70000000-0000-4000-8000-000000000004',
  true
) \gset accepted_

select proposal_id, version_id, version_number, status
from public.accept_cv_rewrite_proposal(
  '70000000-0000-4000-8000-000000000002',
  '70000000-0000-4000-8000-000000000004',
  true
) \gset repeated_

select pg_temp.assert(:'accepted_status' = 'accepted', 'proposal was not accepted');
select pg_temp.assert(:'accepted_version_number'::integer = 2, 'accepted rewrite did not create the next version');
select pg_temp.assert(:'repeated_version_id'::uuid = :'accepted_version_id'::uuid, 'repeated acceptance created another version');
select pg_temp.assert(
  (select count(*) from public.generated_cvs where user_id = '70000000-0000-4000-8000-000000000002') = 2,
  'acceptance was not idempotent'
);
select pg_temp.assert(
  exists (
    select 1 from public.generated_cvs
    where id = :'accepted_version_id'
      and generation_kind = 'rewritten'
      and parent_version_id = :'source_source_id'
      and user_attested is true
  ),
  'accepted version lost lineage or attestation'
);
select pg_temp.assert(not has_table_privilege('anon', 'public.cv_rewrite_proposals', 'select'), 'anon can read rewrite proposals');
select pg_temp.assert(not has_table_privilege('authenticated', 'public.cv_rewrite_proposals', 'select'), 'authenticated browser can read rewrite proposals directly');
select pg_temp.assert(not has_function_privilege('authenticated', 'public.accept_cv_rewrite_proposal(uuid,uuid,boolean)', 'execute'), 'authenticated browser can execute rewrite acceptance directly');

insert into public.cv_rewrite_proposals (
  id, user_id, source_version_id, source_content_hash, evidence_hash,
  objective, status, proposal_markdown, changes, evidence_snapshot,
  diagnostic_snapshot, safety_checks, analysis_model
) values (
  '70000000-0000-4000-8000-000000000005',
  '70000000-0000-4000-8000-000000000002',
  :'source_source_id', :'source_source_hash', repeat('d', 64),
  'concise', 'draft',
  '# Persona ficticia Rewrite\n\n## Resumen Profesional\n\nPropuesta ficticia que será descartada sin crear una versión adicional.',
  '[]'::jsonb,
  '[{"id":"70000000-0000-4000-8000-000000000003","category":"identity","value":"Persona ficticia Rewrite"}]'::jsonb,
  '{}'::jsonb, '{"passed":true}'::jsonb, 'test-model'
);

select proposal_id, status
from public.discard_cv_rewrite_proposal(
  '70000000-0000-4000-8000-000000000002',
  '70000000-0000-4000-8000-000000000005'
) \gset discarded_

select pg_temp.assert(:'discarded_status' = 'discarded', 'proposal was not discarded');
select pg_temp.assert(
  (select count(*) from public.generated_cvs where user_id = '70000000-0000-4000-8000-000000000002') = 2,
  'discarding a proposal created a CV version'
);

select public.delete_b2c_user_data(
  '70000000-0000-4000-8000-000000000002',
  'rewrite-test@example.test'
) as deletion_result \gset deleted_

select pg_temp.assert(
  not exists (select 1 from public.cv_rewrite_proposals where user_id = '70000000-0000-4000-8000-000000000002'),
  'account deletion kept rewrite proposals'
);

select
  :'source_source_id' as source_version_id,
  :'accepted_version_id' as accepted_version_id,
  :'accepted_version_number' as accepted_version_number,
  2 as versions_after_repeated_accept,
  :'discarded_status' as discarded_status,
  :'deleted_deletion_result' as deletion_result;

rollback;
