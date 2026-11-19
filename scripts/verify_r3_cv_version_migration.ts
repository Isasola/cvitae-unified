import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const sql = readFileSync(new URL('../supabase/migrations/202610120001_remove_legacy_generated_cvs_uniqueness.sql', import.meta.url), 'utf8').toLowerCase()
assert.match(sql, /conname = 'generated_cvs_user_vacancy'/)
assert.match(sql, /unique\(user_id,vacancy_id\)/)
assert.match(sql, /drop constraint generated_cvs_user_vacancy/)
assert.match(sql, /create unique index if not exists generated_cvs_user_vacancy_version_uidx/)
assert.match(sql, /\(user_id, vacancy_id, version_number\)/)
assert.doesNotMatch(sql, /delete from|truncate|drop table/)
assert.match(sql, /raise exception/, 'unexpected same-name constraint fails closed')

const base = readFileSync(new URL('../supabase/migrations/202607220000_base_schema.sql', import.meta.url), 'utf8').toLowerCase()
assert.match(base, /vacancy_id text not null/, 'null vacancy semantics remain explicit: null is forbidden')
const versioning = readFileSync(new URL('../supabase/migrations/202608130005_cv_versions_and_evidence.sql', import.meta.url), 'utf8').toLowerCase()
assert.match(versioning, /pg_advisory_xact_lock/, 'version allocation remains serialized')
const rewriteSource = readFileSync(new URL('../netlify/functions/cv-rewrite-workspace.ts', import.meta.url), 'utf8')
assert.match(rewriteSource, /\.eq\('user_id', user\.id\)/, 'workspace reads remain scoped to the authenticated owner')
assert.match(rewriteSource, /p_user_id: user\.id/, 'version acceptance passes only the authenticated owner')

const rewrite = rewriteSource
assert.match(rewrite, /CV_VERSION_CONSTRAINT_CONFLICT/)
assert.match(rewrite, /VERSION_ACCEPTANCE/)
assert.match(rewrite, /retryable/)
console.log('verify_r3_cv_version_migration: PASS idempotent exact_constraint version_unique null_explicit concurrency ownership')
