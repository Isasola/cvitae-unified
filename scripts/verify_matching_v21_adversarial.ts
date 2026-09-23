import assert from 'node:assert/strict'
import { buildDefaultDictionary } from '../supabase/functions/_shared/matching.ts'
import { detectCareerFamily, rankOpportunitiesV2, V2_PRESET_FULL, type MatchDecision } from '../supabase/functions/_shared/matching-v2.ts'

type Expected = 'MATCH' | 'NOT_MATCH' | 'DENY' | 'ABSTAIN'
type Scenario = { id: string; expectation: Expected; retrieval: 'RETRIEVED' | 'NOT_RETRIEVED'; title: string; rubro: string; tags: string[]; extra?: Record<string, unknown> }
type ProfileSpec = { id: string; title: string; skills: string[]; adjacentTitle: string; adjacentSkills: string[]; negativeTitle: string; negativeSkills: string[] }

const dictionary = buildDefaultDictionary()
const FUTURE = '2099-01-01T00:00:00Z'
const profiles: ProfileSpec[] = [
  { id: 'founder_international', title: 'International Development Programme Officer', skills: ['International cooperation', 'Project management', 'English'], adjacentTitle: 'Project Coordinator', adjacentSkills: ['Project management', 'Stakeholder management'], negativeTitle: 'Clinical Hospital Nurse', negativeSkills: ['Nursing', 'Patient care'] },
  { id: 'software_backend_cloud', title: 'Backend Software Engineer', skills: ['Python', 'SQL', 'Docker'], adjacentTitle: 'Data Engineer', adjacentSkills: ['Python', 'SQL', 'ETL'], negativeTitle: 'Human Resources Recruiter', negativeSkills: ['Recruiting', 'Talent acquisition'] },
  { id: 'data_analytics', title: 'Data Analytics Specialist', skills: ['SQL', 'Power BI', 'Python'], adjacentTitle: 'Financial Data Analyst', adjacentSkills: ['SQL', 'Finance', 'Power BI'], negativeTitle: 'Corporate Legal Counsel', negativeSkills: ['Legal', 'Contracts'] },
  { id: 'sales_commercial', title: 'Business Development Sales Executive', skills: ['Sales', 'CRM', 'Negotiation'], adjacentTitle: 'Marketing Account Manager', adjacentSkills: ['Marketing', 'Sales', 'CRM'], negativeTitle: 'Industrial Civil Engineer', negativeSkills: ['Civil engineering', 'Autocad'] },
  { id: 'marketing_comms', title: 'Marketing Communications Specialist', skills: ['SEO', 'Google Ads', 'Content', 'Marketing', 'CRM'], adjacentTitle: 'Sales Account Manager', adjacentSkills: ['Sales', 'Marketing', 'CRM'], negativeTitle: 'Financial Accountant', negativeSkills: ['Accounting', 'Finance'] },
  { id: 'finance_accounting', title: 'Financial Accounting Analyst', skills: ['Accounting', 'Finance', 'Excel'], adjacentTitle: 'Business Data Analyst', adjacentSkills: ['SQL', 'Finance', 'Excel'], negativeTitle: 'Backend Software Engineer', negativeSkills: ['Python', 'Docker'] },
  { id: 'engineering_industrial', title: 'Industrial Mechanical Engineer', skills: ['Mechanical engineering', 'Autocad', 'Maintenance', 'Operations', 'Logistics'], adjacentTitle: 'Operations Logistics Coordinator', adjacentSkills: ['Operations', 'Logistics', 'Maintenance'], negativeTitle: 'Clinical Hospital Nurse', negativeSkills: ['Nursing', 'Patient care'] },
  { id: 'hr_people', title: 'Human Resources Talent Acquisition Specialist', skills: ['Human resources', 'Talent acquisition', 'Excel'], adjacentTitle: 'Administrative Office Coordinator', adjacentSkills: ['Administration', 'Excel', 'Training'], negativeTitle: 'Data Engineer', negativeSkills: ['Python', 'SQL'] },
  { id: 'healthcare', title: 'Clinical Hospital Nurse', skills: ['Nursing', 'Patient care', 'Healthcare'], adjacentTitle: 'Hospital Healthcare Coordinator', adjacentSkills: ['Healthcare', 'Patient care', 'Operations'], negativeTitle: 'Logistics Operations Supervisor', negativeSkills: ['Logistics', 'Warehouse'] },
  { id: 'legal', title: 'Corporate Legal Compliance Counsel', skills: ['Legal', 'Contracts', 'Compliance'], adjacentTitle: 'Administrative Legal Assistant', adjacentSkills: ['Legal', 'Administration', 'Contracts'], negativeTitle: 'Frontend Software Developer', negativeSkills: ['JavaScript', 'React'] },
  { id: 'operations_logistics', title: 'Operations Logistics Coordinator', skills: ['Logistics', 'Operations', 'Excel'], adjacentTitle: 'Project Operations Manager', adjacentSkills: ['Operations', 'Project management', 'Logistics'], negativeTitle: 'Medical Clinical Nurse', negativeSkills: ['Nursing', 'Healthcare'] },
  { id: 'education_academic', title: 'Academic Education Programme Coordinator', skills: ['Education', 'Curriculum', 'Teaching'], adjacentTitle: 'University Academic Coordinator', adjacentSkills: ['Education', 'Teaching', 'Research'], negativeTitle: 'Backend Software Engineer', negativeSkills: ['Python', 'Docker'] },
  { id: 'customer_service', title: 'Customer Service Support Specialist', skills: ['Customer service', 'Communication', 'CRM'], adjacentTitle: 'Customer Success Account Coordinator', adjacentSkills: ['Customer service', 'CRM', 'Sales'], negativeTitle: 'Industrial Mechanical Engineer', negativeSkills: ['Mechanical engineering', 'Maintenance'] },
  { id: 'administrative_generalist', title: 'Administrative Office Assistant', skills: ['Administration', 'Excel', 'Communication'], adjacentTitle: 'Human Resources Administrative Assistant', adjacentSkills: ['Human resources', 'Administration', 'Excel'], negativeTitle: 'Backend Software Engineer', negativeSkills: ['Python', 'Docker'] },
]

function richDescription(title: string, tags: string[]) {
  return `${title}. This role requires demonstrated professional practice in ${tags.join(', ')} and sustained delivery with stakeholders, reporting, planning, and accountable results.`
}
function opportunity(profile: ProfileSpec, scenario: Scenario, index: number) {
  return {
    id: `${profile.id}-${scenario.id}-${index}`,
    slug: `${profile.id}-${scenario.id}-${index}`,
    title: scenario.title,
    rubro: scenario.rubro,
    tags: scenario.tags,
    description: richDescription(scenario.title, scenario.tags),
    source_match_state: 'ALLOWED', is_active: true, verification_status: 'verified', match_eligible: true,
    deleted_at: null, archived_at: null, deadline: FUTURE, eligible_countries: ['py'], eligible_regions: [],
    location: 'Remote', type: 'Remote', work_arrangement: 'remote',
    ...scenario.extra,
  }
}
function scenarios(profile: ProfileSpec): Scenario[] {
  return [
    { id: 'clear-positive', expectation: 'MATCH', retrieval: 'RETRIEVED', title: profile.title, rubro: profile.title, tags: profile.skills },
    { id: 'adjacent-positive', expectation: 'MATCH', retrieval: 'RETRIEVED', title: profile.adjacentTitle, rubro: profile.adjacentTitle, tags: profile.adjacentSkills },
    { id: 'hard-negative', expectation: 'NOT_MATCH', retrieval: 'RETRIEVED', title: profile.negativeTitle, rubro: profile.negativeTitle, tags: profile.negativeSkills },
    { id: 'semantic-trap', expectation: 'NOT_MATCH', retrieval: 'RETRIEVED', title: `Programme monitoring systems ${profile.negativeTitle}`, rubro: profile.negativeTitle, tags: profile.negativeSkills },
    { id: 'remote-us-only', expectation: 'DENY', retrieval: 'RETRIEVED', title: profile.title, rubro: profile.title, tags: profile.skills, extra: { eligible_countries: ['us'] } },
    { id: 'remote-unknown-eligibility', expectation: 'ABSTAIN', retrieval: 'RETRIEVED', title: profile.title, rubro: profile.title, tags: profile.skills, extra: { eligible_countries: [], eligible_regions: [] } },
    { id: 'hard-requirement-fail', expectation: 'DENY', retrieval: 'RETRIEVED', title: profile.title, rubro: profile.title, tags: profile.skills, extra: { hard_requirements: ['Kubernetes'] } },
    { id: 'thin-evidence', expectation: 'ABSTAIN', retrieval: 'RETRIEVED', title: profile.title, rubro: profile.title, tags: [], extra: { description: 'Short' } },
  ]
}

let total = 0, matched = 0, abstained = 0, denied = 0, positives = 0, positiveMatched = 0
let hardNegatives = 0, hardNegativeRejected = 0, conflicts = 0, conflictDenied = 0
let unknownProfession = 0, unknownEligibility = 0, rankingMisses = 0, retrievalMisses = 0
let top5Relevant = 0, top5Shown = 0, top10Relevant = 0, top10Shown = 0
const falsePositiveReasons = new Map<string, number>()
const falseNegativeReasons = new Map<string, number>()
const falseNegativeSamples: Array<{ profile: string; scenario: string; outcome: string; applicable: string; reasons: string[] }> = []
const seniorities = ['trainee', 'junior', 'mid', 'senior']

for (const [profileIndex, spec] of profiles.entries()) {
  const profile = {
    professional_title: spec.title,
    summary: `${spec.title}. ${spec.skills.join(', ')}. Spanish and English professional experience.`,
    profile_data: {
      habilidades: spec.skills, seniority: seniorities[profileIndex % seniorities.length], location: 'Paraguay', modality: 'remote',
      languages: ['Spanish', 'English'],
      candidate_truth: { evidence: { professional_title: 'USER_CONFIRMED', skills: 'USER_CONFIRMED', location: 'USER_CONFIRMED', languages: 'USER_CONFIRMED' } },
    },
  }
  const rows = scenarios(spec).map((scenario, index) => ({ scenario, opp: opportunity(spec, scenario, index) }))
  const retrieved = rows.filter(({ scenario }) => scenario.retrieval === 'RETRIEVED').map(({ opp }) => opp)
  const similarities = new Map(retrieved.map((opp) => [opp.id, opp.title.includes('Programme monitoring systems') ? .99 : .86]))
  const result = rankOpportunitiesV2(profile, retrieved, dictionary, V2_PRESET_FULL, similarities)
  const byId = new Map(result.decisions.map(({ opp, decision }) => [opp.id, decision]))

  for (const { scenario, opp } of rows) {
    if (scenario.retrieval === 'NOT_RETRIEVED') { retrievalMisses++; continue }
    const decision = byId.get(opp.id)!
    total++
    if (decision.outcome === 'MATCH') matched++
    if (decision.outcome === 'ABSTAIN') abstained++
    if (decision.outcome === 'DENY') denied++
    if (decision.applicable === 'UNKNOWN') unknownProfession++
    if (decision.eligibility === 'UNKNOWN') unknownEligibility++

    const isPositive = scenario.expectation === 'MATCH'
    if (isPositive) {
      positives++
      if (decision.outcome === 'MATCH') positiveMatched++
      else {
        const reasons = [...decision.hard_denials, ...decision.negative_reasons, ...decision.unknown_reasons]
        for (const reason of reasons) falseNegativeReasons.set(reason, (falseNegativeReasons.get(reason) ?? 0) + 1)
        falseNegativeSamples.push({ profile: spec.id, scenario: scenario.id, outcome: decision.outcome, applicable: decision.applicable, reasons })
      }
    }
    if (scenario.id === 'hard-negative' || scenario.id === 'semantic-trap') {
      hardNegatives++
      if (decision.outcome !== 'MATCH') hardNegativeRejected++
      if (decision.applicable === 'CONFLICT') { conflicts++; if (decision.outcome === 'DENY') conflictDenied++ }
      if (decision.outcome === 'MATCH') for (const reason of [...decision.positive_reasons, ...decision.unknown_reasons]) falsePositiveReasons.set(reason, (falsePositiveReasons.get(reason) ?? 0) + 1)
    }
    if (scenario.expectation === 'DENY') assert.equal(decision.outcome, 'DENY', `${spec.id}/${scenario.id} must deny`)
    if (scenario.expectation === 'ABSTAIN') assert.equal(decision.outcome, 'ABSTAIN', `${spec.id}/${scenario.id} must abstain`)
    if (scenario.expectation === 'NOT_MATCH') assert.notEqual(decision.outcome, 'MATCH', `${spec.id}/${scenario.id} must not match`)
  }
  const positiveIds = new Set(rows.filter(({ scenario }) => scenario.expectation === 'MATCH').map(({ opp }) => opp.id))
  const visible = result.rankedV2.map(({ opp }) => opp.id)
  for (const id of visible.slice(0, 5)) { top5Shown++; if (positiveIds.has(id)) top5Relevant++ }
  for (const id of visible.slice(0, 10)) { top10Shown++; if (positiveIds.has(id)) top10Relevant++ }
  rankingMisses += rows.filter(({ scenario, opp }) => scenario.expectation === 'MATCH' && !visible.includes(opp.id)).length
}

assert.equal(hardNegativeRejected, hardNegatives, 'all hard negatives and semantic traps must be rejected or abstained')
assert.equal(conflictDenied, conflicts, 'every detected professional conflict must deny before scoring')
assert.equal(retrievalMisses, 0, 'all fixture positives enter the retrieval pool; this verifier isolates ranking from retrieval')
assert.equal(falsePositiveReasons.size, 0, 'no hard negative is visible as a match')

const percent = (value: number, denominator: number) => denominator ? Math.round(value / denominator * 100) : 0
console.log(JSON.stringify({
  profiles: profiles.length, opportunities: total, outcomes: { MATCH: matched, ABSTAIN: abstained, DENY: denied },
  seniority_distribution: Object.fromEntries(seniorities.map((level) => [level, profiles.filter((_, index) => seniorities[index % seniorities.length] === level).length])),
  precision_at_5: percent(top5Relevant, top5Shown), precision_at_10: percent(top10Relevant, top10Shown),
  useful_coverage: percent(positiveMatched, positives), hard_negative_rejection: percent(hardNegativeRejected, hardNegatives),
  professional_conflict_recall: percent(conflictDenied, conflicts), false_positive_rate: percent(matched - positiveMatched, total - positives),
  abstention_rate: percent(abstained, total), unknown_profession_rate: percent(unknownProfession, total), unknown_eligibility_rate: percent(unknownEligibility, total),
  retrieval_misses: retrievalMisses, ranking_misses: rankingMisses,
  false_positive_reasons: Object.fromEntries(falsePositiveReasons), false_negative_reasons: Object.fromEntries(falseNegativeReasons),
  false_negative_samples: falseNegativeSamples,
}, null, 2))
console.log('verify_matching_v21_adversarial: PASS')
