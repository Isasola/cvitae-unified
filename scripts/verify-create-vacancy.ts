import { readFileSync } from 'node:fs'

function read(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

const frontend = read('src/pages/Recruiters.tsx')
const handler = read('netlify/functions/create-vacancy.ts')
const migration = read('supabase/migrations/202609100003_atomic_recruiter_vacancy_creation.sql')

assert(frontend.includes('/.netlify/functions/create-vacancy'), 'The B2B form must call create-vacancy')
assert(frontend.includes('JSON.stringify({ token, ...form })'), 'The B2B form must send its current state verbatim')
assert(handler.includes('.rpc("create_recruiter_vacancy_atomic"'), 'The Function must use the atomic DB operation')
assert(!handler.includes('.from("recruiter_vacancies")\n      .insert'), 'The Function must not create the first partial row itself')
assert(handler.includes('p_salary_range: salary_range?.trim() || null'), 'Empty optional salary must normalize to null')
assert(handler.includes('[create-vacancy][ATOMIC_CREATE_FAILED]'), 'Atomic failures need a safe server-side stage code')
assert(handler.includes('INSERT_FAILED') && handler.includes('MIRROR_INSERT_FAILED') && handler.includes('CONSISTENCY_CHECK_FAILED'), 'Server logs must distinguish the failed publication stage')
assert(handler.includes('[create-vacancy][UNEXPECTED_ERROR]'), 'Unexpected failures need a safe server-side stage code')
assert(!handler.includes('body: JSON.stringify({ error: error.message })'), 'Raw internal errors must not reach the browser')
assert(migration.includes('security definer') && migration.includes("set search_path = ''"), 'The RPC must use a fixed safe search path')
assert(migration.includes('insert into public.recruiter_vacancies') && migration.includes('insert into public.opportunities'), 'Both inserts must be in one RPC transaction')
assert(migration.includes('RECRUITER_VACANCY_INSERT_FAILED') && migration.includes('OPPORTUNITY_MIRROR_INSERT_FAILED'), 'The RPC must identify the failing insert in server logs')
assert(!/insert into public\.opportunities[\s\S]*?\bmodality\b[\s\S]*?values\s*\(/.test(migration), 'The opportunity insert must not depend on the drifted modality column')
assert(migration.includes('revoke all on function') && migration.includes('to service_role'), 'The atomic RPC must be private to service_role')

console.log('B2B create-vacancy: static transaction and safety checks passed.')
