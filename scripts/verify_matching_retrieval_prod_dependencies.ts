import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
const migration = read('../supabase/migrations/202609270001_matching_retrieval_coverage.sql')
const generator = read('./generate_opportunity_universe_artifacts.ts')
const dependencySql = read('../artifacts/opportunity-universe/preflight-retrieval-prod-dependencies.sql')
const retrievalArtifact = read('../artifacts/opportunity-universe/prod-apply-retrieval.sql')
const finalVerifier = read('../artifacts/opportunity-universe/verify-prod.sql')
const universePreflight = read('../artifacts/opportunity-universe/preflight-prod.sql')

const stripCommentsAndStrings = (sql: string) => sql
  .replace(/--[^\r\n]*/g, ' ')
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/'(?:''|[^'])*'/g, "''")

function parseValuesTuples(block: string): string[][] {
  const tuples: string[][] = []
  const parseTuple = (source: string) => {
    const values: string[] = []
    let current = ''
    let inQuote = false
    let depth = 0
    for (let i = 0; i < source.length; i++) {
      const char = source[i]
      if (char === "'" && source[i + 1] === "'" && inQuote) { current += "''"; i++; continue }
      if (char === "'") { inQuote = !inQuote; current += char; continue }
      if (!inQuote && char === '(') depth++
      else if (!inQuote && char === ')') depth--
      if (char === ',' && !inQuote && depth === 0) { values.push(current.trim().replace(/^'|'$/g, '')); current = ''; continue }
      current += char
    }
    values.push(current.trim().replace(/^'|'$/g, ''))
    return values
  }
  let depth = 0
  let quote = false
  let start = -1
  for (let i = 0; i < block.length; i++) {
    if (block[i] === "'" && block[i + 1] === "'" && quote) { i++; continue }
    if (block[i] === "'") { quote = !quote; continue }
    if (quote) continue
    if (block[i] === '(') { if (depth === 0) start = i + 1; depth++ }
    else if (block[i] === ')') { depth--; if (depth === 0 && start >= 0) tuples.push(parseTuple(block.slice(start, i))) }
  }
  return tuples
}

function valuesCte(sql: string, cte: string, nextCte?: string): string {
  const end = nextCte ? `\\),\\s*${nextCte}` : '\\)'
  const match = sql.match(new RegExp(`${cte}\\s+as\\s+\\(values([\\s\\S]*?)${end}`, 'i'))
  assert(match, `generated dependency preflight declares ${cte}`)
  return match[1]
}

const code = stripCommentsAndStrings(migration)
const createdRelations = new Set([...code.matchAll(/create\s+table\s+if\s+not\s+exists\s+([a-z_][\w]*)\.([a-z_][\w]*)/gi)].map(m => `${m[1]}.${m[2]}`))
const sqlAliases = new Set([...code.matchAll(/\b(?:from|join)\s+[a-z_][\w]*\.[a-z_][\w]*\s+(?:as\s+)?([a-z_][\w]*)/gi)].map(m => m[1]))
const relationRefs = new Set([...code.matchAll(/\b(?:references|from|join|alter\s+table|insert\s+into|update|on)\s+(?:only\s+)?([a-z_][\w]*)\.([a-z_][\w]*)/gi)]
  .map(m => `${m[1]}.${m[2]}`).filter(name => !createdRelations.has(name) && !sqlAliases.has(name.split('.')[0])))
const relationTuples = parseValuesTuples(valuesCte(dependencySql, 'expected_relations\\(schema_name,relation_name\\)', 'expected_columns'))
const coveredRelations = new Set(relationTuples.map(([schema, relation]) => `${schema}.${relation}`))
assert.deepEqual([...relationRefs].sort(), [...coveredRelations].sort(), 'every external relation referenced by Retrieval is enumerated in the SQL dependency preflight')
const externalIndexTargets = [...code.matchAll(/create\s+(?:unique\s+)?index\s+[a-z_][\w]*\s+on\s+([a-z_][\w]*)\.([a-z_][\w]*)/gi)].map(m => `${m[1]}.${m[2]}`)
assert(externalIndexTargets.every(target => createdRelations.has(target)), 'all Retrieval indexes depend only on relations created by the same migration')
const schemaTuples = parseValuesTuples(valuesCte(dependencySql, 'expected_schemas\\(schema_name\\)', 'expected_relations'))
const externalSchemas = new Set([...relationRefs].map(name => name.split('.')[0]))
assert.deepEqual([...externalSchemas].sort(), schemaTuples.map(([schema]) => schema).sort(), 'all external relation schemas are checked')

const externalAliases = new Map<string, string>()
for (const m of code.matchAll(/\b(?:from|join)\s+([a-z_][\w]*)\.([a-z_][\w]*)\s+(?:as\s+)?([a-z_][\w]*)/gi)) {
  const relation = `${m[1]}.${m[2]}`
  if (relationRefs.has(relation)) externalAliases.set(m[3], relation)
}
const referencedExternalColumns = new Set<string>()
for (const m of code.matchAll(/\b([a-z_][\w]*)\.([a-z_][\w]*)\b/gi)) {
  const relation = externalAliases.get(m[1])
  if (relation) referencedExternalColumns.add(`${relation}.${m[2]}`)
}
for (const m of code.matchAll(/\breferences\s+([a-z_][\w]*)\.([a-z_][\w]*)\s*\(\s*([a-z_][\w]*)\s*\)/gi)) referencedExternalColumns.add(`${m[1]}.${m[2]}.${m[3]}`)
const alterSnapshot = code.match(/alter\s+table\s+public\.matching_diagnostic_snapshots([\s\S]*?);/i)?.[1]
assert(alterSnapshot, 'migration alters the expected diagnostic snapshot relation')
const addedColumns = [...alterSnapshot.matchAll(/add\s+column\s+if\s+not\s+exists\s+([a-z_][\w]*)\s+([a-z_][\w]*(?:\s+with\s+time\s+zone)?)/gi)].map(m => `public.matching_diagnostic_snapshots.${m[1]}`)
const checkedColumnsBlock = valuesCte(dependencySql, 'expected_columns\\(schema_name,relation_name,column_name,expected_type,addable\\)', 'expected_roles')
const checkedColumnTuples = parseValuesTuples(checkedColumnsBlock)
const coveredColumns = new Set(checkedColumnTuples.map(([schema, relation, column]) => `${schema}.${relation}.${column}`))
const allRequiredColumns = new Set([...referencedExternalColumns, ...addedColumns])
assert.deepEqual([...allRequiredColumns].sort(), [...coveredColumns].sort(), 'all referenced external columns and every ADD COLUMN IF NOT EXISTS target have type checks')

const customTypes = new Set([...code.matchAll(/\b([a-z_][\w]*)\.([a-z_][\w]*)\s*\(\s*(\d+)\s*\)/gi)].map(m => `${m[1]}.${m[2]}(${m[3]})`))
assert.deepEqual([...customTypes], ['public.vector(384)'], 'all schema-qualified typmod types are explicitly covered')
assert.match(dependencySql, /public\.vector\(384\)/i, 'preflight checks the real vector schema and dimension')
assert.match(dependencySql, /table \(ordinary or partitioned\).*case when relkind in \('r','p'\) then 'PASS' else 'FAIL' end/i, 'preflight rejects a view or other non-table object where migration alters/uses a table')

const createdFunctions = new Set([...code.matchAll(/create\s+or\s+replace\s+function\s+([a-z_][\w]*)\.([a-z_][\w]*)/gi)].map(m => `${m[1]}.${m[2]}`))
const qualifiedTypes = new Set([...customTypes].map(type => type.replace(/\(\d+\)$/, '')))
const allRelations = new Set([...createdRelations, ...relationRefs])
const externalFunctions = new Set([...code.matchAll(/\b([a-z_][\w]*)\.([a-z_][\w]*)\s*\(/gi)]
  .map(m => `${m[1]}.${m[2]}`).filter(name => !createdFunctions.has(name) && !allRelations.has(name) && !qualifiedTypes.has(name)))
const functionTuples = parseValuesTuples(valuesCte(dependencySql, 'expected_functions\\(schema_name,function_name,expected_signature,may_be_absent\\)', 'expected_constraints'))
const coveredFunctions = new Set(functionTuples.map(([schema, name]) => `${schema}.${name}`))
assert.deepEqual([...externalFunctions].sort(), [...coveredFunctions].filter(name => externalFunctions.has(name)).sort(), 'all external function calls have signature checks')
assert.ok(coveredFunctions.has('public.score_opportunity_embeddings') && coveredFunctions.has('public.prune_matching_retrieval_candidates'), 'migration-created RPC target signatures are checked for compatible pre-existing definitions')
assert.match(dependencySql, /score_opportunity_embeddings\(public\.vector,text\[\]\) returns table\(id text, similarity double precision\)/i, 'preflight checks the exact RPC input and result table signature')
assert.match(dependencySql, /pg_get_function_result\(p\.oid\)='TABLE\(id text, similarity double precision\)'/i, 'preflight rejects same-input RPCs with incompatible output columns/types')
assert.doesNotMatch(dependencySql, /overload_count=1\s+and\s+compatible_overloads=1/i, 'unrelated overloads do not become false blockers')

const roleNames = new Set<string>()
for (const line of migration.split(/\r?\n/)) {
  if (/^\s*(?:grant|revoke)\b/i.test(line)) {
    const segment = line.match(/\b(?:to|from)\s+([^;]+)/i)?.[1]
    for (const role of segment?.split(',') ?? []) if (role.trim().toLowerCase() !== 'public') roleNames.add(role.trim().toLowerCase())
  }
  if (/^\s*create\s+policy\b/i.test(line)) {
    const segment = line.match(/\bto\s+([a-z_][\w]*(?:\s*,\s*[a-z_][\w]*)*)\s+(?:using|with)\b/i)?.[1]
    for (const role of segment?.split(',') ?? []) roleNames.add(role.trim().toLowerCase())
  }
}
const roleTuples = parseValuesTuples(valuesCte(dependencySql, 'expected_roles\\(role_name\\)', 'expected_functions'))
const coveredRoles = new Set(roleTuples.map(([role]) => role))
assert.deepEqual([...roleNames].sort(), [...coveredRoles].sort(), 'all GRANT/REVOKE/policy roles are checked')

const droppedConstraint = code.match(/drop\s+constraint\s+if\s+exists\s+([a-z_][\w]*)/i)?.[1]
const constraintTuples = parseValuesTuples(valuesCte(dependencySql, 'expected_constraints\\(schema_name,relation_name,constraint_name\\)', 'schema_actual'))
assert.deepEqual(constraintTuples.map(([, , name]) => name), [droppedConstraint], 'every externally existing constraint changed by the migration is reported')
assert.match(code, /<=>/, 'migration uses vector distance operator')
assert.match(dependencySql, /OPERATOR public\.<=> \(public\.vector,public\.vector\)/, 'preflight verifies the exact vector operator dependency')
assert.match(generator, /pg_catalog\.format_type\(a\.atttypid,a\.atttypmod\)/, 'PostgreSQL format_type is the authority for actual vector typmods')
assert.doesNotMatch(generator, /atttypmod\s*-\s*4/i, 'vector typmods are never manually decoded')
assert.match(generator, /actual_type_schema='public'\s+and actual_base_type='vector'/i, 'embedding schema and base type are compared semantically')
assert.match(generator, /actual_type\s*~\s*'\^\(public\\\\\.\)\?vector\\\\\(384\\\\\)\$'/i, 'embedding accepts either format_type representation while requiring dimension 384')
const vectorTypeMatches = (schema: string, baseType: string, formatType: string) =>
  schema === 'public' && baseType === 'vector' && /^(public\.)?vector\(384\)$/.test(formatType)
assert.equal(vectorTypeMatches('public', 'vector', 'vector(384)'), true, 'unqualified format_type is accepted with matching catalog schema/type/dimension')
assert.equal(vectorTypeMatches('public', 'vector', 'public.vector(384)'), true, 'qualified format_type is accepted with matching catalog schema/type/dimension')
assert.equal(vectorTypeMatches('extensions', 'vector', 'vector(384)'), false, 'wrong schema is rejected even when formatted type is unqualified')
assert.equal(vectorTypeMatches('public', 'vector', 'public.vector(380)'), false, 'wrong vector dimension is rejected')
assert.match(dependencySql, /vector distance operator returning double precision[\s\S]*result_type='double precision'/i, 'preflight expects the operator actual return type')
assert.doesNotMatch(dependencySql, /result_type='real'/i, 'preflight does not assert the incorrect real return type')

assert.match(migration, /query_embedding\s+public\.vector\(384\)/i)
assert.doesNotMatch(migration, /extensions\.vector/i)
assert.match(migration, /set\s+search_path\s*=\s*public\s+as\s+\$\$/i)
assert.match(migration, /revoke\s+all\s+on\s+function\s+public\.score_opportunity_embeddings\(public\.vector,\s*text\[\]\)/i)
assert.match(migration, /grant\s+execute\s+on\s+function\s+public\.score_opportunity_embeddings\(public\.vector,\s*text\[\]\)/i)
assert.match(generator, /public\.score_opportunity_embeddings\(public\.vector,text\[\]\)/i)
assert.match(finalVerifier, /public\.score_opportunity_embeddings\(public\.vector,text\[\]\)/i)
assert.match(retrievalArtifact, /query_embedding\s+public\.vector\(384\)/i)
assert.match(generator, /writeFileSync\(resolve\(out, 'preflight-retrieval-prod-dependencies\.sql'\)/)
assert.equal(retrievalArtifact, `-- STAGE D: apply only after Opportunity Universe full reconciliation and post-reconciliation checks pass.\n-- Additive local Retrieval schema. Do not execute without separate approval.\n${migration}`, 'generated Retrieval artifact exactly embeds the migration authority')
assert.match(universePreflight, /public\.score_opportunity_embeddings\(public\.vector,text\[\]\)/i)
for (const [name, sql] of [['migration', migration], ['generator', generator], ['Retrieval artifact', retrievalArtifact], ['final verifier', finalVerifier], ['universe preflight', universePreflight], ['dependency preflight', dependencySql]] as const) {
  assert.doesNotMatch(sql, /extensions\.vector/i, `${name} has no active extensions.vector contract`)
}

function readOnlyStatementCount(sql: string): number {
  let count = 0
  let quote = false
  let lineComment = false
  let blockComment = false
  for (let i = 0; i < sql.length; i++) {
    if (lineComment) { if (sql[i] === '\n') lineComment = false; continue }
    if (blockComment) { if (sql.startsWith('*/', i)) { blockComment = false; i++ } continue }
    if (quote) { if (sql[i] === "'" && sql[i + 1] === "'") { i++; continue } if (sql[i] === "'") quote = false; continue }
    if (sql.startsWith('--', i)) { lineComment = true; i++; continue }
    if (sql.startsWith('/*', i)) { blockComment = true; i++; continue }
    if (sql[i] === "'") { quote = true; continue }
    if (sql[i] === ';') count++
  }
  return count
}
const preflightCode = stripCommentsAndStrings(dependencySql)
assert.equal(readOnlyStatementCount(dependencySql), 1, 'dependency preflight contains exactly one statement')
assert.match(preflightCode, /^\s*with\b/i, 'dependency preflight is one CTE-backed SELECT')
assert.match(preflightCode, /\bselect\s+jsonb_build_object/i, 'dependency preflight returns one JSON object')
assert.doesNotMatch(preflightCode, /\b(?:insert|update|delete|upsert|merge|create|alter|drop|truncate|call|do|execute)\b/i, 'dependency preflight is catalog-only and has no mutation or dynamic execution')
let parenDepth = 0
for (const char of preflightCode) {
  if (char === '(') parenDepth++
  else if (char === ')') { parenDepth--; assert(parenDepth >= 0, 'preflight parentheses never close before opening') }
}
assert.equal(parenDepth, 0, 'preflight parentheses are balanced outside comments and literals')
for (const catalog of ['pg_namespace','pg_extension','pg_type','pg_attribute','pg_class','pg_proc','pg_operator','pg_constraint','pg_roles']) assert(dependencySql.includes(catalog), `preflight reads ${catalog} catalog metadata`)
for (const status of ['PASS','FAIL','ABSENT_OK']) assert(dependencySql.includes(`'${status}'`), `preflight models ${status} dependencies`)
assert.match(dependencySql, /'SAFE_TO_COMPILE',count\(\*\) filter\(where status='FAIL'\)=0/i)
console.log(`verify_matching_retrieval_prod_dependencies: PASS relations=${coveredRelations.size} columns=${coveredColumns.size} functions=${coveredFunctions.size} roles=${coveredRoles.size} type=public.vector(384) read_only=1 statement`)
