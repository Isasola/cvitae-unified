import assert from 'node:assert/strict'
import fs from 'node:fs'
import { canonicalCandidateProfile } from '../shared/candidate-profile.ts'

const read = (path: string) => fs.readFileSync(path, 'utf8')
const matchBatch = read('supabase/functions/match-batch/index.ts')
const profile = read('netlify/functions/b2c-profile.ts')
const builder = read('src/hub/ProfileBuilder.tsx')
const embedding = read('supabase/functions/_shared/embedding.ts')
const alerts = read('netlify/functions/send-high-match-alerts.ts')
const signature = read('shared/matching-profile-signature.ts')
const canonical = read('shared/candidate-profile.ts')

assert.match(matchBatch, /canonicalCandidateProfile\(profile\)/)
assert.match(embedding, /canonicalCandidateProfile\(profile\)/)
assert.match(alerts, /rankOpportunitiesV2\(canonicalCandidateProfile\(profile\)/)
assert.match(signature, /canonicalCandidateProfile\(profile\)/)
assert.match(canonical, /seniority: cleanCandidateText\(data\.seniority\)/)
assert.doesNotMatch(matchBatch, /profile_data\?\.seniority\s*\?\?\s*['"]semi-senior/)
assert.doesNotMatch(profile, /seniority: cleanText\([^\n]+\)\s*\|\|\s*['"]Junior/)
assert.doesNotMatch(builder, /seniority:\s*['"]Junior['"]/) 
assert.match(canonical, /career_route/)
assert.match(canonical, /desired_role_1y/)
assert.match(canonical, /candidate_truth/)

const unknown = canonicalCandidateProfile({ professional_title: 'Analista', profile_data: { location: 'Paraguay', modality: 'remote', career_interests: ['datos'] } })
assert.equal(unknown.profile_data.seniority, '')
assert.equal(unknown.profile_data.provenance.seniority, undefined)
assert.equal(unknown.profile_data.location, 'Paraguay')
assert.equal(unknown.profile_data.modality, 'remote')
assert.equal((unknown.profile_data as any).candidate_eligibility, undefined)

const extracted = canonicalCandidateProfile({ profile_data: { candidate_truth: { evidence: { skills: 'EXTRACTED' } }, habilidades: ['SQL'] } })
assert.equal(extracted.profile_data.provenance.skills, 'EXTRACTED')

console.log('verify_candidate_truth_backbone_item57: PASS')
