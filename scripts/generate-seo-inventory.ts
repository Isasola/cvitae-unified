import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { buildEffectiveSeoInventory } from '../src/lib/seo-inventory.ts'
import { fetchAllPages } from '../src/lib/paged-fetch.js'

type Input = { opportunities: Record<string, any>[]; policies: SourcePolicyRow[] }
const root = path.resolve(import.meta.dirname, '..')
const output = path.join(root, 'generated', 'public-seo-inventory.json')
const policyOutput = path.join(root, 'generated', 'source-distribution-policy-snapshot.json')
const fixture = process.env.SEO_INVENTORY_FIXTURE
const PAGE_SIZE = 1000
const OPPORTUNITY_COLUMNS = 'id,slug,title,organization,description,location,city,department,country_code,eligible_countries,eligible_regions,remote_scope,tags,deadline,application_url,source_url,source,opportunity_type,opportunity_kind,type,created_at,updated_at,is_active,verification_status,catalog_eligible,seo_eligible,seo_status,deleted_at,archived_at'

async function input(): Promise<Input> {
  if (fixture) return JSON.parse(fs.readFileSync(path.resolve(fixture), 'utf8'))
  const url = process.env.SUPABASE_URL
  // Server/build-only credential. It is used for the safe RPC and never written
  // to the generated artifact or exposed to the browser bundle.
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('seo_inventory_policy_unavailable')
  const db = createClient(url, key)
  const { data: policies, error: policyError } = await db.rpc('get_source_distribution_policy')
  if (policyError) throw policyError
  const opportunities = await fetchAllPages<Record<string, any>>(PAGE_SIZE, async (offset, size) => {
    const { data, error } = await db.from('opportunities').select(OPPORTUNITY_COLUMNS).not('slug','is',null).order('updated_at', { ascending:false }).order('id', { ascending:true }).range(offset, offset + size - 1)
    if (error) throw error
    return data || []
  })
  return { opportunities, policies: policies || [] }
}

const { opportunities, policies } = await input()
const rows = buildEffectiveSeoInventory(opportunities, policies)
fs.mkdirSync(path.dirname(output), { recursive:true })
const policyFields = ['source','is_enabled','catalog_enabled','matching_enabled','alerts_enabled','seo_enabled','registry_certified','registry_adapter_version','registry_policy_hash','registry_synced_at','web_catalog_allowed','search_engine_indexing_allowed','google_jobs_distribution_allowed','third_party_job_distribution_allowed','source_attribution_required']
const policySnapshot = policies.map(policy => Object.fromEntries(policyFields.filter(field => field in policy).map(field => [field, (policy as any)[field]])))
fs.writeFileSync(policyOutput, JSON.stringify({ schema_version:'source-distribution-policy:v1', generated_at:new Date().toISOString(), policies: policySnapshot }, null, 2))
fs.writeFileSync(output, JSON.stringify({ schema_version:'public-seo-inventory:v1', generated_at:new Date().toISOString(), rows }, null, 2))
console.log(`SOURCE_POLICY_SNAPSHOT=${policySnapshot.length}`)
console.log(`SEO_INVENTORY=${rows.length}`)
