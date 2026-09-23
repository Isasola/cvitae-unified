import assert from 'node:assert/strict'
import fs from 'node:fs'
import { canonicalOpportunityPath, canonicalOpportunityUrl } from '../src/lib/opportunity-truth.ts'
import { evaluateOpportunityDistribution } from '../src/lib/effective-source-policy.ts'
const policy = { source:'computrabajo', is_enabled:true, web_catalog_allowed:true, catalog_enabled:true, matching_enabled:true, alerts_enabled:true, seo_enabled:true, search_engine_indexing_allowed:true, google_jobs_distribution_allowed:true }
const base = { source:'computrabajo', slug:'role-x', title:'Role X', organization:'Acme', description:'x'.repeat(120), is_active:true, verification_status:'verified', catalog_eligible:true, match_eligible:true, alerts_eligible:true, seo_eligible:true, seo_status:'eligible' }
assert.equal(canonicalOpportunityPath('role-x','job'), '/empleos/role-x')
assert.equal(canonicalOpportunityPath('role-x','scholarship'), '/oportunidades/role-x')
assert.equal(canonicalOpportunityUrl('role-x','job'), 'https://cvitae.lat/empleos/role-x')
assert.equal(evaluateOpportunityDistribution({...base, opportunity_type:'job'}, [policy]).jobPosting.allowed, true)
assert.equal(evaluateOpportunityDistribution({...base, opportunity_type:'scholarship'}, [policy]).jobPosting.allowed, false)
assert.equal(evaluateOpportunityDistribution({...base, opportunity_type:'job', source:'himalayas'}, [{...policy, source:'himalayas'}]).googleJobs.allowed, false)
assert.equal(evaluateOpportunityDistribution({...base, opportunity_type:'job', description:''}, [policy]).jobPosting.allowed, false)
const robots = fs.readFileSync('public/robots.txt','utf8')
for (const path of ['/admin','/auth/callback','/mi-carrera/']) assert.match(robots, new RegExp(`Disallow: ${path.replace('/', '\\/')}`))
assert.match(robots, /Sitemap: https:\/\/cvitae\.lat\/sitemap\.xml/)
assert.ok(!robots.includes('/empleos\nDisallow'), 'public jobs remain crawlable')
const dynamic = fs.readFileSync('netlify/functions/sitemap.ts','utf8')
assert.match(dynamic, /buildEffectiveSeoInventory/)
assert.match(dynamic, /canonical_path/)
assert.ok(!dynamic.includes('/sistemap.xml'))
console.log('verify_canonical_robots_sitemap: PASS')
