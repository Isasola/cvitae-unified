import { test, expect, type Page } from '@playwright/test'

const consent = (analytics: boolean) => ({
  version: 1,
  analytics,
  advertising: false,
  decidedAt: '2026-08-21T00:00:00.000Z',
})

async function mockPublicReads(page: Page) {
  await page.route('**/rest/v1/**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: '[]',
  }))
}

test('GA4 permanece apagado sin consentimiento', async ({ page }) => {
  let googleTagRequests = 0
  await page.route('https://www.googletagmanager.com/**', route => {
    googleTagRequests += 1
    return route.fulfill({ status: 200, contentType: 'application/javascript', body: '' })
  })
  await mockPublicReads(page)
  await page.goto('/', { waitUntil: 'domcontentloaded' })

  expect(googleTagRequests).toBe(0)
  const commands = await page.evaluate(() => window.dataLayer ?? [])
  expect(commands.some((entry: any) => entry?.[0] === 'config')).toBe(false)
})

test('cada entrada directa consentida configura una sola vista inicial', async ({ page }) => {
  await page.addInitScript(value => localStorage.setItem('cvitae_consent_v1', JSON.stringify(value)), consent(true))
  await page.route('https://www.googletagmanager.com/**', route =>
    route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }))
  await mockPublicReads(page)

  for (const path of ['/', '/empleos/fixture', '/oportunidades/fixture', '/blog/fixture', '/empresas']) {
    await page.goto(path, { waitUntil: 'domcontentloaded' })
    const configs = await page.evaluate(() => (window.dataLayer ?? []).filter((entry: any) => entry?.[0] === 'config'))
    expect(configs, path).toHaveLength(1)
    expect(configs[0]?.[1], path).toBe('G-BZ16ZLP8ZZ')
    expect(configs[0]?.[2]?.anonymize_ip, path).toBe(true)
  }
})

test('guardar nuevamente el mismo consentimiento no duplica config/page_view inicial', async ({ page }) => {
  await page.route('https://www.googletagmanager.com/**', route =>
    route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }))
  await mockPublicReads(page)
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'Aceptar todas' }).click()
  await expect.poll(() => page.evaluate(() =>
    (window.dataLayer ?? []).filter((entry: any) => entry?.[0] === 'config').length)).toBe(1)

  await page.evaluate(() => window.dispatchEvent(new CustomEvent('cvitae:open-cookie-settings')))
  await page.getByRole('dialog').getByRole('button', { name: 'Aceptar todas' }).click()
  const configCount = await page.evaluate(() =>
    (window.dataLayer ?? []).filter((entry: any) => entry?.[0] === 'config').length)
  expect(configCount).toBe(1)
})

test('la navegación SPA conserva la atribución de entrada y no repite config', async ({ page }) => {
  await page.addInitScript(value => localStorage.setItem('cvitae_consent_v1', JSON.stringify(value)), consent(true))
  await page.route('https://www.googletagmanager.com/**', route =>
    route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }))
  await mockPublicReads(page)

  await page.goto('/?utm_source=google&utm_medium=organic', {
    waitUntil: 'domcontentloaded',
    referer: 'https://www.google.com/',
  })
  expect(await page.evaluate(() => document.referrer)).toBe('https://www.google.com/')
  expect(new URL(page.url()).searchParams.get('utm_source')).toBe('google')
  expect(new URL(page.url()).searchParams.get('utm_medium')).toBe('organic')

  await page.locator('a[href="/empleos"]').first().click()
  await expect(page).toHaveURL(/\/empleos$/)
  const configCount = await page.evaluate(() =>
    (window.dataLayer ?? []).filter((entry: any) => entry?.[0] === 'config').length)
  expect(configCount).toBe(1)
})
