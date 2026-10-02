import assert from 'node:assert/strict'
import { hasProfessionalEvidence } from '../supabase/functions/_shared/match-readiness.ts'

const thin = { title: 'Global Fellowship', description: 'Global Fellowship', tags: ['OpportunityDesk', 'beca', 'internacional'] }
assert.equal(hasProfessionalEvidence(thin), false, 'source/type/geography tags are not professional evidence')
assert.equal(hasProfessionalEvidence({ ...thin, description: 'Professional programme delivery, stakeholder management and policy analysis. '.repeat(2) }), true)
assert.equal(hasProfessionalEvidence({ ...thin, professional_family: 'engineering' }), true)
console.log('verify_semantic_truth_item57: PASS metadata tags do not become professional evidence')
