import { assessMatchReadiness } from '../supabase/functions/_shared/match-readiness.ts'
function ok(value: unknown, message: string): asserts value { if (!value) throw new Error(message) }
const base = { match_eligible: true, title: 'Cloud Engineer', organization: 'WWF', description: 'A'.repeat(120), application_url: 'https://example.test/apply', country_code: 'PY', remote_scope: null, eligible_countries: [] }
ok(assessMatchReadiness(base, { identity_status: 'IDENTITY_CONFIRMED', http_status: 200 }).readiness === 'STRONG', 'strong evidence should be STRONG')
ok(assessMatchReadiness({ ...base, country_code: null, description: '' }).readiness === 'AMBIGUOUS', 'unknown data is ambiguous, not ineligible')
ok(assessMatchReadiness(base, { identity_status: 'REMOVED', http_status: 410 }).readiness === 'BLOCKED', 'hard dead must be blocked')
console.log('verify_match_readiness: PASS')
