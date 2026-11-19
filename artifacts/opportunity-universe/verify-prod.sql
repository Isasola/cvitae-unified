-- POST-APPLY READ ONLY verification. One JSON result, each invariant explicit.
with u as (select public.get_opportunity_universe_summary() summary),
inv as (select count(*) n from public.opportunities),
st as (select count(*) n, count(*) filter(where lifecycle_state='ACTIVE_VALID') active_valid,
 count(*) filter(where lifecycle_state='INACTIVE_VALID') inactive_valid,count(*) filter(where lifecycle_state='EXPIRED') expired,
 count(*) filter(where lifecycle_state='DELETED') deleted,count(*) filter(where lifecycle_state='ARCHIVED') archived,
 count(*) filter(where lifecycle_state='HARD_DEAD') hard_dead,count(*) filter(where lifecycle_state='SUPERSEDED_DUPLICATE') superseded,
 count(*) filter(where lifecycle_state='STALE_DERIVED_STATE') stale,count(*) filter(where lifecycle_state='LIFECYCLE_UNKNOWN') lifecycle_unknown,
 count(*) filter(where catalog_state='READY') catalog_ready,count(*) filter(where final_matching_state='READY') matching_ready,
 count(*) filter(where alerts_state='READY') alerts_ready,count(*) filter(where seo_state='READY') seo_ready,
 count(*) filter(where cardinality(unresolved_dimensions)>0) routing_unresolved,
 count(*) filter(where cardinality(source_permission_unknown_dimensions)>0) permission_unknown_rows,
 coalesce(sum(cardinality(source_permission_unknown_dimensions)),0) permission_unknown_claims
 from public.opportunity_universe_state),
mf as (select coalesce(sum(n),0) n from (select count(*) n from public.opportunity_universe_state group by case
 when lifecycle_state<>'ACTIVE_VALID' then 'LIFECYCLE'
 when matching_row_state='NOT_READY' then 'MATCH_ROW_NOT_READY'
 when matching_row_state='UNKNOWN' then 'MATCH_ROW_UNKNOWN'
 when source_operational_state='CONFLICT' then 'SOURCE_POLICY_ALIAS_CONFLICT'
 when source_matching_state='DENIED' then 'SOURCE_MATCH_DENIED'
 when source_matching_state='UNKNOWN' then 'SOURCE_MATCH_UNKNOWN'
 when source_matching_operational_state='DENIED' then 'SOURCE_MATCHING_DISABLED'
 when source_matching_operational_state='UNKNOWN' then 'SOURCE_MATCHING_UNKNOWN'
 when source_operational_state='DISABLED' then 'SOURCE_DISABLED'
 when source_operational_state='UNKNOWN' then 'SOURCE_OPERATION_UNKNOWN'
 else 'FINAL_MATCHING_UNIVERSE' end) g),
pc as (select count(distinct canonical_source) sources,count(distinct consumer) dimensions,count(*) rows,
 count(*)-count(distinct (canonical_source,consumer)) duplicate_rows,
 count(*) filter(where permission_state='UNKNOWN') unknown_permission_rows
 from public.opportunity_source_consumer_permissions),
perm_dims as (select coalesce(jsonb_agg(jsonb_build_object('dimension',consumer,'ALLOWED',allowed,'DENIED',denied,'UNKNOWN',unknown_count,'NOT_APPLICABLE',not_applicable) order by consumer),'[]'::jsonb) value
 from (select consumer,count(*) filter(where permission_state='ALLOWED') allowed,count(*) filter(where permission_state='DENIED') denied,count(*) filter(where permission_state='UNKNOWN') unknown_count,count(*) filter(where permission_state='NOT_APPLICABLE') not_applicable from public.opportunity_source_consumer_permissions group by consumer) p),
aliases as (select count(*) n,count(*)-count(distinct emitted_source) duplicate_aliases from public.opportunity_source_identity_aliases),
conflicts as (select count(*) n from public.opportunity_sources s where (public.canonical_opportunity_source_policy(s.source)->>'alias_conflict')::boolean),
permission_semantics as (select count(*) filter(where permission_state not in ('ALLOWED','DENIED','UNKNOWN','NOT_APPLICABLE')) invalid_states from public.opportunity_source_consumer_permissions),
 retrieval as (select count(*) filter(where scan_kind='FULL' and scan_status='COMPLETE' and scan_target_count<>(select matching_ready from st)) full_denominator_mismatch from public.matching_retrieval_states),
 retrieval_state_quality as (select count(*) filter(where profile_signature is null or profile_signature='' or source_policy_signature is null or source_policy_signature='' or scan_kind not in ('FULL','DELTA') or scan_status not in ('PENDING','SCANNING','COMPLETE','ERROR') or examined_count<0 or target_count<0 or candidate_count<0) invalid_states from public.matching_retrieval_states),
 retrieval_candidate_quality as (select count(*) filter(where profile_signature is null or profile_signature='' or opportunity_content_fingerprint is null or opportunity_content_fingerprint='' or candidate_class not in ('MATCH','POTENTIAL') or evaluation_lane not in ('FULL_BACKFILL','INCREMENTAL') or cardinality(retrieval_lanes)=0) invalid_candidates from public.matching_retrieval_candidates),
stale_candidates as (select count(*) n from public.matching_retrieval_candidates c left join public.opportunity_universe_state u on u.opportunity_id=c.opportunity_id where u.opportunity_id is null or u.final_matching_state<>'READY'),
backfill_alerts as (select count(*) n from public.matching_retrieval_candidates c join public.match_alert_deliveries a on a.opportunity_id::text=c.opportunity_id where c.evaluation_lane='FULL_BACKFILL' and a.status='sent'),
repair as (select count(*) n from public.opportunity_universe_state u join public.opportunities o on o.id::text=u.opportunity_id
 where u.lifecycle_repair is not null and o.is_active is distinct from (u.lifecycle_repair->>'is_active')::boolean),
repair_audit as (select (select count(*) from public.opportunity_lifecycle_repair_audit) n,(select count(*) from public.opportunity_lifecycle_repair_audit a left join public.opportunity_source_observations obs on obs.id=a.observation_id where obs.id is null or obs.opportunity_id::text<>a.opportunity_id
 or not ((a.reason='LATEST_HARD_DEAD_OBSERVATION' and obs.identity_status in ('DEAD','REMOVED') and obs.http_status in (404,410))
 or (a.reason='LATEST_LIVE_OBSERVATION_CONTRADICTS_INACTIVE' and obs.identity_status='IDENTITY_CONFIRMED' and obs.http_status=200))) invalid_provenance,
 coalesce((select jsonb_agg(jsonb_build_object('reason',reason,'count',n) order by reason) from (select reason,count(*) n from public.opportunity_lifecycle_repair_audit group by reason) reasons),'[]'::jsonb) by_reason),
views as (select (select count(*) from public.opportunity_catalog_universe) catalog_count,(select count(*) from public.opportunity_final_matching_universe) matching_count,
 (select count(*) from public.opportunity_alert_universe) alerts_count,(select count(*) from public.opportunity_seo_universe) seo_count)
select jsonb_build_object('observed_at',now(),'TOTAL_INVENTORY',inv.n,
 'PREDICTED_FINAL_MATCHING_UNIVERSE',(u.summary->>'final_matching_universe')::bigint,'ACTUAL_FINAL_MATCHING_UNIVERSE',st.matching_ready,
 'PREDICTED_CATALOG_UNIVERSE',(u.summary->>'catalog_universe')::bigint,'ACTUAL_CATALOG_UNIVERSE',views.catalog_count,
 'PREDICTED_ALERT_UNIVERSE',(u.summary->>'alert_universe')::bigint,'ACTUAL_ALERT_UNIVERSE',views.alerts_count,
 'PREDICTED_SEO_UNIVERSE',(u.summary->>'seo_universe')::bigint,'ACTUAL_SEO_UNIVERSE',views.seo_count,
 'ACTUAL_LIFECYCLE_GROUPS',jsonb_build_object('ACTIVE_VALID',st.active_valid,'INACTIVE_VALID',st.inactive_valid,'EXPIRED',st.expired,'DELETED',st.deleted,'ARCHIVED',st.archived,'HARD_DEAD',st.hard_dead,'SUPERSEDED_DUPLICATE',st.superseded,'STALE_DERIVED_STATE',st.stale,'LIFECYCLE_UNKNOWN',st.lifecycle_unknown),
 'ROUTING_UNRESOLVED_ROWS',st.routing_unresolved,'ROWS_WITH_ANY_SOURCE_PERMISSION_UNKNOWN',st.permission_unknown_rows,'SOURCE_PERMISSION_UNKNOWN_DIMENSION_CLAIMS',st.permission_unknown_claims,
 'INVARIANTS',jsonb_build_object(
 'INVENTORY_STATE_COVERAGE',jsonb_build_object('status',case when inv.n=st.n then 'PASS' else 'FAIL' end,'difference',inv.n-st.n),
 'LIFECYCLE_PARTITION',jsonb_build_object('status',case when inv.n=st.active_valid+st.inactive_valid+st.expired+st.deleted+st.archived+st.hard_dead+st.superseded+st.stale+st.lifecycle_unknown then 'PASS' else 'FAIL' end,'difference',inv.n-(st.active_valid+st.inactive_valid+st.expired+st.deleted+st.archived+st.hard_dead+st.superseded+st.stale+st.lifecycle_unknown)),
 'MATCHING_FIRST_FAILURE_PARTITION',jsonb_build_object('status',case when inv.n=mf.n then 'PASS' else 'FAIL' end,'difference',inv.n-mf.n),
 'CATALOG_VIEW_PARITY',case when views.catalog_count=st.catalog_ready then 'PASS' else 'FAIL' end,'MATCHING_VIEW_PARITY',case when views.matching_count=st.matching_ready then 'PASS' else 'FAIL' end,'ALERT_VIEW_PARITY',case when views.alerts_count=st.alerts_ready then 'PASS' else 'FAIL' end,'SEO_VIEW_PARITY',case when views.seo_count=st.seo_ready then 'PASS' else 'FAIL' end,
 'PERMISSION_REGISTRY_105X10',case when pc.sources=105 and pc.dimensions=10 and pc.rows=1050 and pc.duplicate_rows=0 then 'PASS' else 'FAIL' end,
 'ALIASES_EXPECTED_COUNT',jsonb_build_object('status',case when aliases.n=148 and aliases.duplicate_aliases=0 then 'PASS' else 'FAIL' end,'actual',aliases.n,'expected',148),
 'SOURCE_POLICY_ALIAS_CONFLICTS',jsonb_build_object('status',case when conflicts.n=0 then 'PASS' else 'FAIL' end,'count',conflicts.n),'PERMISSION_UNKNOWN_PRESERVED',case when permission_semantics.invalid_states=0 then 'PASS' else 'FAIL' end,'INVALID_PERMISSION_STATES',permission_semantics.invalid_states,'UNKNOWN_NOT_DENIED',case when not exists(select 1 from public.opportunity_universe_state s left join public.opportunity_source_consumer_permissions p on p.canonical_source=s.provenance->>'source' and p.consumer='matching' where s.source_matching_state is distinct from coalesce(p.permission_state,'UNKNOWN')) then 'PASS' else 'FAIL' end,
 'LIFECYCLE_REPAIR_AUDIT',jsonb_build_object('status',case when repair_audit.invalid_provenance=0 and repair.n=0 then 'PASS' else 'FAIL' end,'repair_count',repair_audit.n,'invalid_observation_provenance',repair_audit.invalid_provenance,'by_reason',repair_audit.by_reason,'unapplied_repair_proposals',repair.n),
  'RETRIEVAL_SCHEMA_PRESENT',case when to_regclass('public.matching_retrieval_states') is not null and to_regclass('public.matching_retrieval_candidates') is not null and to_regprocedure('public.score_opportunity_embeddings(public.vector,text[])') is not null and to_regprocedure('public.prune_matching_retrieval_candidates()') is not null then 'PASS' else 'FAIL' end,
  'RETRIEVAL_FULL_DENOMINATOR_MISMATCHES',jsonb_build_object('status',case when retrieval.full_denominator_mismatch=0 then 'PASS' else 'FAIL' end,'count',retrieval.full_denominator_mismatch),'STALE_RETRIEVAL_CANDIDATES_OUTSIDE_UNIVERSE',jsonb_build_object('status',case when stale_candidates.n=0 then 'PASS' else 'FAIL' end,'count',stale_candidates.n),'SENT_ALERTS_FROM_FULL_BACKFILL',jsonb_build_object('status',case when backfill_alerts.n=0 then 'PASS' else 'FAIL' end,'count',backfill_alerts.n),
  'RETRIEVAL_STATE_STRUCTURAL_VALIDITY',jsonb_build_object('status',case when rsq.invalid_states=0 and rcq.invalid_candidates=0 then 'PASS' else 'FAIL' end,'invalid_states',rsq.invalid_states,'invalid_candidates',rcq.invalid_candidates),
  'CANARY_READINESS',case when to_regclass('public.matching_retrieval_states') is not null and rsq.invalid_states=0 and rcq.invalid_candidates=0 and stale_candidates.n=0 then 'PASS' else 'FAIL' end),
 'REGISTRY',jsonb_build_object('canonical_sources',pc.sources,'dimensions',pc.dimensions,'permission_rows',pc.rows,'duplicate_rows',pc.duplicate_rows,'unknown_permission_rows',pc.unknown_permission_rows,'permission_dimension_states',pd.value,'aliases',aliases.n),
 'OPPORTUNITY_UNIVERSE_SUMMARY',u.summary) as opportunity_universe_post_apply_verification
from u cross join inv cross join st cross join mf cross join pc cross join perm_dims pd cross join aliases cross join conflicts cross join permission_semantics cross join retrieval cross join retrieval_state_quality rsq cross join retrieval_candidate_quality rcq cross join stale_candidates cross join backfill_alerts cross join repair cross join repair_audit cross join views;
