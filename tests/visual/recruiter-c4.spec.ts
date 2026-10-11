import { expect, test, type Page } from '@playwright/test'
import { BASE_URL } from '../../playwright.config'

const TOKEN = 'REC-C4-FIXTURE'
const COMPANY = 'Empresa C4 S.A.'

async function injectRecruiterSession(page: Page) {
  await page.addInitScript(({ token, company }) => {
    sessionStorage.setItem('cvitae_recruiter_session', JSON.stringify({
      valid: true, balance: 10, company_name: company, token_id: 'token-c4', token,
    }))
    localStorage.setItem('cvitae_consent_v1', JSON.stringify({
      version: 1, analytics: false, advertising: false, decidedAt: '2026-10-11T00:00:00.000Z',
    }))
    localStorage.setItem('cvitae_guide_b2b_panel_v1_completed', 'true')
  }, { token: TOKEN, company: COMPANY })
}

test('C4 recruiter create, update, SEO Plus consent, reload, withdraw and close', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', error => pageErrors.push(error.message))
  await injectRecruiterSession(page)
  let vacancy: any = null
  let firstUpdateFails = true
  const updateOperationIds: string[] = []
  const seoRequests: any[] = []

  await page.route('/.netlify/functions/create-vacancy', async route => {
    const body = await route.request().postDataJSON()
    expect(body.token).toBe(TOKEN)
    expect(body.operation_id).toMatch(/^[A-Za-z0-9._:-]{8,128}$/)
    vacancy = {
      id: '11111111-1111-4111-8111-111111111111', slug: 'backend-c4-fixture', title: body.title,
      description: body.description, requirements: body.requirements, location: body.location,
      modality: body.modality, salary_range: body.salary_range || null, is_active: true,
      created_at: '2026-10-11T12:00:00.000Z', vacancy_applications: [{ count: 0 }], seo_plus: null,
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      success: true, id: vacancy.id, opportunity_id: 'mirror-c4', slug: vacancy.slug,
      url: `https://cvitae.lat/vacante/${vacancy.slug}`, idempotent: false,
    }) })
  })

  await page.route('/.netlify/functions/validate-recruiter-token', async route => {
    const body = await route.request().postDataJSON()
    const json = (status: number, payload: unknown) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(payload) })
    if (body.action === 'get_vacancies') return json(200, {
      vacancies: vacancy ? [{ ...vacancy }] : [], pagination: { page: body.page || 0, total: vacancy ? 1 : 0, has_more: false },
    })
    if (body.action === 'get_dashboard_stats') return json(200, { stats: { vacantesActivas: vacancy?.is_active ? 1 : 0, totalPostulantes: 0, cvsAnalizados: 0, paraLlamar: 0 } })
    if (body.action === 'update_vacancy') {
      updateOperationIds.push(body.operation_id)
      if (firstUpdateFails) { firstUpdateFails = false; return json(503, { error: 'Falla transitoria simulada', reason: 'VACANCY_UPDATE_UNCONFIRMED' }) }
      expect(body.vacancy_id).toBe(vacancy.id)
      vacancy = { ...vacancy, title: body.title, description: body.description, requirements: body.requirements,
        location: body.location, modality: body.modality, salary_range: body.salary_range }
      return json(200, { ok: true, id: vacancy.id, opportunity_id: 'mirror-c4', slug: vacancy.slug, is_active: true, idempotent: true })
    }
    if (body.action === 'request_seo_plus') {
      seoRequests.push(body)
      expect(body.public_indexing_consent).toBe(true)
      expect(body.contract_version).toBe('seo-plus-publication-v1-2026-10-11')
      vacancy.seo_plus = { request_status: 'REQUESTED', entitlement_status: 'NOT_CONTRACTED',
        authorization_status: 'CONSENT_RECORDED', delivery_status: 'NOT_EVALUATED',
        contract_version: body.contract_version, consented_at: '2026-10-11T12:05:00.000Z', withdrawn_at: null }
      return json(200, { ok: true, idempotent: false, charged: false, distribution_changed: false, request: vacancy.seo_plus })
    }
    if (body.action === 'withdraw_seo_plus') {
      seoRequests.push(body)
      vacancy.seo_plus = { ...vacancy.seo_plus, request_status: 'WITHDRAWN', authorization_status: 'WITHDRAWN',
        delivery_status: 'WITHDRAWN', withdrawn_at: '2026-10-11T12:10:00.000Z' }
      return json(200, { ok: true, idempotent: false, distribution_changed: false, request: vacancy.seo_plus })
    }
    if (body.action === 'close_vacancy') {
      vacancy = { ...vacancy, is_active: false }
      return json(200, { ok: true, id: vacancy.id, opportunity_id: 'mirror-c4', is_active: false, idempotent: false })
    }
    if (body.action === 'get_history') return json(200, { history: [] })
    return json(200, {})
  })

  await page.goto(`${BASE_URL}/empresas`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(500)
  expect(pageErrors, 'browser runtime errors').toEqual([])
  await page.getByRole('button', { name: 'Mis Vacantes' }).click()

  const createForm = page.locator('form').filter({ hasText: 'Nueva vacante' })
  await createForm.getByPlaceholder('Ej: Desarrollador Frontend React').fill('Backend C4')
  await createForm.getByPlaceholder(/Asunción/).fill('Asunción')
  await createForm.locator('select').nth(1).selectOption({ index: 1 })
  await createForm.getByPlaceholder(/Describí el rol/).fill('Rol de ingeniería backend con APIs, TypeScript, SQL y responsabilidades de producción.')
  await createForm.getByPlaceholder(/Experiencia requerida/).fill('Experiencia demostrable con TypeScript, SQL, APIs y operación de servicios.')
  await createForm.getByRole('button', { name: 'Crear vacante' }).click()
  await expect(page.getByText('Backend C4', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Editar' }).click()
  const editForm = page.locator('form').filter({ hasText: 'Editar vacante' })
  await editForm.locator('input').first().fill('Backend C4 actualizado')
  await page.getByRole('button', { name: 'Guardar cambios' }).click()
  await expect(page.getByRole('alert')).toContainText('Falla transitoria simulada')
  await page.getByRole('button', { name: 'Guardar cambios' }).click()
  await expect(page.getByText('Backend C4 actualizado', { exact: true })).toBeVisible()
  expect(updateOperationIds).toHaveLength(2)
  expect(updateOperationIds[1]).toBe(updateOperationIds[0])

  await page.getByRole('button', { name: /SEO Plus/ }).click()
  const seoPanel = page.getByRole('region', { name: 'SEO Plus' })
  await expect(seoPanel.getByRole('button', { name: 'Solicitar SEO Plus' })).toBeDisabled()
  await seoPanel.getByRole('checkbox').check()
  await seoPanel.getByRole('button', { name: 'Solicitar SEO Plus' }).click()
  await expect(seoPanel).toContainText('REQUESTED')
  await expect(seoPanel).toContainText('NOT_CONTRACTED')

  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'Mis Vacantes' }).click()
  await page.getByRole('button', { name: /SEO Plus/ }).click()
  await expect(page.getByRole('region', { name: 'SEO Plus' })).toContainText('CONSENT_RECORDED')
  await page.getByRole('button', { name: /Retirar autorización/ }).click()
  expect(seoRequests.map(item => item.action)).toEqual(['request_seo_plus', 'withdraw_seo_plus'])
  expect(seoRequests.every(item => !('price' in item) && !('payment' in item))).toBe(true)

  await page.getByTitle('Cerrar vacante').click()
  await page.getByRole('button', { name: 'Sí' }).click()
  await expect(page.getByRole('table').getByText('Backend C4 actualizado', { exact: true })).toHaveClass(/line-through/)
})
