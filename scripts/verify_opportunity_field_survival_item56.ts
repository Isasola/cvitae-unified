import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')
const expect = (condition: boolean, message: string) => { if (!condition) throw new Error(`FIELD_SURVIVAL_FAIL: ${message}`) }

const adapter = read('scrapers/source_adapters.py')
const sink = read('scrapers/opportunity_sink.py')
const publicEndpoint = read('netlify/functions/public-opportunities.ts')
const jobDetail = read('src/pages/JobDetail.tsx')
const opportunityDetail = read('src/pages/OpportunityDetail.tsx')
const presentation = read('src/components/cvitae/OpportunityPresentation.tsx')
const fixture = JSON.parse(read('scripts/fixtures/opportunity-detail-rich.json'))

// Shared adapter/persistence contract: these fields have a factual canonical route.
for (const field of ['value', 'currency', 'published_at', 'deadline', 'application_url', 'source_url', 'eligible_countries', 'eligible_regions']) {
  expect(adapter.includes(`"${field}"`), `adapter RPC field ${field}`)
}
for (const field of ['value', 'currency', 'published_at', 'deadline', 'application_url', 'source_url', 'eligible_countries', 'eligible_regions']) {
  expect(adapter.includes(`${field}: result.`) || adapter.includes(`"${field}": result.`), `adapter patch mapping ${field}`)
}
for (const field of ['tags', 'experience_required', 'education_level', 'currency', 'published_at']) expect(sink.includes(`"${field}"`), `sink canonical field ${field}`)

// Public detail must consume the same normalized projection; no source fork is allowed.
for (const source of ['unjobs', 'himalayas', 'computrabajo', 'weworkremotely']) expect(JSON.stringify(fixture.rows).includes(`"source":"${source}"`), `representative fixture source ${source}`)
expect(publicEndpoint.includes('description,tags,requirements'), 'public endpoint exposes tags')
expect(publicEndpoint.includes('onsite_country,remote,remote_scope'), 'public endpoint preserves work-arrangement fields')
for (const page of [jobDetail, opportunityDetail]) expect(page.includes('tags:'), 'detail passes canonical tags to shared facts')
expect(presentation.includes('row.tags'), 'shared renderer consumes tags')
expect(!presentation.includes("source ===") && !presentation.includes("source =="), 'renderer has no source-specific fork')
expect(!presentation.match(/\b(?:salary|benefits|duration)\b[^\n]*Paraguay/i), 'renderer does not invent missing facts')

// Existing enrichment deliberately does not invent fields that remain outside
// the approved contract. The new optional fields are now explicitly sanitized.
const rpcFields = adapter.match(/RPC_FIELDS\s*=\s*\{([\s\S]*?)\n\}/)?.[1] || ''
for (const field of ['applicant_location_requirements']) {
  expect(!rpcFields.includes(`"${field}"`), `unsupported field ${field} is not silently persisted by adapter`)
}
for (const field of ['requirements', 'responsibilities', 'benefits', 'duration_text', 'start_date', 'start_date_text', 'employment_type']) expect(rpcFields.includes(`"${field}"`), `approved field ${field} has shared persistence mapping`)

console.log('ITEM56_5B_FIELD_SURVIVAL_OK=1')
console.log('tags_public_api=1')
console.log('tags_public_detail=1')
console.log('canonical_salary_deadline_geo_fields=1')
console.log('source_agnostic_fixture=1')
console.log('unsupported_fields_explicitly_unmapped=1')
