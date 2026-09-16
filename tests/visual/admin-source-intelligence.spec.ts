import { expect, test, type Page } from '@playwright/test'

const pilots = ['unjobs', 'himalayas', 'talentcom', 'weworkremotely']
const gates = Array.from({ length: 8 }, (_, index) => ({
  status: index === 6 ? 'NOT_APPLICABLE' : 'PASS',
  reason_code: index === 6 ? 'AUTO_DISABLED_BY_POLICY' : 'PASS',
  metrics: index === 0 ? { found: 2 } : index === 1 ? { parsed: 2, fields: {} } : {},
}))

function snapshot() {
  return {
    sources: pilots.map((canonical_source) => ({
      canonical_source,
      display_name: canonical_source === 'unjobs' ? 'UNJobs' : canonical_source,
      source_family: 'fixture', certified: canonical_source === 'unjobs', auto_enabled: canonical_source === 'unjobs',
      execution: { last_run: '2026-09-15T12:00:00.000Z' }, history: [], recent_rows: [],
      quality: { thin_description: 0, missing_country: 0 }, eight_gates: { gates },
    })),
  }
}

async function mockAdmin(page: Page) {
  await page.route('**/.netlify/functions/admin-auth', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ authenticated: true }) }))
  await page.route('**/.netlify/functions/admin-data', async route => {
    const request = route.request()
    const body = request.postDataJSON?.() || {}
    const action = body.action
    const payload = action === 'source_intelligence_snapshot' ? snapshot()
      : action === 'list_control_center' ? { controls: [], sources: [], sourceStats: {} }
      : action === 'trigger_source_scan' ? { status: 'QUEUED', request_id: 'fixture-scan' }
      : action === 'source_scan_status' ? { status: 'COMPLETED', run: { run_id: 'fixture-run', extraction_metrics: { scan_lineage: { items: [], issue_groups: {} } } } }
      : action === 'metrics' ? { growth: [] }
      : action === 'opportunity_review_summary' ? { summary: {}, inventory: { total: 0, published: 0, archived: 0, deleted: 0, deletion_pending: 0, by_type: {} } }
      : ['list_content', 'list_users', 'list_skills', 'list_b2b_prospects', 'list_product_feedback'].includes(action) ? { data: [] }
      : null
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) })
  })
}

test('Fuentes y reglas mounts operational Source Intelligence without React globals', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', error => pageErrors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') pageErrors.push(message.text()) })
  await mockAdmin(page)
  await page.goto('/admin', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(250)
  expect(pageErrors, pageErrors.join(' | ')).toHaveLength(0)
  await page.getByLabel('Contraseña de administración').fill('fixture-password')
  await page.getByRole('button', { name: /acceder/i }).click()
  await page.waitForTimeout(250)
  expect(pageErrors, pageErrors.join(' | ')).toHaveLength(0)
  // Let independent authenticated dashboard reads settle before interacting
  // with the stable sidebar node.
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: 'Fuentes y reglas' }).click()
  await expect(page.getByText('SOURCE INTELLIGENCE OPERATIVO')).toBeVisible()
  await expect(page.getByRole('button', { name: 'EJECUTAR ESCANEO AHORA' })).toBeVisible()
  await page.getByRole('button', { name: 'UNJobs', exact: true }).click()
  await page.getByText('Configuración avanzada', { exact: false }).click()
  for (const tab of ['RESULTADOS', 'PROBLEMAS', 'RECOMENDACIONES', 'HISTORIAL', 'LOGS']) {
    await page.getByRole('button', { name: tab, exact: true }).click()
  }
  await page.getByText('Configuración avanzada', { exact: false }).click()
  await page.screenshot({ path: 'artifacts/visual/admin-source-intelligence-runtime.png', fullPage: true })
  expect(pageErrors, pageErrors.join(' | ')).toHaveLength(0)
  expect(await page.locator('body').innerText()).not.toContain('React is not defined')
})
