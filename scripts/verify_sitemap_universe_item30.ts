import assert from 'node:assert/strict'
import fs from 'node:fs'
import { fetchAllPages, fetchPagesById } from '../src/lib/paged-fetch.js'
import { seoUniversePages, SEO_UNIVERSE_PAGE_SIZE } from '../src/lib/seo-universe-fetch.js'
import { buildEffectiveSeoInventory, seoCanonicalPaths } from '../src/lib/seo-inventory.ts'
import { STATIC_PUBLIC_SITEMAP_ROUTES } from '../src/lib/static-sitemap-routes.js'
import { canonicalSitemapRows } from '../src/lib/sitemap-universe.js'
import { opportunitySitemapPage, opportunitySitemapPageFromUniverse, opportunitySitemapSize, singletonSitemapPage, sitemapIndexEntries } from '../netlify/functions/sitemap.ts'

const policy = [{ source:'computrabajo', is_enabled:true }]
const ready = (id: number) => ({ id:`${String(id).padStart(8,'0')}-0000-4000-8000-000000000000`, source:'computrabajo', slug:`role-${id}`, title:'Programme Officer', organization:'Acme', description:'Programme delivery, monitoring, stakeholder coordination and reporting responsibilities. '.repeat(2), opportunity_type:id === 2500 ? null : 'job', opportunity_kind:id === 2500 ? 'job' : null, is_active:true, verification_status:'verified', updated_at:`2026-09-${String((id % 28) + 1).padStart(2, '0')}T00:00:00Z` })
const raw = Array.from({ length:2501 }, (_, index) => ready(index))
// The fluent fake rejects expensive query shapes instead of quietly ignoring them.
const mockSeoDb = (input: typeof raw, failAt = -1, repeat = false) => {
  const requests: Array<{ cursor:string | null; size:number; columns:string; returned:number }> = []
  return { requests, from(table:string) {
    assert.equal(table,'opportunity_seo_universe')
    let cursor:string | null=null, size=0, columns=''
    const query:any={
      select(value:string, options?:unknown) { assert.equal(options,undefined,'no count query'); columns=value; return query },
      not(column:string, operator:string, value:unknown) { assert.deepEqual([column,operator,value],['slug','is',null]); return query },
      order(column:string, options:unknown) { assert.deepEqual([column,options],['id',{ascending:true}]); return query },
      gt(column:string,value:string) { assert.equal(column,'id'); cursor=value; return query },
      limit(value:number) { assert.equal(value,250); size=value; return query },
      range() { throw new Error('OFFSET_RANGE_FORBIDDEN') },
      then(resolve:any,reject:any) {
        assert.equal(size,250)
        const page=input.filter(row=>repeat || cursor===null || row.id>cursor).slice(0,size)
        const index=requests.length
        requests.push({cursor,size,columns,returned:page.length})
        return Promise.resolve(index===failAt ? {data:null,error:{code:'57014',message:'fixture statement timeout'}} : {
          data:page.map(row=>Object.fromEntries(columns.split(',').map(column=>[column,(row as any)[column]]))),error:null,
        }).then(resolve,reject)
      },
    }
    return query
  } }
}
const collect = async (pages:AsyncIterable<any[]>) => { const rows:any[]=[]; for await(const page of pages) rows.push(...page); return rows }
const db=mockSeoDb(raw)
const fetched = await collect(seoUniversePages(db,Object.keys(raw[0]).join(',')))
assert.equal(SEO_UNIVERSE_PAGE_SIZE,250)
assert.equal(fetched.length,2501); assert.equal(db.requests.length,11); assert.equal(db.requests.at(-1)?.returned,1)
assert.equal(fetched.at(-1)?.slug,'role-2500')
assert.equal(new Set(fetched.map(row=>row.id)).size,2501)
assert.equal(db.requests[0].cursor,null)
db.requests.slice(1).forEach((request,index)=>assert.equal(request.cursor,raw[(index+1)*250-1].id))
for (const length of [0,500,501]) {
  const fixtureDb=mockSeoDb(raw.slice(0,length))
  assert.equal((await collect(seoUniversePages(fixtureDb,'id'))).length,length)
  assert.equal(fixtureDb.requests.length,length===0?1:3)
  assert.equal(fixtureDb.requests.at(-1)?.returned,length===501?1:0,'empty/partial final pages terminate correctly')
}
await assert.rejects(collect(seoUniversePages(mockSeoDb(raw,-1,true),'id')),/KEYSET_CURSOR_NOT_ADVANCING/)
await assert.rejects(collect(fetchPagesById(2,async()=>[{id:'b'},{id:'a'}])),/KEYSET_CURSOR_NOT_ADVANCING/)
await assert.rejects(collect(seoUniversePages(mockSeoDb(raw,1),'id')),(error:any)=>error.code==='57014','DB error cannot yield a successful partial inventory')
const inventory = buildEffectiveSeoInventory(fetched, policy)
assert.equal(inventory.length,2501,'use current shared row-driven gates; complete rows must survive every cursor page')
assert(inventory.some(row=>row.slug==='role-2500'),'final-page row survives canonical inventory')
assert.deepEqual(seoCanonicalPaths(inventory), seoCanonicalPaths(buildEffectiveSeoInventory([...fetched].reverse(), policy)), 'canonical duplicate selection/order must be deterministic')
const duplicateRows=[...fetched,{...ready(2502),slug:'role-99',updated_at:'2026-10-01T00:00:00Z'},{...ready(2503),slug:'role-99',updated_at:'2026-10-01T00:00:00Z'}]
const expectedInventory=buildEffectiveSeoInventory(duplicateRows,policy)
for (const order of [[...duplicateRows].reverse(),[...duplicateRows.filter((_,i)=>i%2),...duplicateRows.filter((_,i)=>!(i%2))]]) {
  assert.deepEqual(buildEffectiveSeoInventory(order,policy).map(row=>[row.canonical_path,row.id]),expectedInventory.map(row=>[row.canonical_path,row.id]),'updated_at DESC, id ASC before canonical-path dedupe is independent of fetch order')
}
assert.equal(expectedInventory.find(row=>row.slug==='role-99')?.id,ready(2502).id,'newest duplicate wins; timestamp ties choose smaller id')
const runtimePaths:string[]=[]
for(let page=1;page<=3;page++) {
  const runtimeDb=mockSeoDb(raw)
  const result=await opportunitySitemapPageFromUniverse(runtimeDb as any,`/sitemap-opportunities/${page}.xml`)
  assert.equal(result.statusCode,200)
  runtimePaths.push(...[...result.body.matchAll(/<loc>https:\/\/cvitae\.lat([^<]+)<\/loc>/g)].map(match=>match[1]))
  assert(runtimeDb.requests.every(request=>request.returned<=250))
  if(page===1) assert.equal(runtimeDb.requests.length,4,'runtime child stops at its XML budget; no full inventory snapshot')
  if(page===3) assert.match(result.body,/role-2500/)
}
assert.deepEqual(runtimePaths.sort(),seoCanonicalPaths(inventory),'all runtime child pages cover the same canonical paths')
assert.equal(await opportunitySitemapSize(mockSeoDb(raw) as any),2501,'index size streams id pages without count(*) or total cap')
assert.equal((await opportunitySitemapPageFromUniverse(mockSeoDb(raw) as any,'/sitemap-opportunities/4.xml')).statusCode,404)
await assert.rejects(opportunitySitemapPageFromUniverse(mockSeoDb(raw,1) as any,'/sitemap-opportunities/1.xml'),(error:any)=>error.code==='57014')
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
// Exercise sitemap paging independently from source permission. These rows
// represent an already-authorized effective SEO inventory, not permission evidence.
const sitemapInventory = Array.from({ length:2501 }, (_, index) => ({ canonical_path:`/empleos/role-${index}`, updated_at:`2026-09-${String((index % 28) + 1).padStart(2, '0')}T00:00:00Z` }))
const entries = sitemapIndexEntries(sitemapInventory.length, blogs.length, vacancies.length)
assert.deepEqual(entries, ['sitemap-static.xml','sitemap-blog.xml','sitemap-vacancies.xml','sitemap-opportunities/1.xml','sitemap-opportunities/2.xml','sitemap-opportunities/3.xml'])
for (const path of ['/sitemap-opportunities/1.xml','/sitemap-opportunities/2.xml','/sitemap-opportunities/3.xml']) {
  const expectedCount = path.endsWith('/3.xml') ? 501 : 1000
  assert.equal((opportunitySitemapPage(path, sitemapInventory).body.match(/<url>/g) || []).length, expectedCount)
}
assert.equal(opportunitySitemapPage('/sitemap-opportunities-1.xml', sitemapInventory).statusCode, 200, 'legacy page 1 remains routable')
for (const path of ['/sitemap-opportunities/0.xml','/sitemap-opportunities/4.xml','/sitemap-opportunities/x.xml','/sitemap-opportunities-2.xml']) assert.equal(opportunitySitemapPage(path, sitemapInventory).statusCode, 404)
assert.deepEqual(sitemapIndexEntries(0), ['sitemap-static.xml']); assert.equal(opportunitySitemapPage('/sitemap-opportunities/1.xml', []).statusCode, 404)
assert.equal(singletonSitemapPage('/sitemap-blog.xml', '/sitemap-blog.xml', blogs).statusCode, 200)
assert.match(singletonSitemapPage('/sitemap-blog.xml', '/sitemap-blog.xml', blogs).body, /article-1000/)
assert.equal(singletonSitemapPage('/sitemap-vacancies.xml', '/sitemap-vacancies.xml', vacancies).statusCode, 200)
assert.match(singletonSitemapPage('/sitemap-vacancies.xml', '/sitemap-vacancies.xml', vacancies).body, /opening-1000/)
assert.equal(singletonSitemapPage('/sitemap-blog.xml', '/sitemap-blog.xml', []).statusCode, 404)
assert.equal(singletonSitemapPage('/sitemap-vacancies.xml', '/sitemap-vacancies.xml', []).statusCode, 404)
assert.deepEqual(sitemapIndexEntries(0, 0, 0), ['sitemap-static.xml'], 'empty/non-indexable fixture families are absent from the index')
const escaped = opportunitySitemapPage('/sitemap-opportunities/1.xml', [{ canonical_path:'/empleos/a?x=1&y=2' }]).body
assert.match(escaped, /a\?x=1&amp;y=2/)
const escapedBlog = singletonSitemapPage('/sitemap-blog.xml', '/sitemap-blog.xml', canonicalSitemapRows('/blog', [{ slug:'a?x=1&y=2' }])).body
assert.match(escapedBlog, /a\?x=1&amp;y=2/)
const allCanonical = [...STATIC_PUBLIC_SITEMAP_ROUTES.map(route => route.url), ...sitemapInventory.map(row => row.canonical_path), ...blogs.map(row => row.canonical_path), ...vacancies.map(row => row.canonical_path)]
assert.equal(new Set(allCanonical).size, allCanonical.length, 'no URL may appear in two sitemap families')
assert.ok(sitemapInventory.every(row => !row.canonical_path.startsWith('/blog/') && !row.canonical_path.startsWith('/vacante/')), 'opportunity sitemap pages remain exclusive to authorized effective inventory')

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
const seoFetch=fs.readFileSync('src/lib/seo-universe-fetch.js','utf8')
assert.match(generator,/for await .*seoUniversePages/)
assert.match(runtime,/for await .*seoUniversePages/)
for(const consumer of [generator,runtime]) assert(!consumer.includes("from('opportunity_seo_universe')"),'SEO DB traversal must exclusively reuse the guarded helper')
assert(!generator.includes('.range('))
assert.match(seoFetch,/order\('id', \{ ascending: true \}\)\.limit\(size\)/)
assert.match(seoFetch,/query\.gt\('id', cursor\)/)
assert(!seoFetch.includes('.range(') && !seoFetch.includes("order('updated_at'") && !seoFetch.includes("count:"))
assert.equal(new Set(STATIC_PUBLIC_SITEMAP_ROUTES.map(route => route.url)).size, STATIC_PUBLIC_SITEMAP_ROUTES.length)
console.log('verify_sitemap_universe_item30: PASS keyset=2501 pages=11 page_budget=250 cursor=strict no_cap errors=fail_closed runtime=full_coverage canonical=deterministic blog=1001 vacancies=1001 xml=escaped')
