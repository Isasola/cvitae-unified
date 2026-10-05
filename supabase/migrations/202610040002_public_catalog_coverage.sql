-- LOCAL ONLY: bounded queries over the entire existing canonical Catalog.
create extension if not exists pg_trgm with schema extensions;
create or replace function public.catalog_search_text(p_title text,p_org text,p_location text,p_area text,p_type text,p_kind text)
returns text language sql immutable parallel safe as $$
  select lower(coalesce(p_title,'')||' '||coalesce(p_org,'')||' '||coalesce(p_location,'')||' '||coalesce(p_area,'')||' '||coalesce(p_type,'')||' '||coalesce(p_kind,'')||' '||
    case coalesce(nullif(p_type,''),p_kind)
      when 'scholarship' then 'beca' when 'fellowship' then 'fellowship'
      when 'seed_capital' then 'capital semilla' when 'accelerator' then 'aceleradora'
      when 'incubator' then 'incubadora' when 'startup_competition' then 'competencia'
      when 'research_funding' then 'investigación' when 'training' then 'formación'
      when 'exchange_program' then 'intercambio' when 'volunteering' then 'voluntariado'
      when 'tender' then 'licitación' else '' end)
$$;
create index if not exists opportunities_catalog_search_idx on public.opportunities using gin
  (public.catalog_search_text(title,organization,location,rubro,opportunity_type,opportunity_kind) extensions.gin_trgm_ops);
create index if not exists opportunities_catalog_area_idx on public.opportunities(rubro,updated_at desc,id);

create or replace function public.search_public_opportunities(
  p_query text default '',p_area text default null,p_types text[] default null,p_mode text default 'all',
  p_after_updated_at timestamptz default null,p_after_id text default null,p_limit integer default 101
) returns setof public.opportunities language plpgsql stable security definer set search_path=public,extensions as $$
begin
  if p_limit<1 or p_limit>101 or length(coalesce(p_query,''))>200 or p_mode not in ('all','jobs','non_jobs') then
    raise exception 'invalid_public_page';
  end if;
  return query select o.* from public.opportunity_catalog_universe v join public.opportunities o on o.id=v.id
    where (coalesce(trim(p_query),'')='' or public.catalog_search_text(o.title,o.organization,o.location,o.rubro,o.opportunity_type,o.opportunity_kind)
      like '%'||replace(replace(replace(lower(trim(p_query)),'!','!!'),'%','!%'),'_','!_')||'%' escape '!')
    and (p_area is null or o.rubro=p_area)
    and (p_types is null or coalesce(nullif(o.opportunity_type,''),
      case o.opportunity_kind when 'empleo' then 'job' when 'pasantia' then 'internship' when 'beca' then 'scholarship'
        when 'voluntariado' then 'volunteering' when 'curso' then 'training' when 'intercambio' then 'exchange_program'
        when 'concurso' then 'startup_competition' when 'programa' then 'grant' when 'conferencia' then 'training'
        else o.opportunity_kind end)=any(p_types) or (o.opportunity_kind='programa' and 'programa'=any(p_types)))
    and (p_mode='all' or (p_mode='jobs')=(lower(coalesce(nullif(o.opportunity_type,''),o.opportunity_kind,'')) in ('job','internship','consultancy','empleo')))
    and (p_after_id is null or (p_after_updated_at is not null and (o.updated_at<p_after_updated_at or o.updated_at is null))
      or (o.updated_at is not distinct from p_after_updated_at and o.id::text>p_after_id))
    order by o.updated_at desc nulls last,o.id asc limit p_limit;
end $$;
revoke all on function public.search_public_opportunities(text,text,text[],text,timestamptz,text,integer) from public,anon,authenticated;
grant execute on function public.search_public_opportunities(text,text,text[],text,timestamptz,text,integer) to service_role;
