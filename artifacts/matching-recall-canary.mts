import { createClient } from '@supabase/supabase-js'
import { buildDictionary, toStrings } from '../supabase/functions/_shared/matching.ts'
import { rankOpportunitiesV2, V2_PRESET_FULL, isPotentialDiscoveryDecision } from '../supabase/functions/_shared/matching-v2.ts'
import { parsePgVector } from '../supabase/functions/_shared/vector.ts'
import { EDGE_SOURCE_IDENTITIES } from '../supabase/functions/_shared/generated-source-registry.ts'

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const userId = 'd0df2c85-d182-4436-abac-7ae1d9c3af9f'
const fields = 'id,slug,title,organization,location,rubro,tags,description,application_url,type,opportunity_type,opportunity_kind,eligible_countries,eligible_regions,source,deadline,created_at,published_at,is_active,verification_status,match_eligible,alerts_eligible,archived_at,deleted_at,remote,remote_scope'
const now = new Date().toISOString()
const deadlineFilter = `deadline.is.null,deadline.gte.${now}`
const canonical = (raw: unknown) => {
  const source = String(raw || '').trim().toLowerCase()
  const profile = EDGE_SOURCE_IDENTITIES.find((item: any) => item.canonical_source === source || item.emitted_aliases.includes(source))
  return profile?.canonical_source || source
}
async function fetchAll() {
  const rows: any[] = []
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.from('opportunities').select(fields)
      .eq('is_active', true).eq('verification_status', 'verified').eq('match_eligible', true)
      .is('deleted_at', null).is('archived_at', null).or(deadlineFilter)
      .order('created_at', { ascending: false }).range(offset, offset + 999)
    if (error) throw error
    rows.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  return rows
}
async function countWhere(extra: Array<(query: any) => any> = []) {
  let query: any = supabase.from('opportunities').select('id', { count: 'exact', head: true })
    .eq('is_active', true).eq('verification_status', 'verified').eq('match_eligible', true)
    .is('deleted_at', null).is('archived_at', null).or(deadlineFilter)
  for (const apply of extra) query = apply(query)
  const { count, error } = await query
  if (error) throw error
  return count ?? 0
}
async function countCatalogEligible() {
  const { count, error } = await supabase.from('opportunities').select('id', { count: 'exact', head: true })
    .eq('is_active', true).eq('verification_status', 'verified').eq('catalog_eligible', true)
    .is('deleted_at', null).is('archived_at', null).or(deadlineFilter)
  if (error) throw error
  return count ?? 0
}

const [{ data: profile, error: profileError }, { data: policies, error: policyError }, { data: dictRows, error: dictError }] = await Promise.all([
  supabase.from('user_master_profiles').select('professional_title,summary,cv_text,profile_data,embedding,updated_at').eq('user_id', userId).maybeSingle(),
  supabase.from('opportunity_sources').select('source,is_enabled'),
  supabase.from('skill_dictionary').select('canonical_name,variants'),
])
if (profileError) throw profileError
if (policyError) throw policyError
if (dictError) throw dictError
if (!profile) throw new Error('profile_missing')

const rows = await fetchAll()
const inventoryResult = await supabase.from('opportunities').select('id', { count: 'exact', head: true })
if (inventoryResult.error) throw inventoryResult.error
const totalInventory = inventoryResult.count ?? null
const catalogEligible = await countCatalogEligible()
const policyMap = new Map((policies || []).map((row: any) => [canonical(row.source), row.is_enabled === true]))
const allowed = (input: any[]) => input.filter(row => policyMap.get(canonical(row.source)) === true).map(row => ({ ...row, source_match_state: 'ALLOWED' }))

const primary = rows.slice(0, 300)
const embedding = parsePgVector(profile.embedding)
const semanticIds: string[] = []
const similarities = new Map<string, number>()
let semanticRows: any[] = []
let semanticError: string | null = null
if (embedding) {
  const { data, error } = await supabase.rpc('match_opportunities', { query_embedding: embedding, match_threshold: 0.10, match_count: 120 })
  if (error) semanticError = error.message
  else {
    for (const item of data || []) {
      semanticIds.push(String(item.id))
      similarities.set(String(item.id), Number(item.similarity ?? 0))
    }
    const ids = new Set(semanticIds)
    semanticRows = rows.filter(row => ids.has(String(row.id)))
  }
}
const currentMap = new Map<string, any>()
for (const row of [...primary, ...semanticRows]) currentMap.set(String(row.id), row)
const currentUnion = [...currentMap.values()]
const currentAllowed = allowed(currentUnion)
const exhaustiveAllowed = allowed(rows)
const dictionary = buildDictionary((dictRows || []).map((row: any) => [String(row.canonical_name || ''), Array.isArray(row.variants) ? row.variants.map(String) : []]))
const skills = toStrings(profile.profile_data?.habilidades)
const profileInput = {
  professional_title: String(profile.professional_title ?? ''), summary: profile.summary, cv_text: profile.cv_text,
  profile_data: {
    habilidades: skills, seniority: String(profile.profile_data?.seniority ?? 'semi-senior'),
    location: String(profile.profile_data?.location ?? ''), career_route: String(profile.profile_data?.career_route ?? ''),
    modality: profile.profile_data?.modality, education: profile.profile_data?.education,
    experience: profile.profile_data?.experience, languages: profile.profile_data?.languages,
    candidate_truth: profile.profile_data?.candidate_truth,
  },
}
const bounded = rankOpportunitiesV2(profileInput, currentAllowed, dictionary, V2_PRESET_FULL, similarities)
const exhaustive = rankOpportunitiesV2(profileInput, exhaustiveAllowed, dictionary, V2_PRESET_FULL, similarities)
function funnel(result: any) {
  const counts = { match: 0, abstain: 0, deny: 0, eligibilityEligible: 0, eligibilityUnknown: 0, eligibilityIneligible: 0, professionalEvidenceReady: 0, professionalFitKnown: 0 }
  for (const item of result.decisions) {
    const decision = item.decision
    if (decision.outcome === 'MATCH') counts.match++
    if (decision.outcome === 'ABSTAIN') counts.abstain++
    if (decision.outcome === 'DENY') counts.deny++
    if (decision.eligibility === 'ELIGIBLE') counts.eligibilityEligible++
    if (decision.eligibility === 'UNKNOWN') counts.eligibilityUnknown++
    if (decision.eligibility === 'INELIGIBLE') counts.eligibilityIneligible++
    if (decision.professional_evidence === 'SUFFICIENT') counts.professionalEvidenceReady++
    if (decision.professional_evidence === 'SUFFICIENT' && decision.applicable !== 'UNKNOWN' && decision.applicable !== 'CONFLICT') counts.professionalFitKnown++
  }
  return { ...counts, scoreablePotential: result.potentialTotal, visiblePotential: result.rankedPotentialV2.length, visibleConfirmed: result.rankedV2.length }
}
const boundedFunnel = funnel(bounded)
const exhaustiveFunnel = funnel(exhaustive)
const currentIds = new Set(currentAllowed.map(row => String(row.id)))
const potentialVisibleIds = new Set(exhaustive.rankedPotentialV2.map((item: any) => String(item.opp.id)))
const missedMatches = exhaustive.decisions.filter((item: any) => !currentIds.has(String(item.opp.id)) && item.decision.outcome === 'MATCH')
const missedVisiblePotential = exhaustive.rankedPotentialV2.filter((item: any) => !currentIds.has(String(item.opp.id)))
const missedScoreable = exhaustive.decisions.filter((item: any) => !currentIds.has(String(item.opp.id)) && isPotentialDiscoveryDecision(item.decision))
const missedAbstain = exhaustive.decisions.filter((item: any) => !currentIds.has(String(item.opp.id)) && item.decision.outcome === 'ABSTAIN')
const missedDeny = exhaustive.decisions.filter((item: any) => !currentIds.has(String(item.opp.id)) && item.decision.outcome === 'DENY')
const primaryIds = new Set(primary.map(row => String(row.id)))
const semanticSet = new Set(semanticRows.map(row => String(row.id)))
const relevant = exhaustive.decisions.filter((item: any) => item.decision.outcome === 'MATCH' || (isPotentialDiscoveryDecision(item.decision) && item.decision.confidence !== 'LOW' && (item.decision.score ?? 0) >= 45))
const capture = { primary_only: 0, semantic_only: 0, both: 0, neither: 0 }
for (const item of relevant) {
  const primaryHit = primaryIds.has(String(item.opp.id)); const semanticHit = semanticSet.has(String(item.opp.id))
  capture[primaryHit && semanticHit ? 'both' : primaryHit ? 'primary_only' : semanticHit ? 'semantic_only' : 'neither']++
}
const topMissed = [...missedMatches.map((item: any) => ({ ...item, kind: 'MATCH' })), ...missedVisiblePotential.map((item: any) => ({ ...item, kind: 'VISIBLE_POTENTIAL' }))].sort((a: any, b: any) => (b.v2Score ?? b.decision.score ?? 0) - (a.v2Score ?? a.decision.score ?? 0)).slice(0, 20).map((item: any) => ({
  opportunity_id: item.opp.id, title: item.opp.title, organization: item.opp.organization, source: item.opp.source, location: item.opp.location,
  published_at: item.opp.published_at ?? null, deadline: item.opp.deadline ?? null, remote_scope: item.opp.remote_scope ?? null,
  eligible_countries: item.opp.eligible_countries ?? [], eligible_regions: item.opp.eligible_regions ?? [], professional_fit: item.decision.applicable,
  eligibility: item.decision.eligibility, score: item.v2Score ?? item.decision.score, confidence: item.decision.confidence, decision: item.decision.outcome,
  kind: item.kind, reason_codes: [...(item.decision.hard_denials || []), ...(item.decision.unknown_reasons || []), ...(item.decision.negative_reasons || [])],
  why_current_retrieval_missed: 'outside primary latest-300 and/or semantic top-120',
  primary_rank: rows.findIndex(row => String(row.id) === String(item.opp.id)) + 1,
  semantic_rank: semanticIds.indexOf(String(item.opp.id)) + 1,
}))
console.log(JSON.stringify({
  universe: { totalInventory, catalogEligible, totalMatchEligible: rows.length, sourcePolicyRows: policies?.length ?? 0, exhaustiveSourceAllowed: exhaustiveAllowed.length },
  retrieval: { primary: primary.length, semanticRpc: semanticIds.length, semanticHydrated: semanticRows.length, union: currentUnion.length, currentSourceAllowed: currentAllowed.length, coveragePercent: Number((currentUnion.length / Math.max(1, rows.length) * 100).toFixed(2)), primaryOrder: 'created_at DESC', primaryFilters: 'is_active=true, verification_status=verified, match_eligible=true, deleted_at IS NULL, archived_at IS NULL, deadline NULL or >= now', semanticFilters: 'match_opportunities threshold=0.10 count=120; hydration applies same filters', dedup: 'id Map', pagination: 'diagnostic fetch pages 1000; production request bounded' },
  bounded: boundedFunnel, exhaustive: exhaustiveFunnel,
  missed: { match: missedMatches.length, visiblePotential: missedVisiblePotential.length, scoreablePotential: missedScoreable.length, abstain: missedAbstain.length, deny: missedDeny.length, capture, relevantUniverse: relevant.length, top20: topMissed },
  embedding: { present: Boolean(embedding), dimension: embedding?.length ?? 0, semanticRanked: semanticIds.length, universeRowsWithoutSemantic: rows.length - semanticRows.length, semanticError },
  profile: { skillsCount: skills.length, locationPresent: Boolean(profile.profile_data?.location), titlePresent: Boolean(profile.professional_title) },
  snapshotComparison: { id: 'eb932654-a03d-4cf2-b928-ccbfd7fd0d0a', primary: 300, semantic: 120, union: 391, sourceAllowed: 391, professionalEvidence: 383, professionalFit: 64, eligibilityEligible: 0, eligibilityUnknown: 378, eligibilityIneligible: 13, match: 0, potentialScoreable: 64, visiblePotential: 0 },
}))
