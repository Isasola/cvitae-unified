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

test('User intelligence separates stale history from current results on mobile-safe drawer', async ({ page }) => {
  const syntheticUser = { id: 'profile-fixture', user_id: 'user-fixture', full_name: 'Candidata SintÃ©tica', email: 'fixture@example.invalid', is_test: true, is_subscribed: false, created_at: '2026-09-30T12:00:00Z' }
  await page.route('**/.netlify/functions/admin-auth', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ authenticated: true }) }))
  await page.route('**/.netlify/functions/admin-data', async route => {
    const action = route.request().postDataJSON?.()?.action
    const payload = action === 'list_users' ? { data: [syntheticUser] }
      : action === 'user_detail' ? {
        profile: { ...syntheticUser, professional_title: 'Coordinadora de proyectos', lifecycle_state: 'engaged', founding_offer_enabled: true, profile_data: { habilidades: ['CoordinaciÃ³n', 'Monitoreo'] } },
        auth_email: syntheticUser.email, founding_beta: { status: 'offered' }, events: [], emails_sent: [], acquisition: null,
        profile_health: { skills_count: 2, has_location: true, has_cv: true, cv_uploaded_at: '2026-09-30T12:00:00Z', has_cv_text: true, has_embedding: true, completeness_score: 6, completeness_max: 6 },
        b2c_intelligence: { professional_area: 'GestiÃ³n de proyectos', professional_title: 'Coordinadora de proyectos', seniority: 'mid', experience: [], top_skills: ['CoordinaciÃ³n', 'Monitoreo'], desired_role_1y: 'Liderar programas regionales', career_interests: ['CooperaciÃ³n internacional'], residence_country: 'PY', last_activity_at: '2026-10-11T12:00:00Z', communication_eligible: false, communication_blockers: ['MATCHING_NOT_CURRENT'], recommendations: [{ code: 'UPDATE_MATCHING', label: 'Actualizar matching', owner: 'Matching', evidence: 'AGE_EXPIRED', state: 'ACTION_AVAILABLE', measurable_result: 'Nueva ejecuciÃ³n vigente' }] },
        matching: { match_count: null, top_score: null, last_match_at: '2026-09-30T12:00:00Z', status: 'STALE', freshness_reason: 'AGE_EXPIRED', is_current: false, snapshot_profile_updated_at: '2026-09-30T11:00:00Z', historical_result: { run_status: 'SUCCESS', run_at: '2026-09-30T12:00:00Z', match_count: 0, visible_potential_count: 4, potential_scoreable_count: 12, coverage_state: 'ELIGIBILITY_UNKNOWN', abstain_count: 401, deny_count: 0 }, diagnostics: { coverage_state: 'ELIGIBILITY_UNKNOWN', eligibility_unknown: 401, professional_fit_known: 70, primary_retrieval: 300, semantic_retrieval: 120 } },
        warnings: ['El diagnÃ³stico de matching estÃ¡ desactualizado'],
      }
      : action === 'source_intelligence_snapshot' ? snapshot()
      : action === 'list_control_center' ? { controls: [], sources: [], sourceStats: {} }
      : action === 'metrics' ? { growth: [] }
      : action === 'opportunity_review_summary' ? { summary: {}, inventory: { total: 0, published: 0, archived: 0, deleted: 0, deletion_pending: 0, by_type: {} } }
      : ['list_content', 'list_skills', 'list_b2b_prospects', 'list_product_feedback'].includes(action) ? { data: [] }
      : null
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) })
  })
  await page.goto('/admin', { waitUntil: 'domcontentloaded' })
  const necessaryCookies = page.getByRole('button', { name: /solo necesarias/i })
  if (await necessaryCookies.isVisible()) await necessaryCookies.click()
  await page.locator('input[type="password"]').fill('fixture-password')
  await page.getByRole('button', { name: /acceder/i }).click()
  await page.waitForTimeout(750)
  await page.evaluate(() => Array.from(document.querySelectorAll('button')).find(button => button.textContent?.trim().startsWith('Usuarios'))?.click())
  await page.getByRole('button', { name: 'ver', exact: true }).click()
  await expect(page.getByText(/Diagn.stico desactualizado/).last()).toBeVisible()
  await expect(page.getByText(/24 horas/)).toBeVisible()
  await expect(page.getByText(/resultado.*no es estado actual/i)).toBeVisible()
  await expect(page.getByText('Actualizar matching', { exact: true })).toBeVisible()
  await page.screenshot({ path: 'artifacts/visual/admin-user-intelligence-r3.png', fullPage: true })
})
