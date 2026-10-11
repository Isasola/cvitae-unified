-- READ_ONLY METADATA PREFLIGHT / NO DATA ROWS / NO MUTATION.
-- Run before authorizing compensation or schema rollback. Returns every real
-- foreign key touching the bridge tables (including ON DELETE behavior) and
-- every table/constraint trigger that can participate in those operations.
with expected_relations(relation_name) as (
  values ('recruiter_vacancies'),('recruiter_vacancy_operations'),
    ('opportunities'),('opportunity_ingestion_events'),('opportunity_universe_state')
), relations as (
  select n.nspname schema_name,c.relname relation_name,c.oid relation_oid
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind in ('r','p')
    and c.relname in (select relation_name from expected_relations)
), foreign_keys as (
  select c.oid constraint_oid,n.nspname constraint_schema,c.conname constraint_name,
    src.relname source_table,dst.relname referenced_table,
    pg_catalog.pg_get_constraintdef(c.oid,true) definition,
    case c.confdeltype when 'a' then 'NO ACTION' when 'r' then 'RESTRICT'
      when 'c' then 'CASCADE' when 'n' then 'SET NULL' when 'd' then 'SET DEFAULT'
      else 'UNKNOWN:'||c.confdeltype end on_delete,
    c.condeferrable deferrable,c.condeferred initially_deferred,c.convalidated validated
  from pg_catalog.pg_constraint c
  join pg_catalog.pg_class src on src.oid=c.conrelid
  join pg_catalog.pg_class dst on dst.oid=c.confrelid
  join pg_catalog.pg_namespace n on n.oid=c.connamespace
  where c.contype='f' and (c.conrelid in (select relation_oid from relations)
    or c.confrelid in (select relation_oid from relations))
), triggers as (
  select n.nspname schema_name,r.relname relation_name,t.tgname trigger_name,
    t.tgisinternal is_internal,
    case t.tgenabled when 'O' then 'ENABLED' when 'D' then 'DISABLED'
      when 'R' then 'REPLICA' when 'A' then 'ALWAYS' else 'UNKNOWN:'||t.tgenabled end enabled_state,
    pn.nspname function_schema,p.proname function_name,
    pg_catalog.pg_get_function_identity_arguments(p.oid) function_arguments,
    pg_catalog.pg_get_triggerdef(t.oid,true) definition,
    nullif(t.tgconstraint,0) constraint_oid
  from pg_catalog.pg_trigger t
  join pg_catalog.pg_class r on r.oid=t.tgrelid
  join pg_catalog.pg_namespace n on n.oid=r.relnamespace
  join pg_catalog.pg_proc p on p.oid=t.tgfoid
  join pg_catalog.pg_namespace pn on pn.oid=p.pronamespace
  where t.tgrelid in (select relation_oid from relations)
    or t.tgconstraint in (select constraint_oid from foreign_keys)
), relation_inventory as (
  select e.relation_name,(r.relation_oid is not null) present
  from expected_relations e left join relations r using(relation_name)
)
select jsonb_build_object(
  'mode','READ_ONLY_METADATA',
  'relations',coalesce((select jsonb_agg(to_jsonb(relation_inventory) order by relation_name) from relation_inventory),'[]'::jsonb),
  'missing_relations',coalesce((select jsonb_agg(relation_name order by relation_name) from relation_inventory where not present),'[]'::jsonb),
  'foreign_keys',coalesce((select jsonb_agg(to_jsonb(foreign_keys) order by source_table,constraint_name) from foreign_keys),'[]'::jsonb),
  'triggers',coalesce((select jsonb_agg(to_jsonb(triggers) order by relation_name,trigger_name) from triggers),'[]'::jsonb),
  'operator_note','Before schema apply recruiter_vacancy_operations is expected missing; after apply all five relations must be present. Review every ON DELETE and enabled trigger before compensation/rollback.'
);
