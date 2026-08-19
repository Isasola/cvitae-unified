import { test, expect, type Page } from '@playwright/test'

async function getCanonicals(page: Page) {
  const loc = page.locator('link[rel="canonical"]')
  const count = await loc.count()
  const hrefs = await Promise.all(Array.from({ length: count }, (_, i) => loc.nth(i).getAttribute('href')))
  return hrefs.filter((h): h is string => !!h)
}

async function getRobotsMetas(page: Page) {
  const loc = page.locator('meta[name="robots"]')
  const count = await loc.count()
  const values = await Promise.all(Array.from({ length: count }, (_, i) => loc.nth(i).getAttribute('content')))
  return values.filter((v): v is string => !!v)
}

test('production: OpportunityDetail route check', async ({ page }) => {
  const fatal: string[] = []
  page.on('console', m => {
    if (m.type() === 'error' && (m.text().includes('Cannot access') || m.text().includes('before initialization')))
      fatal.push(m.text())
  })
  page.on('pageerror', e => fatal.push(e.message))

  await page.goto('/oportunidades/programa-reinventa-2ee118c1', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('main', { timeout: 10000 })

  const marketSearch = await page.locator('section[aria-label="Buscar oportunidades"]').count()
  expect(fatal, `TDZ on detail route: ${fatal.join(' | ')}`).toHaveLength(0)
  expect(marketSearch, 'Real slug routed to MarketOpportunities').toBe(0)
  const title = await page.title()
  console.log('OpportunityDetail title:', title)
  expect(title).toMatch(/CVitae/)
})

test('production: Paraguay SEO meta (canonical=self, robots=index)', async ({ page }) => {
  await page.goto('/oportunidades/paraguay', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('section[aria-label="Buscar oportunidades"]', { timeout: 10000 })
  await page.waitForTimeout(800)

  const canonicals = await getCanonicals(page)
  const robots = await getRobotsMetas(page)
  console.log(`PY canonicals (${canonicals.length}):`, canonicals, '| robots:', robots)

  expect(canonicals.length, 'No canonical tag found').toBeGreaterThan(0)
  expect(canonicals.length, 'Too many canonical tags — possible conflict').toBeLessThanOrEqual(2)
  const unique = [...new Set(canonicals)]
  expect(unique, 'Conflicting canonical URLs on PY page').toHaveLength(1)
  expect(unique[0]).toContain('/oportunidades/paraguay')

  robots.forEach(v => expect(v, `Unexpected noindex on indexable page: ${v}`).not.toContain('noindex'))
})

test('production: Peru SEO meta (canonical=self, robots=noindex)', async ({ page }) => {
  await page.goto('/oportunidades/peru', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('section[aria-label="Buscar oportunidades"]', { timeout: 10000 })
  await page.waitForTimeout(800)

  const canonicals = await getCanonicals(page)
  const robots = await getRobotsMetas(page)
  console.log(`PE canonicals (${canonicals.length}):`, canonicals, '| robots:', robots)

  expect(canonicals.length).toBeGreaterThan(0)
  expect(canonicals.length).toBeLessThanOrEqual(2)
  const unique = [...new Set(canonicals)]
  expect(unique, 'Conflicting canonical URLs on PE page').toHaveLength(1)
  expect(unique[0]).toContain('/oportunidades/peru')

  expect(robots.length, 'Missing robots noindex on noindex page').toBeGreaterThan(0)
  const uniqueRobots = [...new Set(robots)]
  expect(uniqueRobots, 'Conflicting robots directives on PE page').toHaveLength(1)
  expect(uniqueRobots[0]).toContain('noindex')
})

test('production: LATAM SEO meta (canonical=self, robots=index)', async ({ page }) => {
  await page.goto('/oportunidades/latam', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('section[aria-label="Buscar oportunidades"]', { timeout: 10000 })
  await page.waitForTimeout(800)

  const canonicals = await getCanonicals(page)
  const robots = await getRobotsMetas(page)
  console.log(`LATAM canonicals (${canonicals.length}):`, canonicals, '| robots:', robots)

  expect(canonicals.length).toBeGreaterThan(0)
  expect(canonicals.length).toBeLessThanOrEqual(2)
  const unique = [...new Set(canonicals)]
  expect(unique, 'Conflicting canonical URLs on LATAM page').toHaveLength(1)
  expect(unique[0]).toContain('/oportunidades/latam')

  robots.forEach(v => expect(v, `Unexpected noindex on indexable page: ${v}`).not.toContain('noindex'))
})

test('production: Remoto-LATAM SEO meta (canonical=self, robots=noindex)', async ({ page }) => {
  await page.goto('/oportunidades/remoto-latam', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('section[aria-label="Buscar oportunidades"]', { timeout: 10000 })
  await page.waitForTimeout(800)

  const canonicals = await getCanonicals(page)
  const robots = await getRobotsMetas(page)
  console.log(`Remoto-LATAM canonicals (${canonicals.length}):`, canonicals, '| robots:', robots)

  expect(canonicals.length).toBeGreaterThan(0)
  expect(canonicals.length).toBeLessThanOrEqual(2)
  const unique = [...new Set(canonicals)]
  expect(unique, 'Conflicting canonical URLs on Remoto-LATAM page').toHaveLength(1)
  expect(unique[0]).toContain('/oportunidades/remoto-latam')

  expect(robots.length, 'Missing robots noindex on noindex page').toBeGreaterThan(0)
  const uniqueRobots = [...new Set(robots)]
  expect(uniqueRobots, 'Conflicting robots directives on Remoto-LATAM page').toHaveLength(1)
  expect(uniqueRobots[0]).toContain('noindex')
})
