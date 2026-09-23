import assert from 'node:assert/strict'
import fs from 'node:fs'
import { fetchAllPages } from '../src/lib/paged-fetch.js'
import { buildEffectiveSeoInventory, seoCanonicalPaths } from '../src/lib/seo-inventory.ts'
import { STATIC_PUBLIC_SITEMAP_ROUTES } from '../src/lib/static-sitemap-routes.js'
import { canonicalSitemapRows } from '../src/lib/sitemap-universe.js'
import { opportunitySitemapPage, singletonSitemapPage, sitemapIndexEntries } from '../netlify/functions/sitemap.ts'

const policy = [{ source:'computrabajo', is_enabled:true }]
const ready = (id: number) => ({ id:`row-${id}`, source:'computrabajo', slug:`role-${id}`, title:'Programme Officer', organization:'Acme', description:'Programme delivery, monitoring, stakeholder coordination and reporting responsibilities. '.repeat(2), opportunity_type:id === 2500 ? null : 'job', opportunity_kind:id === 2500 ? 'job' : null, is_active:true, verification_status:'verified', updated_at:`2026-09-${String((id % 28) + 1).padStart(2, '0')}T00:00:00Z` })
const raw = Array.from({ length:2501 }, (_, index) => ready(index))
const offsets:number[] = []
const fetched = await fetchAllPages(1000, async (offset, size) => { offsets.push(offset); return raw.slice(offset, offset + size) })
assert.equal(fetched.length, 2501); assert.deepEqual(offsets, [0,1000,2000]); assert.equal(fetched.at(-1)?.slug, 'role-2500')
const inventory = buildEffectiveSeoInventory(fetched, policy)
assert.equal(inventory.length, 2501); assert.ok(inventory.some(row => row.slug === 'role-2500' && row.canonical_path === '/empleos/role-2500'))
assert.deepEqual(seoCanonicalPaths(inventory), seoCanonicalPaths(buildEffectiveSeoInventory([...fetched].reverse(), policy)), 'canonical duplicate selection/order must be deterministic')
const denied = buildEffectiveSeoInventory([{ ...ready(3000), slug:'expired', deadline:'2020-01-01' }, { ...ready(3001), slug:'archived', archived_at:'2026-01-01T00:00:00Z' }, { ...ready(3002), slug:'deleted', deleted_at:'2026-01-01T00:00:00Z' }], policy)
assert.equal(denied.length, 0)

const blogRaw = Array.from({ length:1001 }, (_, index) => ({ id:`blog-${index}`, slug:`article-${index}`, updated_at:`2026-09-${String((index % 28) + 1).padStart(2, '0')}T00:00:00Z` }))
const vacancyRaw = Array.from({ length:1001 }, (_, index) => ({ id:`vacancy-${index}`, slug:`opening-${index}`, updated_at:`2026-09-${String((index % 28) + 1).padStart(2, '0')}T00:00:00Z` }))
const blogOffsets:number[] = [], vacancyOffsets:number[] = []
const blogs = canonicalSitemapRows('/blog', await fetchAllPages(1000, async (offset, size) => { blogOffsets.push(offset); return blogRaw.slice(offset, offset + size) }))
const vacancies = canonicalSitemapRows('/vacante', await fetchAllPages(1000, async (offset, size) => { vacancyOffsets.push(offset); return vacancyRaw.slice(offset, offset + size) }))
assert.deepEqual(blogOffsets, [0,1000]); assert.deepEqual(vacancyOffsets, [0,1000])
assert.equal(blogs.length, 1001); assert.equal(vacancies.length, 1001)
assert.ok(blogs.some(row => row.canonical_path === '/blog/article-1000')); assert.ok(vacancies.some(row => row.canonical_path === '/vacante/opening-1000'))
assert.equal(canonicalSitemapRows('/blog', [{ slug:'duplicate' }, { slug:'duplicate' }]).length, 1, 'canonical detail URLs dedupe within their family')
const entries = sitemapIndexEntries(inventory.length, blogs.length, vacancies.length)
assert.deepEqual(entries, ['sitemap-static.xml','sitemap-blog.xml','sitemap-vacancies.xml','sitemap-opportunities-1.xml','sitemap-opportunities-2.xml','sitemap-opportunities-3.xml'])
assert.equal((opportunitySitemapPage('/sitemap-opportunities-1.xml', inventory).body.match(/<url>/g) || []).length, 1000)
assert.equal((opportunitySitemapPage('/sitemap-opportunities-2.xml', inventory).body.match(/<url>/g) || []).length, 1000)
assert.equal((opportunitySitemapPage('/sitemap-opportunities-3.xml', inventory).body.match(/<url>/g) || []).length, 501)
for (const path of ['/sitemap-opportunities-0.xml','/sitemap-opportunities-4.xml','/sitemap-opportunities-x.xml']) assert.equal(opportunitySitemapPage(path, inventory).statusCode, 404)
assert.deepEqual(sitemapIndexEntries(0), ['sitemap-static.xml']); assert.equal(opportunitySitemapPage('/sitemap-opportunities-1.xml', []).statusCode, 404)
assert.equal(singletonSitemapPage('/sitemap-blog.xml', '/sitemap-blog.xml', blogs).statusCode, 200)
assert.match(singletonSitemapPage('/sitemap-blog.xml', '/sitemap-blog.xml', blogs).body, /article-1000/)
assert.equal(singletonSitemapPage('/sitemap-vacancies.xml', '/sitemap-vacancies.xml', vacancies).statusCode, 200)
assert.match(singletonSitemapPage('/sitemap-vacancies.xml', '/sitemap-vacancies.xml', vacancies).body, /opening-1000/)
assert.equal(singletonSitemapPage('/sitemap-blog.xml', '/sitemap-blog.xml', []).statusCode, 404)
assert.equal(singletonSitemapPage('/sitemap-vacancies.xml', '/sitemap-vacancies.xml', []).statusCode, 404)
assert.deepEqual(sitemapIndexEntries(0, 0, 0), ['sitemap-static.xml'], 'empty/non-indexable fixture families are absent from the index')
const escaped = opportunitySitemapPage('/sitemap-opportunities-1.xml', [{ canonical_path:'/empleos/a?x=1&y=2' }]).body
assert.match(escaped, /a\?x=1&amp;y=2/)
const escapedBlog = singletonSitemapPage('/sitemap-blog.xml', '/sitemap-blog.xml', canonicalSitemapRows('/blog', [{ slug:'a?x=1&y=2' }])).body
assert.match(escapedBlog, /a\?x=1&amp;y=2/)
const allCanonical = [...STATIC_PUBLIC_SITEMAP_ROUTES.map(route => route.url), ...inventory.map(row => row.canonical_path), ...blogs.map(row => row.canonical_path), ...vacancies.map(row => row.canonical_path)]
assert.equal(new Set(allCanonical).size, allCanonical.length, 'no URL may appear in two sitemap families')
assert.ok(inventory.every(row => !row.canonical_path.startsWith('/blog/') && !row.canonical_path.startsWith('/vacante/')), 'opportunity universe remains exclusive to effective inventory')

const build = fs.readFileSync('scripts/generate-sitemap.mjs', 'utf8'), runtime = fs.readFileSync('netlify/functions/sitemap.ts', 'utf8'), generator = fs.readFileSync('scripts/generate-seo-inventory.ts', 'utf8')
assert.match(build, /STATIC_PUBLIC_SITEMAP_ROUTES/); assert.match(runtime, /STATIC_PUBLIC_SITEMAP_ROUTES/)
assert.match(build, /canonicalSitemapRows/); assert.match(runtime, /canonicalSitemapRows/)
assert.match(build, /fetchAllPages/); assert.match(runtime, /fetchAllPages/)
assert.ok(!build.includes('.limit(') && !runtime.includes('.limit('), 'public sitemap families have no fixed fetch ceiling')
assert.match(build, /generate\(\)\.catch\(\(error\) => \{[\s\S]*process\.exit\(1\)/, 'build sitemap failures terminate the build')
assert.match(build, /content_hub/); assert.match(build, /recruiter_vacancies/)
assert.match(runtime, /sitemap-blog\.xml/); assert.match(runtime, /sitemap-vacancies\.xml/)
assert.match(fs.readFileSync('src/pages/BlogPost.tsx', 'utf8'), /<link rel="canonical"/)
assert.match(fs.readFileSync('src/pages/VacantePage.tsx', 'utf8'), /<link rel="canonical"/)
assert.ok(!fs.readFileSync('src/pages/BlogPost.tsx', 'utf8').includes('noindex'), 'BlogPost contract is indexable')
assert.ok(!fs.readFileSync('src/pages/VacantePage.tsx', 'utf8').includes('noindex'), 'VacantePage contract is indexable')
assert.ok(!build.includes(".in('tipo', ['oportunidad', 'empleo', 'beca'])"), 'content_hub opportunities cannot enter the build sitemap universe')
assert.match(generator, /fetchAllPages/); assert.match(generator, /order\('updated_at'.*order\('id'/s)
assert.equal(new Set(STATIC_PUBLIC_SITEMAP_ROUTES.map(route => route.url)).size, STATIC_PUBLIC_SITEMAP_ROUTES.length)
console.log('verify_sitemap_universe_item30: PASS paged=2501 blog=1001 vacancies=1001 canonical=deterministic children=bounded empty=omitted xml=escaped')
