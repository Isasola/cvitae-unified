-- A B2B vacancy and its B2C opportunity mirror are one publication unit.
-- Any error in either insert rolls the whole function back.
create or replace function public.create_recruiter_vacancy_atomic(
  p_recruiter_token_id text,
  p_title text,
  p_description text,
  p_requirements text,
  p_location text,
  p_modality text,
  p_salary_range text,
  p_slug text,
  p_rubro text,
  p_tags text[],
  p_application_url text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token public.recruiter_tokens%rowtype;
  v_vacancy public.recruiter_vacancies%rowtype;
  v_typed_input public.recruiter_vacancies%rowtype;
  v_opportunity_id text;
begin
  if nullif(trim(p_title), '') is null
    or nullif(trim(p_description), '') is null
    or nullif(trim(p_requirements), '') is null
    or nullif(trim(p_location), '') is null then
    raise exception 'required_vacancy_fields_missing';
  end if;
  if nullif(trim(p_slug), '') is null or p_slug !~ '^[a-z0-9-]{3,80}$' then
    raise exception 'invalid_vacancy_slug';
  end if;
  if p_application_url !~ '^https://[^[:space:]]+$' then
    raise exception 'invalid_vacancy_url';
  end if;

  select * into v_token
  from public.recruiter_tokens
  where id::text = p_recruiter_token_id
    and is_active = true
    and verification_status = 'verified'
  for key share;
  if not found then raise exception 'invalid_recruiter'; end if;
  if nullif(trim(v_token.company_name), '') is null then
    raise exception 'verified_company_name_missing';
  end if;

  -- Compatible with historical databases where recruiter_token_id was text
  -- and newer reproducible schemas where it is uuid.
  v_typed_input := jsonb_populate_record(
    null::public.recruiter_vacancies,
    jsonb_build_object('recruiter_token_id', v_token.id::text)
  );

  begin
    insert into public.recruiter_vacancies (
      title, description, requirements, location, modality, salary_range,
      company, slug, recruiter_token_id, is_active
    ) values (
      trim(p_title), trim(p_description), trim(p_requirements), trim(p_location),
      coalesce(nullif(trim(p_modality), ''), 'Presencial'),
      nullif(trim(coalesce(p_salary_range, '')), ''), trim(v_token.company_name),
      p_slug, v_typed_input.recruiter_token_id, true
    ) returning * into v_vacancy;
  exception when others then
    raise exception 'RECRUITER_VACANCY_INSERT_FAILED: %', sqlerrm;
  end;

  begin
    insert into public.opportunities (
      title, organization, description, location, type, rubro, tags,
      application_url, recruiter_vacancy_id, source, source_authority,
      original_source_url, original_source_verified, opportunity_kind,
      opportunity_type, country_code, verification_status, verification_score,
      verification_reasons, reviewed_at, reviewed_by, is_active
    ) values (
      trim(p_title), trim(v_token.company_name), trim(p_description), trim(p_location),
      coalesce(nullif(trim(p_modality), ''), 'Presencial'),
      coalesce(nullif(trim(p_rubro), ''), 'General'), coalesce(p_tags, '{}'::text[]),
      p_application_url, v_vacancy.id, 'recruiter_b2b', 'original',
      p_application_url, true, 'empleo', 'job', 'PY', 'verified', 100,
      jsonb_build_array('empresa verificada', 'vacante creada en CVitae'),
      now(), 'verified_recruiter:' || v_token.id::text, true
    ) returning id into v_opportunity_id;
  exception when others then
    raise exception 'OPPORTUNITY_MIRROR_INSERT_FAILED: %', sqlerrm;
  end;

  return jsonb_build_object(
    'success', true,
    'id', v_vacancy.id,
    'slug', v_vacancy.slug,
    'opportunity_id', v_opportunity_id,
    'url', p_application_url
  );
end;
$$;

revoke all on function public.create_recruiter_vacancy_atomic(text,text,text,text,text,text,text,text,text,text[],text)
  from public, anon, authenticated;
grant execute on function public.create_recruiter_vacancy_atomic(text,text,text,text,text,text,text,text,text,text[],text)
  to service_role;
