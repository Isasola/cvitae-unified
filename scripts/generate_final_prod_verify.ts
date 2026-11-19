import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const output = resolve(process.cwd(), 'artifacts/release/final-prod-verify.sql')
const sql = `-- READ ONLY final release verification. One JSON result; run after Pipeline and Retrieval are applied.
with
inventory as (
  select count(*) total_inventory from public.opportunities
), universe as (
  select count(*) universe_rows,
    count(distinct opportunity_id) distinct_rows,
    count(*) filter(where catalog_state='READY') catalog_ready,
    count(*) filter(where final_matching_state='READY') matching_ready,
    count(*) filter(where alerts_state='READY') alerts_ready,
    count(*) filter(where seo_state='READY') seo_ready
  from public.opportunity_universe_state
), pipeline as (
  select count(*) pipeline_rows,
    count(distinct opportunity_id) distinct_rows,
    count(*) filter(where catalog_state='READY') catalog_ready,
    count(*) filter(where final_matching_state='READY') matching_ready,
    count(*) filter(where alerts_state='READY') alerts_ready,
    count(*) filter(where seo_state='READY') seo_ready,
    count(*) filter(where catalog_reason is null or btrim(catalog_reason)='') catalog_no_reason,
    count(*) filter(where matching_reason is null or btrim(matching_reason)='') matching_no_reason,
    count(*) filter(where alerts_reason is null or btrim(alerts_reason)='') alerts_no_reason,
    count(*) filter(where seo_reason is null or btrim(seo_reason)='') seo_no_reason,
    count(*) filter(where next_action_reason is null or btrim(next_action_reason)=''
      or ingestion_reason is null or btrim(ingestion_reason)=''
      or observation_reason is null or btrim(observation_reason)=''
      or factory_reason is null or btrim(factory_reason)=''
      or verification_reason is null or btrim(verification_reason)=''
      or lifecycle_reason is null or btrim(lifecycle_reason)=''
      or catalog_reason is null or btrim(catalog_reason)=''
      or matching_reason is null or btrim(matching_reason)=''
      or alerts_reason is null or btrim(alerts_reason)=''
      or seo_reason is null or btrim(seo_reason)='') unexplained,
    count(*) filter(where observation_state='MISSING') observation_missing,
    count(*) filter(where observation_state<>'MISSING') observation_present,
    count(*) filter(where factory_status='ready') factory_ready,
    count(*) filter(where factory_status='review') factory_review,
    count(*) filter(where factory_status='pending') factory_pending,
    count(*) filter(where factory_status='blocked') factory_blocked,
    count(*) filter(where factory_status='failed') factory_failed,
    count(*) filter(where next_action='SOURCE_REFRESH') next_source_refresh,
    count(*) filter(where next_action='FACTORY_DRAIN') next_factory_drain,
    count(*) filter(where next_action='INSPECT_CONSUMER_REASON') next_inspect_consumer,
    count(*) filter(where next_action='EXISTING_VERIFICATION_AUTOMATION_OR_REVIEW') next_verification,
    count(*) filter(where next_action='REVIEW_LIFECYCLE_EVIDENCE') next_lifecycle_review,
    jsonb_build_object(
      'ingestion',count(*) filter(where ingestion_reason is null or btrim(ingestion_reason)=''),
      'observation',count(*) filter(where observation_reason is null or btrim(observation_reason)=''),
      'factory',count(*) filter(where factory_reason is null or btrim(factory_reason)=''),
      'verification',count(*) filter(where verification_reason is null or btrim(verification_reason)=''),
      'lifecycle',count(*) filter(where lifecycle_reason is null or btrim(lifecycle_reason)=''),
      'catalog',count(*) filter(where catalog_reason is null or btrim(catalog_reason)=''),
      'matching',count(*) filter(where matching_reason is null or btrim(matching_reason)=''),
      'alerts',count(*) filter(where alerts_reason is null or btrim(alerts_reason)=''),
      'seo',count(*) filter(where seo_reason is null or btrim(seo_reason)=''),
      'next_action',count(*) filter(where next_action_reason is null or btrim(next_action_reason)='')
    ) no_reason_counts
  from public.opportunity_pipeline_status
), missing_pipeline as (
  select count(*) rows_without_status from public.opportunities o
  where not exists (select 1 from public.opportunity_pipeline_status p where p.opportunity_id=o.id)
), retrieval as (
  select to_regclass('public.matching_retrieval_states') is not null states_present,
    to_regclass('public.matching_retrieval_candidates') is not null candidates_present,
    to_regprocedure('public.score_opportunity_embeddings(public.vector,text[])') is not null score_signature_present,
    to_regprocedure('public.prune_matching_retrieval_candidates()') is not null prune_function_present
), acceptance as (
  select i.total_inventory,u.universe_rows,u.distinct_rows,
    p.pipeline_rows,p.distinct_rows pipeline_distinct,p.unexplained,m.rows_without_status,
    p.catalog_ready,p.matching_ready,p.alerts_ready,p.seo_ready,
    p.factory_ready,p.factory_review,p.factory_pending,p.factory_blocked,p.factory_failed,
    p.catalog_no_reason,p.matching_no_reason,p.alerts_no_reason,p.seo_no_reason,
    r.states_present,r.candidates_present,r.score_signature_present,r.prune_function_present,
    (i.total_inventory=u.universe_rows and u.universe_rows=u.distinct_rows and p.pipeline_rows=i.total_inventory
      and p.pipeline_rows=p.distinct_rows and m.rows_without_status=0) structural_contract_pass,
    (r.states_present and r.candidates_present and r.score_signature_present and r.prune_function_present) retrieval_schema_pass,
    p.no_reason_counts,p.observation_present,p.observation_missing,
    jsonb_build_object('SOURCE_REFRESH',p.next_source_refresh,'FACTORY_DRAIN',p.next_factory_drain,
      'INSPECT_CONSUMER_REASON',p.next_inspect_consumer,'EXISTING_VERIFICATION_AUTOMATION_OR_REVIEW',p.next_verification,
      'REVIEW_LIFECYCLE_EVIDENCE',p.next_lifecycle_review) next_action_counts
  from inventory i cross join universe u cross join pipeline p cross join missing_pipeline m cross join retrieval r
)
select jsonb_build_object(
  'UNIVERSE',jsonb_build_object('total_inventory',total_inventory,'universe_rows',universe_rows,
    'unreconciled',total_inventory-universe_rows,'duplicates',universe_rows-distinct_rows),
  'PIPELINE',jsonb_build_object('pipeline_rows',pipeline_rows,'unexplained',unexplained,
    'missing_status',rows_without_status,'no_reason_counts',no_reason_counts),
  'RETRIEVAL',jsonb_build_object('matching_retrieval_states_exists',states_present,
    'matching_retrieval_candidates_exists',candidates_present,
    'score_opportunity_embeddings_correct_signature',score_signature_present,
    'prune_matching_retrieval_candidates_exists',prune_function_present),
  'SEO',jsonb_build_object('ready',seo_ready),
  'CONSUMERS',jsonb_build_object('catalog_ready',catalog_ready,'matching_ready',matching_ready,
    'alerts_ready',alerts_ready,'reasons_without_counts',jsonb_build_object('catalog',catalog_no_reason,
      'matching',matching_no_reason,'alerts',alerts_no_reason,'seo',seo_no_reason)),
  'OBSERVATION',jsonb_build_object('present',observation_present,'missing',observation_missing,
    'next_action_counts',next_action_counts),
  'FACTORY',jsonb_build_object('ready',factory_ready,'review',factory_review,'pending',factory_pending,
    'blocked',factory_blocked,'failed',factory_failed),
  'FINAL_ACCEPTANCE',jsonb_build_object('structural_contract_pass',structural_contract_pass,
    'retrieval_schema_pass',retrieval_schema_pass,'unexplained_zero',unexplained=0,
    'release_schema_pass',structural_contract_pass and unexplained=0 and rows_without_status=0,
    'prod_release_pass',structural_contract_pass and retrieval_schema_pass and unexplained=0 and rows_without_status=0)
) as final_prod_release_verification
from acceptance;
`

mkdirSync(dirname(output), { recursive: true })
writeFileSync(output, sql, 'utf8')
console.log(`generate_final_prod_verify: ${output}`)
