import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, extname, join, resolve } from 'node:path'
import ts from 'typescript'
import { serverSeoFlags } from '../netlify/functions/lib/seo-flags'

const root = process.cwd()
const functionsDir = join(root, 'netlify', 'functions')
const entries = readdirSync(functionsDir)
  .filter(name => extname(name) === '.ts')
  .map(name => join(functionsDir, name))

const visited = new Set<string>()
const forbidden: string[] = []

function resolveImport(fromFile: string, specifier: string) {
  if (!specifier.startsWith('.')) return null
  const base = resolve(dirname(fromFile), specifier)
  const candidates = [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.mjs`, join(base, 'index.ts'), join(base, 'index.tsx')]
  return candidates.find(candidate => existsSync(candidate)) || null
}

function visit(file: string) {
  if (visited.has(file)) return
  visited.add(file)
  const source = readFileSync(file, 'utf8')
  if (source.includes('import.meta.env')) forbidden.push(file)

  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true)
  parsed.forEachChild(node => {
    if (ts.isImportDeclaration(node)) {
      if (node.importClause?.isTypeOnly || !ts.isStringLiteral(node.moduleSpecifier)) return
      const dependency = resolveImport(file, node.moduleSpecifier.text)
      if (dependency) visit(dependency)
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      const dependency = resolveImport(file, node.moduleSpecifier.text)
      if (dependency) visit(dependency)
    }
  })
}

entries.forEach(visit)
assert(visited.has(join(functionsDir, 'admin-seo.ts')), 'admin-seo must be covered by the server dependency audit')
assert(visited.has(join(functionsDir, 'seo-pipeline.ts')), 'seo-pipeline must be covered by the server dependency audit')
assert.deepEqual(forbidden, [], `Netlify server graph must not contain import.meta.env:\n${forbidden.join('\n')}`)

const flagNames = ['SEO_PIPELINE_V2', 'SEO_AI_SUGGESTIONS', 'SEO_GOOGLE_INDEXING', 'SEO_DRY_RUN'] as const
const previous = Object.fromEntries(flagNames.map(name => [name, process.env[name]]))
try {
  flagNames.forEach(name => delete process.env[name])
  assert.deepEqual(serverSeoFlags(), {
    SEO_PIPELINE_V2: false,
    SEO_AI_SUGGESTIONS: false,
    SEO_GOOGLE_INDEXING: false,
    SEO_DRY_RUN: true,
  }, 'missing server flags must preserve safe defaults')

  flagNames.forEach(name => { process.env[name] = 'false' })
  assert.deepEqual(serverSeoFlags(), {
    SEO_PIPELINE_V2: false,
    SEO_AI_SUGGESTIONS: false,
    SEO_GOOGLE_INDEXING: false,
    SEO_DRY_RUN: false,
  }, 'explicit false must be honored')

  flagNames.forEach(name => { process.env[name] = 'true' })
  assert.deepEqual(serverSeoFlags(), {
    SEO_PIPELINE_V2: true,
    SEO_AI_SUGGESTIONS: true,
    SEO_GOOGLE_INDEXING: true,
    SEO_DRY_RUN: true,
  }, 'explicit true must be honored')
} finally {
  for (const name of flagNames) {
    if (previous[name] === undefined) delete process.env[name]
    else process.env[name] = previous[name]
  }
}

const [{ handler: adminSeoHandler }, { handler: seoPipelineHandler }] = await Promise.all([
  import('../netlify/functions/admin-seo'),
  import('../netlify/functions/seo-pipeline'),
])
assert.equal(typeof adminSeoHandler, 'function', 'admin-seo must initialize in Node')
assert.equal(typeof seoPipelineHandler, 'function', 'seo-pipeline must initialize in Node')

console.log(`PASS verify-netlify-server-env: ${entries.length} entries / ${visited.size} server files audited; flags absent/false/true; admin-seo and seo-pipeline initialize`)
