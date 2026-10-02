import { createClient } from '@supabase/supabase-js'
import { buildCanonicalSourcePolicyIndex, inventoryFunnelPage, mergeInventoryFunnelCounts, normalizeSourcePolicyRow } from '../shared/matching-retrieval.ts'
import { EDGE_SOURCE_IDENTITIES } from '../supabase/functions/_shared/generated-source-registry.ts'

// Read-only accounting only. This script is prepared for later controlled validation; do not run against PROD in this workstream.
const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) throw new Error('READ_ONLY_SUPABASE_CONFIGURATION_REQUIRED')
const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
const { data: policies, error: policyError } = await supabase.from('opportunity_sources').select('source,is_enabled,matching_enabled')
if (policyError) throw policyError
const identities = EDGE_SOURCE_IDENTITIES
const canonicalSource = (raw: unknown) => {
  const source = String(raw ?? '').trim().toLowerCase()
  const identity = identities.find((item) => item.canonical_source === source || item.emitted_aliases.includes(source))
  return identity?.canonical_source || source
}
const sourcePolicyIndex = buildCanonicalSourcePolicyIndex((policies ?? []).map(normalizeSourcePolicyRow), identities, canonicalSource)
const funnel: Record<string, any> = { TOTAL_INVENTORY: 0, WHY_NOT_MATCH_UNIVERSE: {}, EXCLUSION_CLASSES: {} }
const now = new Date().toISOString()
const observationDate = now.slice(0, 10).replaceAll('-', '')
let afterId = ''
for (;;) {
  const { data, error } = await supabase.from('opportunities')
    .select('id,source,title,content_fingerprint,is_active,verification_status,deleted_at,archived_at,deadline,match_eligible')
    .gt('id', afterId).order('id', { ascending: true }).limit(500)
  if (error) throw error
  const rows = data ?? []
  const page = inventoryFunnelPage(rows, sourcePolicyIndex, now)
  mergeInventoryFunnelCounts(funnel, page.counts)
  if (rows.length < 500) break
  afterId = String(rows[rows.length - 1].id)
}
console.log(JSON.stringify({ label: `CURRENT_READONLY_PROD_${observationDate}`, read_only: true, consistency: 'PAGED_READ_ONLY_OBSERVATION', as_of: now, ...funnel }))
