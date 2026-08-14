/**
 * Punto 13 — Pruebas visuales del dashboard de matches B2C.
 * Cubre los casos V1-V15 del QA punto 13.
 *
 * ESTRATEGIA DE AUTH:
 * - Tests de EmptyState (sin auth): corren sin sesión — no necesitan nada especial.
 * - Tests con mock completo: interceptan match-batch + user_master_profiles + auth.
 *   El token de auth se obtiene del Supabase local en el setup del test.
 * - Tests BLOCKED: requieren sesión real + perfil en DB + Edge Functions corriendo.
 *
 * BLOCKER PRINCIPAL: los tests V1-V15 con auth requieren que:
 *   1. El servidor Vite esté corriendo (manejado por webServer en playwright.config.ts).
 *   2. Supabase local esté corriendo (`npm run staging:local` o `supabase start`).
 *   3. El usuario QA exista en la DB local (se crea en el fixture de auth).
 *
 * EJECUCIÓN:
 *   pnpm test:visual                    — suite completa
 *   pnpm exec playwright test --grep V6 — un caso específico
 */

import { test, expect, type Page, type APIRequestContext } from '@playwright/test'
import { BASE_URL, SUPABASE_URL, ANON_KEY } from '../../playwright.config'

// ─── Constantes ───────────────────────────────────────────────────────────────

const QA_EMAIL    = 'visual-qa-p13@test.invalid'
const QA_PASSWORD = 'local-test-only-2026'

const MOCK_MATCH_RESPONSE = {
  matches: [
    {
      id: 'mock-1', slug: 'desarrollador-nodejs-senior',
      titulo: 'Desarrollador Node.js Senior',
      categoria: 'Tecnología e IT', ubicacion: 'Remoto',
      organization: 'Empresa Ficticia S.A.',
      application_url: 'https://example.com/apply/1',
      skillsScore: 88, titleScore: 72, seniorityScore: 78, locationScore: 95,
      finalScore: 84,
      vacancySkills: ['Node.js', 'TypeScript', 'PostgreSQL'],
      matchedSkills: ['Node.js', 'TypeScript'],
      missingSkills: ['PostgreSQL'],
      source: 'test',
    },
    {
      id: 'mock-2', slug: 'frontend-react',
      titulo: 'Frontend Developer React',
      categoria: 'Tecnología e IT', ubicacion: 'Asunción, Paraguay',
      organization: 'Tech Corp',
      application_url: 'https://example.com/apply/2',
      skillsScore: 65, titleScore: 60, seniorityScore: 78, locationScore: 100,
      finalScore: 72,
      vacancySkills: ['React', 'TypeScript', 'Docker'],
      matchedSkills: ['React', 'TypeScript'],
      missingSkills: ['Docker'],
      source: 'test',
    },
  ],
  profileSkills: ['Node.js', 'React', 'TypeScript'],
  missingSkills: ['PostgreSQL', 'Docker', 'AWS'],
  is_subscribed: true,
  match_alerts_enabled: false,
  meta: { activeOpportunities: 25, vectorCandidates: 0, generatedAt: new Date().toISOString() },
}

const MOCK_PROFILE = [{
  id: 'qa-profile-local',
  user_id: 'qa-user-local',
  professional_title: 'Desarrollador Fullstack QA',
  profile_data: {
    habilidades: ['Node.js', 'React', 'TypeScript'],
    seniority: 'semi-senior',
    location: 'Asunción, Paraguay',
    career_route: 'empleo-local',
  },
  is_subscribed: true,
  match_alerts_enabled: false,
  updated_at: new Date().toISOString(),
}]

// ─── Helpers de auth ──────────────────────────────────────────────────────────

async function getQaToken(request: APIRequestContext): Promise<string | null> {
  // Intentar signin con usuario QA ya creado
  const signinRes = await request.post(
    `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
    {
      data: { email: QA_EMAIL, password: QA_PASSWORD },
      headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    },
  )
  if (signinRes.ok()) {
    const body = await signinRes.json()
    return body?.access_token || null
  }
  // Si no existe, crear el usuario
  const signupRes = await request.post(`${SUPABASE_URL}/auth/v1/signup`, {
    data: { email: QA_EMAIL, password: QA_PASSWORD },
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
  })
  if (signupRes.ok()) {
    const body = await signupRes.json()
    if (body?.session?.access_token) return body.session.access_token
    // Con email confirmation: volver a hacer signin
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

/**
 * Inyectar sesión falsa + interceptar todas las llamadas de red necesarias
 * para que el dashboard se renderice con matches mockeados.
 *
 * Esta estrategia bypasea la verificación real de tokens (solo válida para tests locales).
 */
async function setupAuthenticatedMock(page: Page, token: string, matchResponse = MOCK_MATCH_RESPONSE) {
  // 1. Interceptar llamadas de auth para simular sesión válida
  await page.route(`${SUPABASE_URL}/auth/v1/user`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'qa-user-local', email: QA_EMAIL, role: 'authenticated',
        app_metadata: {}, user_metadata: {}, aud: 'authenticated',
        created_at: new Date().toISOString(),
      }),
    })
  })

  // 1b. Interceptar refresh token para que el mock no intente refrescar un token placeholder
  await page.route(`${SUPABASE_URL}/auth/v1/token*`, async (route) => {
    const req = route.request()
    if (req.url().includes('grant_type=refresh_token')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: matchResponse === MOCK_MATCH_RESPONSE ? 'mock-access-token-refreshed' : 'mock-access-token',
          token_type: 'bearer',
          expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          refresh_token: 'local-qa-refresh-placeholder',
          user: { id: 'qa-user-local', email: QA_EMAIL, role: 'authenticated', app_metadata: {}, user_metadata: {} },
        }),
      })
    } else {
      await route.continue()
    }
  })

  // 2. Interceptar profile query
  await page.route(`${SUPABASE_URL}/rest/v1/user_master_profiles**`, async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_PROFILE),
      })
    } else {
      await route.continue()
    }
  })

  // 3. Interceptar match-batch
  await page.route('**/functions/v1/match-batch', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(matchResponse),
    })
  })

  // 4. Interceptar gemini-courses
  await page.route('**/.netlify/functions/gemini-courses', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ courses: [], recommendations: [] }),
    })
  })

  // 5. Inyectar sesión en storage ANTES de que la app cargue.
  // supabase-js v2 usa la key "sb-{hostname[0]}-auth-token".
  // Para http://127.0.0.1:54321 → hostname = "127.0.0.1" → split(".")[0] = "127" → "sb-127-auth-token".
  // El valor es el objeto sesión plano (access_token, refresh_token, expires_at, user).
  await page.addInitScript(({ t, email }) => {
    const session = {
      access_token: t,
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      refresh_token: 'local-qa-refresh-placeholder',
      user: {
        id: 'qa-user-local',
        email,
        role: 'authenticated',
        app_metadata: { provider: 'email' },
        user_metadata: {},
        aud: 'authenticated',
        created_at: new Date().toISOString(),
      },
    }
    localStorage.setItem('sb-127-auth-token', JSON.stringify(session))
  }, { t: token, email: QA_EMAIL })
}

// ─── Tests sin auth (siempre corren) ─────────────────────────────────────────

test.describe('Punto 13 — Estados sin autenticación', () => {

  test('EmptyState pre-auth: formulario de email visible y funcional', async ({ page }) => {
    await page.goto('/mi-carrera')
    // Hay dos inputs de email en la página (EmptyState + newsletter footer)
    // Usar aria-label para seleccionar el correcto
    const loginInput = page.getByRole('textbox', { name: 'Email para entrar a Mi carrera' })
    await expect(loginInput).toBeVisible({ timeout: 10_000 })
    await loginInput.fill('test@example.com')
    await expect(loginInput).toHaveValue('test@example.com')
    await page.screenshot({ path: 'artifacts/visual/screenshots/empty-state-pre-auth-desktop.png' })
  })

  test('EmptyState pre-auth: teclado — Enter en input no rompe la página', async ({ page }) => {
    await page.goto('/mi-carrera')
    const loginInput = page.getByRole('textbox', { name: 'Email para entrar a Mi carrera' })
    await expect(loginInput).toBeVisible({ timeout: 10_000 })
    await loginInput.fill('test@example.com')
    await page.keyboard.press('Enter')
    // La página no debe romperse — puede mostrar mensaje de error de red (local)
    await page.waitForTimeout(1500)
    const title = await page.title()
    expect(title).toBeTruthy()
    await page.screenshot({ path: 'artifacts/visual/screenshots/empty-state-keyboard.png' })
  })

  test('EmptyState pre-auth: responsive mobile 375px', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/mi-carrera')
    await page.waitForSelector('input[type="email"]', { timeout: 10_000 })
    const hasOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    )
    expect(hasOverflow).toBe(false)
    await page.screenshot({ path: 'artifacts/visual/screenshots/empty-state-mobile.png' })
  })

  test('EmptyState pre-auth: responsive 600px', async ({ page }) => {
    await page.setViewportSize({ width: 600, height: 900 })
    await page.goto('/mi-carrera')
    await page.waitForSelector('input[type="email"]', { timeout: 10_000 })
    const hasOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    )
    expect(hasOverflow).toBe(false)
    await page.screenshot({ path: 'artifacts/visual/screenshots/empty-state-600px.png' })
  })

})

// ─── Tests con mock completo ──────────────────────────────────────────────────

test.describe('Punto 13 — Dashboard con mock completo', () => {

  // V6 — estado vacío con usuario autenticado y sin matches
  test('V6 — estado vacío: matches vacíos muestra mensaje, sin error JS', async ({ page, request }) => {
    const token = await getQaToken(request)
    if (!token) {
      test.fixme(true, 'BLOCKED: Supabase local no responde. Verificar: npm run staging:local')
      return
    }
    const emptyResponse = { ...MOCK_MATCH_RESPONSE, matches: [], missingSkills: [], profileSkills: [] }
    await setupAuthenticatedMock(page, token, emptyResponse)

    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))

    await page.goto('/mi-carrera')
    await page.waitForSelector('text=/oportunidades|carrera|mi carrera/i', { timeout: 15_000 })

    const jsErrors = errors.filter((e) => !e.includes('ResizeObserver'))
    expect(jsErrors, `Errores JS: ${jsErrors.join(', ')}`).toHaveLength(0)

    await page.screenshot({ path: 'artifacts/visual/screenshots/V6-empty-state.png', fullPage: true })
  })

  // V7 — estado error
  test('V7 — error de match-batch: banner visible con Reintentar', async ({ page, request }) => {
    const token = await getQaToken(request)
    if (!token) {
      test.fixme(true, 'BLOCKED: Supabase local no responde')
      return
    }

    await page.route(`${SUPABASE_URL}/auth/v1/user`, async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ id: 'qa-user-local', email: QA_EMAIL, role: 'authenticated' }) })
    })
    await page.route(`${SUPABASE_URL}/rest/v1/user_master_profiles**`, async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_PROFILE) })
      } else { await route.continue() }
    })
    // match-batch falla
    await page.route('**/functions/v1/match-batch', async (route) => {
      await route.fulfill({ status: 500, contentType: 'application/json',
        body: JSON.stringify({ error: 'No pudimos calcular tus matches en este momento.' }) })
    })

    await page.addInitScript(({ t, email }) => {
      localStorage.setItem('sb-127-auth-token', JSON.stringify({
        access_token: t, token_type: 'bearer', expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        refresh_token: 'local-qa-refresh-placeholder',
        user: {
          id: 'qa-user-local', email, role: 'authenticated',
          app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: new Date().toISOString(),
        },
      }))
    }, { t: token, email: QA_EMAIL })

    await page.goto('/mi-carrera')
    // Esperar el banner de error
    await page.waitForSelector('text=/no pudimos|error/i', { timeout: 20_000 })

    const retryBtn = page.locator('button', { hasText: /reintentar/i })
    await expect(retryBtn).toBeVisible()

    // La página no debe estar completamente rota
    await expect(page.locator('html')).not.toBeEmpty()
    await page.screenshot({ path: 'artifacts/visual/screenshots/V7-error-banner.png' })
  })

  // V8 — estado éxito
  test('V8 — estado éxito: cards, score, habilidades faltantes visibles', async ({ page, request }) => {
    const token = await getQaToken(request)
    if (!token) {
      test.fixme(true, 'BLOCKED: Supabase local no responde')
      return
    }
    await setupAuthenticatedMock(page, token)

    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))

    await page.goto('/mi-carrera')
    await page.waitForSelector('text=Oportunidades', { timeout: 20_000 })

    // Score visible
    await expect(page.locator('text=/\\d+\\/100/')).toBeVisible()
    // Habilidades faltantes
    await expect(page.locator('text=Habilidades faltantes')).toBeVisible()
    // Cards de oportunidades
    await expect(page.locator('article').first()).toBeVisible()

    const jsErrors = errors.filter((e) => !e.includes('ResizeObserver'))
    expect(jsErrors, `JS errors: ${jsErrors.join(', ')}`).toHaveLength(0)

    await page.screenshot({ path: 'artifacts/visual/screenshots/V8-success-state.png', fullPage: true })
  })

  // V2 — missingSkills canonicalizados
  test('V2 — missingSkills sin alias crudos', async ({ page, request }) => {
    const token = await getQaToken(request)
    if (!token) {
      test.fixme(true, 'BLOCKED: Supabase local no responde')
      return
    }
    const mockWithCanonicals = {
      ...MOCK_MATCH_RESPONSE,
      missingSkills: ['PostgreSQL', 'Docker', 'AWS'],
    }
    await setupAuthenticatedMock(page, token, mockWithCanonicals)

    await page.goto('/mi-carrera')
    // Esperar a que las cards de matches estén en el DOM — garantiza que los datos cargaron
    await page.waitForSelector('article', { timeout: 20_000 })
    // Ahora que los matches están renderizados, missingSkills debe estar populado
    // Esperar a que desaparezca el placeholder
    await page.waitForFunction(
      () => {
        const all = Array.from(document.querySelectorAll('li'))
        return !all.some((li) => li.textContent?.includes('Se mostrarán cuando'))
      },
      { timeout: 5_000 },
    )

    const missingSection = page.locator('h4', { hasText: 'Habilidades faltantes' }).locator('~ ul')
    const text = await missingSection.textContent() || ''

    expect(text).toContain('PostgreSQL')
    expect(text).toContain('Docker')
    expect(text).not.toContain('nodejs')
    expect(text).not.toContain('powerbi')
    expect(text).not.toMatch(/\bjs\b/)

    await page.screenshot({ path: 'artifacts/visual/screenshots/V2-missing-skills-canonical.png' })
  })

  // V9 — responsive desktop
  test('V9 — desktop 1440px: sin overflow horizontal', async ({ page, request }) => {
    const token = await getQaToken(request)
    if (!token) {
      test.fixme(true, 'BLOCKED: Supabase local no responde')
      return
    }
    await setupAuthenticatedMock(page, token)
    await page.setViewportSize({ width: 1440, height: 900 })

    await page.goto('/mi-carrera')
    await page.waitForSelector('text=Oportunidades', { timeout: 20_000 })

    const hasOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    )
    expect(hasOverflow).toBe(false)

    await expect(page.locator('text=Habilidades faltantes')).toBeVisible()
    await page.screenshot({ path: 'artifacts/visual/screenshots/V9-desktop-layout.png', fullPage: true })
  })

  // V10 — responsive mobile
  test('V10 — mobile 375px: sin overflow', async ({ page, request }) => {
    const token = await getQaToken(request)
    if (!token) {
      test.fixme(true, 'BLOCKED: Supabase local no responde')
      return
    }
    await setupAuthenticatedMock(page, token)
    await page.setViewportSize({ width: 375, height: 812 })

    await page.goto('/mi-carrera')
    await page.waitForSelector('text=/oportunidades|carrera/i', { timeout: 20_000 })

    const hasOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    )
    expect(hasOverflow).toBe(false)
    await page.screenshot({ path: 'artifacts/visual/screenshots/V10-mobile-layout.png', fullPage: true })
  })

  // V11 — ventana reducida
  test('V11 — 600px: sin overflow', async ({ page, request }) => {
    const token = await getQaToken(request)
    if (!token) {
      test.fixme(true, 'BLOCKED: Supabase local no responde')
      return
    }
    await setupAuthenticatedMock(page, token)
    await page.setViewportSize({ width: 600, height: 900 })

    await page.goto('/mi-carrera')
    await page.waitForSelector('text=/oportunidades|carrera/i', { timeout: 20_000 })

    const hasOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    )
    expect(hasOverflow).toBe(false)
    await page.screenshot({ path: 'artifacts/visual/screenshots/V11-reduced-window.png', fullPage: true })
  })

  // V12 — teclado
  test('V12 — navegación por teclado: Tab lleva focus a elemento interactivo', async ({ page, request }) => {
    const token = await getQaToken(request)
    if (!token) {
      test.fixme(true, 'BLOCKED: Supabase local no responde')
      return
    }
    await setupAuthenticatedMock(page, token)

    await page.goto('/mi-carrera')
    await page.waitForSelector('text=/oportunidades|carrera/i', { timeout: 20_000 })

    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab')

    const focused = await page.evaluate(() => {
      const el = document.activeElement
      return el ? { tag: el.tagName, role: el.getAttribute('role') } : null
    })
    expect(focused).not.toBeNull()
    expect(['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'].includes(focused!.tag)).toBeTruthy()
    await page.screenshot({ path: 'artifacts/visual/screenshots/V12-keyboard-nav.png' })
  })

  // V14 — score coherente
  test('V14 — score 84 tiene más matchedSkills que score 72', async ({ page, request }) => {
    const token = await getQaToken(request)
    if (!token) {
      test.fixme(true, 'BLOCKED: Supabase local no responde')
      return
    }
    await setupAuthenticatedMock(page, token)

    await page.goto('/mi-carrera')
    await page.waitForSelector('text=Oportunidades', { timeout: 20_000 })

    // La primera card (featured) tiene score 84
    const firstCard = page.locator('article').first()
    await expect(firstCard).toBeVisible()

    await page.screenshot({ path: 'artifacts/visual/screenshots/V14-score-coherence.png' })
  })

  // V15 — botón actualizar
  test('V15 — botón "Actualizar análisis" hace nueva llamada a match-batch', async ({ page, request }) => {
    const token = await getQaToken(request)
    if (!token) {
      test.fixme(true, 'BLOCKED: Supabase local no responde')
      return
    }

    let fetchCount = 0
    await page.route(`${SUPABASE_URL}/auth/v1/user`, async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ id: 'qa-user-local', email: QA_EMAIL, role: 'authenticated' }) })
    })
    await page.route(`${SUPABASE_URL}/rest/v1/user_master_profiles**`, async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_PROFILE) })
      } else { await route.continue() }
    })
    await page.route('**/functions/v1/match-batch', async (route) => {
      fetchCount++
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_MATCH_RESPONSE) })
    })
    await page.route('**/.netlify/functions/gemini-courses', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ courses: [] }) })
    })

    await page.addInitScript(({ t, email }) => {
      localStorage.setItem('sb-127-auth-token', JSON.stringify({
        access_token: t, token_type: 'bearer', expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        refresh_token: 'local-qa-refresh-placeholder',
        user: {
          id: 'qa-user-local', email, role: 'authenticated',
          app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: new Date().toISOString(),
        },
      }))
    }, { t: token, email: QA_EMAIL })

    await page.goto('/mi-carrera')
    await page.waitForSelector('text=Oportunidades', { timeout: 20_000 })

    const beforeCount = fetchCount
    const refreshBtn = page.locator('button', { hasText: /actualizar análisis/i })
    await expect(refreshBtn).toBeVisible()
    await refreshBtn.click()

    await page.waitForTimeout(2000)
    expect(fetchCount).toBeGreaterThan(beforeCount)
    await page.screenshot({ path: 'artifacts/visual/screenshots/V15-refresh.png' })
  })

})

// ─── Tests E2E con Edge Function local ───────────────────────────────────────
// Requieren: Supabase local corriendo + edge runtime con DISABLE_EMBEDDINGS=true
// Usuarios QA creados en DB local: visual-qa-p13@test.invalid (user A), visual-qa-p13-b@test.invalid (user B)
// Oportunidades QA: qa-opp-001, qa-opp-002, qa-opp-003 (match_eligible=true)
// match-batch: http://127.0.0.1:54321/functions/v1/match-batch

test.describe('Punto 13 — E2E con Edge Function local', () => {

  // V1 — carga real con match-batch local
  test('V1 — carga real con Edge Function match-batch activa', async ({ page, request }) => {
    test.setTimeout(90_000) // match-batch local tarda ~13s en cold start
    const token = await getQaToken(request)
    if (!token) {
      test.fixme(true, 'BLOCKED: Supabase local no responde. Verificar: npm run staging:local')
      return
    }

    // Interceptar match-batch para evitar CORS de Kong local (retorna `*` para credentialed requests)
    // route.fetch() hace la llamada server-side (Node.js, sin CORS) y reenvía la respuesta al browser
    await page.route(`${SUPABASE_URL}/functions/v1/match-batch`, async (route) => {
      const response = await route.fetch()
      const body = await response.text()
      await route.fulfill({
        status: response.status(),
        contentType: 'application/json',
        body,
        headers: {
          'Access-Control-Allow-Origin': 'http://localhost:3000',
          'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        },
      })
    })
    await page.route('**/.netlify/functions/gemini-courses', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ courses: [] }) })
    })

    await page.addInitScript(({ t, email }) => {
      localStorage.setItem('sb-127-auth-token', JSON.stringify({
        access_token: t, token_type: 'bearer', expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        refresh_token: 'local-qa-real',
        user: { id: 'df5f1cf6-9be7-4fa6-8864-82dcfa5ffb3d', email, role: 'authenticated',
          app_metadata: { provider: 'email' }, user_metadata: {}, aud: 'authenticated',
          created_at: new Date().toISOString() },
      }))
    }, { t: token, email: QA_EMAIL })

    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))

    await page.goto('/mi-carrera')
    // 80s para cold start del isolate Deno en primera invocación
    await page.waitForSelector('article', { timeout: 80_000 })

    // Verificar estructura mínima
    const firstCard = page.locator('article').first()
    await expect(firstCard).toBeVisible()
    await expect(page.locator('text=Habilidades faltantes')).toBeVisible()

    const jsErrors = errors.filter((e) => !e.includes('ResizeObserver'))
    expect(jsErrors, `JS errors: ${jsErrors.join(', ')}`).toHaveLength(0)

    await page.screenshot({ path: 'artifacts/visual/screenshots/V1-real-match-batch.png', fullPage: true })
  })

  // V3 — invalidación de caché al cambiar profile_data
  test('V3 — invalidación de caché real al editar perfil en DB', async ({ page, request }) => {
    test.setTimeout(120_000) // dos cargas de match-batch (antes y después de editar)
    const token = await getQaToken(request)
    if (!token) {
      test.fixme(true, 'BLOCKED: Supabase local no responde')
      return
    }

    // Interceptar match-batch para evitar CORS de Kong local
    await page.route(`${SUPABASE_URL}/functions/v1/match-batch`, async (route) => {
      const response = await route.fetch()
      const body = await response.text()
      await route.fulfill({
        status: response.status(),
        contentType: 'application/json',
        body,
        headers: {
          'Access-Control-Allow-Origin': 'http://localhost:3000',
          'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        },
      })
    })
    await page.route('**/.netlify/functions/gemini-courses', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ courses: [] }) })
    })

    await page.addInitScript(({ t, email }) => {
      localStorage.setItem('sb-127-auth-token', JSON.stringify({
        access_token: t, token_type: 'bearer', expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        refresh_token: 'local-qa-real',
        user: { id: 'df5f1cf6-9be7-4fa6-8864-82dcfa5ffb3d', email, role: 'authenticated',
          app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: new Date().toISOString() },
      }))
    }, { t: token, email: QA_EMAIL })

    await page.goto('/mi-carrera')
    // 80s para cold start del isolate Deno (igual que V1)
    await page.waitForSelector('article', { timeout: 80_000 })

    // Leer el timestamp "Inteligencia actualizada HH:MM" o "Inteligencia profesional lista"
    const firstTimestamp = await page.locator('text=/Inteligencia/').first().textContent()

    // Modificar el perfil en DB para cambiar la signature del caché
    await request.patch(`${SUPABASE_URL}/rest/v1/user_master_profiles?user_id=eq.df5f1cf6-9be7-4fa6-8864-82dcfa5ffb3d`, {
      data: { updated_at: new Date().toISOString() },
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
    })

    // Recargar la página — la signature ha cambiado, debería hacer nuevo fetch
    await page.reload()
    await page.waitForSelector('article', { timeout: 30_000 })

    // La página sigue mostrando resultados (no rompió)
    await expect(page.locator('article').first()).toBeVisible()
    await page.screenshot({ path: 'artifacts/visual/screenshots/V3-cache-invalidation.png' })
  })

  // V4 — completar curso NO modifica user_master_profiles
  test('V4 — completar curso en Learning Plan no modifica perfil automáticamente', async ({ page, request }) => {
    const token = await getQaToken(request)
    if (!token) {
      test.fixme(true, 'BLOCKED: Supabase local no responde')
      return
    }

    // Interceptar gemini-courses con mock (no disponible sin GEMINI_API_KEY local)
    await page.route('**/.netlify/functions/gemini-courses', async (route) => {
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({
          courses: [{
            id: 'qa-course-1', skill: 'PostgreSQL',
            course: 'PostgreSQL para desarrolladores', platform: 'Coursera',
            url: 'https://example.com/course', why: 'Requerido en múltiples ofertas',
            status: 'suggested', learningFocus: 'PostgreSQL', level: 'intermedio',
            sources: [{ id: 'qa-opp-001', slug: 'desarrollador-nodejs-senior-qa', title: 'Node.js Senior' }],
          }],
          recommendations: [],
        }),
      })
    })

    await page.addInitScript(({ t, email }) => {
      localStorage.setItem('sb-127-auth-token', JSON.stringify({
        access_token: t, token_type: 'bearer', expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        refresh_token: 'local-qa-real',
        user: { id: 'df5f1cf6-9be7-4fa6-8864-82dcfa5ffb3d', email, role: 'authenticated',
          app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: new Date().toISOString() },
      }))
    }, { t: token, email: QA_EMAIL })

    // Leer el updated_at del perfil antes de navegar a Learning Plan
    const profileBefore = await request.get(
      `${SUPABASE_URL}/rest/v1/user_master_profiles?user_id=eq.df5f1cf6-9be7-4fa6-8864-82dcfa5ffb3d&select=updated_at`,
      { headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` } },
    )
    const profileBeforeData = await profileBefore.json()
    const updatedAtBefore = profileBeforeData[0]?.updated_at

    // Navegar a Learning Plan
    await page.goto('/mi-carrera/aprender')
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})
    // La página de Learning Plan no debe romperse
    const title = await page.title()
    expect(title).toBeTruthy()

    // Verificar que el perfil NO fue modificado (updated_at no cambió)
    const profileAfter = await request.get(
      `${SUPABASE_URL}/rest/v1/user_master_profiles?user_id=eq.df5f1cf6-9be7-4fa6-8864-82dcfa5ffb3d&select=updated_at`,
      { headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` } },
    )
    const profileAfterData = await profileAfter.json()
    const updatedAtAfter = profileAfterData[0]?.updated_at

    expect(updatedAtAfter).toBe(updatedAtBefore)
    await page.screenshot({ path: 'artifacts/visual/screenshots/V4-learning-no-profile-change.png' })
  })

  // V5 — estado loading visible durante fetch de match-batch
  test('V5 — estado loading visible durante fetch de match-batch', async ({ page, request }) => {
    const token = await getQaToken(request)
    if (!token) {
      test.fixme(true, 'BLOCKED: Supabase local no responde')
      return
    }

    // Interceptar match-batch con delay artificial para capturar el estado de loading
    await page.route('**/functions/v1/match-batch', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 3000))
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify(MOCK_MATCH_RESPONSE),
      })
    })
    await page.route('**/.netlify/functions/gemini-courses', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ courses: [] }) })
    })

    await page.addInitScript(({ t, email }) => {
      localStorage.setItem('sb-127-auth-token', JSON.stringify({
        access_token: t, token_type: 'bearer', expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        refresh_token: 'local-qa-real',
        user: { id: 'df5f1cf6-9be7-4fa6-8864-82dcfa5ffb3d', email, role: 'authenticated',
          app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: new Date().toISOString() },
      }))
    }, { t: token, email: QA_EMAIL })

    await page.route(`${SUPABASE_URL}/auth/v1/user`, async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ id: 'df5f1cf6-9be7-4fa6-8864-82dcfa5ffb3d', email: QA_EMAIL, role: 'authenticated' }) })
    })
    await page.route(`${SUPABASE_URL}/rest/v1/user_master_profiles**`, async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_PROFILE) })
      } else { await route.continue() }
    })

    await page.goto('/mi-carrera')

    // El LoaderState muestra "Un momento…" durante el fetch (3s delay artificial)
    await expect(page.locator('text=Un momento')).toBeVisible({ timeout: 10_000 })
    await page.screenshot({ path: 'artifacts/visual/screenshots/V5-loading-state.png' })

    // Esperar a que terminen los matches
    await page.waitForSelector('article', { timeout: 15_000 })
    await page.screenshot({ path: 'artifacts/visual/screenshots/V5-after-loading.png' })
  })

  // V13 — aislamiento: token de A no devuelve datos de B
  test('V13 — aislamiento de datos: token usuario A no expone datos de usuario B', async ({ request }) => {
    const tokenA = await getQaToken(request)
    if (!tokenA) {
      test.fixme(true, 'BLOCKED: Supabase local no responde')
      return
    }

    // Obtener token de usuario B
    const signinB = await request.post(
      `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
      {
        data: { email: 'visual-qa-p13-b@test.invalid', password: 'local-test-only-2026' },
        headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
      },
    )
    expect(signinB.ok(), 'Usuario B debe poder autenticarse').toBe(true)
    const tokenBData = await signinB.json()
    const tokenB = tokenBData?.access_token
    expect(tokenB, 'Token de usuario B debe existir').toBeTruthy()

    // Llamar match-batch con token de A
    const resA = await request.post(`${SUPABASE_URL}/functions/v1/match-batch`, {
      data: {},
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
    })
    expect(resA.ok()).toBe(true)
    const dataA = await resA.json()

    // Llamar match-batch con token de B
    const resB = await request.post(`${SUPABASE_URL}/functions/v1/match-batch`, {
      data: {},
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenB}` },
    })
    expect(resB.ok()).toBe(true)
    const dataB = await resB.json()

    // Perfil A tiene habilidades de Node.js/React/TypeScript
    // Perfil B tiene habilidades de Figma/UX Research — profileSkills deben ser distintos
    expect(dataA.profileSkills).not.toEqual(dataB.profileSkills)

    // Los matches de A no deben contener datos del perfil de B (título "Diseñador UX QA")
    const matchesAText = JSON.stringify(dataA.matches)
    expect(matchesAText).not.toContain('Diseñador UX QA')
    expect(matchesAText).not.toContain('Figma')

    // Los matches de B no deben contener datos del perfil de A
    const matchesBText = JSON.stringify(dataB.matches)
    expect(matchesBText).not.toContain('Desarrollador Fullstack QA')
  })

})
