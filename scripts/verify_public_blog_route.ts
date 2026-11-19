import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createPublicBlogPostHandler, parseBlogSlug, renderApprovedBlogHtml, renderPublicBlogListHtml } from '../netlify/functions/public-blog-post.ts'
import { isCurrentPublicBlog, publicBlogExclusionReason } from '../src/lib/public-blog-contract.ts'

const today = new Date('2026-10-14T12:00:00Z')
const published = {
  id: 'blog-1', tipo: 'blog', titulo: 'Guía <segura>', slug: 'guia-segura',
  cuerpo: '# Datos\n\nVerificá [la fuente](https://jobs.example/post) y <script>alert(1)</script>.',
  categoria: 'Empleo', created_at: '2026-10-10T00:00:00Z', updated_at: '2026-10-12T00:00:00Z',
  is_active: true, metadata: { author_name: 'Equipo' },
}
assert.equal(parseBlogSlug('ok.slug-1'), 'ok.slug-1')
assert.equal(parseBlogSlug('../admin'), null)
assert.equal(parseBlogSlug('%2e%2e'), null)

const html = renderApprovedBlogHtml(published)
const richHtml = renderApprovedBlogHtml({ ...published, cuerpo: '# Datos\n\n## First\n\nBody\n\n## Second\n\nMore' })
assert.match(html, /<meta name="robots" content="index,follow">/)
assert.match(html, /<link rel="canonical" href="https:\/\/cvitae\.lat\/blog\/guia-segura">/)
assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/)
assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/)
assert.match(html, /href="https:\/\/jobs\.example\/post" rel="noopener noreferrer"/)
assert.match(html, /application\/ld\+json/)
assert.match(html, /site-header[\s\S]*Oportunidades[\s\S]*site-footer/, 'server HTML retains navigation and footer')
assert.match(richHtml, /class="inline-cta"/, 'server HTML retains the mid-article conversion step')
assert.match(html, /BlogPosting/)
assert.match(html, /BreadcrumbList/)
assert.match(html, /gtag\('consent','default',\{ad_storage:'denied'/)
assert.ok(html.indexOf("gtag('consent','default'") < html.indexOf('googletagmanager.com/gtag/js'), 'consent default is set before analytics loads')
assert.doesNotMatch(html, /data-ad-slot=/, 'ads stay absent unless render-time readiness gates are true')
const consentedAdHtml = renderApprovedBlogHtml(published, { ads: { ready: true, cmpReady: true, client: 'ca-pub-12345', slot: '67890' } })
assert.match(consentedAdHtml, /data-ad-placement="blog-end" style="display:none"/)
assert.match(consentedAdHtml, /advertising===true/)
assert.match(consentedAdHtml, /cvitae:consent-changed/)
assert.match(consentedAdHtml, /createElement\('script'\)/)
assert.doesNotMatch(consentedAdHtml, /<script[^>]+src="https:\/\/pagead\.googlesyndication\.com/, 'AdSense script is not loaded before client consent')
const ldJson = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)?.[1]
assert.ok(ldJson)
assert.equal((JSON.parse(ldJson!) as any)['@graph']?.[0]?.['@type'], 'BlogPosting')

const rows = new Map<string, Record<string, any>>([
  ['guia-segura', published],
  ['draft-ai', { ...published, id: 'blog-draft', slug: 'draft-ai', metadata: { auto_generated: true, approval: { status: 'PENDING_REVIEW' } } }],
  ['approved-ai', { ...published, id: 'blog-approved-ai', slug: 'approved-ai', metadata: { auto_generated: true, approval: { status: 'PUBLISHED' } } }],
  ['related-approved', { ...published, id: 'blog-related-approved', slug: 'related-approved', titulo: 'Related approved' }],
  ['related-draft', { ...published, id: 'blog-related-draft', slug: 'related-draft', metadata: { auto_generated: true, approval: { status: 'PENDING_REVIEW' } } }],
  ['expired', { ...published, id: 'blog-expired', slug: 'expired', fecha_vencimiento: '2026-10-13T00:00:00Z' }],
  ['invalid-expiry', { ...published, id: 'blog-invalid-expiry', slug: 'invalid-expiry', fecha_vencimiento: 'yesterday-ish' }],
  ['inactive', { ...published, id: 'blog-inactive', slug: 'inactive', is_active: false }],
  ['invalid-type', { ...published, id: 'blog-invalid-type', slug: 'invalid-type', tipo: 'draft' }],
])
const allRows = [...rows.values()]
const handler = createPublicBlogPostHandler(async slug => rows.get(slug) || null, () => today, async () => allRows, async current => allRows.filter(row => row.id !== current.id))
const request = (path: string, rawQuery = '', httpMethod = 'GET') => ({
  path, rawQuery, httpMethod,
  queryStringParameters: Object.fromEntries(new URLSearchParams(rawQuery)),
}) as any
const response = async (path: string, rawQuery = '', method = 'GET') => handler(request(path, rawQuery, method))

assert.equal((await response('/blog/guia-segura')).statusCode, 200)
assert.equal((await response('/blog/approved-ai')).statusCode, 200)
const approvedDetail = await response('/blog/guia-segura')
assert.match(approvedDetail.body, /related-approved/)
assert.doesNotMatch(approvedDetail.body, /related-draft/)
assert.equal(approvedDetail.headers['Cache-Control'], 'no-store')
const draftResponse = await response('/blog/draft-ai')
assert.equal(draftResponse.statusCode, 404, 'drafts stay private until the Admin PUBLISH transition')
assert.equal(draftResponse.headers['X-Robots-Tag'], 'noindex, nofollow')
const expiredResponse = await response('/blog/expired')
assert.equal(expiredResponse.statusCode, 404)
assert.match(expiredResponse.body, /name="robots" content="noindex,nofollow"/)
assert.equal(expiredResponse.headers['X-Robots-Tag'], 'noindex, nofollow')
assert.equal((await response('/blog/invalid-expiry')).statusCode, 404, 'invalid expiration is data error, not proof of current publication')
assert.equal((await response('/blog/inactive')).statusCode, 404)
assert.equal((await response('/blog/invalid-type')).statusCode, 404)
assert.equal((await response('/blog/missing')).statusCode, 404)
assert.equal((await response('/blog/../admin')).statusCode, 404)
assert.equal((await response('/.netlify/functions/public-blog-post', 'slug=guia-segura')).statusCode, 200)
assert.equal((await response('/.netlify/functions/public-blog-post', 'slug=guia-segura&slug=approved-ai')).statusCode, 404)
assert.equal((await response('/blog/guia-segura', '', 'POST')).statusCode, 405)
assert.equal((await response('/blog')).statusCode, 200)
const list = await response('/blog')
assert.match(list.body, /href="\/blog\/guia-segura"/)
assert.match(list.body, /href="\/blog\/approved-ai"/)
for (const excluded of ['draft-ai', 'expired', 'invalid-expiry', 'inactive', 'invalid-type']) assert.doesNotMatch(list.body, new RegExp(`/blog/${excluded}`), `list omits ${excluded}`)
assert.equal(isCurrentPublicBlog({ ...published, fecha_vencimiento: 'bad-date' }, today.getTime()), false)
assert.equal(publicBlogExclusionReason({ ...published, fecha_vencimiento: 'bad-date' }, today.getTime()), 'BLOG_EXPIRY_INVALID', 'invalid expiration is explicitly diagnosable')
assert.match(renderPublicBlogListHtml([published]), /<h1 id="blog-title"/)
assert.match(renderPublicBlogListHtml([published]), /site-header[\s\S]*site-footer/)

const unavailableHandler = createPublicBlogPostHandler(async () => { throw new Error('read failure') }, () => today, async () => { throw new Error('list failure') })
const unavailableDetail = await unavailableHandler(request('/blog/guia-segura'))
assert.equal(unavailableDetail.statusCode, 503)
assert.equal(unavailableDetail.headers['X-Robots-Tag'], 'noindex')
const unavailableList = await unavailableHandler(request('/blog'))
assert.equal(unavailableList.statusCode, 503)
assert.equal(unavailableList.headers['X-Robots-Tag'], 'noindex')

const redirects = readFileSync('netlify.toml', 'utf8')
assert.match(redirects, /from = "\/blog\/:slug"\s+to = "\/.netlify\/functions\/public-blog-post\?slug=:slug"\s+status = 200\s+force = true/)
assert.match(redirects, /from = "\/blog"\s+to = "\/.netlify\/functions\/public-blog-post\?view=list"\s+status = 200\s+force = true/)
assert.match(redirects, /from = "\/blog\/:slug\/index.html"[\s\S]*?force = true/)
if (existsSync('dist/_redirects')) {
  const artifactRedirects = readFileSync('dist/_redirects', 'utf8').trim().split(/\r?\n/)
  const listRule = artifactRedirects.indexOf('/blog /.netlify/functions/public-blog-post?view=list 200!')
  const detailRule = artifactRedirects.indexOf('/blog/:slug /.netlify/functions/public-blog-post?slug=:slug 200!')
  assert.ok(listRule >= 0 && detailRule > listRule, 'generated Netlify artifact forces list and detail through current content_hub checks')
  assert.ok(existsSync('dist/blog/career-guide/index.html'), 'fixture build has a pre-rendered public article to shadow')
  assert.equal(existsSync('dist/blog/retired-blog/index.html'), false, 'revoked content is not generated into a new static artifact')
}
const temp = mkdtempSync(join(tmpdir(), 'cvitae-blog-shadow-'))
try {
  const staticPath = join(temp, 'blog', 'expired', 'index.html')
  mkdirSync(join(temp, 'blog', 'expired'), { recursive: true })
  writeFileSync(staticPath, renderApprovedBlogHtml(published), 'utf8')
  assert.equal(existsSync(staticPath), true, 'fixture reproduces a prerendered static detail file')
  const revokedWithStaleFile = await response('/blog/expired')
  assert.equal(revokedWithStaleFile.statusCode, 404, 'the forced dynamic route observes revocation without rebuilding the fixture')
  assert.match(revokedWithStaleFile.body, /noindex,nofollow/)
  assert.doesNotMatch(revokedWithStaleFile.body, /Gu\u00eda &lt;segura&gt;/, 'revoked content is not returned from the stale static fixture')
} finally { rmSync(temp, { recursive: true, force: true }) }
const prerender = readFileSync('scripts/prerender.mjs', 'utf8')
const sitemap = readFileSync('netlify/functions/sitemap.ts', 'utf8')
const sitemapBuild = readFileSync('scripts/generate-sitemap.mjs', 'utf8')
assert.match(prerender, /isCurrentPublicBlog/)
assert.match(sitemap, /isCurrentPublicBlog/)
assert.match(sitemapBuild, /isCurrentPublicBlog/)
assert.match(sitemap, /select\('id,tipo,is_active,titulo,slug,created_at,updated_at,fecha_vencimiento,metadata'\)/)

console.log('verify_public_blog_route: PASS published HTML/SEO, escaped content, source links, draft/expiry 404, sitemap/prerender publication gate')
