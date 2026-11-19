/**
 * Punto 15 — Estados UI de onboarding, guías y feedback en B2C y B2B.
 *
 * Todos los casos se reproducen localmente con mocks/interceptación de red.
 * No requieren Edge Functions desplegadas ni credenciales reales.
 *
 * Casos cubiertos:
 *   P15-R1  /empresas  — estado loading en carga de vacantes
 *   P15-R2  /empresas  — estado vacío (sin vacantes)
 *   P15-R3  /empresas  — estado error en creación de vacante
 *   P15-R4  /empresas  — estado éxito al crear vacante (URL generada)
 *   P15-R5  /empresas  — estado sin candidatos para una vacante
 *   P15-R6  /empresas  — balance = 0 deshabilita Analizar CV
 *   P15-R7  /empresas  — ProductGuide visible al entrar por primera vez
 *   P15-R8  /empresas  — error de comparación de candidatos muestra banner (no alert)
 *   P15-C1  /mi-carrera/cv  — ProductGuide visible al entrar por primera vez
 *   P15-C2  /mi-carrera/cv  — estado loading con GrowthLine
 *   P15-C3  /mi-carrera/cv  — estado error de carga del workspace
 *   P15-C4  /mi-carrera/cv  — límite diario alcanzado deshabilita Generar
 *
 * Cola manual final (requieren entorno real):
 *   - Interacción con analyze-cv-candidate (Edge Function + Bedrock)
 *   - CORS real del browser en staging
 *   - Comparación real de candidatos (Netlify Function + credenciales)
 */

import { test, expect, type Page, type APIRequestContext } from '@playwright/test'
import { BASE_URL, SUPABASE_URL, ANON_KEY } from '../../playwright.config'

// ─── Helpers de auth ──────────────────────────────────────────────────────────

const QA_EMAIL    = 'visual-qa-p13@test.invalid'
const QA_PASSWORD = 'local-test-only-2026'

async function getQaToken(request: APIRequestContext): Promise<string | null> {
  const signinRes = await request.post(
    `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
    {
      data: { email: QA_EMAIL, password: QA_PASSWORD },
      headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    },
  )
  if (signinRes.ok()) return (await signinRes.json())?.access_token || null
  const signupRes = await request.post(`${SUPABASE_URL}/auth/v1/signup`, {
    data: { email: QA_EMAIL, password: QA_PASSWORD },
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
  })
  if (signupRes.ok()) {
    const body = await signupRes.json()
    if (body?.session?.access_token) return body.session.access_token
    const retryRes = await request.post(
      `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
      {
        data: { email: QA_EMAIL, password: QA_PASSWORD },
        headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
      },
    )
    if (retryRes.ok()) return (await retryRes.json())?.access_token || null
  }
  return null
}

function injectSession(page: Page, token: string) {
  return page.addInitScript((t) => {
    const session = {
      access_token: t, refresh_token: 'mock-refresh', expires_at: Date.now() / 1000 + 3600,
      token_type: 'bearer',
      user: { id: 'qa-user-local', email: 'visual-qa-p13@test.invalid', role: 'authenticated', aud: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() },
    }
    localStorage.setItem('sb-127-auth-token', JSON.stringify(session))
  }, token)
}

function mockSupabaseAuth(page: Page) {
  page.route(`${SUPABASE_URL}/auth/v1/user`, async (route) => {
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        id: 'qa-user-local', email: QA_EMAIL, role: 'authenticated',
        app_metadata: {}, user_metadata: {}, aud: 'authenticated',
        created_at: new Date().toISOString(),
      }),
    })
  })
  page.route(`${SUPABASE_URL}/auth/v1/token*`, async (route) => {
    const req = route.request()
    if (req.url().includes('grant_type=refresh_token')) {
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({
          access_token: 'mock-refreshed-token', refresh_token: 'mock-refresh',
          token_type: 'bearer', expires_in: 3600, expires_at: Date.now() / 1000 + 3600,
          user: { id: 'qa-user-local', email: QA_EMAIL, role: 'authenticated', aud: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() },
        }),
      })
      return
    }
    await route.fallback()
  })
  page.route(`${SUPABASE_URL}/rest/v1/user_master_profiles**`, async (route) => {
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify([{
        id: 'qa-profile-local', user_id: 'qa-user-local',
        professional_title: 'QA Tester',
        profile_data: { habilidades: ['Node.js'], seniority: 'senior', daily_usage: { date: '2020-01-01', cv_vivo: 0, matches_shown: 0 } },
        is_subscribed: false, match_alerts_enabled: false, updated_at: new Date().toISOString(),
      }]),
    })
  })
}

// ─── Helpers específicos de Recruiters ───────────────────────────────────────

function mockRecruiterToken(page: Page, opts: {
  balance?: number;
  vacancies?: any[];
  responseOverride?: (action: string) => any;
} = {}) {
  const balance = opts.balance ?? 5
  const vacancies = opts.vacancies ?? []

  page.route('/.netlify/functions/validate-recruiter-token', async (route) => {
    const body = await route.request().postDataJSON()
    const action = body?.action

    if (opts.responseOverride) {
      const override = opts.responseOverride(action ?? '')
      if (override !== undefined) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(override) })
        return
      }
    }

    if (!action) {
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({
          valid: true, balance, company_name: 'Empresa QA S.A.',
          token_id: 'tok-qa-001', token: body.token || 'REC-TEST-2026',
        }),
      })
      return
    }

    if (action === 'get_vacancies') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ vacancies }) })
      return
    }
    if (action === 'get_history') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ history: [] }) })
      return
    }
    if (action === 'get_dashboard_stats') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ stats: { vacantesActivas: vacancies.length, totalPostulantes: 0, cvsAnalizados: 0, paraLlamar: 0 } }) })
      return
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) })
  })
}

// Inyecta una sesión de recruiter en sessionStorage y navega directamente al panel
// Esto bypasea el TokenLogin y monta RecruiterPanel directamente.
function injectRecruiterSession(page: Page, opts: { balance?: number; company?: string } = {}) {
  const session = {
    valid: true,
    balance: opts.balance ?? 5,
    company_name: opts.company ?? 'Empresa QA S.A.',
    token_id: 'tok-qa-001',
    token: 'REC-TEST-2026',
  }
  return page.addInitScript((s) => {
    sessionStorage.setItem('cvitae_recruiter_session', JSON.stringify(s))
    localStorage.setItem('cvitae_consent_v1', JSON.stringify({
      version: 1,
      analytics: false,
      advertising: false,
      decidedAt: '2026-08-20T00:00:00.000Z',
    }))
    localStorage.setItem('cvitae_guide_b2b_panel_v1_completed', 'true')
  }, session)
}

async function openRecruiterPanel(page: Page) {
  await page.goto(`${BASE_URL}/empresas`, { waitUntil: 'domcontentloaded' })
}

// ─── Tests /empresas ──────────────────────────────────────────────────────────

test.describe('/empresas — estados de carga y vacío', () => {
  test('P15-R1 — spinner visible mientras carga vacantes', async ({ page }) => {
    await injectRecruiterSession(page)

    page.route('/.netlify/functions/validate-recruiter-token', async (route) => {
      const body = await route.request().postDataJSON()
      const action = body?.action
      if (action === 'get_vacancies') {
        await new Promise(r => setTimeout(r, 1800))
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ vacancies: [] }) })
        return
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) })
    })

    await openRecruiterPanel(page)

    // Navegar al tab Mis Vacantes para ver el spinner
    const tabVacancies = page.locator('button', { hasText: 'Mis Vacantes' })
    await expect(tabVacancies).toBeVisible({ timeout: 10_000 })
    await tabVacancies.click()

    // El spinner debe estar visible mientras la petición está pendiente
    await expect(page.locator('.animate-spin').first()).toBeVisible({ timeout: 5_000 })
  })

  test('P15-R2 — estado vacío cuando no hay vacantes', async ({ page }) => {
    await injectRecruiterSession(page)
    mockRecruiterToken(page, { vacancies: [] })
    await openRecruiterPanel(page)

    const tabVacancies = page.locator('button', { hasText: 'Mis Vacantes' })
    await expect(tabVacancies).toBeVisible({ timeout: 10_000 })
    await tabVacancies.click()

    await expect(page.getByRole('heading', { name: 'Creá tu primera vacante' })).toBeVisible({ timeout: 5_000 })
  })

  test('P15-R3 — banner de error al fallar creación de vacante', async ({ page }) => {
    await injectRecruiterSession(page)
    mockRecruiterToken(page, { vacancies: [] })
    page.route('/.netlify/functions/create-vacancy', async (route) => {
      await route.fulfill({
        status: 400, contentType: 'application/json',
        body: JSON.stringify({ error: 'El título no puede estar vacío' }),
      })
    })

    await openRecruiterPanel(page)
    const tabVacancies = page.locator('button', { hasText: 'Mis Vacantes' })
    await expect(tabVacancies).toBeVisible({ timeout: 10_000 })
    await tabVacancies.click()

    // Llenar el formulario usando placeholders exactos del código fuente
    await page.fill('input[placeholder="Ej: Desarrollador Frontend React"]', 'Dev Test')
    await page.fill('input[placeholder="Ej: Asunción, Paraguay"]', 'Asunción')
    // Modalidad y Rubro son selects — seleccionar por value
    await page.selectOption('select[value="Presencial"], select:has(option[value="Presencial"])', 'Remoto')
    await page.selectOption('select:has(option[value=""])', { index: 1 })
    await page.fill('textarea[placeholder*="Describí el rol"]', 'Descripción del puesto de prueba para el test de QA.')
    await page.fill('textarea[placeholder*="Experiencia requerida"]', 'Requisitos del puesto de prueba para el test de QA.')

    await page.click('button[type="submit"]')
    await expect(page.locator('text=El título no puede estar vacío')).toBeVisible({ timeout: 5_000 })
  })

  test('P15-R4 — banner dorado con URL al crear vacante exitosamente', async ({ page }) => {
    await injectRecruiterSession(page)
    mockRecruiterToken(page, { vacancies: [] })
    page.route('/.netlify/functions/create-vacancy', async (route) => {
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ url: 'https://cvitae.lat/vacante/dev-test-qa-2026' }),
      })
    })

    await openRecruiterPanel(page)
    const tabVacancies = page.locator('button', { hasText: 'Mis Vacantes' })
    await expect(tabVacancies).toBeVisible({ timeout: 10_000 })
    await tabVacancies.click()

    await page.fill('input[placeholder="Ej: Desarrollador Frontend React"]', 'Dev Test QA')
    await page.fill('input[placeholder="Ej: Asunción, Paraguay"]', 'Asunción')
    await page.selectOption('select:has(option[value=""])', { index: 1 })
    await page.fill('textarea[placeholder*="Describí el rol"]', 'Descripción del puesto de prueba para el test de QA completo.')
    await page.fill('textarea[placeholder*="Experiencia requerida"]', 'Requisitos del puesto de prueba para el test de QA completo.')

    await page.click('button[type="submit"]')
    await expect(page.locator('text=¡Vacante creada!')).toBeVisible({ timeout: 5_000 })
    await expect(page.locator('text=cvitae.lat/vacante/dev-test-qa-2026')).toBeVisible({ timeout: 3_000 })
  })

  test('P15-R5 — estado vacío cuando la vacante no tiene candidatos', async ({ page }) => {
    await injectRecruiterSession(page)
    const vacancy = { id: 'vac-001', title: 'Dev QA', slug: 'dev-qa', location: 'Asunción', modality: 'Remoto', created_at: new Date().toISOString(), vacancy_applications: [{ count: 0 }] }
    mockRecruiterToken(page, {
      vacancies: [vacancy],
      responseOverride: (action) => {
        if (action === 'get_applicants') return { applicants: [], review: { total: 0, analyzed: 0, pending: 0, manual_review: 0, strong: 0, shortlist: 0, batches_completed: 0 }, pagination: { has_more: false } }
        return undefined
      },
    })

    await openRecruiterPanel(page)
    const tabVacancies = page.locator('button', { hasText: 'Mis Vacantes' })
    await expect(tabVacancies).toBeVisible({ timeout: 10_000 })
    await tabVacancies.click()

    // Click en "Ver" para entrar al panel de candidatos
    await expect(page.locator('text=Dev QA')).toBeVisible({ timeout: 5_000 })
    await page.locator('button', { hasText: 'Ver' }).first().click()

    await expect(page.locator('text=Todavía no hay postulantes')).toBeVisible({ timeout: 5_000 })
    await expect(page.locator('text=Compartí el link de postulación')).toBeVisible({ timeout: 3_000 })
  })

  test('P15-R6 — balance 0 deshabilita el botón Analizar CV', async ({ page }) => {
    await injectRecruiterSession(page, { balance: 0 })
    mockRecruiterToken(page, { balance: 0 })
    await openRecruiterPanel(page)

    // El tab Analizar CV está activo por defecto
    const analyzeBtn = page.locator('button', { hasText: 'Analizar CV' }).last()
    await expect(analyzeBtn).toBeVisible({ timeout: 10_000 })
    await expect(analyzeBtn).toBeDisabled()
    await expect(page.locator('text=Sin créditos')).toBeVisible({ timeout: 3_000 })
  })

  test('P15-R7 — ProductGuide visible al entrar por primera vez', async ({ page }) => {
    // Asegurarse de que la clave no esté en localStorage
    await injectRecruiterSession(page)
    await page.addInitScript(() => {
      localStorage.removeItem('cvitae_guide_b2b_panel_v1_completed')
    })

    mockRecruiterToken(page)
    await openRecruiterPanel(page)

    // El ProductGuide debe aparecer (esperar primero que el panel cargue)
    await expect(page.locator('text=análisis de candidatos')).toBeVisible({ timeout: 10_000 })
    // El guide aparece como sección fija en bottom-right
    await expect(page.getByRole('heading', { name: 'Publicá una vacante' })).toBeVisible({ timeout: 5_000 })
  })

  test('P15-R8 — error de comparación muestra banner, no alert', async ({ page }) => {
    await injectRecruiterSession(page)
    const history = [
      { id: 'h1', candidate_name: 'Juan Pérez', file_name: 'juan.pdf', ats_score: 85, vacancy_label: 'Dev', created_at: new Date().toISOString(), is_starred: false, strengths: [], critical_improvements: [] },
      { id: 'h2', candidate_name: 'Ana López', file_name: 'ana.pdf', ats_score: 72, vacancy_label: 'Dev', created_at: new Date().toISOString(), is_starred: false, strengths: [], critical_improvements: [] },
    ]
    mockRecruiterToken(page, {
      responseOverride: (action) => {
        if (action === 'get_history') return { history }
        return undefined
      },
    })
    page.route('/.netlify/functions/compare-candidates', async (route) => {
      await route.fulfill({
        status: 500, contentType: 'application/json',
        body: JSON.stringify({ error: 'No se pudo comparar los candidatos' }),
      })
    })

    // Detectar si se llama a window.alert — debe NO llamarse
    let alertCalled = false
    page.on('dialog', (dialog) => { alertCalled = true; dialog.dismiss() })

    await openRecruiterPanel(page)
    const tabHistory = page.locator('button', { hasText: 'Historial' })
    await expect(tabHistory).toBeVisible({ timeout: 10_000 })
    await tabHistory.click()

    // Esperar a que el historial cargue
    await expect(page.locator('text=Juan Pérez')).toBeVisible({ timeout: 5_000 })

    // Seleccionar los dos candidatos
    const checkboxes = page.locator('input[type="checkbox"]')
    await checkboxes.nth(0).check()
    await checkboxes.nth(1).check()

    // Click en Comparar
    await page.locator('button', { hasText: /Comparar/ }).click()

    // El error debe aparecer como banner, no como alert nativo
    await expect(page.locator('text=No se pudo comparar los candidatos')).toBeVisible({ timeout: 5_000 })
    expect(alertCalled).toBe(false)
  })

  test('P15-R9 — error de carga de vacantes no parece un estado vacío', async ({ page }) => {
    await injectRecruiterSession(page)
    page.route('/.netlify/functions/validate-recruiter-token', async route => {
      const action = (await route.request().postDataJSON())?.action
      if (action === 'get_vacancies') {
        await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Servicio de vacantes temporalmente no disponible' }) })
        return
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) })
    })
    await openRecruiterPanel(page)
    await page.locator('button', { hasText: 'Mis Vacantes' }).click()
    await expect(page.getByRole('alert')).toContainText('Servicio de vacantes temporalmente no disponible')
    await expect(page.getByRole('button', { name: 'Reintentar' })).toBeVisible()
  })

  test('P15-R10 — error de historial ofrece reintento', async ({ page }) => {
    await injectRecruiterSession(page)
    page.route('/.netlify/functions/validate-recruiter-token', async route => {
      const action = (await route.request().postDataJSON())?.action
      if (action === 'get_history') {
        await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'No pudimos recuperar el historial' }) })
        return
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) })
    })
    await openRecruiterPanel(page)
    await page.locator('button', { hasText: 'Historial' }).click()
    await expect(page.getByRole('alert')).toContainText('No pudimos recuperar el historial')
    await expect(page.getByRole('button', { name: 'Reintentar' })).toBeVisible()
  })
})

// ─── Tests /mi-carrera/cv ─────────────────────────────────────────────────────

test.describe('/mi-carrera/cv — estados de CVVivo', () => {
  test('P15-C1 — ProductGuide visible al entrar por primera vez', async ({ page, request }) => {
    const token = await getQaToken(request)
    if (!token) { test.skip(); return }

    await page.addInitScript(() => {
      localStorage.removeItem('cvitae_guide_b2c_cv_vivo_v1_completed')
    })
    await injectSession(page, token)
    await mockSupabaseAuth(page)

    // Mock del workspace y match-batch para que la página cargue rápido
    page.route(`${SUPABASE_URL}/functions/v1/match-batch`, async (route) => {
      const response = await route.fetch()
      const body = await response.text()
      await route.fulfill({
        status: response.status(), contentType: 'application/json', body,
        headers: { 'Access-Control-Allow-Origin': 'http://localhost:3000' },
      })
    })
    page.route('/.netlify/functions/cv-workspace', async (route) => {
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ evidence: [], versions: [] }),
      })
    })

    await page.goto(`${BASE_URL}/mi-carrera/cv`, { waitUntil: 'networkidle' })

    // ProductGuide debe aparecer (el guide de CV Vivo)
    await expect(page.locator('text=CV Vivo').first()).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('text=Confirmá tus evidencias')).toBeVisible({ timeout: 5_000 })
  })

  test('P15-C2 — spinner/loading visible mientras carga el workspace', async ({ page, request }) => {
    const token = await getQaToken(request)
    if (!token) { test.skip(); return }

    await injectSession(page, token)
    await mockSupabaseAuth(page)

    // Retrasar la respuesta del workspace
    page.route(`${SUPABASE_URL}/functions/v1/match-batch`, async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ matches: [] }) })
    })
    page.route('/.netlify/functions/cv-workspace', async (route) => {
      await new Promise(r => setTimeout(r, 2000))
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ evidence: [], versions: [] }),
      })
    })

    await page.goto(`${BASE_URL}/mi-carrera/cv`)

    // El loading skeleton con el texto aparece antes de que termine la carga
    await expect(page.locator('text=Preparando tu espacio de CV')).toBeVisible({ timeout: 5_000 })
  })

  test('P15-C3 — estado error de carga del workspace muestra mensaje integrado', async ({ page, request }) => {
    const token = await getQaToken(request)
    if (!token) { test.skip(); return }

    await injectSession(page, token)
    await mockSupabaseAuth(page)

    page.route(`${SUPABASE_URL}/functions/v1/match-batch`, async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ matches: [] }) })
    })
    page.route('/.netlify/functions/cv-workspace', async (route) => {
      await route.fulfill({
        status: 500, contentType: 'application/json',
        body: JSON.stringify({ error: 'No pudimos cargar tu espacio de CV' }),
      })
    })

    await page.goto(`${BASE_URL}/mi-carrera/cv`, { waitUntil: 'networkidle' })

    // El error debe mostrarse en el workspace, no en un alert
    await expect(page.locator('text=No pudimos cargar tu espacio de CV')).toBeVisible({ timeout: 10_000 })
  })

  test('P15-C4 — límite diario alcanzado deshabilita el botón Generar', async ({ page, request }) => {
    const token = await getQaToken(request)
    if (!token) { test.skip(); return }

    await injectSession(page, token)

    // Perfil con cv_vivo = 1 hoy y sin suscripción
    page.route(`${SUPABASE_URL}/auth/v1/user`, async (route) => {
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ id: 'qa-user-local', email: QA_EMAIL, role: 'authenticated', app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: new Date().toISOString() }),
      })
    })
    page.route(`${SUPABASE_URL}/auth/v1/token*`, async (route) => {
      if (route.request().url().includes('refresh_token')) {
        await route.fulfill({
          status: 200, contentType: 'application/json',
          body: JSON.stringify({ access_token: 'mock-refreshed', refresh_token: 'mock-r', token_type: 'bearer', expires_in: 3600, expires_at: Date.now() / 1000 + 3600, user: { id: 'qa-user-local', email: QA_EMAIL, role: 'authenticated', aud: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() } }),
        })
      } else await route.fallback()
    })

    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Asuncion' })
    page.route(`${SUPABASE_URL}/rest/v1/user_master_profiles**`, async (route) => {
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify([{
          id: 'qa-profile-local', user_id: 'qa-user-local',
          professional_title: 'QA Tester',
          profile_data: { habilidades: ['Node.js'], seniority: 'senior', daily_usage: { date: today, cv_vivo: 1, matches_shown: 0 } },
          is_subscribed: false, match_alerts_enabled: false, updated_at: new Date().toISOString(),
        }]),
      })
    })
    page.route(`${SUPABASE_URL}/functions/v1/match-batch`, async (route) => {
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ matches: [{ id: 'v1', titulo: 'Dev QA', finalScore: 80, id: 'v1' }], is_subscribed: false }),
        headers: { 'Access-Control-Allow-Origin': 'http://localhost:3000' },
      })
    })
    page.route('/.netlify/functions/cv-workspace', async (route) => {
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ evidence: [{ id: 'ev1', category: 'skill', claim: 'Node.js', confirmed_value: 'Node.js', context: null, source_kind: 'profile', source_label: null, status: 'confirmed' }], versions: [] }),
      })
    })

    await page.goto(`${BASE_URL}/mi-carrera/cv`, { waitUntil: 'networkidle' })

    // El botón debe estar deshabilitado con el mensaje de límite
    await expect(page.locator('text=Límite diario alcanzado')).toBeVisible({ timeout: 15_000 })
    const limitBtn = page.locator('button', { hasText: 'Límite diario alcanzado' })
    await expect(limitBtn).toBeDisabled()
  })
})
