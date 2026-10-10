import { readFileSync } from 'node:fs'

function read(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

const frontend = read('src/pages/Recruiters.tsx')
const handler = read('netlify/functions/create-vacancy.ts')
const migration = read('supabase/migrations/202610090002_recruiter_opportunity_bridge.sql')
const policyMigration = read('supabase/migrations/202610090001_controlled_recruiter_producer.sql')

assert(frontend.includes('/.netlify/functions/create-vacancy'), 'The B2B form must call create-vacancy')
assert(frontend.includes('beginVacancy(organizationId, form)') && frontend.includes('operation_id: operationId'), 'The B2B form must send a durable operation id')
assert(handler.includes('.rpc("create_recruiter_vacancy_atomic"'), 'The Function must use the atomic DB operation')
assert(!handler.includes('.from("recruiter_vacancies")\n      .insert'), 'The Function must not create the first partial row itself')
assert(handler.includes('p_salary_range: salary_range?.trim() || null'), 'Empty optional salary must normalize to null')
assert(handler.includes('[create-vacancy][ATOMIC_CREATE_FAILED]'), 'Atomic failures need a safe server-side stage code')
assert(handler.includes('INSERT_FAILED') && handler.includes('MIRROR_INSERT_FAILED') && handler.includes('CONSISTENCY_CHECK_FAILED'), 'Server logs must distinguish the failed publication stage')
assert(handler.includes('[create-vacancy][UNEXPECTED_ERROR]'), 'Unexpected failures need a safe server-side stage code')
assert(!handler.includes('body: JSON.stringify({ error: error.message })'), 'Raw internal errors must not reach the browser')
assert(handler.includes('createHash') && handler.includes('p_operation_id: operation_id'), 'Slug and RPC must share durable operation identity')
assert(migration.includes('security definer set search_path=\'\''), 'The RPC must use a fixed safe search path')
assert(migration.includes('primary key(recruiter_token_id,operation_id)') && migration.includes('pg_advisory_xact_lock'), 'Retries and concurrency need a durable organization-scoped key')
assert(migration.includes('insert into public.recruiter_vacancies') && migration.includes('sync_recruiter_vacancy_mirror'), 'Vacancy and mirror must share one transaction')
assert(migration.includes("jsonb_build_object('text',v.requirements)") && migration.includes("'value_semantics','COMPENSATION_TEXT'"), 'Requirements and salary text need faithful mapping and provenance')
assert(migration.includes('country_code') && migration.includes("v.is_active,null"), 'The bridge must not invent a country')
assert(migration.includes("'pending',null") && migration.includes('original_source_verified') && migration.includes('false'), 'Publisher identity must not verify declared facts')
assert(migration.includes('close_recruiter_vacancy_atomic') && migration.includes('close_universe_mismatch'), 'Close must be atomic and check downstream lifecycle')
assert(migration.includes('reconcile_recruiter_vacancies_r2') && migration.includes('historical_preview_changed'), 'Historical reconciliation must be guarded by the preview denominator')
assert(migration.includes('revoke all on function') && migration.includes('to service_role'), 'The atomic RPC must be private to service_role')
assert(policyMigration.includes("p_source='recruiter_b2b'") && policyMigration.includes("'EXECUTABLE_PRODUCER'"), 'recruiter_b2b must be registered as a controlled producer')
assert(policyMigration.includes('controlled_opportunity_permission') && policyMigration.includes('WEB_CATALOG_DENIED'), 'Consumer permission must remain independent and explainable')
assert(!policyMigration.includes('update public.opportunity_sources'), 'Producer registration must not silently grant distribution')

console.log('B2B create-vacancy: static future/historical/permission contract checks passed.')
