import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fetchAllPages } from '../src/lib/paged-fetch.js'
import { canonicalSitemapRows } from '../src/lib/sitemap-universe.js'
import { buildEffectiveSeoInventory, seoCanonicalPaths } from '../src/lib/seo-inventory.ts'

const root = path.resolve(import.meta.dirname, '..')
const source = fs.readFileSync(path.join(root, 'scripts/prerender.mjs'), 'utf8')
const fixture = JSON.parse(fs.readFileSync(path.join(root, 'scripts/fixtures/seo-inventory.json'), 'utf8'))
const publicFixturePath = path.join(root, 'scripts/fixtures/prerender-public-fixture.json')
const publicFixture = JSON.parse(fs.readFileSync(publicFixturePath, 'utf8'))
const effective = buildEffectiveSeoInventory(fixture.opportunities, fixture.policies)
const expected = seoCanonicalPaths(effective)
const opportunityDirectories = ['empleos', 'oportunidades']
  .flatMap(family => fs.existsSync(path.join(root, 'dist', family))
    ? fs.readdirSync(path.join(root, 'dist', family), { withFileTypes: true })
      .filter(entry => entry.isDirectory() && fs.existsSync(path.join(root, 'dist', family, entry.name, 'index.html')))
      .map(entry => `/${family}/${entry.name}`)
    : [])
  .filter(route => !['/oportunidades/paraguay', '/oportunidades/latam', '/oportunidades/peru', '/oportunidades/remoto-latam'].includes(route))
assert.deepEqual([...new Set(opportunityDirectories)].sort(), expected, 'prerendered opportunity set must equal effective SEO inventory')
for (const canonicalPath of expected) {
  const html = fs.readFileSync(path.join(root, 'dist', ...canonicalPath.split('/').filter(Boolean), 'index.html'), 'utf8')
  assert.match(html, new RegExp(`<link rel="canonical" href="https://cvitae\\.lat${canonicalPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}">`))
  const wrongFamily = canonicalPath.startsWith('/empleos/') ? canonicalPath.replace('/empleos/', '/oportunidades/') : canonicalPath.replace('/oportunidades/', '/empleos/')
  assert.equal(fs.existsSync(path.join(root, 'dist', ...wrongFamily.split('/').filter(Boolean), 'index.html')), false, `wrong family absent: ${wrongFamily}`)
}
assert.equal(buildEffectiveSeoInventory([{ ...fixture.opportunities[0], deadline:'2020-01-01' }], fixture.policies).length, 0, 'expired row is absent')
assert.equal(buildEffectiveSeoInventory([{ ...fixture.opportunities[0], archived_at:'2026-01-01T00:00:00Z' }], fixture.policies).length, 0, 'archived row is absent')
assert.equal(buildEffectiveSeoInventory([{ ...fixture.opportunities[0], deleted_at:'2026-01-01T00:00:00Z' }], fixture.policies).length, 0, 'deleted row is absent')
const kindOnly = buildEffectiveSeoInventory([{ ...fixture.opportunities[0], id:'kind-only', slug:'kind-only-job', opportunity_type:null, opportunity_kind:'job' }], fixture.policies)
assert.equal(kindOnly[0]?.canonical_path, '/empleos/kind-only-job', 'opportunity_kind-only job preserves its canonical family')
assert.match(source, /fetchAllPages/); assert.match(source, /canonicalSitemapRows/); assert.match(source, /canonical_path/)
assert.ok(!source.includes(".in('tipo', ['oportunidad', 'empleo', 'beca'])"), 'content_hub opportunities cannot write public detail pages')
assert.ok(!source.includes('for (const job of [])'), 'legacy alias prerender engine removed')
assert.ok(!source.includes('description.length >= 100 && realOrg.length > 0'), 'prerender does not locally grant JobPosting permission')
const vacancyBlock = source.slice(source.indexOf('let vacancyCount'))
assert.match(vacancyBlock, /'@type': 'WebPage'/)
assert.match(vacancyBlock, /factualJobPosting\(/); assert.ok(!vacancyBlock.includes("'@type': 'JobPosting'") && !vacancyBlock.includes('hiringOrganization') && !vacancyBlock.includes('employmentType'), 'vacancy prerender delegates JobPosting construction to shared factual builder')

const blogRaw = Array.from({ length:1001 }, (_, index) => ({ id:`blog-${index}`, slug:`article-${index}`, updated_at:`2026-09-${String((index % 28) + 1).padStart(2, '0')}T00:00:00Z` }))
const vacancyRaw = Array.from({ length:1001 }, (_, index) => ({ id:`vacancy-${index}`, slug:`opening-${index}`, updated_at:`2026-09-${String((index % 28) + 1).padStart(2, '0')}T00:00:00Z` }))
const blogOffsets:number[] = [], vacancyOffsets:number[] = []
const blogs = canonicalSitemapRows('/blog', await fetchAllPages(1000, async (offset, size) => { blogOffsets.push(offset); return blogRaw.slice(offset, offset + size) }))
const vacancies = canonicalSitemapRows('/vacante', await fetchAllPages(1000, async (offset, size) => { vacancyOffsets.push(offset); return vacancyRaw.slice(offset, offset + size) }))
assert.deepEqual(blogOffsets, [0, 1000]); assert.deepEqual(vacancyOffsets, [0, 1000])
assert.equal(blogs.length, 1001); assert.equal(vacancies.length, 1001)
assert.ok(blogs.every(row => row.canonical_path.startsWith('/blog/'))); assert.ok(vacancies.every(row => row.canonical_path.startsWith('/vacante/')))
assert.equal(canonicalSitemapRows('/blog', [{ slug:'active' }, { slug:'active' }]).length, 1, 'blog detail canonicals dedupe')
assert.equal(canonicalSitemapRows('/vacante', [{ slug:'active' }, { slug:'active' }]).length, 1, 'vacancy detail canonicals dedupe')
assert.ok(!source.includes('.limit('), 'no prerender dynamic family has a fixed fetch ceiling')
assert.match(fs.readFileSync(path.join(root, 'dist', '404.html'), 'utf8'), /noindex/)

const activeBlogs = canonicalSitemapRows('/blog', publicFixture.blogs.filter((row: any) => row.is_active !== false)).map(row => row.canonical_path).sort()
const activeVacancies = canonicalSitemapRows('/vacante', publicFixture.vacancies.filter((row: any) => row.is_active !== false)).map(row => row.canonical_path).sort()
if (process.env.PRERENDER_PUBLIC_FIXTURE) {
  const prerenderedPaths = (family: string) => fs.existsSync(path.join(root, 'dist', family))
    ? fs.readdirSync(path.join(root, 'dist', family), { withFileTypes:true })
      .filter(entry => entry.isDirectory() && fs.existsSync(path.join(root, 'dist', family, entry.name, 'index.html')))
      .map(entry => `/${family}/${entry.name}`).sort()
    : []
  const prerenderedBlogs = prerenderedPaths('blog').filter(route => route !== '/blog/index.html')
  const prerenderedVacancies = prerenderedPaths('vacante')
  assert.deepEqual(prerenderedBlogs, activeBlogs, 'sitemap blog canonical set equals prerendered blog detail set')
  assert.deepEqual(prerenderedVacancies, activeVacancies, 'sitemap vacancy canonical set equals prerendered vacancy detail set')
  for (const canonicalPath of [...activeBlogs, ...activeVacancies]) {
    const html = fs.readFileSync(path.join(root, 'dist', ...canonicalPath.split('/').filter(Boolean), 'index.html'), 'utf8')
    assert.match(html, new RegExp(`<link rel="canonical" href="https://cvitae\\.lat${canonicalPath}">`))
  }
  for (const row of [...publicFixture.blogs, ...publicFixture.vacancies].filter((item: any) => item.is_active === false)) {
    const family = publicFixture.blogs.includes(row) ? 'blog' : 'vacante'
    assert.equal(fs.existsSync(path.join(root, 'dist', family, row.slug, 'index.html')), false, `inactive detail absent: ${row.slug}`)
  }
}
console.log(`verify_prerender_universe_item31: PASS opportunities=authoritative blog=1001 vacancies=1001 pagination=eof aliases=removed fixture_e2e=${Boolean(process.env.PRERENDER_PUBLIC_FIXTURE)}`)
