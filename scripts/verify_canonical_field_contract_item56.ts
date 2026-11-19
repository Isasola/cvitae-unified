import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')
const fail = (message: string): never => { throw new Error(`CANONICAL_CONTRACT_FAIL: ${message}`) }
const expect = (condition: boolean, message: string) => { if (!condition) fail(message) }

const migration = read('supabase/migrations/202609240001_canonical_opportunity_field_contract.sql')
const adapter = read('scrapers/source_adapters.py')
const endpoint = read('netlify/functions/public-opportunities.ts')
const presentation = read('src/components/cvitae/OpportunityPresentation.tsx')
const workspace = read('netlify/functions/application-workspace.ts')

for (const column of ['requirements jsonb', 'responsibilities jsonb', 'benefits jsonb', 'duration_text text', 'start_date date', 'start_date_text text', 'employment_type text']) {
  expect(migration.includes(`ADD COLUMN IF NOT EXISTS ${column}`), `nullable additive column ${column}`)
}
expect(!migration.includes('DROP COLUMN') && !migration.includes('RENAME COLUMN'), 'migration does not remove or rename columns')
for (const forbidden of ['end_date', 'work_arrangement', 'duration_value', 'duration_unit', 'salary_amount', 'salary_unit']) expect(!migration.includes(forbidden), `forbidden speculative column ${forbidden}`)
expect(migration.includes('ALTER TABLE public.opportunities'), 'migration targets opportunities only')
expect(migration.includes('NULL when source evidence is unavailable'), 'missing JSONB remains NULL by contract')
expect(migration.includes('create or replace function public.apply_opportunity_enrichment_atomic'), 'canonical migration owns the atomic writer')
expect(migration.includes("'requirements','responsibilities','benefits','duration_text','start_date','start_date_text','employment_type'"), 'RPC whitelist accepts all canonical fields')
expect(migration.includes("jsonb_typeof(p_patch->v_key) <> 'array'"), 'structured JSONB arrays are validated')
expect(migration.includes("jsonb_array_length(p_patch->v_key) > 100"), 'structured JSONB arrays are bounded')
expect(migration.includes("raise exception 'invalid_%', v_key"), 'invalid structured payloads fail deterministically')
expect(migration.includes("raise exception 'invalid_start_date'"), 'invalid explicit start dates fail deterministically')
expect(migration.includes("requirements=case when v_changed?'requirements'"), 'requirements is persisted in the atomic UPDATE')
expect(migration.includes("employment_type=case when v_changed?'employment_type'"), 'employment_type is persisted in the atomic UPDATE')
expect(migration.includes('changed_fields,v_before,v_after'), 'enrichment event records changed/before/after fields')
expect(migration.includes("if p_patch ? v_key then v_text:=nullif(trim(p_patch->>v_key),'')"), 'blank scalar canonical values are no-op')
expect(migration.includes("if jsonb_typeof(p_patch->v_key) <> 'string' then raise exception 'invalid_%', v_key"), 'canonical scalar JSON types are strict')
expect(migration.includes("if jsonb_typeof(p_patch->v_key) = 'null' then continue"), 'canonical scalar JSON null is no-op')
for (const field of ['duration_text', 'start_date_text', 'employment_type']) expect(migration.includes(`array['duration_text','start_date_text','employment_type']`) && migration.includes("raise exception 'invalid_%', v_key"), `strict scalar validation covers ${field}`)
expect(migration.includes("if jsonb_array_length(v_items)>0"), 'empty structured arrays are no-op')
expect(migration.includes("p_patch ? 'start_date' and jsonb_typeof(p_patch->'start_date') <> 'null'"), 'start_date null is not a new delete semantic')
expect(migration.includes("array['title','organization','description','value','currency','deadline','application_url','source_url']"), 'deadline remains in the production-compatible text loop')
expect(migration.includes("deadline=case when v_changed?'deadline' then v_changed->>'deadline'"), 'deadline update remains text-compatible')

for (const field of ['requirements', 'responsibilities', 'benefits', 'duration_text', 'start_date', 'start_date_text', 'employment_type']) {
  expect(adapter.includes(`"${field}"`), `adapter contract includes ${field}`)
  expect(endpoint.includes(field), `public endpoint includes ${field}`)
}
expect(adapter.includes('structured_items(result.requirements, with_category=True)'), 'requirements items sanitized')
expect(adapter.includes('structured_items(result.responsibilities)'), 'responsibilities items sanitized')
expect(adapter.includes('structured_items(result.benefits)'), 'benefits items sanitized')
expect(endpoint.includes('remote,remote_scope'), 'work arrangement remains separate')
expect(!endpoint.includes('work_arrangement'), 'no ambiguous work_arrangement field')
expect(presentation.includes('Qué buscan') && presentation.includes('Qué harías') && presentation.includes('Beneficios'), 'structured sections are shared')
expect(presentation.includes('Ver descripción original completa'), 'original description remains available')
expect(workspace.includes('requirements,responsibilities,benefits') && workspace.includes('structuredOpportunity'), 'workspace receives structured opportunity facts')
expect(!presentation.includes('source ===') && !presentation.includes('source =='), 'presentation remains source agnostic')

console.log('ITEM56_5C_CANONICAL_CONTRACT_OK=1')
console.log('migration_additive_nullable=1')
console.log('jsonb_missing_is_null=1')
console.log('employment_type_separate_from_work_arrangement=1')
console.log('shared_public_and_workspace_plumbing=1')
console.log('source_agnostic_renderer=1')
