import assert from 'node:assert/strict'
import fs from 'node:fs'
import { publicDistributionProjection, type SourcePolicyRow } from '../src/lib/effective-source-policy.ts'
import { buildEffectiveSeoInventory } from '../src/lib/seo-inventory.ts'
import { publicOpportunitySchemaType } from '../src/lib/opportunity-truth.ts'

const rich = { source:'computrabajo', slug:'programme-officer', title:'Programme Officer', organization:'Acme', description:'Programme delivery, monitoring, stakeholder coordination and reporting responsibilities. '.repeat(2), tags:['programme','monitoring'], opportunity_type:'job', is_active:true, verification_status:'verified', catalog_eligible:true, match_eligible:true, alerts_eligible:true, seo_eligible:true, seo_status:'eligible' }
const policy = (source: string, extra: Partial<SourcePolicyRow> = {}): SourcePolicyRow => ({ source, is_enabled:true, catalog_enabled:false, matching_enabled:false, alerts_enabled:false, seo_enabled:false, web_catalog_allowed:false, search_engine_indexing_allowed:null, google_jobs_distribution_allowed:false, third_party_job_distribution_allowed:false, ...extra })

const ordinary = publicDistributionProjection(rich, [policy('computrabajo')])
assert.equal(ordinary.seo.allowed, true); assert.equal(ordinary.jobPosting.allowed, true); assert.equal(ordinary.googleJobs.allowed, true)
assert.equal(ordinary.thirdParty.allowed, false); assert(ordinary.thirdParty.reasons.includes('THIRD_PARTY_DELIVERY_UNAVAILABLE'))
assert.equal(publicDistributionProjection(rich, [policy('computrabajo', { source_attribution_required:true })]).sourceAttributionRequired, true)
assert.equal(publicDistributionProjection(rich, [policy('computrabajo')]).sourceAttributionRequired, false)
const thirdPartyPermitted = publicDistributionProjection(rich, [policy('computrabajo', { third_party_job_distribution_allowed:true })])
assert.equal(thirdPartyPermitted.thirdParty.allowed, false); assert(thirdPartyPermitted.thirdParty.reasons.includes('THIRD_PARTY_DELIVERY_UNAVAILABLE'))
const himalayas = publicDistributionProjection({ ...rich, source:'himalayas' }, [policy('himalayas', { web_catalog_allowed:true, search_engine_indexing_allowed:false })])
assert.equal(himalayas.seo.allowed, false); assert.equal(himalayas.jobPosting.allowed, false); assert.equal(himalayas.googleJobs.allowed, false); assert.equal(himalayas.thirdParty.allowed, false)
assert.equal(publicDistributionProjection({ ...rich, opportunity_type:'scholarship' }, [policy('computrabajo')]).jobPosting.allowed, false)
assert.equal(publicDistributionProjection({ ...rich, opportunity_type:'training' }, [policy('computrabajo')]).jobPosting.allowed, false)
assert.equal(publicDistributionProjection({ ...rich, description:'thin' }, [policy('computrabajo')]).jobPosting.allowed, false)
assert.equal(publicOpportunitySchemaType({ ...rich, opportunity_type:'training' }, false), 'WebPage')
assert.equal(publicOpportunitySchemaType({ ...rich, opportunity_type:'training' }, true), 'WebPage')
assert.equal(publicOpportunitySchemaType({ ...rich, opportunity_type:'scholarship' }, false), 'Scholarship')
const inventory = buildEffectiveSeoInventory([rich, { ...rich, source:'himalayas', slug:'himalayas-job' }], [policy('computrabajo'), policy('himalayas', { web_catalog_allowed:true, search_engine_indexing_allowed:false })])
assert.equal(inventory.length, 1); assert.equal(inventory[0].distribution.jobPosting.allowed, true); assert.equal(inventory[0].distribution.googleJobs.allowed, true)
const pageJob = fs.readFileSync('src/pages/JobDetail.tsx', 'utf8'), pageOpportunity = fs.readFileSync('src/pages/OpportunityDetail.tsx', 'utf8'), prerender = fs.readFileSync('scripts/prerender.mjs', 'utf8'), truth = fs.readFileSync('src/lib/opportunity-truth.ts', 'utf8')
assert.match(pageJob, /distribution\?\.sourceAttributionRequired && job\.source_url/); assert.match(pageJob, /Fuente original/); assert.ok(!pageJob.includes('sourceRegistry'))
assert.match(pageOpportunity, /publicOpportunitySchemaType\(item, canEmitJobPosting\)/); assert.match(pageOpportunity, /schemaType === 'Scholarship'/)
assert.match(prerender, /aggregatedJobPosting\(job,\s*canonical\)/)
assert.ok(!truth.includes('distributionTruth')); assert.ok(!fs.existsSync('netlify/functions/third-party-distribution.ts'))
const transition = fs.readFileSync('supabase/migrations/202609220002_item28_effective_distribution_transition.sql', 'utf8')
assert.match(transition, /THIRD_PARTY_DELIVERY_UNAVAILABLE/i); assert.match(transition, /item28_transition_definition_unexpected/)
assert.match(transition, /legacy_gate text := \$legacy\$if v_organic_seo/, 'legacy marker must begin directly with if')
assert.ok(!transition.includes('$legacy$\nif'), 'legacy marker must not require a zero-indentation newline')
assert.match(transition, /normalized_definition := regexp_replace\(definition, '\[\[:space:\]\]\+', ' ', 'g'\)/)
assert.match(transition, /position\(normalized_legacy_gate in normalized_definition\)/)
assert.match(transition, /legacy_pattern text := .*s\[\.\]seo_enabled.*\[\[:space:\]\]\*.*s\[\.\]google_jobs_distribution_allowed/s)
assert.match(transition, /regexp_replace\(definition, legacy_pattern, effective_gate, 1, 1, 'n'\)/)
assert.match(transition, /original_definition := definition/)
assert.match(transition, /if definition = original_definition/)
const legacyMarker = "if v_organic_seo and not s.seo_enabled then raise exception 'organic_seo_forbidden'; end if; if v_google_jobs and not s.google_jobs_distribution_allowed then raise exception 'google_jobs_forbidden'; end if; if v_third_party and not s.third_party_job_distribution_allowed then raise exception 'third_party_distribution_forbidden'; end if;"
const effectiveMarker = "if v_organic_seo and lower(o.source)='himalayas' then raise exception 'organic_seo_forbidden'; end if; if v_google_jobs and lower(o.source)='himalayas' then raise exception 'google_jobs_forbidden'; end if; if v_third_party then raise exception 'third_party_delivery_unavailable'; end if;"
const indentationVariant = `prefix\n  ${legacyMarker.replaceAll('; if', ';\n  if')}\n  suffix`
const whitespaceTolerant = /if v_organic_seo and not s\.seo_enabled then raise exception 'organic_seo_forbidden';[\s\S]*?end if;[\s\S]*?if v_google_jobs and not s\.google_jobs_distribution_allowed then raise exception 'google_jobs_forbidden';[\s\S]*?end if;[\s\S]*?if v_third_party and not s\.third_party_job_distribution_allowed then raise exception 'third_party_distribution_forbidden';[\s\S]*?end if;/
const transformedVariant = indentationVariant.replace(whitespaceTolerant, effectiveMarker)
assert.ok(transformedVariant.includes(effectiveMarker), 'indented pg_get_functiondef gate must be replaceable')
assert.ok(!transformedVariant.includes("s.seo_enabled"), 'legacy gate must not survive replacement')
const historical = fs.readFileSync('supabase/migrations/202609140001_opportunity_automation_transition.sql', 'utf8')
const legacyGate = legacyMarker
const effectiveGate = effectiveMarker
assert.ok(historical.includes(legacyGate), 'captured local historical definition retains expected gate segment')
const transformed = historical.replace(legacyGate, effectiveGate)
assert.ok(!transformed.includes(legacyGate)); assert.ok(transformed.includes(effectiveGate), 'offline textual transformation is deterministic for the captured local definition')
console.log('verify_onward_distribution_item28: PASS canonical_projection third_party_fail_closed no_emitter')
