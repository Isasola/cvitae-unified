import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { buildEffectiveSeoInventory, buildSeoInventoryFromUniverse, seoCanonicalPaths } from '../src/lib/seo-inventory.ts'
import { sitemapIndexEntries } from '../src/lib/sitemap-universe.js'
import { publicDistributionProjection } from '../src/lib/effective-source-policy.ts'

const root = path.resolve(import.meta.dirname, '..')
const fixture = JSON.parse(fs.readFileSync(path.resolve(root, process.env.SEO_INVENTORY_FIXTURE || 'scripts/fixtures/seo-inventory.json'), 'utf8'))
const project = () => fixture.fromUniverse ? buildSeoInventoryFromUniverse(fixture.opportunities) : buildEffectiveSeoInventory(fixture.opportunities, fixture.policies)
const inventory = project()
const expected = seoCanonicalPaths(inventory)
if (fixture.fromUniverse) {
  const generated = JSON.parse(fs.readFileSync(path.join(root,'generated/public-seo-inventory.json'),'utf8'))
  assert.deepEqual(seoCanonicalPaths(generated.rows),expected,'canonical SQL input reaches generated inventory without a second source gate')
  for (const row of generated.rows) {
    assert.deepEqual(row.distribution.seo,{allowed:true,authority:'opportunity_seo_universe'})
    const {seo: _legacy, ...external}=publicDistributionProjection(row,fixture.policies)
    const {seo: _canonical, ...actual}=row.distribution
    assert.deepEqual(actual,external,'attribution and external distribution guards remain unchanged')
  }
}
const same = (actual: string[], label: string) => assert.deepEqual([...new Set(actual)].sort(), expected, label)
const locs = (xml: string) => [...xml.matchAll(/<loc>https:\/\/cvitae\.lat(\/[^<]+)<\/loc>/g)].map(match => match[1])

const sitemapIndex = fs.readFileSync(path.join(root, 'dist/sitemap.xml'), 'utf8')
assert.match(sitemapIndex, /<sitemapindex\b/, 'build sitemap must be an index')
const childNames = [...sitemapIndex.matchAll(/<loc>https:\/\/cvitae\.lat\/([^<]+)<\/loc>/g)].map(match => match[1])
assert.ok(childNames.length > 0, 'sitemap index must advertise child files')
const opportunityPaths: string[] = []
for (const childName of childNames) {
  const childPath = path.join(root, 'dist', ...childName.split('/'))
  assert.ok(fs.existsSync(childPath), `advertised child must exist in build snapshot: ${childName}`)
  const childXml = fs.readFileSync(childPath, 'utf8')
  if (childName.startsWith('sitemap-opportunities/')) opportunityPaths.push(...locs(childXml))
}
same(opportunityPaths.filter(item => /^\/(empleos|oportunidades)\/[^/]+$/.test(item)), 'build child opportunity sitemaps must equal effective SEO inventory')
assert.deepEqual(childNames.filter(name => name.startsWith('sitemap-opportunities/')), sitemapIndexEntries(expected.length).filter(name => name.startsWith('sitemap-opportunities/')), 'build child pagination must match shared universe')

const prerendered = expected.filter(item => fs.existsSync(path.join(root, 'dist', ...item.split('/').filter(Boolean), 'index.html')))
same(prerendered, 'every effective SEO URL must have a prerendered public page')
for (const canonical of expected) {
  const alias = canonical.startsWith('/empleos/') ? canonical.replace('/empleos/', '/oportunidades/') : canonical.replace('/oportunidades/', '/empleos/')
  assert.equal(fs.existsSync(path.join(root, 'dist', ...alias.split('/').filter(Boolean), 'index.html')), false, `wrong family must not produce static content: ${alias}`)
}

const redirects = fs.readFileSync(path.join(root, 'dist/_redirects'), 'utf8').trim().split(/\r?\n/).filter(Boolean)
const redirectTargets = redirects.map(line => line.split(/\s+/)[1])
same(redirectTargets, 'redirect targets must be canonical effective SEO URLs')
assert.ok(redirects.every(line => line.endsWith(' 301!')), 'redirects must be forced HTTP redirects')

// Runtime uses the same Opportunity Truth projection; this guards against a
// build-only URL selection being introduced beside the runtime function.
same(seoCanonicalPaths(project()), 'runtime effective inventory')
assert.deepEqual(sitemapIndexEntries(2501).filter(name => name.startsWith('sitemap-opportunities/')), ['sitemap-opportunities/1.xml', 'sitemap-opportunities/2.xml', 'sitemap-opportunities/3.xml'], 'shared pagination contract remains 1000/1000/501')

console.log(JSON.stringify({ total: fixture.opportunities.length, effective_seo: expected.length, build_child_opportunity_urls: opportunityPaths.length, prerender_public_200: prerendered.length, redirects: redirects.length, sitemap_children: childNames.length }))
