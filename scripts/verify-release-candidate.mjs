import { spawnSync } from 'node:child_process'
const commands = [
  ['npx.cmd',['tsx','scripts/verify_candidate_truth.ts']], ['npx.cmd',['tsx','scripts/verify-matching-v2.ts']],
  ['npx.cmd',['tsx','scripts/verify_matching_v21_gold.ts']], ['npx.cmd',['tsx','scripts/verify_downstream_match_behavior.ts']],
  ['npx.cmd',['tsx','scripts/verify_matching_v21_decision_contract.ts']],
  ['npx.cmd',['tsx','scripts/verify_matching_v21_adversarial.ts']],
  ['npx.cmd',['tsx','scripts/verify_matching_b2c_consumers.ts']],
  ['python',['scripts/verify_computrabajo_opportunity_truth.py']], ['python',['scripts/verify_himalayas_opportunity_truth.py']],
  ['python',['scripts/verify_opportunity_truth_persistence.py']],
  ['python',['scripts/verify_weworkremotely_opportunity_truth.py']], ['python',['scripts/verify_unjobs_opportunity_truth.py']],
  ['python',['scripts/verify_source_certification_readiness.py']],
  ['python',['scripts/verify_opportunitydesk_opportunity_truth.py']], ['python',['scripts/verify_oyaop_opportunity_truth.py']], ['python',['scripts/verify_eu_delegation_opportunity_truth.py']],
  ['npx.cmd',['tsx','scripts/verify_distribution_truth.ts']], ['npx.cmd',['tsx','scripts/verify_search_demand.ts']], ['npx.cmd',['tsx','scripts/verify_approval_bus.ts']],
  ['npx.cmd',['tsx','scripts/verify_effective_source_policy.ts']],
  ['npx.cmd',['tsx','scripts/verify_onward_distribution_item28.ts']],
  ['npx.cmd',['tsx','scripts/verify_source_attribution_item28.ts']],
  ['npx.cmd',['tsx','scripts/verify_public_truth_item29.ts']],
  ['npx.cmd',['tsx','scripts/verify_sitemap_universe_item30.ts']],
  ['npx.cmd',['tsx','scripts/verify_text_integrity_item49.ts']],
  ['npx.cmd',['tsx','scripts/verify_prerender_universe_item31.ts']],
  ['npx.cmd',['tsx','scripts/verify_redirect_consistency_item32.ts']],
  ['npx.cmd',['tsx','scripts/verify_jobposting_item33.ts']],
  ['python',['scripts/generate_effective_routing_audit.py']],
  ['npx.cmd',['tsx','scripts/verify_effective_routing_item24.ts']],
  ['npx.cmd',['tsx','scripts/verify_effective_routing_repair.ts']],
  ['npx.cmd',['tsx','scripts/verify_intrinsic_routing_parity.ts']],
  ['python',['scripts/verify_effective_routing_policy_projection.py']],
  ['npx.cmd',['tsx','scripts/verify_real_effective_routing_audit.ts']],
  ['python',['scripts/verify_source_policy_boundary.py']],
  ['python',['scripts/verify_edge_source_registry.py']],
  ['npx.cmd',['tsx','scripts/verify-public-opportunity-pagination.ts']],
  ['npx.cmd',['tsx','scripts/verify-source-policy-snapshot.ts']],
  ['npx.cmd',['tsx','scripts/verify_inventory_reconciliation.ts']],
  ['npx.cmd',['tsx','scripts/verify_admin_inventory_operations.ts']],
  ['python',['scripts/verify_scraper_field_survival.py']],
  ['python',['scripts/verify_scraper_system_integration.py']],
  ['npx.cmd',['tsx','scripts/verify_future_ingestion_e2e.ts']],
  ['npx.cmd',['tsx','scripts/verify_b2c_pipeline_e2e.ts']],
  ['npx.cmd',['tsx','scripts/verify_cable_wiring_sql.mjs']],
  ['python',['scripts/verify_ingestion_telemetry.py']],
  ['python',['scripts/verify_opportunity_factory.py']],
  ['python',['scripts/verify_factory_queue_fairness.py']],
  ['python',['scripts/verify_scraper_run_duration_contract.py']],
  ['npx.cmd',['tsx','scripts/verify_seo_inventory.ts']],
  ['npx.cmd',['tsx','scripts/verify_canonical_robots_sitemap.ts']], ['npx.cmd',['tsx','scripts/verify_source_intelligence_field_states.ts']],
  ['python',['scripts/verify_source_maintenance.py']], ['python',['scripts/verify_monitor_rejection_semantics.py']], ['python',['scripts/verify_blog_query_encoding.py']],
  ['python',['scripts/verify_source_scan_lineage.py']], ['npx.cmd',['tsx','scripts/verify_opportunity_pipeline_contract.ts']],
  ['npx.cmd',['tsx','scripts/verify_source_intelligence_item53.ts']], ['npx.cmd',['tsx','scripts/verify_b2c_secondary_contracts.ts']],
  ['python',['scripts/verify_observation_writer.py']], ['python',['scripts/verify_ingestion_continuity.py']],
  ['python',['scripts/verify_observation_coverage_recovery.py']],
  ['npx.cmd',['tsx','scripts/verify_shared_b2c_item57.ts']], ['npx.cmd',['tsx','scripts/verify_b2c_opportunity_experience_item56.ts']],
  ['npx.cmd',['tsx','scripts/verify_b2c_value_clarity_item57.ts']], ['npx.cmd',['tsx','scripts/verify_canonical_field_contract_item56.ts']],
]
const failures = []
const matchingPending = []
for (const [command, args] of commands) {
  const result = spawnSync(command, args, { stdio:'inherit', shell:process.platform === 'win32' })
  if (result.status !== 0) {
    const failure = { command, args: args.join(' '), status: result.status, signal: result.signal }
    if (['scripts/verify-matching-v2.ts','scripts/verify_downstream_match_behavior.ts'].includes(args[1])) matchingPending.push(failure)
    else failures.push(failure)
    console.error(`LOCAL_GATE_FAIL: ${command} ${args.join(' ')} status=${result.status} signal=${result.signal || 'none'}`)
  }
}
if (failures.length) {
  console.error(JSON.stringify({ verifier:'release_candidate', structural:'STRUCTURAL_FAIL', matching_product_validation: matchingPending.length ? 'MATCHING_PRODUCT_VALIDATION_PENDING' : 'NOT_PENDING', matching_failures:matchingPending, structural_failures:failures }, null, 2))
  process.exitCode = 1
} else {
  console.log(JSON.stringify({ verifier:'release_candidate', structural:'STRUCTURAL_LOCAL_PASS', matching_product_validation:matchingPending.length ? 'MATCHING_PRODUCT_VALIDATION_PENDING' : 'NO_MATCHING_VALIDATION_FAILURE', matching_failures:matchingPending, product:'PRODUCT_RELEASE_PENDING', product_evidence:'Supplied PROD routing has catalog_ready=0, matching_ready=0 and alerts_ready=0; live Admin endpoint and deployed future-canary evidence are unavailable in this local pass.' }, null, 2))
}
