-- WRITE CUTOVER / NOT AUTHORIZED BY DEFAULT.
-- Run only after the 12-argument handler is deployed, observed healthy and the
-- operator has established that no legacy caller remains. This is not part of
-- schema apply or historical reconciliation authorization.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
create or replace function public.create_recruiter_vacancy_atomic(
  p_recruiter_token_id text,p_title text,p_description text,p_requirements text,p_location text,p_modality text,
  p_salary_range text,p_slug text,p_rubro text,p_tags text[],p_application_url text
) returns jsonb language plpgsql security definer set search_path='' as $$
begin
  raise exception 'operation_id_required_after_r2_cutover';
end $$;
revoke all on function public.create_recruiter_vacancy_atomic(
  text,text,text,text,text,text,text,text,text,text[],text
) from public,anon,authenticated;
grant execute on function public.create_recruiter_vacancy_atomic(
  text,text,text,text,text,text,text,text,text,text[],text
) to service_role;
commit;
