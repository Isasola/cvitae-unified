import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'

const netlifyConfig = readFileSync(new URL('../../netlify.toml', import.meta.url), 'utf8')
const cspMatch = netlifyConfig.match(/Content-Security-Policy\s*=\s*"([^"]+)"/)
if (!cspMatch) throw new Error('No se encontro la CSP de Netlify')
const csp = cspMatch[1]

async function applyProductionCsp(page: Page) {
  await page.route(/^http:\/\/localhost:3000\//, async route => {
    if (route.request().resourceType() !== 'document') return route.continue()
    const response = await route.fetch()
    await route.fulfill({
      response,
      headers: { ...response.headers(), 'content-security-policy': csp },
    })
  })
}

async function mockPublicReads(page: Page) {
  await page.route('**/rest/v1/**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: '[]',
  }))
}

async function mockGoogleMeasurement(page: Page) {
  let scripts = 0
  let collects = 0
  await page.route('https://www.google-analytics.com/g/collect**', route => {
    collects += 1
    return route.fulfill({ status: 204, body: '' })
  })
  await page.route('https://www.googletagmanager.com/gtag/js**', route => {
    scripts += 1
    return route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: "fetch('https://www.google-analytics.com/g/collect?v=2&tid=G-BZ16ZLP8ZZ', { mode: 'no-cors' });",
    })
  })
  return {
    scripts: () => scripts,
    collects: () => collects,
  }
}

test.beforeEach(async ({ page }) => {
  await applyProductionCsp(page)
  await mockPublicReads(page)
})

test('la CSP permite gtag y collect con consentimiento inicialmente denegado', async ({ page }) => {
  const cspErrors: string[] = []
  page.on('console', message => {
    if (message.type() === 'error' && message.text().toLowerCase().includes('content security policy')) {
      cspErrors.push(message.text())
    }
  })
  const requests = await mockGoogleMeasurement(page)

  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await expect.poll(requests.scripts).toBe(1)
  await expect.poll(requests.collects).toBe(1)

  const state = await page.evaluate(() => ({
    defaults: (window.dataLayer ?? []).filter((entry: any) => entry?.[0] === 'consent' && entry?.[1] === 'default'),
    configs: (window.dataLayer ?? []).filter((entry: any) => entry?.[0] === 'config'),
    hasGaCookie: document.cookie.includes('_ga'),
  }))
  expect((state.defaults.at(-1) as any)?.[2]?.analytics_storage).toBe('denied')
  expect(state.configs).toHaveLength(1)
  expect(state.hasGaCookie).toBe(false)
  expect(cspErrors).toEqual([])

  await page.getByRole('button', { name: 'Aceptar todas' }).click()
  const accepted = await page.evaluate(() => ({
    updates: (window.dataLayer ?? []).filter((entry: any) => entry?.[0] === 'consent' && entry?.[1] === 'update'),
    configs: (window.dataLayer ?? []).filter((entry: any) => entry?.[0] === 'config').length,
  }))
  expect((accepted.updates.at(-1) as any)?.[2]?.analytics_storage).toBe('granted')
  expect(accepted.configs).toBe(1)
})

test('rechazar conserva denied y no crea cookies Analytics', async ({ page }) => {
  await mockGoogleMeasurement(page)
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'Solo necesarias' }).click()

  const state = await page.evaluate(() => ({
    updates: (window.dataLayer ?? []).filter((entry: any) => entry?.[0] === 'consent' && entry?.[1] === 'update'),
    hasGaCookie: document.cookie.includes('_ga'),
  }))
  expect((state.updates.at(-1) as any)?.[2]?.analytics_storage).toBe('denied')
  expect(state.hasGaCookie).toBe(false)
})

test('una URL sensible no carga el tag aunque la CSP lo permita', async ({ page }) => {
  const requests = await mockGoogleMeasurement(page)
  await page.goto('/auth/callback?code=secret-fixture', { waitUntil: 'domcontentloaded' })

  expect(requests.scripts()).toBe(0)
  expect(requests.collects()).toBe(0)
  const serialized = await page.evaluate(() => JSON.stringify(window.dataLayer ?? []))
  expect(serialized).not.toContain('secret-fixture')
  expect(serialized).not.toContain('config')
})
