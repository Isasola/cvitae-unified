-- Keep semantic search synchronized with scraper inserts and content updates.
-- New rows already start with embedding = null; meaningful edits must invalidate
-- the previous vector so the scheduled worker regenerates it.

create or replace function public.invalidate_opportunity_embedding()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.title is distinct from old.title
    or new.organization is distinct from old.organization
    or new.rubro is distinct from old.rubro
    or new.type is distinct from old.type
    or new.opportunity_type is distinct from old.opportunity_type
    or new.opportunity_kind is distinct from old.opportunity_kind
    or new.tags is distinct from old.tags
    or new.location is distinct from old.location
    or new.country_code is distinct from old.country_code
    or new.eligible_countries is distinct from old.eligible_countries
    or new.description is distinct from old.description
  then
    new.embedding := null;
  end if;
  return new;
end;
$$;

drop trigger if exists opportunities_invalidate_embedding on public.opportunities;
create trigger opportunities_invalidate_embedding
before update on public.opportunities
for each row
execute function public.invalidate_opportunity_embedding();

comment on function public.invalidate_opportunity_embedding() is
  'Invalidates semantic vectors whenever scraper-controlled matching content changes.';
