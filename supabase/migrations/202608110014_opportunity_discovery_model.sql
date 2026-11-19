alter table public.opportunities
  add column if not exists opportunity_type text,
  add column if not exists eligible_countries text[] not null default '{}',
  add column if not exists eligible_regions text[] not null default '{}',
  add column if not exists remote boolean,
  add column if not exists onsite_country text,
  add column if not exists funding_type text,
  add column if not exists funding_amount numeric,
  add column if not exists currency text,
  add column if not exists fully_funded boolean,
  add column if not exists deadline timestamptz,
  add column if not exists published_at timestamptz,
  add column if not exists age_min integer,
  add column if not exists age_max integer,
  add column if not exists education_level text,
  add column if not exists experience_required text,
  add column if not exists citizenship_requirement text,
  add column if not exists residency_requirement text,
  add column if not exists sector text,
  add column if not exists tags text[] not null default '{}',
  add column if not exists source_url text,
  add column if not exists source_authority text not null default 'aggregator',
  add column if not exists original_source_url text,
  add column if not exists original_source_verified boolean not null default false,
  add column if not exists verified_at timestamptz;

alter table public.opportunities drop constraint if exists opportunities_opportunity_type_check;
alter table public.opportunities add constraint opportunities_opportunity_type_check check (
  opportunity_type is null or opportunity_type in (
    'job', 'internship', 'consultancy', 'scholarship', 'fellowship', 'grant',
    'seed_capital', 'accelerator', 'incubator', 'startup_competition',
    'research_funding', 'training', 'exchange_program', 'volunteering', 'tender'
  )
);

alter table public.opportunities drop constraint if exists opportunities_source_authority_check;
alter table public.opportunities add constraint opportunities_source_authority_check
  check (source_authority in ('original', 'aggregator', 'discovery'));

alter table public.opportunities drop constraint if exists opportunities_age_range_check;
alter table public.opportunities add constraint opportunities_age_range_check check (
  (age_min is null or age_min between 0 and 120)
  and (age_max is null or age_max between 0 and 120)
  and (age_min is null or age_max is null or age_min <= age_max)
);

update public.opportunities
set opportunity_type = case opportunity_kind
  when 'empleo' then 'job'
  when 'pasantia' then 'internship'
  when 'beca' then 'scholarship'
  when 'voluntariado' then 'volunteering'
  when 'curso' then 'training'
  when 'intercambio' then 'exchange_program'
  when 'concurso' then 'startup_competition'
  else 'grant'
end
where opportunity_type is null;

create index if not exists opportunities_type_public_idx
  on public.opportunities (opportunity_type, created_at desc)
  where is_active = true and catalog_eligible = true and deleted_at is null and archived_at is null;

create index if not exists opportunities_deadline_idx
  on public.opportunities (deadline)
  where deadline is not null and deleted_at is null;

comment on column public.opportunities.source_authority is
  'original=fuente oficial; aggregator=descubrimiento que exige verificar original; discovery=señal que nunca se publica directamente';
