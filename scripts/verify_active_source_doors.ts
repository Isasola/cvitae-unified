/** C09.1: offline producer/Observation/row/policy/Admin parity. No network. */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { evaluateOpportunityDistribution, effectiveSourceSwitches, registeredSourceOperationalDefault, sourceProducerExecution } from '../src/lib/effective-source-policy.ts'
import { classifyOpportunityUniverse } from '../src/lib/opportunity-universe.ts'
import { sourcePermissionDimensionTruth, sourcePermissionEvidenceClass, canonicalSourcePermissionRegistry } from '../src/lib/source-permission-truth.ts'
import { sourceDoorDiagnostics } from '../src/lib/source-intelligence-contract.ts'
import { evaluateEightGates } from '../netlify/functions/lib/eight-gates.ts'

const fixture = spawnSync('python', ['scripts/fixture_future_ingestion_python.py'], { encoding:'utf8' })
assert.equal(fixture.status, 0, fixture.stderr)
const flow = JSON.parse(fixture.stdout).active_flow
assert.equal(flow.observation.opportunity_id, 'future-himalayas-factual')
assert.equal(flow.observation.http_status, 200)
assert.equal(flow.lineage.observation.state, 'PERSISTED')
assert.equal(flow.ingestion_event.trace_state,'TRACED')
assert.equal(flow.ingestion_event.opportunity_id,flow.observation.opportunity_id)
const row = { ...flow.row, id:'future-himalayas-factual', slug:'factual-role', is_active:true, verification_status:'verified' }
const stale = (source:string) => ({ source, is_enabled:false, catalog_enabled:false, matching_enabled:false, alerts_enabled:false, seo_enabled:false })
const now = new Date('2026-10-06T12:00:00Z')
for (const source of ['himalayas','jobicy','remotive','computrabajo','weworkremotely','impactpool','fundacion_carolina','arbeitnow','unjobs']) {
  assert.equal(registeredSourceOperationalDefault(source), true)
  const policy = stale(source)
  assert.equal(effectiveSourceSwitches(policy).is_enabled, true, `${source}: consumer restrictions do not stop operation`)
  const result = evaluateOpportunityDistribution({ ...row, source }, [policy], now)
  const universe = classifyOpportunityUniverse({ ...row, source }, [policy], flow.observation, now)
  assert.equal(universe.source_operational_state, 'ENABLED')
  for (const [consumer, field] of [['catalog','catalog_state'],['matching','final_matching_state'],['alerts','alerts_state'],['seo','seo_state']] as const)
    assert.equal(result[consumer].allowed, universe[field] === 'READY', `${source}/${consumer}: shared effective authority`)
  if (['himalayas','jobicy','remotive','computrabajo','weworkremotely','impactpool','fundacion_carolina','arbeitnow','unjobs'].includes(source)) {
    assert(result.catalog.allowed && result.matching.allowed && result.alerts.allowed && result.seo.allowed)
  }
}
const himalayas = evaluateOpportunityDistribution(row, [stale('himalayas')], now)
const missingPolicy = evaluateOpportunityDistribution(row, [], now)
assert.equal(missingPolicy.catalog.capabilityState,'ALLOWED', 'missing operational configuration is not missing permission evidence')
assert.equal(missingPolicy.catalog.allowed,false)
assert(himalayas.sourceOn && himalayas.catalog.allowed && himalayas.seo.allowed)
assert(!himalayas.googleJobs.allowed && !himalayas.jobPosting.allowed && !himalayas.thirdParty.allowed)
// Explicit external DENIED fixture; do not rewrite actual WWR UNKNOWN evidence.
const wwrExternalDenied = evaluateOpportunityDistribution({...row,source:'weworkremotely'},[stale('weworkremotely')],now,
  (source,dimension)=> dimension==='google_jobs' ? {...sourcePermissionDimensionTruth(source,dimension),state:'DENIED',reason:'LOCAL_EXTERNAL_DENIED_FIXTURE'} : sourcePermissionDimensionTruth(source,dimension))
for (const consumer of ['catalog','matching','alerts','seo'] as const) assert(wwrExternalDenied[consumer].allowed)
assert.equal(wwrExternalDenied.googleJobs.allowed,false)
assert(wwrExternalDenied.googleJobs.reasons.includes('GOOGLE_JOBS_SOURCE_PERMISSION_DENIED'))
const wwrExternalAllowed = evaluateOpportunityDistribution({...row,source:'weworkremotely'},[stale('weworkremotely')],now,
  (source,dimension)=> dimension==='google_jobs' ? {...sourcePermissionDimensionTruth(source,dimension),state:'ALLOWED',reason:'LOCAL_EXTERNAL_ALLOWED_FIXTURE'} : sourcePermissionDimensionTruth(source,dimension))
assert.equal(wwrExternalAllowed.googleJobs.allowed,true,'external negative has discriminating power with identical row/operator facts')
assert.equal(sourcePermissionDimensionTruth('weworkremotely','google_jobs').state,'UNKNOWN','fixture cannot invent a WWR permission decision')
const unknown = classifyOpportunityUniverse({ ...row, source:'unjobs' }, [stale('unjobs')], null, now)
assert.equal(unknown.source_operational_state, 'ENABLED')
assert.equal(unknown.source_matching_state, 'UNKNOWN')
assert.equal(unknown.final_matching_state, 'READY')
assert(!unknown.unresolved_dimensions.includes('SOURCE_MATCH_PERMISSION'))
const thin = classifyOpportunityUniverse({ ...row, description:'' }, [stale('himalayas')], null, now)
assert.equal(thin.source_operational_state, 'ENABLED')
assert.equal(thin.seo_state, 'NOT_READY')
assert.equal(thin.seo_effective_reason, 'THIN_CONTENT')
assert.equal(classifyOpportunityUniverse(row, [stale('himalayas')], null, now).seo_state, 'READY')
for (const consumer of ['source','catalog','matching','alerts','seo'] as const) {
  const policy = { ...stale('himalayas'), consumer_switch_overrides:{ [consumer]:false } }
  const result = evaluateOpportunityDistribution(row, [policy], now)
  if (consumer === 'source') { assert(!result.sourceOn); for (const door of ['catalog','matching','alerts','seo'] as const) assert(!result[door].allowed) }
  else { assert(!result[consumer].allowed); for (const other of ['catalog','matching','alerts','seo'] as const) if (other !== consumer) assert(result[other].allowed) }
}
const historical = classifyOpportunityUniverse({ ...row, created_at:'2026-09-01', updated_at:'2026-10-01' }, [stale('himalayas')], null, now)
const future = classifyOpportunityUniverse({ ...row, created_at:'2026-10-06', updated_at:'2026-10-06' }, [stale('himalayas')], null, now)
for (const field of ['catalog_state','final_matching_state','alerts_state','seo_state'] as const) assert.equal(historical[field], future[field])
for (const source of ['weworkremotely','computrabajo','impactpool','fundacion_carolina','unjobs']) {
 const h=classifyOpportunityUniverse({...row,source,created_at:'2026-09-01'},[stale(source)],null,now)
 const f=classifyOpportunityUniverse({...row,source,created_at:'2026-10-06'},[stale(source)],null,now)
 for(const field of ['catalog_state','final_matching_state','alerts_state','seo_state'] as const) assert.equal(h[field],f[field])
}
const profile = { canonical_source:'himalayas', adapter_version:'EXPECTED:v2', certified:true, auto_enabled:false }
const run = { status:'success', adapter_version:'EXECUTED:v1', extraction_metrics:{ executed_cleaner_version:'EXECUTED_CLEANER:v1', eight_gates:{ gate_1:{ status:'PASS', reason_code:'DISCOVERY_COMPLETED' }, gate_2:{ status:'FAIL', reason_code:'EXTRACTION_HTML_CHANGED', metrics:{ fields:{} } } } } }
const gates = evaluateEightGates(profile, [row], run, [flow.observation], []).gates
const ledger = { inventory:1, ingestion_traced:1, ingestion_trace_incomplete:0, observation_missing:1, factory_ready:1, lifecycle_active_valid:1, lifecycle_unknown:0, catalog_ready:1, matching_ready:1, alerts_ready:1, seo_ready:1 }
const diagnostics = sourceDoorDiagnostics(profile, effectiveSourceSwitches(stale('himalayas')), run, gates, ledger)
assert.equal(diagnostics.stages.length, 13)
assert.equal(diagnostics.first_failure?.name, 'EXTRACTION')
assert.equal(diagnostics.next_action, 'INSPECT_EXTRACTION_FIELDS')
assert.equal(diagnostics.stages.find(item => item.name === 'OBSERVATION')?.reason, 'OBSERVATION_MISSING')
assert.equal(diagnostics.stages.find(item => item.name === 'ADAPTER')?.evidence.executed, 'EXECUTED:v1')
const unknownDiagnostic = sourceDoorDiagnostics({canonical_source:'unjobs'}, {is_enabled:true}, null)
assert.equal(unknownDiagnostic.stages.find(item => item.name === 'CONSUMER PERMISSION')?.evidence.matching.state, 'UNKNOWN')
assert.equal(unknownDiagnostic.stages.find(item => item.name === 'ADAPTER')?.status, 'NOT_EVALUATED')
assert(JSON.stringify(diagnostics).length < 12000)
const wiring = readFileSync('supabase/migrations/202610040001_source_switch_wiring.sql','utf8')
const registry = JSON.parse(readFileSync('src/generated/source-intelligence-registry.json','utf8'))
for (const profile of registry.sources) assert.equal(wiring.includes(`'${profile.canonical_source}'`), registeredSourceOperationalDefault(profile.canonical_source), `SQL registered operational projection: ${profile.canonical_source}`)
for (const permission of canonicalSourcePermissionRegistry()) for (const decision of Object.values(permission.dimensions))
  if (decision.state === 'DENIED') assert.equal(sourcePermissionEvidenceClass(decision), 'EXPLICIT_EVIDENCE_BACKED')
assert.equal(sourcePermissionDimensionTruth('wwr','seo_index').state,'DENIED')
const noProducer=sourceProducerExecution('conacyt_convocatorias')
assert.equal(noProducer.state,'NO_EXECUTABLE_PRODUCER')
const noProducerDecision=evaluateOpportunityDistribution({...row,source:'conacyt_convocatorias'},[{...stale('conacyt_convocatorias'),is_enabled:true}],now)
assert.equal(noProducerDecision.sourceOn,false)
assert(noProducerDecision.catalog.reasons.includes('NO_EXECUTABLE_PRODUCER'))
const noProducerAdmin=sourceDoorDiagnostics({canonical_source:'conacyt_convocatorias'},{is_enabled:true},null)
assert.equal(noProducerAdmin.first_failure?.reason,'NO_EXECUTABLE_PRODUCER')

const aliasOnly=registry.sources.find((p:any)=>p.canonical_source==='googlejobs_v3')
assert.equal(aliasOnly.producer_execution.state,'NO_EXECUTABLE_PRODUCER')
assert(aliasOnly.producer_execution.canonical_producer_owners.includes('googlejobs_v2'))
assert(sourceProducerExecution('googlejobs_v2').entrypoints.some((path:string)=>path.endsWith('googlejobs_v3.py')))
for (const p of registry.sources.filter((p:any)=>p.producer_execution.state==='NO_EXECUTABLE_PRODUCER')) {
  const decision=evaluateOpportunityDistribution({...row,source:p.canonical_source},[{...stale(p.canonical_source),is_enabled:true}],now)
  assert.equal(decision.sourceOn,false,`profile without its own executable producer: ${p.canonical_source}`)
}

const executable=registry.sources.filter((p:any)=>p.producer_execution.state==='EXECUTABLE_PRODUCER')
for (const p of executable) assert.equal(effectiveSourceSwitches(stale(p.canonical_source)).is_enabled,true)
assert.equal(executable.length+registry.sources.filter((p:any)=>p.producer_execution.state==='NO_EXECUTABLE_PRODUCER').length,registry.sources.length)
writeFileSync('artifacts/release/source-door-semantics-local-evidence.json', JSON.stringify({
  checkpoint:'C09.1', scope:'OFFLINE_REPOSITORY_EVIDENCE_NOT_PROD', cases:['A','B','C','D','E','F','G','H'],
  matrix_conditions:'Factual READY fixture, operational default from verified repository entrypoints, no operator kill. No PROD observations; first-party historical policy is advisory.',
  producer_counts:{registry_profiles:registry.sources.length,executable_producers:executable.length,executable_default_active:executable.length,executable_with_manual_kill:0,manual_kill_count_scope:'LOCAL_MATRIX_NO_OVERRIDES; PROD_UNKNOWN_NOT_QUERIED',no_executable_producer:registry.sources.length-executable.length},
  computed_from:['source-permission-truth.ts','Registry V2','effective-source-policy.ts','opportunity-universe.ts'],
  sources:canonicalSourcePermissionRegistry().map(item => {
    const decisions = evaluateOpportunityDistribution({...row,source:item.canonical_source},[{...stale(item.canonical_source),is_enabled:true}],new Date('2026-10-10T12:00:00Z'))
    return {canonical_source:item.canonical_source, source_operational_state:decisions.sourceOn?'ACTIVE_REPOSITORY_DEFAULT':'NO_EXECUTABLE_PRODUCER',
      producer_execution:sourceProducerExecution(item.canonical_source),
      executable_registry_default:registeredSourceOperationalDefault(item.canonical_source),
      previous_global_kill_coupling:registeredSourceOperationalDefault(item.canonical_source)
        ? 'EXECUTABLE_SOURCE_DEFAULT_FALSE_CAN_QUARANTINE; NOT_CANONICAL_PERMISSION_TRUTH'
        : 'NO_EXECUTABLE_DEFAULT_PROVEN; PERMISSION_NOT_USED_AS_GLOBAL_KILL',
      consumers:Object.entries(item.dimensions).map(([consumer, truth]) => {
        const key = consumer==='seo_index'?'seo':consumer==='google_jobs'?'googleJobs':consumer==='third_party_distribution'?'thirdParty':consumer
        const decision = (decisions as any)[key]
        return {consumer,permission_state:truth.state,evidence_class:sourcePermissionEvidenceClass(truth),
          reason:truth.reason,reference:truth.evidence_url_or_repo_reference,
          permission_role:decision?.permissionRole || 'SPECIFIC_DIMENSION',
          final_behavior:decision ? decision.allowed?'READY_IF_ROW_GATES_PASS':decision.reasons : 'SEPARATE_DIMENSION_NOT_A_GLOBAL_KILL'}
      }), jobPosting:{allowed:decisions.jobPosting.allowed, reasons:decisions.jobPosting.reasons},
      aeo_geo:'Ordinary first-party WebPage content; no independent emitter or permission grant invented',
    }
  }),
},null,2)+'\n')
console.log('verify_active_source_doors: PASS cases=A,B,C,D,E,F,G,H; Registry/SQL projection parity; no PROD')
