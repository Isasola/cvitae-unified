export type EligibilityState = 'ELIGIBLE' | 'INELIGIBLE' | 'UNKNOWN'
export type CandidateEligibility = { version: 1; residence_country: string; citizenship_countries: string[]; work_authorization_countries: string[]; evidence: { residence_country: 'USER_CONFIRMED' | 'UNKNOWN'; citizenship_countries: 'USER_CONFIRMED' | 'UNKNOWN'; work_authorization_countries: 'USER_CONFIRMED' | 'UNKNOWN' }; confirmed_at: string | null }
export const LATAM_COUNTRIES = new Set(['AR','BO','BR','CL','CO','CR','CU','DO','EC','SV','GT','HN','MX','NI','PA','PY','PE','UY','VE'])
export function normalizeCountryCode(value: unknown): string { const code=String(value ?? '').trim().toUpperCase(); return isISO3166Alpha2(code) ? code : '' }
const list=(value: unknown) => Array.from(new Set((Array.isArray(value)?value:[]).map(normalizeCountryCode).filter(Boolean))).sort()
export function canonicalCandidateEligibility(value: any): CandidateEligibility { const raw=value && typeof value==='object'?value:{}; const residence_country=normalizeCountryCode(raw.residence_country); const citizenship_countries=list(raw.citizenship_countries); const work_authorization_countries=list(raw.work_authorization_countries); const evidence=raw.evidence||{}; return {version:1,residence_country,citizenship_countries,work_authorization_countries,evidence:{residence_country:evidence.residence_country==='USER_CONFIRMED'&&residence_country?'USER_CONFIRMED':'UNKNOWN',citizenship_countries:evidence.citizenship_countries==='USER_CONFIRMED'&&citizenship_countries.length?'USER_CONFIRMED':'UNKNOWN',work_authorization_countries:evidence.work_authorization_countries==='USER_CONFIRMED'&&work_authorization_countries.length?'USER_CONFIRMED':'UNKNOWN'},confirmed_at:typeof raw.confirmed_at==='string'?raw.confirmed_at:null} }
export function confirmedCandidateEligibility(value: unknown): CandidateEligibility { const base=canonicalCandidateEligibility(value); const has=Boolean(base.residence_country||base.citizenship_countries.length||base.work_authorization_countries.length); return {...base,evidence:{residence_country:base.residence_country?'USER_CONFIRMED':'UNKNOWN',citizenship_countries:base.citizenship_countries.length?'USER_CONFIRMED':'UNKNOWN',work_authorization_countries:base.work_authorization_countries.length?'USER_CONFIRMED':'UNKNOWN'},confirmed_at:has?new Date().toISOString():null} }
const regions=(opp:any)=>Array.isArray(opp?.eligible_regions)?opp.eligible_regions.map((x:any)=>String(x).toUpperCase()):[]
const countries=(opp:any)=>Array.isArray(opp?.eligible_countries)?opp.eligible_countries.map(normalizeCountryCode).filter(Boolean):[]
export function evaluateOpportunityEligibility(candidateValue: unknown, opp: any): {state: EligibilityState; reason: string} {
  const candidate=canonicalCandidateEligibility(candidateValue)
  const rs=regions(opp), cs=countries(opp)
  const residency=Boolean(opp?.residency_requirement), citizenship=Boolean(opp?.citizenship_requirement), remote=opp?.remote===true
  const global=rs.includes('GLOBAL')
  if (global && !residency && !citizenship) return {state:'ELIGIBLE',reason:'OPPORTUNITY_GLOBAL_ELIGIBILITY'}
  if (global && citizenship && !cs.length && rs.every((region:string)=>region==='GLOBAL')) return {state:'UNKNOWN',reason:'OPPORTUNITY_CITIZENSHIP_REQUIREMENT_UNSTRUCTURED'}
  if (global && residency && !cs.length && rs.every((region:string)=>region==='GLOBAL')) return {state:'UNKNOWN',reason:'OPPORTUNITY_RESIDENCY_REQUIREMENT_UNSTRUCTURED'}
  if(!cs.length&&!rs.length) return {state:'UNKNOWN',reason:'OPPORTUNITY_ELIGIBILITY_UNKNOWN'}
  if(!remote&&!residency&&!citizenship) return {state:'UNKNOWN',reason:'OPPORTUNITY_ELIGIBILITY_BASIS_UNKNOWN'}
  const allowed=(country:string)=>cs.includes(country)||(rs.includes('LATAM')&&LATAM_COUNTRIES.has(country))
  const unsupported=rs.find((r:string)=>r!=='LATAM'&&r!=='GLOBAL')
  if(unsupported) return {state:'UNKNOWN',reason:`REGION_MEMBERSHIP_UNSUPPORTED:${unsupported}`}
  const residence=candidate.evidence.residence_country==='USER_CONFIRMED'?candidate.residence_country:''
  const citizen=candidate.evidence.citizenship_countries==='USER_CONFIRMED'?candidate.citizenship_countries:[]
  if(citizenship){if(!citizen.length)return {state:'UNKNOWN',reason:'CANDIDATE_CITIZENSHIP_UNKNOWN'};if(!citizen.some(allowed))return {state:'INELIGIBLE',reason:'CANDIDATE_CITIZENSHIP_NOT_ALLOWED'}}
  if(residency || (remote&&!citizenship)){if(!residence)return {state:'UNKNOWN',reason:'CANDIDATE_RESIDENCE_UNKNOWN'};if(!allowed(residence))return {state:'INELIGIBLE',reason:'CANDIDATE_COUNTRY_NOT_ALLOWED'}}
  return {state:'ELIGIBLE',reason:citizenship?'OPPORTUNITY_CITIZENSHIP_ELIGIBILITY':'OPPORTUNITY_RESIDENCE_ELIGIBILITY'}
}
import { isISO3166Alpha2 } from './iso-countries'
