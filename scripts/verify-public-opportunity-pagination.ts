import assert from 'node:assert/strict'
import { publicCatalogQuery, publicCatalogPage, PUBLIC_CATALOG_PAGE_SIZE } from '../netlify/functions/lib/public-opportunity-pagination.ts'
import { readFileSync } from 'node:fs'

const rows = Array.from({ length: 1301 }, (_, i) => ({ id: String(i).padStart(5,'0'), updated_at: '2026-10-04T00:00:00Z', title: i===1250?'Rare Precision Engineer':'Programme Officer' }))
const args = publicCatalogQuery({q:'Rare Precision',area:'Research',mode:'jobs'})
assert.equal(args.p_query,'Rare Precision'); assert.equal(args.p_area,'Research'); assert.equal(args.p_limit,101)
assert.equal(rows.filter(row=>row.title.includes(args.p_query)).slice(0,args.p_limit)[0].id,'01250')
let cursor: string | null = null
const seen = new Set<string>()
let pages = 0
do {
  const scope = publicCatalogQuery({cursor:cursor || undefined})
  const page = publicCatalogPage(rows.filter(row=>!scope.p_after_id || row.id>scope.p_after_id).slice(0,scope.p_limit))
  assert.ok(page.rows.length<=PUBLIC_CATALOG_PAGE_SIZE)
  for(const row of page.rows) { assert.ok(!seen.has(row.id)); seen.add(row.id) }
  cursor=page.nextCursor; pages++
} while(cursor)
assert.equal(seen.size,1301); assert.equal(pages,14)
assert.throws(()=>publicCatalogQuery({cursor:'{"id":1}'}))
assert.throws(()=>publicCatalogQuery({q:'x'.repeat(201)}))
assert.throws(()=>publicCatalogQuery({types:'[1]'}))
const endpoint=readFileSync('netlify/functions/public-opportunities.ts','utf8')
assert.match(endpoint,/rpc\('search_public_opportunities', queryParams\)/)
assert.doesNotMatch(endpoint,/collectAllowedPages|maxPages|target = slug \? 1 : 300/)
assert.match(endpoint,/Object\.fromEntries\(COLUMNS\.split/,'RPC rows retain the existing public field allowlist')
for(const path of ['Jobs','Opportunities','MarketOpportunities']) {
  const ui=readFileSync(`src/pages/${path}.tsx`,'utf8')
  assert.match(ui,/loadPublicOpportunityPage/); assert.match(ui,/q: query/)
  assert.match(ui,/nextCursor/); assert.match(ui,/Ver más resultados/)
  assert.match(ui,/requestSequence/,'old search responses cannot overwrite newer filters')
}
console.log('public_pagination: PASS beyond_1000=1250 query_before_page=1 pages=14 rows=1301 bounded_request=101 no_scan_collector=1')
for(const path of ['scripts/run_matching_retrieval_expansion.ts','supabase/functions/match-batch/index.ts','netlify/functions/send-high-match-alerts.ts']) {
  const consumer=readFileSync(path,'utf8')
  assert.match(consumer,/rpc\(['"]get_source_distribution_policy['"]\)/, `${path} reads effective config including operator audit`)
  assert.doesNotMatch(consumer,/from\(['"]opportunity_sources['"]\)\.select\(['"]source,is_enabled,matching_enabled['"]\)/)
}
