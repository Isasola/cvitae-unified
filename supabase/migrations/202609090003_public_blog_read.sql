-- Active blog articles are public content. A production policy drift allowed
-- opportunities through content_hub while hiding every active blog row from
-- anon/authenticated clients and from the SEO prerender.
grant select on table public.content_hub to anon, authenticated;

drop policy if exists "public_read_active_blog" on public.content_hub;
create policy "public_read_active_blog"
  on public.content_hub
  for select
  to anon, authenticated
  using (is_active = true and tipo = 'blog');
