import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(import.meta.dirname, '..')
const inventoryPath = path.join(root, 'generated', 'public-seo-inventory.json')
const ROUTE = /^\/(empleos|oportunidades)\/([a-z0-9][a-z0-9._-]*)$/i
const MAX_AGE_MS = 24 * 60 * 60 * 1000

export function canonicalRoute(pathname) {
  const match = ROUTE.exec(String(pathname || ''))
  if (!match) throw new Error(`seo_redirect_invalid_canonical_path:${pathname}`)
  return { canonical_path: pathname, family: match[1], slug: match[2] }
}

export function assertRedirectGraph(redirects, canonicals) {
  const sources = new Set()
  for (const { source, target } of redirects) {
    const sourceRoute = canonicalRoute(source), targetRoute = canonicalRoute(target)
    if (source === target || sources.has(source) || canonicals.has(source) || !canonicals.has(target)) throw new Error(`seo_redirect_invalid_graph:${source}`)
    if (sourceRoute.slug !== targetRoute.slug || sourceRoute.family === targetRoute.family) throw new Error(`seo_redirect_invalid_alias:${source}`)
    sources.add(source)
  }
  for (const { target } of redirects) if (sources.has(target)) throw new Error(`seo_redirect_chain_or_loop:${target}`)
}

export function buildOpportunityRedirects(rows) {
  const canonicals = new Set(rows.map(row => canonicalRoute(row.canonical_path).canonical_path))
  const redirects = []
  let collisions = 0
  for (const canonical of [...canonicals].sort()) {
    const { family, slug } = canonicalRoute(canonical)
    const source = `/${family === 'empleos' ? 'oportunidades' : 'empleos'}/${slug}`
    if (canonicals.has(source)) { collisions++; continue }
    redirects.push({ source, target: canonical })
  }
  redirects.sort((a, b) => a.source.localeCompare(b.source) || a.target.localeCompare(b.target))
  assertRedirectGraph(redirects, canonicals)
  return { redirects, collisions, canonicals }
}

export function parseInventory(inventory, now = Date.now()) {
  if (!inventory || !Array.isArray(inventory.rows) || !inventory.generated_at) throw new Error('seo_inventory_invalid')
  const generatedAt = Date.parse(inventory.generated_at)
  if (!Number.isFinite(generatedAt) || now - generatedAt > MAX_AGE_MS) throw new Error('seo_inventory_stale')
  if (!inventory.rows.length && process.env.SEO_INVENTORY_ALLOW_EMPTY !== 'true') throw new Error('seo_inventory_empty')
  return inventory.rows
}

export function redirectText(rows) {
  const { redirects, collisions } = buildOpportunityRedirects(rows)
  return { text: redirects.map(({ source, target }) => `${source} ${target} 301!`).join('\n') + (redirects.length ? '\n' : ''), redirects, collisions }
}

export function generate() {
  if (!fs.existsSync(inventoryPath)) throw new Error('seo_inventory_missing')
  const rows = parseInventory(JSON.parse(fs.readFileSync(inventoryPath, 'utf8')))
  const { text, redirects, collisions } = redirectText(rows)
  fs.writeFileSync(path.join(root, 'dist', '_redirects'), text)
  console.log(`SEO_REDIRECTS=${redirects.length}`)
  console.log(`SEO_REDIRECT_COLLISIONS=${collisions}`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) generate()
