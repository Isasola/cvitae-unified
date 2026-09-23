import assert from 'node:assert/strict'
import fs from 'node:fs'
import { publicDistributionProjection, type SourcePolicyRow } from '../src/lib/effective-source-policy.ts'

const row = { source:'computrabajo', slug:'role', title:'Programme Officer', organization:'Acme', description:'Programme delivery, monitoring and reporting responsibilities for candidates. '.repeat(2), opportunity_type:'job', is_active:true, verification_status:'verified' }
const policy: SourcePolicyRow = { source:'computrabajo', is_enabled:true, source_attribution_required:true }
assert.equal(publicDistributionProjection(row, [policy]).sourceAttributionRequired, true)
assert.equal(publicDistributionProjection(row, [{ ...policy, source_attribution_required:false }]).sourceAttributionRequired, false)
const page = fs.readFileSync('src/pages/JobDetail.tsx', 'utf8')
assert.match(page, /distribution\?\.sourceAttributionRequired && job\.source_url/)
assert.match(page, /safeExternalUrl\(job\.source_url\)/)
assert.ok(!page.includes('sourceRegistry'))
console.log('verify_source_attribution_item28: PASS projection_required_source_url_linked')
