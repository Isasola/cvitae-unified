-- LOCAL ONLY: exact filtered Catalog count, independent from page size.
create or replace function public.count_public_opportunities(
  p_query text default '', p_area text default null,
  p_types text[] default null, p_mode text default 'all'
) returns bigint language plpgsql stable security definer
set search_path=public,extensions as $$
declare result bigint;
begin
  if length(coalesce(p_query,'')) > 200 or p_mode is null or p_mode not in ('all','jobs','non_jobs') then
    raise exception 'invalid_public_page';
  end if;
  select count(*) into result
  from public.opportunity_catalog_universe v
  join public.opportunities o on o.id=v.id
  where (coalesce(trim(p_query),'')='' or public.catalog_search_text(o.title,o.organization,o.location,o.rubro,o.opportunity_type,o.opportunity_kind)
      like '%'||replace(replace(replace(lower(trim(p_query)),'!','!!'),'%','!%'),'_','!_')||'%' escape '!')
    and (p_area is null or o.rubro=p_area)
    and (p_types is null or coalesce(nullif(o.opportunity_type,''),
      case o.opportunity_kind when 'empleo' then 'job' when 'pasantia' then 'internship' when 'beca' then 'scholarship'
        when 'voluntariado' then 'volunteering' when 'curso' then 'training' when 'intercambio' then 'exchange_program'
        when 'concurso' then 'startup_competition' when 'programa' then 'grant' when 'conferencia' then 'training'
        else o.opportunity_kind end)=any(p_types) or (o.opportunity_kind='programa' and 'programa'=any(p_types)))
    and (p_mode='all' or (p_mode='jobs')=(lower(coalesce(nullif(o.opportunity_type,''),o.opportunity_kind,'')) in ('job','internship','consultancy','empleo')));
  return result;
end $$;

revoke all on function public.count_public_opportunities(text,text,text[],text) from public,anon,authenticated;
grant execute on function public.count_public_opportunities(text,text,text[],text) to service_role;
