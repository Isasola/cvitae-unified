/** Release entry points only. Offline: no database, email, GitHub or Netlify. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const previousGate = process.env.CVITAE_PROD_RELEASE_VALIDATED
const previousKey = process.env.RESEND_API_KEY
delete process.env.RESEND_API_KEY
let networkCalls = 0
const previousFetch = globalThis.fetch
globalThis.fetch = (async () => { networkCalls++; throw new Error('NETWORK_FORBIDDEN') }) as typeof fetch
try {
  const { handler, config } = await import('../netlify/functions/send-high-match-alerts.ts')
  assert.equal(config.schedule, '0 */2 * * *')
  for (const gate of [undefined, '', 'false', 'TRUE']) {
    if (gate === undefined) delete process.env.CVITAE_PROD_RELEASE_VALIDATED
    else process.env.CVITAE_PROD_RELEASE_VALIDATED = gate
    const result = await handler({} as any, {} as any, () => {}) as any
    assert.equal(result.statusCode, 200)
    assert.deepEqual(JSON.parse(result.body), { skipped: true, reason: 'PROD_RELEASE_NOT_VALIDATED' })
  }
  process.env.CVITAE_PROD_RELEASE_VALIDATED = 'true'
  const open = await handler({} as any, {} as any, () => {}) as any
  assert.equal(open.statusCode, 503, 'validated gate reaches existing missing-provider-key check')
  assert.equal(networkCalls, 0)

  const names = ['matching-retrieval', 'source-maintenance', 'scrapers', 'blog_generator',
    'linkedin_poster', 'notify_signups', 'refresh_embeddings']
  for (const name of names) {
    const yaml = readFileSync(`.github/workflows/${name}.yml`, 'utf8')
    assert.match(yaml, /\bschedule:/)
    const expressions = [...yaml.matchAll(/^    if: (.*)$/gm)].map(m => m[1])
    assert.equal(expressions.length, 1, `${name}: one guarded job`)
    const expression = expressions[0]
    assert.match(expression, /vars\.CVITAE_PROD_RELEASE_VALIDATED == 'true'/)
    const evaluate = (event: string, flag: string | undefined, conclusion = 'success') => {
      const js = expression.replaceAll('github.event_name', JSON.stringify(event))
        .replaceAll('vars.CVITAE_PROD_RELEASE_VALIDATED', JSON.stringify(flag ?? ''))
        .replaceAll('github.event.workflow_run.conclusion', JSON.stringify(conclusion))
      return Function(`"use strict"; return (${js})`)() as boolean
    }
    for (const flag of [undefined, '', 'false', 'TRUE']) {
      assert.equal(evaluate('schedule', flag), false, `${name}: cron fail closed`)
      if (name === 'refresh_embeddings') assert.equal(evaluate('workflow_run', flag), false)
    }
    assert.equal(evaluate('schedule', 'true'), true)
    assert.equal(evaluate('workflow_dispatch', undefined), true, 'explicit manual canary remains available')
    if (name === 'refresh_embeddings') {
      assert.equal(evaluate('workflow_run', 'true'), true)
      assert.equal(evaluate('workflow_run', 'true', 'failure'), false)
    }
  }
  for (const name of ['opportunity-universe-maintenance', 'scheduled-source-automation']) {
    const yaml = readFileSync(`.github/workflows/${name}.yml`, 'utf8')
    assert.doesNotMatch(yaml, /\bschedule:/)
    assert.match(yaml, /confirm_prod_release_validated == 'YES' && vars\.CVITAE_PROD_RELEASE_VALIDATED == 'true'/)
  }
  console.log('PASS release gates: 7 cron jobs, embeddings completion trigger, scheduled Alert sender, 2 manual workers; absent/false gates cause zero network effects')
} finally {
  globalThis.fetch = previousFetch
  if (previousGate === undefined) delete process.env.CVITAE_PROD_RELEASE_VALIDATED
  else process.env.CVITAE_PROD_RELEASE_VALIDATED = previousGate
  if (previousKey === undefined) delete process.env.RESEND_API_KEY
  else process.env.RESEND_API_KEY = previousKey
}
