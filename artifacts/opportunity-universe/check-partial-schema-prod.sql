-- READ ONLY Stage 2 partial-apply inspection. Catalog/metadata only; this script does not mutate state.
with expected_tables(name) as (values
  ('opportunity_source_identity_aliases'),('opportunity_source_consumer_permissions'),('opportunity_universe_dirty_sources'),('opportunity_lifecycle_repair_audit'),('opportunity_universe_state')
), expected_views(name,marker) as (values
  ('opportunity_final_matching_universe','final_matching_state'),('opportunity_catalog_universe','catalog_state'),('opportunity_seo_universe','seo_state'),('opportunity_alert_universe','alerts_state')
), expected_indexes(name) as (values ('opportunity_universe_final_matching_idx'),('opportunity_universe_source_state_idx')),
expected_triggers(name,table_name) as (values
  ('opportunities_refresh_universe','opportunities'),('opportunity_observation_refresh_universe','opportunity_source_observations'),('opportunity_sources_refresh_universe','opportunity_sources'),('opportunity_permissions_refresh_universe','opportunity_source_consumer_permissions'),('opportunity_source_trust_before_insert','opportunities')
), expected_policies(name) as (values
  ('opportunity_universe_state_service_role'),('opportunity_source_identity_aliases_service_role'),('opportunity_source_permissions_service_role'),('opportunity_universe_dirty_sources_service_role'),('opportunity_lifecycle_repair_audit_service_role')
), expected_functions(name,body_md5) as (values
('canonical_opportunity_source_policy','baca2c21fe3ed85acadf0db8080f62c8'),
('opportunity_deadline_state','c3d10422a80aeb0bf9dd6feed46f4525'),
('opportunity_requirements_text','0e49052c34b830f062f11982d25dd27b'),
('opportunity_universe_decision','bf5b7822c9786f76153c2be67ec8c55e'),
('refresh_opportunity_universe','346a3cccfc3ad9de092df4a98a108cf7'),
('opportunity_universe_after_write','4f9dbbd9a6447a1e83c7f0d5bbb06e20'),
('admin_update_source_policy_atomic','b986efa43491503e5dfd62580c30c9c5'),
('refresh_due_opportunity_universe','f1db5ee454b81aa5dfad894afd90c98a'),
('opportunity_observation_refresh_universe','2997bbce7b9e51458f59cf5eb0da5c1c'),
('opportunity_source_policy_refresh_universe','29f918f998c6fe0a258560cc77fd59b4'),
('opportunity_permission_refresh_universe','49d796c12a53ed3720bccd2053a72404'),
('refresh_dirty_opportunity_universe_sources','84872c772cdd0cf2ee9be705ed78e54b'),
('apply_opportunity_source_trust','3b50a659893ddfbf6e4c36756d88c109'),
('reconcile_opportunity_universe_page','dba8805ad4779a74fbe27a8a8d651b1a'),
('get_opportunity_universe_summary','8ed16ab765025be9b8fe5f60fd683f55'),
('get_opportunity_universe_row','fe10aecef3f4e8451be8291d6d6ce172'),
('latest_opportunity_universe_observations','796d46a24fc78a032c91f3846159d031')
), table_objects as (
  select 'table' kind,e.name, c.oid is not null present,
    coalesce(c.relrowsecurity,false) definition_ok
  from expected_tables e left join pg_class c on c.relnamespace='public'::regnamespace and c.relname=e.name and c.relkind in ('r','p')
), view_objects as (
  select 'view' kind,e.name,c.oid is not null present,
    coalesce(position(e.marker in lower(pg_get_viewdef(c.oid,true)))>0 and position('ready' in lower(pg_get_viewdef(c.oid,true)))>0,false) definition_ok
  from expected_views e left join pg_class c on c.relnamespace='public'::regnamespace and c.relname=e.name and c.relkind='v'
), index_objects as (
  select 'index' kind,e.name,c.oid is not null present,
    coalesce(i.indisvalid and i.indisready,false) definition_ok
  from expected_indexes e left join pg_class c on c.relnamespace='public'::regnamespace and c.relname=e.name and c.relkind='i'
  left join pg_index i on i.indexrelid=c.oid
), trigger_objects as (
  select 'trigger' kind,e.name,t.oid is not null present,
    coalesce(t.tgenabled<>'D',false) definition_ok
  from expected_triggers e left join pg_class rel on rel.relnamespace='public'::regnamespace and rel.relname=e.table_name
  left join pg_trigger t on t.tgrelid=rel.oid and t.tgname=e.name and not t.tgisinternal
), policy_objects as (
  select 'policy' kind,e.name,p.oid is not null present,
    coalesce(p.polcmd='*',false) definition_ok
  from expected_policies e left join pg_policy p on p.polrelid in (select oid from pg_class where relnamespace='public'::regnamespace) and p.polname=e.name
), function_objects as (
  select 'function' kind,e.name,
    coalesce(bool_or(p.oid is not null),false) present,
    coalesce(bool_or(md5(btrim(regexp_replace(p.prosrc,'[[:space:]]+',' ','g')))=e.body_md5),false) definition_ok
  from expected_functions e left join pg_proc p on p.pronamespace='public'::regnamespace and p.proname=e.name
  group by e.name,e.body_md5
), objects as (
  select * from table_objects union all select * from view_objects union all select * from index_objects
  union all select * from trigger_objects union all select * from policy_objects union all select * from function_objects
), summary as (
  select count(*) object_total,count(*) filter(where present) object_present,
    count(*) filter(where not present) object_missing,count(*) filter(where present and not definition_ok) definition_mismatch,
    coalesce(jsonb_agg(jsonb_build_object('kind',kind,'name',name,'present',present,'release_definition_match',case when present then definition_ok else null end) order by kind,name),'[]'::jsonb) object_details
  from objects
)
select jsonb_build_object(
  'stage','OPPORTUNITY_UNIVERSE_SCHEMA',
  'status',case when object_present=0 then 'NOT_APPLIED' when object_missing>0 then 'PARTIALLY_APPLIED' when definition_mismatch=0 then 'ALREADY_APPLIED_EQUIVALENT' else 'UNKNOWN' end,
  'objects_expected',object_total,'objects_present',object_present,'objects_missing',object_missing,'definition_mismatches',definition_mismatch,
  'definition_comparison','Function bodies compare normalized md5; views, RLS, indexes, triggers and policies use catalog structure/markers.',
  'objects',object_details
) as stage2_schema_state
from summary;
