-- READ ONLY, POST-APPLY operator verification. Do not run before authorization.
-- EXPLAIN ANALYZE executes these two bounded reads (and consumes IO); it neither
-- changes data nor performs maintenance. No count(*) or inventory-wide parity
-- scan is needed here. Local verifier proves old/new full fixture equivalence.
--
-- Acceptance: READY-id index -> opportunity PK lookups for the current page;
-- no full opportunities outer scan / ~16k universe PK probes to produce 250.
-- The second plan must seek opportunity_id > cursor at the partial index.
-- Live gates can legitimately require more than 250 candidates to yield 250.
-- Record times/buffers and confirm comfortable headroom under the REAL timeout.
-- 250 is a page size, not a product cap. The build continues keyset until EOF.
-- Apply ONLY 202610080001_seo_universe_read_path.sql first, after authorization.
-- It builds one index (IO/locking during application) and replaces one view;
-- it does not edit/reapply 040001, run recovery, or activate scheduled workers.
-- Rollback: restore ONLY the opportunity_seo_universe CREATE OR REPLACE from
-- unchanged 202610040001 (or the saved pre-apply view definition). The additive
-- index may remain: it changes no truth and needs no immediate IO cleanup.
-- PROD performance/timeout acceptance is PENDING until these plans and the
-- exhaustive real-data build pass; the local fixture is not PROD validation.

select pg_get_indexdef('public.opportunity_universe_seo_ready_id_idx'::regclass)
  as seo_ready_index,
  c.reloptions as view_options,
  pg_get_userbyid(c.relowner) as view_owner,
  c.relacl as view_acl
from pg_class c
where c.oid='public.opportunity_seo_universe'::regclass;

explain (analyze, buffers)
select id,slug,title,organization,description,location,city,department,
  country_code,eligible_countries,eligible_regions,remote_scope,tags,deadline,
  application_url,source_url,source,opportunity_type,opportunity_kind,type,
  created_at,updated_at,is_active,verification_status,catalog_eligible,
  seo_eligible,seo_status,deleted_at,archived_at
from public.opportunity_seo_universe
where slug is not null
order by id asc
limit 250;

-- Cursor comes from the actual first eligible page; no guessed source or ID.
explain (analyze, buffers)
with first_page as materialized (
  select id from public.opportunity_seo_universe
  where slug is not null order by id asc limit 250
), cursor as (select max(id) last_id from first_page)
select s.id,s.slug,s.title,s.organization,s.description,s.location,s.city,s.department,
  s.country_code,s.eligible_countries,s.eligible_regions,s.remote_scope,s.tags,s.deadline,
  s.application_url,s.source_url,s.source,s.opportunity_type,s.opportunity_kind,s.type,
  s.created_at,s.updated_at,s.is_active,s.verification_status,s.catalog_eligible,
  s.seo_eligible,s.seo_status,s.deleted_at,s.archived_at
from public.opportunity_seo_universe s
where s.slug is not null and s.id > (select last_id from cursor)
order by s.id asc
limit 250;

-- Subsequent exhaustive build smoke is local with the authorized production
-- read credentials, never a deploy. Do not increase timeout or cap row count.
