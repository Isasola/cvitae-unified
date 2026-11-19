/** Deterministic shared gates; uncertainty is reviewed, never guessed. */
export type GeoScope = 'PY' | 'PE' | 'LATAM' | 'WW' | 'UNKNOWN' | 'RESTRICTED'
const RESTRICTED = /\b(us(?:a)?\s*only|united states\s*only|canada\s*only|north america(?:\s*only)?|emea(?:\s*only)?|europe(?:\s*only)?|eu\s*only|uk\s*only)\b/i
const LATAM = /\b(latam|latin america|latinoam[eé]rica|south america|sudam[eé]rica)\b/i
const WORLD = /\b(worldwide|global|all countries|any country|international applicants)\b/i
const PY = /\b(paraguay|asunci[oó]n|\bpy\b)\b/i
const PE = /\b(per[uú]|lima|\bpe\b)\b/i
const GENERIC = /^(login|sign in|all jobs|careers?|privacy|terms|no results|empleos? en|vacantes? abiertas? en)\b/i
const TYPES = new Set(['job','internship','consultancy','scholarship','fellowship','grant','seed_capital','accelerator','incubator','startup_competition','research_funding','training','exchange_program','volunteering','tender'])
export interface GateInput { title?: string | null; description?: string | null; application_url?: string | null; source_url?: string | null; opportunity_type?: string | null; country_code?: string | null; location?: string | null; eligible_countries?: string[] | null; eligible_regions?: string[] | null; deadline?: string | null }
export interface GateResult { state: 'pass' | 'review' | 'blocked'; reasons: string[]; geo: GeoScope; expired: boolean }
export function geoScope(input: Pick<GateInput, 'country_code'|'location'|'description'|'eligible_countries'|'eligible_regions'>): GeoScope {
  const country = String(input.country_code || '').trim().toUpperCase()
  const text = [input.location,input.description,...(input.eligible_countries || []),...(input.eligible_regions || [])].filter(Boolean).join(' ')
  if (RESTRICTED.test(text)) return 'RESTRICTED'
  if (country === 'PY' || PY.test(text)) return 'PY'
  if (country === 'PE' || PE.test(text)) return 'PE'
  if (country && country !== 'UNKNOWN' && country !== 'WW') return 'RESTRICTED'
  if (LATAM.test(text)) return 'LATAM'
  if (country === 'WW' || WORLD.test(text)) return 'WW'
  return 'UNKNOWN'
}
export function candidateCanAccess(input: GateInput, candidateCountry?: string | null): boolean { const geo = geoScope(input); const country = String(candidateCountry || '').trim().toUpperCase(); return !country || country === 'UNKNOWN' ? geo !== 'RESTRICTED' : geo === country || geo === 'LATAM' || geo === 'WW' }
export function evaluateOpportunity(input: GateInput, now = new Date()): GateResult {
  const reasons: string[] = []; const title = String(input.title || '').trim()
  if (title.length < 3 || GENERIC.test(title)) reasons.push('invalid_title')
  if (!/^https?:\/\/[^\s]+$/i.test(String(input.application_url || ''))) reasons.push('invalid_application_url')
  if (input.source_url && !/^https?:\/\/[^\s]+$/i.test(input.source_url)) reasons.push('invalid_source_url')
  if (!TYPES.has(String(input.opportunity_type || ''))) reasons.push('unknown_type')
  const geo = geoScope(input); if (geo === 'UNKNOWN') reasons.push('unknown_geography'); if (geo === 'RESTRICTED') reasons.push('restricted_geography')
  const date = input.deadline ? new Date(input.deadline) : null; const expired = Boolean(date && !Number.isNaN(date.getTime()) && date.getTime() < now.getTime()); if (expired) reasons.push('expired')
  if (String(input.description || '').replace(/<[^>]*>/g,'').trim().length < 80) reasons.push('thin_description')
  const blocked = reasons.some(x => ['invalid_title','invalid_application_url','unknown_type','expired'].includes(x)); return { state: blocked ? 'blocked' : reasons.length ? 'review' : 'pass', reasons, geo, expired }
}
