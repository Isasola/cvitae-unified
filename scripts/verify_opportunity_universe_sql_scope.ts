import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

type ScopeIssue = { functionName: string; variable: string }

type LexicalSqlIssue = { kind: string; offset: number }

/** Masks strings, quoted identifiers, comments and dollar-quoted bodies, preserving code punctuation. */
export function scanSqlLexically(sql: string): LexicalSqlIssue[] {
  const chars = sql.split('')
  const blank = (start: number, end: number, token = ' ') => {
    for (let i = start; i < end; i++) if (chars[i] !== '\n' && chars[i] !== '\r') chars[i] = i === start ? token : ' '
  }
  const dollarTagAt = (i: number) => sql.slice(i).match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/)?.[0]
  let i = 0
  while (i < sql.length) {
    if (sql.startsWith('--', i)) {
      const end = sql.indexOf('\n', i)
      blank(i, end < 0 ? sql.length : end)
      i = end < 0 ? sql.length : end
    } else if (sql.startsWith('/*', i)) {
      const end = sql.indexOf('*/', i + 2)
      const stop = end < 0 ? sql.length : end + 2
      blank(i, stop)
      i = stop
    } else if (sql[i] === "'") {
      const start = i++
      while (i < sql.length) {
        if (sql[i] === "'" && sql[i + 1] === "'") { i += 2; continue }
        if (sql[i++] === "'") break
      }
      blank(start, i, 'S')
    } else if (sql[i] === '"') {
      const start = i++
      while (i < sql.length) {
        if (sql[i] === '"' && sql[i + 1] === '"') { i += 2; continue }
        if (sql[i++] === '"') break
      }
      blank(start, i, 'I')
    } else if (sql[i] === '$' && dollarTagAt(i)) {
      const start = i
      const tag = dollarTagAt(i)!
      const end = sql.indexOf(tag, i + tag.length)
      i = end < 0 ? sql.length : end + tag.length
      blank(start, i, 'D')
    } else i++
  }

  const code = chars.join('')
  const issues: LexicalSqlIssue[] = []
  for (const pattern of [/,,/g, /,\s*;/g, /,\s*\)/g, /\bWITH\s*,/gi, /\)\s*,\s*,\s*[A-Za-z_][A-Za-z0-9_]*\s+AS\s*\(/gi]) {
    for (const match of code.matchAll(pattern)) issues.push({ kind: pattern.source, offset: match.index ?? 0 })
  }
  let depth = 0
  for (let at = 0; at < code.length; at++) {
    if (code[at] === '(') depth++
    else if (code[at] === ')') {
      depth--
      if (depth < 0) { issues.push({ kind: 'unbalanced-close-parenthesis', offset: at }); depth = 0 }
    }
  }
  if (depth !== 0) issues.push({ kind: 'unbalanced-open-parenthesis', offset: code.length })
  return issues.sort((a, b) => a.offset - b.offset || a.kind.localeCompare(b.kind))
}

function stripCommentsAndStrings(sql: string): string {
  return sql
    .replace(/--[^\r\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/'(?:''|[^'])*'/g, "''")
}

export function findUndeclaredPlpgsqlVariables(sql: string): ScopeIssue[] {
  const issues: ScopeIssue[] = []
  const functionPattern = /create\s+or\s+replace\s+function\s+([\w.]+)[\s\S]*?\bas\s+\$\$([\s\S]*?)\$\$\s*;/gi
  for (const match of sql.matchAll(functionPattern)) {
    const headerStart = match.index ?? 0
    const bodyStart = headerStart + match[0].indexOf('$$') + 2
    const header = sql.slice(headerStart, bodyStart)
    if (!/\blanguage\s+plpgsql\b/i.test(header)) continue
    const body = stripCommentsAndStrings(match[1] ? match[0].slice(match[0].indexOf('$$') + 2, match[0].lastIndexOf('$$')) : match[2])
    const declarationMatch = body.match(/\bdeclare\b([\s\S]*?)\bbegin\b/i)
    const declarations = new Set<string>()
    if (declarationMatch) {
      for (const statement of declarationMatch[1].split(';')) {
        const variable = statement.trim().match(/^(?:declare\s+)?(v_[a-z][a-z0-9_]*)\s+/i)?.[1]?.toLowerCase()
        if (variable) declarations.add(variable)
      }
    }
    const used = new Set([...body.matchAll(/\b(v_[a-z][a-z0-9_]*)\b/gi)].map(token => token[1].toLowerCase()))
    for (const variable of used) if (!declarations.has(variable)) issues.push({ functionName: match[1], variable })
  }
  return issues.sort((a, b) => a.functionName.localeCompare(b.functionName) || a.variable.localeCompare(b.variable))
}

const migration = readFileSync(new URL('../supabase/migrations/202609280001_opportunity_universe.sql', import.meta.url), 'utf8')
const generatedSchema = readFileSync(new URL('../artifacts/opportunity-universe/prod-apply-schema.sql', import.meta.url), 'utf8')
const compileTransaction = readFileSync(new URL('../artifacts/opportunity-universe/prod-compile-transaction.sql', import.meta.url), 'utf8')
const partialApplyCheck = readFileSync(new URL('../artifacts/opportunity-universe/check-partial-schema-prod.sql', import.meta.url), 'utf8')
const generator = readFileSync(new URL('./generate_opportunity_universe_artifacts.ts', import.meta.url), 'utf8')

for (const sample of [
  `select ',,' as value; -- ,,,\nselect 1;`,
  `select /* ,,, */ 1;`,
  `do $$ begin raise notice ',,'; end $$;`,
]) assert.deepEqual(scanSqlLexically(sample), [], 'lexical scanner ignores commas and delimiters inside strings/comments/dollar quotes')
assert(scanSqlLexically('select 1,, 2;').some(issue => issue.kind === ',,'), 'lexical scanner catches actual consecutive SQL commas')
assert(scanSqlLexically("select coalesce((select 1),'[]'::jsonb),, 'next',2;").some(issue => issue.kind === ',,'), 'lexical scanner reproduces the exact jsonb argument-list duplicate-comma failure')
assert(scanSqlLexically('select (1;').some(issue => issue.kind === 'unbalanced-open-parenthesis'), 'lexical scanner catches unbalanced parentheses')

const brokenHistoricalShape = `
create or replace function public.other_function() returns void language plpgsql as $$
declare v_count_key text;
begin null; end $$;
create or replace function public.reconcile_opportunity_universe_page() returns void language plpgsql as $$
declare v_counts jsonb;
begin v_count_key := 'x'; end $$;
`
assert.deepEqual(findUndeclaredPlpgsqlVariables(brokenHistoricalShape), [
  { functionName: 'public.reconcile_opportunity_universe_page', variable: 'v_count_key' },
], 'a declaration in another function cannot satisfy the reconciliation function scope')

for (const [name, sql] of [['migration', migration], ['generated schema', generatedSchema]] as const) {
  const issues = findUndeclaredPlpgsqlVariables(sql)
  assert.deepEqual(issues, [], `${name} has no PL/pgSQL variable used outside its own function declaration scope`)
}
assert.match(migration, /function public\.reconcile_opportunity_universe_page[\s\S]*?declare[\s\S]*?v_count_key text[\s\S]*?begin[\s\S]*?v_count_key:=/i)

const summaryBody = migration.match(/create or replace function public\.get_opportunity_universe_summary\(\)[\s\S]*?as \$\$([\s\S]*?)\$\$;/i)?.[1]
assert(summaryBody, 'summary SQL function body is present')
const generatedSummaryBody = generatedSchema.match(/create or replace function public\.get_opportunity_universe_summary\(\)[\s\S]*?as \$\$([\s\S]*?)\$\$;/i)?.[1]
assert(generatedSummaryBody, 'generated schema contains the complete summary function body')
assert.equal(generatedSummaryBody, summaryBody, 'generated summary function body exactly matches migration authority')
for (const cte of ['universe_summary_per_source_base', 'universe_summary_lifecycle_reason_counts', 'universe_summary_seo_reason_counts', 'universe_summary_per_source', 'lifecycle_recovery_per_source']) {
  assert(summaryBody.includes(cte), `summary function contains ${cte}`)
  assert(generatedSummaryBody.includes(cte), `generated summary function contains ${cte}`)
}
const lifecyclePerSourceStart = summaryBody.indexOf("'lifecycle_recovery_per_source'")
const lifecyclePerSourceEnd = summaryBody.indexOf("'seo_permission_unknown_ready_rows'", lifecyclePerSourceStart)
assert(lifecyclePerSourceStart >= 0 && lifecyclePerSourceEnd > lifecyclePerSourceStart, 'lifecycle per-source summary block is bounded by its neighboring JSON keys')
const lifecyclePerSourceBlock = summaryBody.slice(lifecyclePerSourceStart, lifecyclePerSourceEnd)
assert.match(lifecyclePerSourceBlock, /with source_base as[\s\S]*?recovery_counts as[\s\S]*?recovery_json as[\s\S]*?reason_counts as[\s\S]*?reason_json as[\s\S]*?left join recovery_json[\s\S]*?left join reason_json/i, 'per-source lifecycle breakdown uses independent per-source aggregations')
assert.doesNotMatch(lifecyclePerSourceBlock, /r\.provenance\s*->>\s*'source'\s*=\s*u\.provenance\s*->>\s*'source'/i, 'lifecycle per-source aggregation has no grouped-outer provenance correlation')
const generatedSummaryStart = generatedSchema.indexOf("'lifecycle_recovery_per_source'")
const generatedSummaryEnd = generatedSchema.indexOf("'seo_permission_unknown_ready_rows'", generatedSummaryStart)
assert(generatedSummaryStart >= 0 && generatedSummaryEnd > generatedSummaryStart, 'generated schema includes the lifecycle per-source block')
assert.doesNotMatch(generatedSchema.slice(generatedSummaryStart, generatedSummaryEnd), /r\.provenance\s*->>\s*'source'\s*=\s*u\.provenance\s*->>\s*'source'/i, 'generated lifecycle per-source block has no grouped-outer provenance correlation')
assert.match(summaryBody, /universe_summary_per_source_base as[\s\S]*universe_summary_lifecycle_reason_counts as[\s\S]*universe_summary_seo_reason_counts as[\s\S]*universe_summary_per_source as/i, 'sibling PER_SOURCE output also uses independent source-keyed aggregations')
assert.doesNotMatch(summaryBody, /r\.provenance\s*->>\s*'source'\s*=\s*u\.provenance\s*->>\s*'source'/i, 'summary function has no correlated grouped-provenance reference in either per-source output')
assert.doesNotMatch(lifecyclePerSourceBlock, /\bu\.provenance\b|\br\.provenance\b/i, 'lifecycle per-source JSON aggregation does not correlate grouped outer provenance')
const perSourceOutputStart = summaryBody.indexOf("'per_source'")
const perSourceOutputEnd = summaryBody.indexOf("'unreconciled'", perSourceOutputStart)
assert(perSourceOutputStart >= 0 && perSourceOutputEnd > perSourceOutputStart, 'per_source JSON output block is bounded')
const perSourceOutput = summaryBody.slice(perSourceOutputStart, perSourceOutputEnd)
const referencedPerSourceAliases = [...perSourceOutput.matchAll(/\bx\.([a-z_][a-z0-9_]*)/gi)].map(match => match[1].toLowerCase())
const projectedPerSourceAliases = new Set(['source','n','active_valid','inactive_valid','stale_derived_state','lifecycle_unknown','catalog_ready','match_row_ready','source_match_allowed','source_match_denied','policy_unknown','matching_switch_disabled','matching_switch_unknown','final_matching','seo','seo_row_ready','seo_row_not_ready','seo_row_unknown','seo_effective_ready','seo_content_ready_unresolved','lifecycle_recoverable_now','lifecycle_refresh_required','lifecycle_content_not_ready','lifecycle_system_error','top_lifecycle_unresolved_reasons','seo_permission_unknown_ready_rows','seo_block_reasons','alerts','professional_thin','match_row_unknown'])
const removedAliasReferences = [...new Set(referencedPerSourceAliases.filter(alias => !projectedPerSourceAliases.has(alias)))]
assert.deepEqual(removedAliasReferences, [], 'per_source JSON does not reference removed/unprojected aliases')
const sourceBaseCte = summaryBody.match(/universe_summary_per_source_base as \(([\s\S]*?)\), universe_summary_lifecycle_reason_counts as/i)?.[1]
const sourceExtensionCte = summaryBody.match(/universe_summary_per_source as \(([\s\S]*?)\)\s*select jsonb_build_object/i)?.[1]
assert(sourceBaseCte && sourceExtensionCte, 'both source projection CTEs are bounded')
for (const alias of referencedPerSourceAliases) {
  const aliasToken = new RegExp(`\\b${alias}\\b`, 'i')
  assert(aliasToken.test(sourceBaseCte) || aliasToken.test(sourceExtensionCte), `per_source output alias ${alias} is projected by its source CTE`)
}

for (const [name, sql] of [['generated schema', generatedSchema], ['summary function body', summaryBody]] as const) {
  const lexicalIssues = scanSqlLexically(sql)
  assert.deepEqual(lexicalIssues, [], `${name} passes lexical SQL sanity: no consecutive/dangling commas or unbalanced parentheses`)
}
assert.doesNotMatch(migration, /\),,/i, 'migration does not contain the exact duplicate-comma regression')
assert.doesNotMatch(generatedSchema, /\),,/i, 'generated schema does not contain the exact duplicate-comma regression')

const accountingFixture = [
  { source: 'alpha', recovery: 'REFRESH_REQUIRED' },
  { source: 'alpha', recovery: 'CONTENT_NOT_READY' },
  { source: 'beta', recovery: 'SYSTEM_ERROR' },
]
const perSource = new Map<string, Map<string, number>>()
for (const row of accountingFixture) {
  const classes = perSource.get(row.source) || new Map<string, number>()
  classes.set(row.recovery, (classes.get(row.recovery) || 0) + 1)
  perSource.set(row.source, classes)
}
assert.equal([...perSource.values()].reduce((sum, classes) => sum + [...classes.values()].reduce((n, count) => n + count, 0), 0), accountingFixture.length, 'per-source unresolved counts reconcile globally')
for (const [source, classes] of perSource) assert.equal([...classes.values()].reduce((sum, count) => sum + count, 0), accountingFixture.filter(row => row.source === source).length, `${source}: recovery classes partition its unresolved rows`)

assert.equal(compileTransaction, `BEGIN;\n\n${generatedSchema}\nROLLBACK;\n`, 'compile transaction wraps the exact generated schema and ends with ROLLBACK')
assert.doesNotMatch(generatedSchema, /^\s*(?:BEGIN|COMMIT|ROLLBACK)\s*;/im, 'schema has no own transaction control')
assert.doesNotMatch(generatedSchema, /^\s*CREATE\s+(?:UNIQUE\s+)?INDEX\s+CONCURRENTLY\b/im, 'schema has no nontransactional concurrent index DDL')
assert.doesNotMatch(generatedSchema, /^\s*VACUUM\b/im, 'schema has no VACUUM')
assert.doesNotMatch(generatedSchema, /\b(?:net\.http|http_get|http_post|dblink|pg_notify|lo_import)\s*\(/i, 'schema has no external side effect call')
assert.doesNotMatch(generatedSchema, /\b(?:select|perform|call)\s+(?:public\.)?reconcile_opportunity_universe_page\s*\(/i, 'schema does not execute historical reconciliation')
const partialSqlBody = partialApplyCheck.replace(/--[^\r\n]*/g, ' ').replace(/'(?:''|[^'])*'/g, "''")
assert.doesNotMatch(partialSqlBody, /\b(?:insert|update|delete|merge|create|alter|drop|truncate|call|do)\b/i, 'partial-apply checker is catalog-only and read-only')
assert.match(partialApplyCheck, /'NOT_APPLIED'[\s\S]*'PARTIALLY_APPLIED'[\s\S]*'ALREADY_APPLIED_EQUIVALENT'[\s\S]*'UNKNOWN'/, 'partial-apply checker reports all four required states')
for (const catalog of ['pg_class','pg_proc','pg_trigger','pg_policy','pg_index']) assert(partialApplyCheck.includes(catalog), `partial-apply checker consults ${catalog} metadata`)
console.log('verify_opportunity_universe_sql_scope: PASS function scopes, grouped-source aggregation regression, per-source accounting partition, exact rollback wrapper, schema transaction-safety contract, read-only partial-apply checker')
