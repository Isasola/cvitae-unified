import assert from 'node:assert/strict'
import fs from 'node:fs'
import { publicDistributionProjection, type SourcePolicyRow } from '../src/lib/effective-source-policy.ts'

const row = { source:'remotive', slug:'role', title:'Programme Officer', organization:'Acme', description:'Programme delivery, monitoring and reporting responsibilities for candidates. '.repeat(2), opportunity_type:'job', is_active:true, verification_status:'verified' }
const policy: SourcePolicyRow = { source:'remotive', is_enabled:true, source_attribution_required:false }
assert.equal(publicDistributionProjection(row, [policy]).sourceAttributionRequired, true)
const unknownAttribution = publicDistributionProjection({ ...row, source:'computrabajo' }, [{ ...policy, source:'computrabajo', source_attribution_required:true }])
assert.equal(unknownAttribution.sourceAttributionRequired, false)
assert.equal(unknownAttribution.sourceAttributionState, 'UNKNOWN', 'legacy boolean must not convert UNKNOWN into an attribution decision')
const page = fs.readFileSync('src/pages/JobDetail.tsx', 'utf8')
assert.match(page, /sourceAttributionRequired:job\.distribution\?\.sourceAttributionRequired/)
assert.match(page, /safeExternalUrl\(job\.application_url\)/)
assert.match(page, /source_url:job\.source_url/)
assert.ok(!page.includes('sourceRegistry'))
console.log('verify_source_attribution_item28: PASS projection_required_source_url_linked')
