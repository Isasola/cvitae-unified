import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
const source = read('./generate_final_prod_verify.ts')
const sql = read('../artifacts/release/final-prod-verify.sql')

assert.match(source, /final-prod-verify\.sql/)
assert.match(sql, /^\s*-- READ ONLY/i)
assert.match(sql, /as final_prod_release_verification\s+from acceptance;\s*$/i)
for (const key of [
  "'UNIVERSE'", "'PIPELINE'", "'RETRIEVAL'", "'SEO'", "'CONSUMERS'", "'OBSERVATION'", "'FACTORY'", "'FINAL_ACCEPTANCE'",
  "'total_inventory'", "'universe_rows'", "'unreconciled'", "'duplicates'", "'pipeline_rows'", "'unexplained'", "'missing_status'",
  "'no_reason_counts'", "'matching_retrieval_states_exists'", "'matching_retrieval_candidates_exists'",
  "'score_opportunity_embeddings_correct_signature'", "'prune_matching_retrieval_candidates_exists'",
  "'structural_contract_pass'", "'retrieval_schema_pass'", "'unexplained_zero'", "'release_schema_pass'",
]) assert.ok(sql.includes(key), `final verifier includes ${key}`)
assert.match(sql, /public\.score_opportunity_embeddings\(public\.vector,text\[\]\)/)
assert.match(sql, /public\.opportunity_pipeline_status/)
assert.match(sql, /p\.factory_ready,p\.factory_review,p\.factory_pending,p\.factory_blocked,p\.factory_failed/)
assert.match(sql, /'FACTORY',jsonb_build_object\('ready',factory_ready,'review',factory_review,'pending',factory_pending,\s*'blocked',factory_blocked,'failed',factory_failed\)/)
assert.match(sql, /public\.opportunity_universe_state/)
assert.match(sql, /to_regclass\('public\.matching_retrieval_states'\)/)
assert.match(sql, /to_regclass\('public\.matching_retrieval_candidates'\)/)

// Scan SQL executable text only: comments and quoted literals are masked before
// proving this is a single read-only SELECT statement.
const code = sql
  .replace(/--[^\r\n]*/g, ' ')
  .replace(/'(?:''|[^'])*'/g, "''")
assert.equal((code.match(/;/g) || []).length, 1, 'one SQL statement only')
assert.match(code, /^\s*with\b/i)
assert.doesNotMatch(code, /\b(?:insert|update|delete|merge|create|alter|drop|truncate|call|do|execute|grant|revoke)\b/i)
console.log('verify_final_prod_release: PASS read_only=1 statement=1 sections=8')
