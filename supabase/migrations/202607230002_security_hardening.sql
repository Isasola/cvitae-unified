-- CVitae production RLS hardening.
-- Public forms use Netlify Functions with service_role; browser clients only
-- receive explicit read access to public content and own candidate records.

do $$
declare
  policy_row record;
begin
  for policy_row in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'content_hub', 'linkedin_posts', 'pedidos', 'recruiter_analyses',
        'recruiter_leads', 'recruiter_tokens', 'recruiter_vacancies',
        'skill_candidates', 'tokens', 'vacancy_applications'
      )
  loop
    execute format('drop policy if exists %I on %I.%I',
      policy_row.policyname, policy_row.schemaname, policy_row.tablename);
  end loop;
end $$;

revoke all on table public.content_hub from anon, authenticated;
revoke all on table public.linkedin_posts from anon, authenticated;
revoke all on table public.pedidos from anon, authenticated;
revoke all on table public.recruiter_analyses from anon, authenticated;
revoke all on table public.recruiter_leads from anon, authenticated;
revoke all on table public.recruiter_tokens from anon, authenticated;
revoke all on table public.recruiter_vacancies from anon, authenticated;
revoke all on table public.skill_candidates from anon, authenticated;
revoke all on table public.tokens from anon, authenticated;
revoke all on table public.vacancy_applications from anon, authenticated;

grant select on table public.content_hub to anon, authenticated;
grant select on table public.recruiter_vacancies to anon, authenticated;

create policy "public_read_published_content"
  on public.content_hub for select to anon, authenticated
  using (is_active = true);

create policy "public_read_active_vacancies"
  on public.recruiter_vacancies for select to anon, authenticated
  using (is_active = true);

-- Server-side functions and automation retain full access.
grant all on table public.content_hub to service_role;
grant all on table public.linkedin_posts to service_role;
grant all on table public.pedidos to service_role;
grant all on table public.recruiter_analyses to service_role;
grant all on table public.recruiter_leads to service_role;
grant all on table public.recruiter_tokens to service_role;
grant all on table public.recruiter_vacancies to service_role;
grant all on table public.skill_candidates to service_role;
grant all on table public.tokens to service_role;
grant all on table public.vacancy_applications to service_role;

create policy "service_content_hub" on public.content_hub
  for all to service_role using (true) with check (true);
create policy "service_linkedin_posts" on public.linkedin_posts
  for all to service_role using (true) with check (true);
create policy "service_pedidos" on public.pedidos
  for all to service_role using (true) with check (true);
create policy "service_recruiter_analyses" on public.recruiter_analyses
  for all to service_role using (true) with check (true);
create policy "service_recruiter_leads" on public.recruiter_leads
  for all to service_role using (true) with check (true);
create policy "service_recruiter_tokens" on public.recruiter_tokens
  for all to service_role using (true) with check (true);
create policy "service_recruiter_vacancies" on public.recruiter_vacancies
  for all to service_role using (true) with check (true);
create policy "service_skill_candidates" on public.skill_candidates
  for all to service_role using (true) with check (true);
create policy "service_tokens" on public.tokens
  for all to service_role using (true) with check (true);
create policy "service_vacancy_applications" on public.vacancy_applications
  for all to service_role using (true) with check (true);

-- Prevent future tables from automatically granting ALL to browser roles.
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on tables from authenticated;
