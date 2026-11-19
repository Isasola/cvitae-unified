\set ON_ERROR_STOP on

begin;

insert into public.recruiter_tokens (
  id, email, company_name, access_token, verification_status, is_active
) values (
  '00000000-0000-4000-8000-000000000103',
  'b2b-atomic-fixture@example.org',
  'Empresa QA Atomic',
  'REC-QA-ATOMIC-2026',
  'verified',
  true
);

create or replace function pg_temp.fail_atomic_mirror_fixture()
returns trigger
language plpgsql
as $$
begin
  if new.title = 'Atomic mirror failure fixture' then
    raise exception 'forced_mirror_failure';
  end if;
  return new;
end;
$$;

create trigger fail_atomic_mirror_fixture
before insert on public.opportunities
for each row execute function pg_temp.fail_atomic_mirror_fixture();

do $test$
declare
  v_result jsonb;
begin
  v_result := public.create_recruiter_vacancy_atomic(
    '00000000-0000-4000-8000-000000000103',
    'Asesor Comercial QA',
    'Descripción completa de responsabilidades para la prueba local.',
    'Requisitos obligatorios para la prueba local.',
    'Asunción, Paraguay',
    'Presencial',
    'Gs. 4.000.000',
    'asesor-comercial-qa-atomic',
    'Marketing / Ventas',
    array['ventas', 'comercial'],
    'https://cvitae.lat/vacante/asesor-comercial-qa-atomic'
  );

  if coalesce((v_result->>'success')::boolean, false) is not true
    or nullif(v_result->>'id', '') is null
    or nullif(v_result->>'opportunity_id', '') is null then
    raise exception 'normal atomic creation did not return a complete result';
  end if;
  if not exists (
    select 1 from public.recruiter_vacancies
    where slug = 'asesor-comercial-qa-atomic'
      and is_active
      and company = 'Empresa QA Atomic'
      and salary_range = 'Gs. 4.000.000'
  ) then
    raise exception 'normal recruiter vacancy was not persisted active';
  end if;
  if not exists (
    select 1 from public.opportunities
    where recruiter_vacancy_id = (v_result->>'id')::uuid
      and source = 'recruiter_b2b'
      and is_active
      and verification_status = 'verified'
      and catalog_eligible
      and match_eligible
      and alerts_eligible
      and seo_eligible
      and type = 'Presencial'
  ) then
    raise exception 'normal B2C opportunity mirror was not persisted active';
  end if;

  v_result := public.create_recruiter_vacancy_atomic(
    '00000000-0000-4000-8000-000000000103',
    'Salary Optional QA',
    'Descripción suficientemente completa para probar salario opcional.',
    'Requisitos suficientemente completos para la prueba.',
    'Asunción, Paraguay',
    'Presencial',
    '',
    'salary-optional-qa-atomic',
    'Marketing / Ventas',
    array[]::text[],
    'https://cvitae.lat/vacante/salary-optional-qa-atomic'
  );
  if not exists (
    select 1 from public.recruiter_vacancies
    where slug = 'salary-optional-qa-atomic' and salary_range is null and is_active
  ) then
    raise exception 'empty optional salary was not normalized to null';
  end if;

  begin
    perform public.create_recruiter_vacancy_atomic(
      '00000000-0000-4000-8000-000000000103',
      'Atomic mirror failure fixture',
      'Descripción que llega correctamente al primer insert.',
      'Requisitos que llegan correctamente al primer insert.',
      'Asunción, Paraguay',
      'Presencial',
      null,
      'atomic-mirror-failure-fixture',
      'Marketing / Ventas',
      array[]::text[],
      'https://cvitae.lat/vacante/atomic-mirror-failure-fixture'
    );
    raise exception 'forced mirror failure unexpectedly returned success';
  exception when others then
    if sqlerrm = 'forced mirror failure unexpectedly returned success' then
      raise;
    end if;
  end;

  if exists (
    select 1 from public.recruiter_vacancies
    where slug = 'atomic-mirror-failure-fixture'
  ) then
    raise exception 'failed mirror left a partial recruiter vacancy';
  end if;
  if exists (
    select 1 from public.opportunities
    where application_url = 'https://cvitae.lat/vacante/atomic-mirror-failure-fixture'
  ) then
    raise exception 'failed mirror left a partial opportunity';
  end if;

  if has_function_privilege('anon',
       'public.create_recruiter_vacancy_atomic(text,text,text,text,text,text,text,text,text,text[],text)',
       'execute')
    or has_function_privilege('authenticated',
       'public.create_recruiter_vacancy_atomic(text,text,text,text,text,text,text,text,text,text[],text)',
       'execute')
    or not has_function_privilege('service_role',
       'public.create_recruiter_vacancy_atomic(text,text,text,text,text,text,text,text,text,text[],text)',
       'execute') then
    raise exception 'atomic RPC execute grants are unsafe';
  end if;

  raise notice 'PASS B2B vacancy atomic creation, optional salary, and rollback';
end;
$test$;

rollback;
