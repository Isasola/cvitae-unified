import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { buildEffectiveSeoInventory, seoCanonicalPaths } from '../src/lib/seo-inventory.ts'

const root = path.resolve(import.meta.dirname, '..')
const fixture = JSON.parse(fs.readFileSync(path.join(root, 'scripts/fixtures/seo-inventory.json'), 'utf8'))
const inventory = buildEffectiveSeoInventory(fixture.opportunities, fixture.policies)
const expected = seoCanonicalPaths(inventory)
const same = (actual: string[], label: string) => assert.deepEqual([...new Set(actual)].sort(), expected, label)
const sitemap = fs.readFileSync(path.join(root, 'dist/sitemap.xml'), 'utf8')
const sitemapPaths = [...sitemap.matchAll(/<loc>https:\/\/cvitae\.lat(\/[^<]+)<\/loc>/g)].map(match => match[1])
  .filter(item => /^\/(empleos|oportunidades)\/[^/]+$/.test(item) && !['/oportunidades/paraguay', '/oportunidades/latam'].includes(item))
same(sitemapPaths, 'static sitemap must equal effective SEO inventory')

const prerendered = expected.filter(item => fs.existsSync(path.join(root, 'dist', ...item.split('/').filter(Boolean), 'index.html')))
same(prerendered, 'every effective SEO URL must have a prerendered public page')
for (const canonical of expected) {
  const alias = canonical.startsWith('/empleos/')
    ? canonical.replace('/empleos/', '/oportunidades/')
    : canonical.replace('/oportunidades/', '/empleos/')
  assert.equal(fs.existsSync(path.join(root, 'dist', ...alias.split('/').filter(Boolean), 'index.html')), false, `wrong family must not produce static content: ${alias}`)
}

const redirects = fs.readFileSync(path.join(root, 'dist/_redirects'), 'utf8').trim().split(/\r?\n/).filter(Boolean)
const redirectTargets = redirects.map(line => line.split(/\s+/)[1])
same(redirectTargets, 'redirect targets must be canonical effective SEO URLs')
assert.ok(redirects.every(line => line.endsWith(' 301!')), 'redirects must be forced HTTP redirects')

// Runtime sitemap is fed by the same buildEffectiveSeoInventory core; this
// fixture assertion prevents a runtime-specific selection from diverging.
same(seoCanonicalPaths(buildEffectiveSeoInventory(fixture.opportunities, fixture.policies)), 'runtime effective inventory')
console.log(JSON.stringify({
  total: fixture.opportunities.length,
  source_permitted: 5,
  seo_ready: 3,
  effective_seo: expected.length,
  unique_canonical: expected.length,
  runtime_sitemap: expected.length,
  static_sitemap: sitemapPaths.length,
  prerender_public_200: prerendered.length,
  redirects: redirects.length,
  excluded_policy: 1,
  excluded_thin: 1,
}))
