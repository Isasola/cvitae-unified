/** Read-only local accounting. Uses only public URL and anon credentials; it never uses service-role credentials. */
import { evaluateOpportunityEligibility, confirmedCandidateEligibility } from '../shared/candidate-eligibility.ts'
import { isEligibleForProfile } from '../supabase/functions/_shared/matching.ts'

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
if (!url || !anonKey) {
  console.log('READONLY_PREVIEW_SKIPPED_NO_PUBLIC_CREDENTIALS')
  process.exit(0)
}

const fields = 'id,location,remote,remote_scope,eligible_countries,eligible_regions,residency_requirement,citizenship_requirement,source_match_state,match_eligible'
const response = await fetch(`${url}/rest/v1/opportunities?select=${fields}&source_match_state=eq.ALLOWED&match_eligible=eq.true`, {
  headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
})
if (response.status === 401 || response.status === 403 || response.status === 400) {
  console.log('READONLY_PREVIEW_SKIPPED_RLS')
  process.exit(0)
}
if (!response.ok) throw new Error(`read-only query failed: ${response.status}`)
const candidate = confirmedCandidateEligibility({ residence_country: 'PY', citizenship_countries: ['PY'], work_authorization_countries: ['PY'] })
const counts: Record<string, number> = { ELIGIBLE: 0, INELIGIBLE: 0, UNKNOWN: 0 }
const legacy: Record<string, number> = { ELIGIBLE: 0, INELIGIBLE: 0, UNKNOWN: 0 }
const reasons = new Map<string, number>()
let locationProxyDifferences = 0
for (const opportunity of await response.json()) {
  const next = evaluateOpportunityEligibility(candidate, opportunity)
  counts[next.state]++
  reasons.set(next.reason, (reasons.get(next.reason) ?? 0) + 1)
  const prior = isEligibleForProfile(opportunity, 'Paraguay') ? 'ELIGIBLE' : 'INELIGIBLE'
  legacy[prior]++
  if (prior !== next.state) locationProxyDifferences++
}
console.log(JSON.stringify({ legacy, next: counts, locationProxyDifferences, topReasons: [...reasons.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5) }, null, 2))
