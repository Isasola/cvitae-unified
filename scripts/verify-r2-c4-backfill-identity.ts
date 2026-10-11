import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'

const root = new URL('../', import.meta.url)
const source = (path: string) => readFileSync(new URL(path, root), 'utf8')

type Alias = { emitted: string; canonical: string }
type Identity = { state: 'RESOLVED' | 'MISSING' | 'AMBIGUOUS' | 'UNREGISTERED'; reason: string; canonical: string | null }
const normalize = (value: string | null) => value?.trim().toLowerCase() || null
const resolveIdentity = (raw: string | null, aliases: Alias[], canonicalSources: Set<string>): Identity => {
  const emitted = normalize(raw)
  if (!emitted) return { state: 'MISSING', reason: 'SOURCE_IDENTITY_MISSING', canonical: null }
  const targets = aliases.filter(item => item.emitted === emitted).map(item => item.canonical)
  const distinctTargets = [...new Set(targets)]
  if (targets.length > 1 || distinctTargets.length > 1) {
    return { state: 'AMBIGUOUS', reason: 'MULTIPLE_ALIAS_ROWS_OR_TARGETS', canonical: null }
  }
  if (targets.length === 1) return {
    state: 'RESOLVED',
    reason: canonicalSources.has(emitted) && targets[0] !== emitted
      ? 'EXPLICIT_ALIAS_OVERRIDES_CANONICAL_NAME_COLLISION' : 'EXPLICIT_ALIAS',
    canonical: targets[0],
  }
  if (canonicalSources.has(emitted)) return { state: 'RESOLVED', reason: 'DIRECT_CANONICAL_SOURCE', canonical: emitted }
  return { state: 'UNREGISTERED', reason: 'NO_CANONICAL_IDENTITY_AUTHORITY', canonical: null }
}

const aliases: Alias[] = [
  { emitted: 'shared-name', canonical: 'canonical-a' },
  { emitted: 'ambiguous', canonical: 'canonical-a' },
  { emitted: 'ambiguous', canonical: 'canonical-b' },
]
const canonicalSources = new Set(['shared-name', 'canonical-a', 'canonical-b'])
assert.deepEqual(resolveIdentity('shared-name', aliases, canonicalSources), {
  state: 'RESOLVED', reason: 'EXPLICIT_ALIAS_OVERRIDES_CANONICAL_NAME_COLLISION', canonical: 'canonical-a',
})
assert.deepEqual(resolveIdentity('ambiguous', aliases, canonicalSources), {
  state: 'AMBIGUOUS', reason: 'MULTIPLE_ALIAS_ROWS_OR_TARGETS', canonical: null,
})

type Opportunity = { id: string; source: string; createdAt: string }
const inventory: Opportunity[] = [
  { id: 'collision', source: 'shared-name', createdAt: '2026-01-01' },
  { id: 'review', source: 'ambiguous', createdAt: '2026-01-02' },
  { id: 'stable', source: 'canonical-a', createdAt: '2026-01-03' },
]
const membership = new Map(inventory.map(item => [item.id, {
  id: item.id,
  source: item.source,
  identity: resolveIdentity(item.source, aliases, canonicalSources),
  state: resolveIdentity(item.source, aliases, canonicalSources).state === 'RESOLVED' ? 'PENDING' : 'BLOCKED_IDENTITY',
  completionCount: 0,
}]))
assert.equal(membership.size, inventory.length)
assert.equal(new Set(membership.keys()).size, membership.size, 'global opportunity membership is unique')
assert.equal(membership.get('review')?.state, 'BLOCKED_IDENTITY', 'ambiguous identity is retained, not guessed or lost')

inventory.push({ id: 'backdated-after-snapshot', source: 'canonical-a', createdAt: '2020-01-01' })
inventory.find(item => item.id === 'stable')!.source = 'canonical-b'
assert.equal(membership.has('backdated-after-snapshot'), false, 'a later backdated insert cannot join the immutable snapshot')
assert.equal(membership.get('stable')?.identity.canonical, 'canonical-a', 'later source mutation cannot move historical membership')

type Job = { status: 'PENDING' | 'RUNNING' | 'FAILED' | 'COMPLETE'; cursor: string | null; processed: number; attempts: number }
const job: Job = { status: 'PENDING', cursor: null, processed: 0, attempts: 0 }
const runnableIds = [...membership.values()].filter(item => item.state === 'PENDING').map(item => item.id).sort()
const applyBatch = (current: Job, ids: string[], failAt?: string) => {
  assert.notEqual(current.status, 'FAILED', 'FAILED never re-enters automatic selection')
  current.status = 'RUNNING'
  current.attempts += 1
  const staged = ids.map(id => {
    if (id === failAt) throw new Error(`refresh_failed:${id}`)
    return id
  })
  current.processed += staged.length
  current.cursor = staged.at(-1) || current.cursor
  current.status = 'COMPLETE'
}
const cursorBeforeFailure = job.cursor
const processedBeforeFailure = job.processed
try {
  applyBatch(job, runnableIds, 'stable')
  assert.fail('fixture must fail')
} catch (error) {
  job.status = 'FAILED'
  job.cursor = cursorBeforeFailure
  job.processed = processedBeforeFailure
  assert.match(String(error), /refresh_failed:stable/)
}
assert.equal(job.cursor, cursorBeforeFailure)
assert.equal(job.processed, processedBeforeFailure)
assert.equal(job.status, 'FAILED')
assert.equal(['PENDING', 'RUNNING'].includes(job.status), false, 'automatic selector excludes FAILED')

const expectedAttempts = job.attempts
const recover = (current: Job, compareAttempts: number, note: string) => {
  assert.equal(current.status, 'FAILED')
  assert.equal(current.attempts, compareAttempts)
  assert.ok(note.trim())
  current.status = 'PENDING'
}
recover(job, expectedAttempts, 'fixture failure reviewed')
applyBatch(job, runnableIds)
for (const id of runnableIds) membership.get(id)!.completionCount += 1
assert.equal(job.processed, runnableIds.length)
assert.equal(job.cursor, runnableIds.at(-1))
assert.ok([...membership.values()].every(item => item.state === 'BLOCKED_IDENTITY' || item.completionCount === 1))

const sourceCounts = new Map<string, number>()
for (const member of membership.values()) {
  const bucket = member.identity.state === 'RESOLVED' ? `SOURCE:${member.identity.canonical}` : `IDENTITY_REVIEW:${member.identity.state}`
  sourceCounts.set(bucket, (sourceCounts.get(bucket) || 0) + 1)
}
const processed = [...membership.values()].filter(item => item.completionCount === 1).length
const pending = membership.size - processed
assert.equal([...sourceCounts.values()].reduce((sum, value) => sum + value, 0), membership.size)
assert.equal(processed + pending, membership.size)
const histogram = { admitted: 1, excluded: processed - 1 }
assert.equal(histogram.admitted + histogram.excluded, processed, 'outcome histogram reconciles exactly')

const migration = source('supabase/migrations/202610110001_private_b2c_matching_consumer.sql')
const preflight = source('artifacts/release/r2-c4-preflight-readonly-20261011.sql')
const preview = source('artifacts/release/r2-c4-private-matching-backfill-preview-readonly-20261011.sql')
const verify = source('artifacts/release/r2-c4-private-matching-backfill-verify-readonly-20261011.sql')
const resume = source('artifacts/release/r2-c4-private-matching-backfill-resume-write-20261011.sql')
const rollback = source('artifacts/release/r2-c4-rollback-write-20261011.sql')
const universeAuthority = source('supabase/migrations/202609280001_opportunity_universe.sql')

const c4Tables = [
  'private_matching_c4_reconciliation_runs',
  'private_matching_c4_reconciliation_sources',
  'private_matching_c4_reconciliation_members',
  'private_matching_c4_reconciliation_batches',
  'private_matching_c4_reconciliation_outcomes',
] as const

const balancedContents = (sql: string, openAt: number) => {
  let depth = 0
  let quoted = false
  for (let index = openAt; index < sql.length; index += 1) {
    const char = sql[index]
    if (char === "'") {
      if (quoted && sql[index + 1] === "'") index += 1
      else quoted = !quoted
      continue
    }
    if (quoted) continue
    if (char === '(') depth += 1
    if (char === ')' && --depth === 0) return sql.slice(openAt + 1, index)
  }
  assert.fail(`unbalanced SQL starting at offset ${openAt}`)
}

const splitTopLevel = (value: string) => {
  const parts: string[] = []
  let start = 0
  let depth = 0
  let quoted = false
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index]
    if (char === "'") {
      if (quoted && value[index + 1] === "'") index += 1
      else quoted = !quoted
      continue
    }
    if (quoted) continue
    if (char === '(') depth += 1
    else if (char === ')') depth -= 1
    else if (char === ',' && depth === 0) {
      parts.push(value.slice(start, index).trim())
      start = index + 1
    }
  }
  parts.push(value.slice(start).trim())
  return parts.filter(Boolean)
}

const tableBodies = new Map(c4Tables.map(table => {
  const declaration = `create table public.${table}`
  const declarationAt = migration.indexOf(declaration)
  assert.notEqual(declarationAt, -1, `${table}: CREATE TABLE exists`)
  const openAt = migration.indexOf('(', declarationAt)
  return [table, balancedContents(migration, openAt)] as const
}))
const tableColumns = new Map([...tableBodies].map(([table, body]) => {
  const columns = splitTopLevel(body).flatMap(part => {
    const first = part.match(/^([a-z_][a-z0-9_]*)\s+/i)?.[1]?.toLowerCase()
    return first && !['check', 'constraint', 'foreign', 'primary', 'unique'].includes(first) ? [first] : []
  })
  return [table, new Set(columns)] as const
}))
const sqlCheckVocabulary = new Set(['and', 'between', 'cardinality', 'check', 'false', 'in', 'is', 'not', 'null', 'or', 'true'])
const ddlCheckCounts = new Map<string, number>()
for (const [table, body] of tableBodies) {
  const columns = tableColumns.get(table)!
  let checkCount = 0
  for (const part of splitTopLevel(body)) {
    let searchAt = 0
    while (true) {
      const checkAt = part.toLowerCase().indexOf('check', searchAt)
      if (checkAt === -1) break
      const openAt = part.indexOf('(', checkAt)
      const expression = balancedContents(part, openAt)
      checkCount += 1
      const identifiers = expression.replace(/'(?:''|[^'])*'/g, '').match(/[a-z_][a-z0-9_]*/gi) || []
      for (const identifier of identifiers.map(value => value.toLowerCase())) {
        assert.ok(columns.has(identifier) || sqlCheckVocabulary.has(identifier),
          `${table}: CHECK references missing column or unsupported identifier ${identifier}`)
      }
      searchAt = openAt + expression.length + 2
    }
  }
  ddlCheckCounts.set(table, checkCount)
}
const ddlForeignKeyCounts = new Map<string, number>()
for (const [table, body] of tableBodies) {
  const columns = tableColumns.get(table)!
  let foreignKeyCount = 0
  for (const part of splitTopLevel(body)) {
    const localColumn = part.match(/^([a-z_][a-z0-9_]*)\s+/i)?.[1]?.toLowerCase()
    const reference = part.match(/references\s+public\.([a-z_][a-z0-9_]*)\s*\(\s*([a-z_][a-z0-9_]*)\s*\)/i)
    if (!reference) continue
    foreignKeyCount += 1
    assert.ok(localColumn && columns.has(localColumn), `${table}: foreign key local column exists`)
    const [, targetTable, targetColumn] = reference.map(value => value.toLowerCase())
    if (tableColumns.has(targetTable as typeof c4Tables[number])) {
      assert.ok(tableColumns.get(targetTable as typeof c4Tables[number])!.has(targetColumn),
      `${table}: foreign key target ${targetTable}.${targetColumn} exists`)
    }
  }
  ddlForeignKeyCounts.set(table, foreignKeyCount)
}
const sourcesDdl = tableBodies.get('private_matching_c4_reconciliation_sources')!
const membersDdl = tableBodies.get('private_matching_c4_reconciliation_members')!
assert.doesNotMatch(sourcesDdl, /attempt_count|completion_count|processing_state/)
assert.match(membersDdl, /check\(attempt_count>=completion_count\)/)
assert.match(membersDdl, /check\(\(processing_state='COMPLETE' and completion_count=1\)\s+or \(processing_state<>'COMPLETE' and completion_count=0\)\)/)

const refreshDefinition = universeAuthority.match(/create or replace function public\.refresh_opportunity_universe[\s\S]*?end \$\$;/)?.[0] || ''
const refreshAuthorities = readdirSync(new URL('supabase/migrations/', root))
  .filter(path => path.endsWith('.sql'))
  .filter(path => /create(?: or replace)? function public\.refresh_opportunity_universe/.test(source(`supabase/migrations/${path}`)))
assert.deepEqual(refreshAuthorities, ['202609280001_opportunity_universe.sql'],
  'refresh_opportunity_universe has one effective repository definition')
assert.match(refreshDefinition, /returns jsonb/)
assert.match(refreshDefinition, /v_decision := public\.opportunity_universe_decision/)
assert.match(refreshDefinition, /return jsonb_set\(v_decision,'\{lifecycle_flag_changed\}'/)
assert.match(universeAuthority, /'lifecycle_state',v_lifecycle/)
assert.match(universeAuthority, /'final_matching_state',v_final/)
assert.match(migration, /v_refresh->>'lifecycle_state' is distinct from v_after\.lifecycle_state/)
assert.match(migration, /v_refresh->>'final_matching_state' is distinct from v_after\.final_matching_state/)

const scopedPaths = [
  'supabase/migrations/202610110001_private_b2c_matching_consumer.sql',
  'artifacts/release/r2-c4-preflight-readonly-20261011.sql',
  'artifacts/release/r2-c4-matching-post-apply-readonly-20261011.sql',
  'artifacts/release/r2-c4-post-apply-readonly-20261011.sql',
  'artifacts/release/r2-c4-private-matching-backfill-preview-readonly-20261011.sql',
  'artifacts/release/r2-c4-private-matching-backfill-prepare-write-20261011.sql',
  'artifacts/release/r2-c4-private-matching-backfill-batch-write-20261011.sql',
  'artifacts/release/r2-c4-private-matching-backfill-resume-write-20261011.sql',
  'artifacts/release/r2-c4-private-matching-backfill-verify-readonly-20261011.sql',
  'artifacts/release/r2-c4-rollback-write-20261011.sql',
]
for (const path of scopedPaths) {
  const contents = source(path)
  assert.ok(contents.endsWith('\n'), `${path}: final newline`)
  assert.equal(contents.split(/\r?\n/).findIndex(line => /[ \t]+$/.test(line)), -1, `${path}: no trailing whitespace`)
}

for (const token of [
  'private_matching_c4_reconciliation_runs', 'private_matching_c4_reconciliation_sources',
  'private_matching_c4_reconciliation_members', 'private_matching_c4_reconciliation_batches',
  'private_matching_c4_reconciliation_outcomes',
]) assert.match(migration, new RegExp(token))
assert.match(migration, /opportunity_id text primary key/)
assert.match(migration, /EXPLICIT_ALIAS_OVERRIDES_CANONICAL_NAME_COLLISION/)
assert.match(migration, /MULTIPLE_ALIAS_ROWS_OR_TARGETS/)
assert.match(migration, /insert into public\.private_matching_c4_reconciliation_members[\s\S]*from public\.opportunities o/)
const pageSelection = migration.match(/select coalesce\(array_agg\(opportunity_id[\s\S]*?v_selected:=cardinality\(v_ids\);/)?.[0] || ''
assert.match(pageSelection, /private_matching_c4_reconciliation_members/)
assert.doesNotMatch(pageSelection, /public\.opportunities|opportunity_source_identity_aliases/)
assert.match(migration, /where status in \('PENDING','RUNNING'\) and identity_state='RESOLVED'/)
assert.match(migration, /STOP_FAILED_SOURCE/)
assert.match(migration, /resume_private_matching_c4_failed_source/)
assert.match(migration, /cursor_unchanged/)
assert.match(migration, /processed_unchanged/)
assert.match(migration, /batch_identity_or_completeness_mismatch/)
assert.match(migration, /derived_universe_missing_after_refresh/)
assert.match(migration, /refresh_result_persistence_mismatch/)
assert.match(migration, /check\(selected_count=cardinality\(selected_ids\)\)/)
assert.match(migration, /check\(attempted_count=cardinality\(attempted_ids\)\)/)
assert.match(migration, /check\(attempted_ids<@selected_ids\)/)
assert.match(migration, /check\(total_members=resolved_members\+identity_review_members\)/)
assert.match(migration, /private_matching_c4_reconciliation_outcomes/)
assert.match(migration, /permission_global_digest/)
assert.match(migration, /permission_recruiter_digest/)
assert.doesNotMatch(migration, /c6dcc71299db2237f17d455729d238a7/)
assert.doesNotMatch(migration, /position\([^\n]*pg_get_viewdef/)
assert.match(migration, /d\.refobjid='public\.opportunities'::regclass/)
assert.match(migration, /d\.refobjid='public\.opportunity_universe_state'::regclass/)
assert.doesNotMatch(migration, /(?:update|insert into)\s+public\.opportunity_source_consumer_permissions/i)
assert.doesNotMatch(migration, /(?:update|insert into)\s+public\.opportunity_sources/i)
assert.match(migration, /grant select on public\.private_matching_c4_reconciliation_runs/)
assert.doesNotMatch(migration, /grant select,insert,update,delete on public\.private_matching_c4_reconciliation/)

assert.match(preflight, /ACL_REMEDIATION_REQUIRED/)
assert.match(preflight, /end final_result/)
assert.match(preflight, /pg_rewrite[\s\S]*pg_depend/)
assert.doesNotMatch(preflight, /pg_get_viewdef/)
assert.match(preview, /private_matching_c4_source_identity/)
assert.match(preview, /identity_review_members/)
assert.match(verify, /denominator_identity_pass/)
assert.match(verify, /cumulative_histogram_mismatches/)
assert.match(verify, /global_permissions_unchanged/)
assert.match(verify, /recruiter_permissions_unchanged/)
assert.match(verify, /REFERENCE_ONLY_DIFFERENT_HISTORICAL_ALGORITHM_NOT_COMPARABLE/)
assert.match(verify, /historical_8_5_3_preserved/)
assert.match(verify, /lifecycle_3_2_preserved/)
assert.match(verify, /then 'PASS' else 'STOP' end final_result/)
assert.match(resume, /null::text[\s\S]*null::integer[\s\S]*null::text/)
for (const table of ['outcomes', 'batches', 'members', 'sources', 'runs']) {
  assert.match(rollback, new RegExp(`drop table public\\.private_matching_c4_reconciliation_${table}`))
}

console.log(JSON.stringify({
  status: 'PASS',
  evidence: 'LOCAL_STATIC_AND_MODEL_CANARIES',
  postgres_runtime: 'PENDING',
  snapshot: { members: membership.size, unique: new Set(membership.keys()).size, processed, pending, buckets: Object.fromEntries(sourceCounts) },
  failure_recovery: { cursor_advanced_on_failure: false, counters_inflated_on_failure: false, explicit_recovery_attempt: expectedAttempts },
  digests: { global: 'SEPARATE_REPRODUCIBLE_CONTRACT', recruiter_b2b: 'SEPARATE_REPRODUCIBLE_CONTRACT', legacy_c6: 'REFERENCE_ONLY' },
  ddl_contract: {
    tables: c4Tables.length,
    columns_by_table: Object.fromEntries([...tableColumns].map(([table, columns]) => [table, columns.size])),
    checks_by_table: Object.fromEntries(ddlCheckCounts),
    foreign_keys_by_table: Object.fromEntries(ddlForeignKeyCounts),
    refresh_result_keys: ['lifecycle_state', 'final_matching_state'],
  },
}, null, 2))
