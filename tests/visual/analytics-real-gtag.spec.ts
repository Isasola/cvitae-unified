import { expect, test, type Page } from '@playwright/test'

async function mockPublicReads(page: Page) {
  await page.route('**/rest/v1/**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: '[]',
  }))
}

async function isolateRealGoogleTag(page: Page) {
  let scripts = 0
  const measurementAttempts: string[] = []

  await page.route(/https:\/\/([^/]+\.)?(google-analytics\.com|analytics\.google\.com)\/.*/, route => {
    measurementAttempts.push(route.request().url())
    return route.fulfill({ status: 204, body: '' })
  })
  await page.route('https://www.googletagmanager.com/**', route => {
    const url = new URL(route.request().url())
    if (url.pathname === '/gtag/js') {
      scripts += 1
      return route.continue()
    }
    measurementAttempts.push(route.request().url())
    return route.fulfill({ status: 204, body: '' })
  })

  return {
    scripts: () => scripts,
    measurements: () => measurementAttempts,
    pageViews: () => measurementAttempts.filter(url => {
      const parsed = new URL(url)
      return parsed.pathname.endsWith('/g/collect') && parsed.searchParams.get('en') === 'page_view'
    }),
  }
}

test.beforeEach(async ({ page }) => {
  await mockPublicReads(page)
})

test('gtag real procesa config denegado y emite medicion cookieless interceptada', async ({ page, context }) => {
  const google = await isolateRealGoogleTag(page)
  await page.goto('/', { waitUntil: 'domcontentloaded' })

  await expect.poll(google.scripts).toBe(1)
  await expect.poll(() => google.measurements().filter(url => url.includes('/g/collect')).length).toBeGreaterThan(0)
  await expect.poll(() => google.pageViews().length).toBe(1)
  expect((await context.cookies()).filter(cookie => cookie.name.startsWith('_ga'))).toEqual([])

  const state = await page.evaluate(() => {
    const entries = window.dataLayer ?? []
    return {
      commandFormats: entries.slice(0, 3).map(entry => Object.prototype.toString.call(entry)),
      defaultConsent: entries.find((entry: any) => entry?.[0] === 'consent' && entry?.[1] === 'default'),
      configs: entries.filter((entry: any) => entry?.[0] === 'config').length,
    }
  })
  expect(state.commandFormats).toEqual(['[object Arguments]', '[object Arguments]', '[object Arguments]'])
  expect((state.defaultConsent as any)?.[2]?.analytics_storage).toBe('denied')
  expect(state.configs).toBe(1)
})

test('gtag real con consentimiento concedido emite medicion y crea cookies', async ({ page, context }) => {
  await page.addInitScript(() => localStorage.setItem('cvitae_consent_v1', JSON.stringify({
    version: 1,
    analytics: true,
    advertising: false,
    decidedAt: '2026-08-21T00:00:00.000Z',
  })))
  const google = await isolateRealGoogleTag(page)
  await page.goto('/', { waitUntil: 'domcontentloaded' })

  await expect.poll(() => google.measurements().filter(url => url.includes('/g/collect')).length).toBeGreaterThan(0)
  await expect.poll(() => google.pageViews().length).toBe(1)
  await expect.poll(async () => (await context.cookies()).some(cookie => cookie.name === '_ga')).toBe(true)

  await page.locator('a[href="/empleos"]').first().click()
  await expect(page).toHaveURL(/\/empleos$/)
  expect(await page.evaluate(() => (window.dataLayer ?? []).filter((entry: any) => entry?.[0] === 'config').length)).toBe(1)
})

test('gtag real no se carga ni mide una URL sensible', async ({ page }) => {
  const google = await isolateRealGoogleTag(page)
  await page.goto('/auth/callback?code=fixture', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1_000)

  expect(google.scripts()).toBe(0)
  expect(google.measurements()).toEqual([])
  expect(await page.evaluate(() => (window.dataLayer ?? []).filter((entry: any) => entry?.[0] === 'config').length)).toBe(0)
})
