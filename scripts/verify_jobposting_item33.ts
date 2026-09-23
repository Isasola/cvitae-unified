import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
  aggregatedJobPosting,
  factualJobPosting,
} from '../src/lib/factual-job-posting.ts'

const base:any = {
  slug:'role',
  title:'Programme Officer',
  description:'Programme delivery, monitoring, stakeholder coordination, reporting, planning and implementation responsibilities for this role. '.repeat(2),
  organization:'Acme',
  opportunity_type:'job',
  published_at:'2026-09-01T00:00:00Z',
  city:'Asunción',
  country_code:'PY',
  type:'full time',
  is_active:true,
  verification_status:'verified',
}

const factual = factualJobPosting(base, 'https://cvitae.lat/empleos/role')

assert.equal(factual.state, 'READY')
assert.equal(factual.structuredData?.['@type'], 'JobPosting')
assert.equal(factual.structuredData?.datePosted, base.published_at)
assert.equal(factual.structuredData?.employmentType, 'FULL_TIME')

assert.equal(
  factualJobPosting({ ...base, country_code:null }, 'x').state,
  'NOT_READY',
)

assert.equal(
  factualJobPosting({ ...base, country_code:'ZZZ' }, 'x').state,
  'NOT_READY',
)

assert.equal(
  factualJobPosting({ ...base, published_at:'09/01/2026' }, 'x').state,
  'NOT_READY',
)

assert.equal(
  factualJobPosting({
    ...base,
    published_at:undefined,
    created_at:'2026-09-01',
    updated_at:'2026-09-02',
  }, 'x').state,
  'NOT_READY',
)

assert.equal(
  factualJobPosting({ ...base, deadline:'bad' }, 'x').state,
  'NOT_READY',
)

const open = factualJobPosting({
  ...base,
  deadline:'2099-01-01',
}, 'x')

assert.equal(open.structuredData?.validThrough, '2099-01-01')

const missingDeadline = factualJobPosting(base, 'x')

assert.ok(
  !('validThrough' in (missingDeadline.structuredData || {}))
)

assert.equal(
  factualJobPosting({ ...base, type:'remoto' }, 'x')
    .structuredData?.employmentType,
  undefined,
)

assert.equal(
  factualJobPosting({
    ...base,
    opportunity_type:'internship',
    type:null,
  }, 'x').structuredData?.employmentType,
  'INTERN',
)

// Facts and policy are separate.
assert.equal(
  factualJobPosting(base, 'x').state,
  'READY',
)

const bothAllowed = aggregatedJobPosting({
  ...base,
  distribution:{
    jobPosting:{ allowed:true },
    googleJobs:{ allowed:true },
  },
}, 'x')

assert.equal(bothAllowed.state, 'READY')

for (const distribution of [
  {
    jobPosting:{ allowed:true },
    googleJobs:{ allowed:false },
  },
  {
    jobPosting:{ allowed:false },
    googleJobs:{ allowed:true },
  },
  {
    jobPosting:{ allowed:true },
  },
  {
    googleJobs:{ allowed:true },
  },
  undefined,
]) {
  assert.equal(
    aggregatedJobPosting({
      ...base,
      distribution,
    }, 'x').state,
    'NOT_READY',
  )
}

const prerender = fs.readFileSync('scripts/prerender.mjs', 'utf8')

assert.match(
  prerender,
  /aggregatedJobPosting\(job,\s*canonical\)/,
)

assert.match(
  prerender,
  /factualJobPosting\([\s\S]*?vacancy/,
)

assert.ok(
  !prerender.includes('EMPLOYMENT_TYPE_MAPPING'),
  'prerender must not duplicate employment type mapping',
)

assert.ok(
  !prerender.includes('GOOGLE_ET_VALID'),
  'prerender must not duplicate Google employment type set',
)

assert.ok(
  !prerender.includes(
    '...(canEmitJobPosting && canEmitGoogleJobs ? {} : {})'
  ),
  'no no-op permission spread may remain',
)

assert.ok(
  !prerender.includes("addressCountry: 'PY'"),
  'no PY fallback in prerender JobPosting',
)

assert.ok(
  !prerender.includes('datePosted: job.created_at'),
  'ingestion created_at must not become datePosted',
)

console.log(
  'verify_jobposting_item33: PASS factual_and_policy_separated shared_prerender=true published_at=true google_fail_closed=true'
)