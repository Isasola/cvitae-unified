import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import { EDGE_SOURCE_IDENTITIES } from '../supabase/functions/_shared/generated-source-registry.ts'
import { isEligibleForProfile, toStrings } from '../supabase/functions/_shared/matching.ts'

export type EligibilityState = 'ELIGIBLE' | 'INELIGIBLE' | 'UNKNOWN'
type EvidenceKind = 'WORLDWIDE' | 'COUNTRY' | 'REGION' | 'WORK_AUTHORIZATION'

export function canonicalSource(raw: unknown): string {
  const source = String(raw || '').trim().toLowerCase()
  const identity = EDGE_SOURCE_IDENTITIES.find((item: any) => item.canonical_source === source || item.emitted_aliases.includes(source))
  return identity?.canonical_source || source
}

/** Exact source-policy contract copied from match-batch runtime. */
export function applyMatchBatchSourcePolicy(rows: any[], policyRows: any[]) {
  const sourceIds = [...new Set(rows.map((row) => canonicalSource(row.source)).filter(Boolean))]
  const enabledSources = new Set(policyRows.filter((row) => row.is_enabled === true).map((row) => String(row.source)))
  void sourceIds
  return rows.filter((row) => enabledSources.has(canonicalSource(row.source))).map((row) => ({ ...row, source_match_state: 'ALLOWED' }))
}

/** Exact declaredEligibilityState semantics used by Matching V2. */
export function declaredEligibilityState(opp: any, profileLocation: string): EligibilityState {
  const declared = toStrings(opp.eligible_countries).concat(toStrings(opp.eligible_regions))
  if (!isEligibleForProfile(opp, profileLocation)) return 'INELIGIBLE'
  return declared.length ? 'ELIGIBLE' : 'UNKNOWN'
}

const normalize = (value: unknown) => String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
const snippet = (text: string, index: number, length: number) => text.slice(Math.max(0, index - 48), Math.min(text.length, index + length + 48)).trim()

/** Conservative applicant-eligibility extraction; workplace wording is excluded. */
export function extractEligibilityEvidence(value: unknown, field: 'description' | 'requirements') {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim()
  const folded = normalize(text)
  const rules: Array<{ id: string; kind: EvidenceKind; re: RegExp }> = [
    { id: 'EXPLICIT_APPLICANT_WORLDWIDE', kind: 'WORLDWIDE', re: /(?:applicant|candidate|eligible|open to|anyone).{0,80}(?:worldwide|global|all countries|anywhere in the world)|(?:worldwide|global|all countries|anywhere in the world).{0,80}(?:applicant|candidate|open to)/i },
    { id: 'EXPLICIT_WORK_AUTHORIZATION', kind: 'WORK_AUTHORIZATION', re: /(?:authorized|authorised|right)\s+to\s+work|work\s+(?:authorization|authorisation|permit)|visa\s+sponsorship|legally\s+work|citizenship\s+requirement|residen(?:t|ts|cy)\s+requirement/i },
    { id: 'EXPLICIT_APPLICANT_COUNTRY', kind: 'COUNTRY', re: /(?:applicant|candidate|eligible|authorized|based|resident).{0,80}(?:in|from)\s+(paraguay|peru|argentina|brazil|brasil|colombia|chile|mexico|united states|usa|canada|united kingdom|uk)|(?:paraguay|peru|argentina|brazil|brasil|colombia|chile|mexico|united states|usa|canada|united kingdom|uk).{0,80}(?:applicant|candidate|resident|authorized)/i },
    { id: 'EXPLICIT_APPLICANT_REGION', kind: 'REGION', re: /(?:applicant|candidate|eligible|open to).{0,80}(?:latam|latin america|south america|emea|apac|europe)|(?:latam|latin america|south america|emea|apac|europe).{0,80}(?:applicant|candidate|eligible)/i },
  ]
  const rule = rules.find((candidate) => candidate.re.test(folded))
  if (!rule) return null
  const match = folded.match(rule.re)
  return { field, rule_id: rule.id, kind: rule.kind, snippet: snippet(text, match?.index ?? 0, match?.[0]?.length ?? 0) }
}

function rowEvidence(row: any) {
  const description = extractEligibilityEvidence(row.description, 'description')
  if (description) return description
  if (Array.isArray(row.requirements)) return row.requirements.map((item: any) => extractEligibilityEvidence(item?.text, 'requirements')).find(Boolean) || null
  return extractEligibilityEvidence(row.requirements, 'requirements')
}

export function classifyUnknown(row: any) {
  const evidence = rowEvidence(row)
  if (evidence) {
    if (evidence.kind === 'WORLDWIDE') return { cause: 'EXPLICIT_WORLDWIDE_NOT_CANONICALIZED', evidence }
    if (evidence.kind === 'COUNTRY') return { cause: 'EXPLICIT_COUNTRY_NOT_CANONICALIZED', evidence }
    if (evidence.kind === 'REGION') return { cause: 'EXPLICIT_REGION_NOT_CANONICALIZED', evidence }
    return { cause: evidence.field === 'requirements' ? 'REQUIREMENTS_EXPLICIT_ELIGIBILITY_NOT_STRUCTURED' : 'DESCRIPTION_EXPLICIT_ELIGIBILITY_NOT_STRUCTURED', evidence }
  }
  if (String(row.remote_scope || '').toUpperCase() === 'WORLDWIDE') return { cause: 'UNRESOLVED_RAW_CHECK_REQUIRED', evidence: { rule_id: 'REMOTE_SCOPE_REQUIRES_APPLICANT_PROVENANCE', field: 'remote_scope' } }
  return { cause: 'SOURCE_TRULY_HAS_NO_ELIGIBILITY_EVIDENCE', evidence: null }
}

export function classifyRows(rows: any[], policyRows: any[], profileLocation: string) {
  const allowed = applyMatchBatchSourcePolicy(rows, policyRows)
  return allowed.map((row) => {
    const state = declaredEligibilityState(row, profileLocation)
    return { ...row, canonical_source: canonicalSource(row.source), eligibility_state: state, historical: Boolean(row.created_at && row.created_at < '2026-09-24T00:00:00Z'), ...(state === 'UNKNOWN' ? classifyUnknown(row) : { cause: null, evidence: null }) }
  })
}

async function run() {
  const url = process.env.SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  if (!url || !key) throw new Error('missing_read_only_supabase_env')
  const db = createClient(url, key)
  const now = new Date().toISOString()
  const fields = 'id,source,title,organization,location,country_code,remote,remote_scope,onsite_country,eligible_countries,eligible_regions,requirements,description,source_url,application_url,created_at,match_eligible,is_active,verification_status,deleted_at,archived_at,deadline'
  const rows: any[] = []
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db.from('opportunities').select(fields).eq('is_active', true).eq('verification_status', 'verified').eq('match_eligible', true).is('deleted_at', null).is('archived_at', null).or(`deadline.is.null,deadline.gte.${now}`).order('created_at', { ascending: false }).range(offset, offset + 999)
    if (error) throw error
    rows.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  const sourceIds = [...new Set(rows.map((row) => canonicalSource(row.source)).filter(Boolean))]
  const { data: policies, error: policyError } = await db.from('opportunity_sources').select('source,is_enabled').in('source', sourceIds)
  if (policyError) throw policyError
  const classified = classifyRows(rows, policies || [], 'Paraguay')
  const unknown = classified.filter((row) => row.eligibility_state === 'UNKNOWN')
  const count = (items: any[], key: string) => Object.fromEntries([...items.reduce((m, x) => m.set(String(x[key] || 'UNKNOWN'), (m.get(String(x[key] || 'UNKNOWN')) || 0) + 1), new Map())].sort((a, b) => b[1] - a[1]))
  const sourceRows = [...new Set(classified.map((row) => row.canonical_source))].map((source) => { const items = classified.filter((row) => row.canonical_source === source); const u = items.filter((row) => row.eligibility_state === 'UNKNOWN'); return { source, match_eligible_before_policy: rows.filter((row) => canonicalSource(row.source) === source).length, source_allowed: items.length, eligible: items.filter((row) => row.eligibility_state === 'ELIGIBLE').length, unknown: u.length, ineligible: items.filter((row) => row.eligibility_state === 'INELIGIBLE').length, unknown_rate: Number((u.length / Math.max(1, items.length) * 100).toFixed(2)), causes: count(u, 'cause') } }).sort((a, b) => b.unknown - a.unknown)
  const output = { generated_at: now, population: { match_eligible_before_source_policy: rows.length, source_allowed_after_policy: classified.length, eligible: classified.filter((row) => row.eligibility_state === 'ELIGIBLE').length, unknown: unknown.length, ineligible: classified.filter((row) => row.eligibility_state === 'INELIGIBLE').length }, cause_counts: count(unknown, 'cause'), source_rows: sourceRows, rows: classified }
  fs.writeFileSync('artifacts/eligibility-unknown-accounting.json', JSON.stringify(output, null, 2))
  console.log(JSON.stringify({ ...output, rows: undefined }, null, 2))
}

if (process.argv[1]?.replaceAll('\\', '/').endsWith('artifacts/eligibility-unknown-accounting.mts')) run()
