-- READ ONLY / after separately authorized 202610110001 and 202610110002.
begin transaction read only;

select signature,to_regprocedure(signature) is not null present
from (values
  ('public.opportunity_universe_decision_before_c4_20261011(jsonb,jsonb,jsonb,jsonb)'),
  ('public.match_opportunities_before_c4_20261011(public.vector,double precision,integer)'),
  ('public.private_matching_c4_source_identity(text)'),
  ('public.private_matching_c4_contract_digests()'),
  ('public.prepare_private_matching_c4_reconciliation()'),
  ('public.resume_private_matching_c4_failed_source(text,integer,text)'),
  ('public.reconcile_private_matching_c4_batch(integer)'),
  ('public.update_recruiter_vacancy_atomic(text,uuid,text,text,text,text,text,text,text)'),
  ('public.request_recruiter_seo_plus(text,uuid,text,boolean,text)'),
  ('public.withdraw_recruiter_seo_plus(text,uuid,text)')
) required(signature) order by signature;

with target as (
  select to_regprocedure('public.match_opportunities(public.vector,double precision,integer)')::oid oid
)
select p.oid,p.oid::regprocedure exact_regprocedure,
  pg_get_function_arguments(p.oid) arguments_with_defaults,
  pg_get_function_result(p.oid) function_result,l.lanname,p.provolatile,p.prosecdef,
  pg_get_userbyid(p.proowner) owner,md5(coalesce(p.proacl::text,'DEFAULT_ACL')) output_acl_digest,
  '791d2b1e22edbb03f97770724fbb588b' authorized_input_acl_digest,
  has_function_privilege('service_role',p.oid,'EXECUTE') service_execute,
  has_function_privilege('anon',p.oid,'EXECUTE') anon_execute,
  has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated_execute,
  (select count(*) from pg_proc f join pg_namespace n on n.oid=f.pronamespace
    where n.nspname='public' and f.proname='match_opportunities') overload_count,
  (p.pronargs=3 and p.pronargdefaults=2
    and p.proargnames[1:3]=array['query_embedding','match_threshold','match_count']::text[]
    and regexp_replace(pg_get_expr(p.proargdefaults,0),'\s+','','g')='0.3,20'
    and pg_get_function_result(p.oid)=
      'TABLE(id text, title text, organization text, location text, rubro text, tags text[], description text, application_url text, source text, similarity double precision)'
    and l.lanname='sql' and p.provolatile='s' and not p.prosecdef
    and not has_function_privilege('anon',p.oid,'EXECUTE')
    and not has_function_privilege('authenticated',p.oid,'EXECUTE')
    and position('public.opportunity_final_matching_universe' in pg_get_functiondef(p.oid))>0) contract_compatible
from target t join pg_proc p on p.oid=t.oid join pg_language l on l.oid=p.prolang;

select identity_state,status,count(*) sources,sum(total_rows) total_rows,
  sum(processed_rows) processed_rows,sum(total_rows-processed_rows) pending_rows,
  sum(changed_rows) changed_rows,sum(attempts) attempts,sum(recovery_count) recoveries
from public.private_matching_c4_reconciliation_sources
group by identity_state,status order by identity_state,status;

select c.oid,c.reloptions,md5(coalesce(c.relacl::text,'DEFAULT_ACL')) acl_digest,
  has_table_privilege('service_role',c.oid,'SELECT') service_select,
  has_table_privilege('anon',c.oid,'SELECT') anon_select,
  has_table_privilege('authenticated',c.oid,'SELECT') authenticated_select
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname='opportunity_final_matching_universe' and c.relkind='v';

select to_regclass('public.recruiter_vacancy_mutation_operations') is not null mutation_operations,
  to_regclass('public.recruiter_seo_plus_requests') is not null seo_plus_requests,
  to_regclass('public.recruiter_seo_plus_events') is not null seo_plus_events;

with target as (select 'public.opportunity_final_matching_universe'::regclass oid)
select source.oid::regclass dependency,count(*) dependency_edges,
  bool_or(a.attname='final_matching_state') references_final_matching_state
from target t join pg_rewrite r on r.ev_class=t.oid
join pg_depend d on d.classid='pg_rewrite'::regclass and d.objid=r.oid
  and d.refclassid='pg_class'::regclass
join pg_class source on source.oid=d.refobjid
left join pg_attribute a on a.attrelid=d.refobjid and a.attnum=d.refobjsubid
where source.oid in ('public.opportunities'::regclass,'public.opportunity_universe_state'::regclass)
group by source.oid order by source.oid::regclass::text;

with synthetic as (
  select public.opportunity_universe_decision(
    jsonb_build_object('id','c4-read-only-open','source','recruiter_b2b','title','Backend Engineer',
      'description',repeat('Backend TypeScript SQL production role. ',4),'is_active',true,
      'verification_status','pending','deadline',null),null,
    public.canonical_opportunity_source_policy('recruiter_b2b'),null) d
)
select d->>'lifecycle_state' lifecycle_state,d->>'matching_row_state' matching_row_state,
  d->>'source_matching_state' source_matching_state,d->>'final_matching_state' final_matching_state,
  d->'source_permission_unknown_dimensions' permission_unknown_dimensions,
  d->'provenance'->'private_matching_contract' private_matching_contract
from synthetic;

select count(*) recruiter_vacancies,
  count(*) filter(where r.is_active) recruiter_open,
  count(*) filter(where not r.is_active) recruiter_closed,
  count(o.id) mirrors,
  count(*) filter(where r.recruiter_token_id is null or t.id is null) owner_missing,
  count(*) filter(where o.recruiter_vacancy_id is not null and o.source<>'recruiter_b2b') mirror_source_conflicts
from public.recruiter_vacancies r
left join public.recruiter_tokens t on t.id::text=r.recruiter_token_id::text
left join public.opportunities o on o.recruiter_vacancy_id=r.id;

select count(*) duplicate_mirrors from (
  select recruiter_vacancy_id from public.opportunities where recruiter_vacancy_id is not null
  group by recruiter_vacancy_id having count(*)>1
) duplicates;

select count(*) recruiter_mirrors,
  count(*) filter(where r.is_active and u.lifecycle_state='ACTIVE_VALID' and u.final_matching_state='READY') open_private_matching_ready,
  count(*) filter(where not r.is_active and u.lifecycle_state='INACTIVE_VALID' and u.final_matching_state='NOT_READY') closed_private_matching_blocked,
  count(*) filter(where u.source_matching_state='UNKNOWN' and 'matching'=any(u.source_permission_unknown_dimensions)) matching_unknown_preserved,
  count(*) filter(where u.catalog_state='READY' or u.seo_state='READY' or u.alerts_state='READY') other_consumers_ready
from public.recruiter_vacancies r
join public.opportunities o on o.recruiter_vacancy_id=r.id and o.source='recruiter_b2b'
join public.opportunity_universe_state u on u.opportunity_id=o.id;

select count(*) seo_plus_requests,count(*) filter(where entitlement_status='ACTIVE') active_entitlements,
  count(*) filter(where delivery_status='PUBLISHED') published,
  count(*) filter(where authorization_status='CONSENT_RECORDED' and public_indexing_consent is not true) invalid_consent
from public.recruiter_seo_plus_requests;

select public.private_matching_c4_contract_digests() reproducible_contract_digests;
select 'c6dcc71299db2237f17d455729d238a7' legacy_recruiter_reference_digest,
  'REFERENCE_ONLY_DIFFERENT_HISTORICAL_ALGORITHM_NOT_COMPARABLE' comparison_rule;

rollback;
