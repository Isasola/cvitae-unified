/**
 * Release smoke test — verifies routing, TDZ, and CSP for the LATAM market release.
 * Runs against a production-like Vite preview build.
 * No auth required. No Supabase writes performed.
 */

import { test, expect } from '@playwright/test'

// MarketOpportunities renders this aria-label on its search section.
// LandingPage does NOT have this element — it uniquely identifies the market page.
const MARKET_SEARCH_SELECTOR = 'section[aria-label="Buscar oportunidades"]'

// Expected page title patterns. Allow the template default as fallback for non-critical.
const PAGES = [
  {
    url: '/',
    label: 'LandingPage',
    expectedTitle: /CVitae/i,
    waitSelector: 'h1',
  },
  {
    url: '/oportunidades',
    label: 'Opportunities',
    expectedTitle: /oportunidades|becas|CVitae/i,
    waitSelector: 'h1',
  },
  {
    url: '/oportunidades/paraguay',
    label: 'MarketOpportunities:PY',
    marketKey: 'paraguay',
    expectedTitle: /Paraguay.*CVitae|CVitae.*Paraguay/i,
    waitSelector: MARKET_SEARCH_SELECTOR,
  },
  {
    url: '/oportunidades/latam',
    label: 'MarketOpportunities:LATAM',
    marketKey: 'latam',
    expectedTitle: /LATAM|latina|CVitae/i,
    waitSelector: MARKET_SEARCH_SELECTOR,
  },
  {
    url: '/oportunidades/peru',
    label: 'MarketOpportunities:PE',
    marketKey: 'peru',
    expectedTitle: /Per|CVitae/i,
    waitSelector: MARKET_SEARCH_SELECTOR,
  },
  {
    url: '/oportunidades/remoto-latam',
    label: 'MarketOpportunities:RemotoLATAM',
    marketKey: 'remoto-latam',
    expectedTitle: /Remoto|LATAM|CVitae/i,
    waitSelector: MARKET_SEARCH_SELECTOR,
  },
  {
    url: '/admin',
    label: 'Admin (auth boundary)',
    expectedTitle: /.+/,
    waitSelector: 'body',
  },
]

for (const page of PAGES) {
  test(`smoke: ${page.label} (${page.url})`, async ({ page: browser }) => {
    const fatalErrors: string[] = []
    const pageErrors: string[] = []

    browser.on('console', msg => {
      if (msg.type() === 'error') {
        const text = msg.text()
        if (
          text.includes('Cannot access') ||
          text.includes('before initialization') ||
          text.includes('Content Security Policy') && text.includes('violat')
        ) {
          fatalErrors.push(text)
        }
      }
    })

    browser.on('pageerror', err => {
      pageErrors.push(err.message)
    })

    const response = await browser.goto(page.url, { waitUntil: 'domcontentloaded', timeout: 15000 })
    expect(response?.status() ?? 200, `${page.url}: server error`).toBeLessThan(500)

    // Wait for the specific component element to confirm the right component rendered
    await browser.waitForSelector(page.waitSelector, { timeout: 10000 })

    // Allow time for react-helmet to flush the title update
    await browser.waitForFunction(
      (marker: string) => document.title !== 'CVitae | Tu Agente de Carrera Inteligente para Paraguay' || marker === '',
      page.label,
      { timeout: 5000 }
    ).catch(() => { /* title may not update in local build without production data */ })

    const title = await browser.title()

    // No TDZ / initialization errors
    expect(fatalErrors, `FATAL errors on ${page.url}: ${fatalErrors.join(' | ')}`).toHaveLength(0)
    expect(pageErrors, `Page errors on ${page.url}: ${pageErrors.join(' | ')}`).toHaveLength(0)

    // For market pages specifically: verify the search section rendered (proves MarketOpportunities ran)
    if (page.marketKey) {
      const searchSection = await browser.locator(MARKET_SEARCH_SELECTOR).count()
      expect(searchSection, `Market search section missing on ${page.url} — wrong component rendered`).toBe(1)
    }
  })
}

// Specific: real opportunity slug should NOT route to MarketOpportunities
test('smoke: /oportunidades/:real-slug → OpportunityDetail (not market page)', async ({ page: browser }) => {
  const fatalErrors: string[] = []
  browser.on('console', msg => {
    if (msg.type() === 'error' && (
      msg.text().includes('Cannot access') ||
      msg.text().includes('before initialization')
    )) fatalErrors.push(msg.text())
  })
  browser.on('pageerror', err => fatalErrors.push(err.message))

  await browser.goto('/oportunidades/some-nonexistent-slug-xyz123', { waitUntil: 'domcontentloaded' })
  await browser.waitForSelector('body', { timeout: 10000 })
  await browser.waitForTimeout(500)

  expect(fatalErrors, `TDZ error on real slug route: ${fatalErrors.join(' | ')}`).toHaveLength(0)

  // Must NOT render the MarketOpportunities search section
  const marketSearch = await browser.locator(MARKET_SEARCH_SELECTOR).count()
  expect(marketSearch, 'Real slug incorrectly routed to MarketOpportunities').toBe(0)
})
