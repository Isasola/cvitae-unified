-- Rebuild content_hub policies to remove production-only restrictive drift.
-- Published rows are public; drafts and every write remain service-role only.
do $$
declare
  policy_row record;
begin
  for policy_row in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'content_hub'
  loop
    execute format('drop policy if exists %I on public.content_hub', policy_row.policyname);
  end loop;
end $$;

revoke all on table public.content_hub from anon, authenticated;
grant select on table public.content_hub to anon, authenticated;
grant all on table public.content_hub to service_role;

create policy "public_read_published_content"
  on public.content_hub
  for select
  to anon, authenticated
  using (is_active = true);

create policy "service_content_hub"
  on public.content_hub
  for all
  to service_role
  using (true)
  with check (true);
