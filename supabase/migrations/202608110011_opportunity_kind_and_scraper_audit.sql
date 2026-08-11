alter table public.opportunities
  add column if not exists opportunity_kind text not null default 'empleo';

alter table public.opportunities drop constraint if exists opportunities_opportunity_kind_check;
alter table public.opportunities add constraint opportunities_opportunity_kind_check
  check (opportunity_kind in ('empleo', 'beca', 'pasantia', 'concurso', 'voluntariado', 'curso', 'intercambio', 'conferencia', 'programa'));

update public.opportunities
set opportunity_kind = case
  when lower(coalesce(type, '')) like '%beca%' then 'beca'
  when lower(coalesce(type, '')) like '%pasant%' then 'pasantia'
  when lower(coalesce(type, '')) like '%concurso%' then 'concurso'
  when lower(coalesce(type, '')) like '%voluntar%' then 'voluntariado'
  when lower(coalesce(type, '')) like '%curso%' then 'curso'
  when lower(coalesce(type, '')) like '%intercambio%' then 'intercambio'
  when lower(coalesce(type, '')) like '%conferencia%' then 'conferencia'
  when lower(coalesce(type, '')) like '%programa%' then 'programa'
  else 'empleo'
end;

create index if not exists opportunities_public_kind_idx
  on public.opportunities (opportunity_kind, created_at desc)
  where is_active = true and catalog_eligible = true and deleted_at is null and archived_at is null;

alter table public.scraper_controls
  add column if not exists audit_status text not null default 'untested',
  add column if not exists audit_found_count integer,
  add column if not exists audit_valid_count integer,
  add column if not exists audit_unique_count integer,
  add column if not exists audit_sample_count integer,
  add column if not exists audit_notes text;

alter table public.scraper_controls drop constraint if exists scraper_controls_audit_status_check;
alter table public.scraper_controls add constraint scraper_controls_audit_status_check
  check (audit_status in ('untested', 'candidate', 'needs_review', 'directory_only', 'empty', 'broken'));

update public.scraper_controls
set audit_status = 'empty', audit_found_count = 0, audit_valid_count = 0,
    audit_unique_count = 0, audit_sample_count = 0,
    audit_notes = 'Ejecución real aislada: no produjo oportunidades válidas. Mantener pausado y reparar.',
    quality_status = 'unproductive', collection_enabled = false, require_review = true,
    last_audited_at = now(), updated_at = now(), updated_by = 'audit-2026-08-11';

with audit(scraper_id, audit_status, found_count, valid_count, unique_count, sample_count) as (values
  ('arbeitnow_scraper','candidate',308,308,40,20),
  ('automotriz_scraper','needs_review',10,1,1,1),
  ('bancos_scraper','needs_review',2,1,1,1),
  ('becal_scraper','needs_review',60,60,40,20),
  ('callcenters_scraper','needs_review',13,11,11,11),
  ('computrabajo_scraper','candidate',379,379,40,20),
  ('foros_scraper','needs_review',1,1,1,1),
  ('fundacion_carolina_scraper','candidate',26,26,26,20),
  ('fundacion_scraper','needs_review',7,7,7,7),
  ('gastronomia_hoteles_scraper','needs_review',10,1,1,1),
  ('himalayas_scraper','candidate',400,400,40,20),
  ('jobicy_scraper','candidate',168,168,40,20),
  ('logistica_transporte_scraper','needs_review',13,4,4,4),
  ('medios_comunicacion_scraper','needs_review',10,1,1,1),
  ('ongs_scraper','needs_review',43,22,22,20),
  ('opportunitydesk_scraper','candidate',347,347,40,20),
  ('oya_scraper','candidate',96,96,40,20),
  ('remotive_scraper','candidate',20,20,20,20),
  ('seguros_scraper','needs_review',2,1,1,1),
  ('talentcom_scraper','needs_review',150,150,40,20),
  ('unjobs_scraper','candidate',171,6,6,6),
  ('weworkremotely_scraper','candidate',420,420,40,20)
)
update public.scraper_controls controls
set audit_status = audit.audit_status,
    audit_found_count = audit.found_count,
    audit_valid_count = audit.valid_count,
    audit_unique_count = audit.unique_count,
    audit_sample_count = audit.sample_count,
    audit_notes = case when audit.audit_status = 'candidate'
      then 'Extracción concreta confirmada en modo aislado. Requiere importación a revisión y validación de elegibilidad antes de publicar.'
      else 'Produjo datos, pero la muestra contiene navegación, noticias, páginas genéricas o metadatos insuficientes. Reparar antes de importar.' end,
    quality_status = 'degraded', collection_enabled = false, require_review = true,
    last_audited_at = now(), updated_at = now(), updated_by = 'audit-2026-08-11'
from audit where controls.scraper_id = audit.scraper_id;

update public.scraper_controls
set collection_enabled = true, require_review = false, quality_status = 'healthy',
    audit_notes = 'Extracción paraguaya concreta confirmada; fuente previamente verificada y operativa.'
where scraper_id = 'computrabajo_scraper';
