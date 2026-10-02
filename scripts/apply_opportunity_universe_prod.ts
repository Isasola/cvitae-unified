import { createClient } from '@supabase/supabase-js'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const args = new Map<string, string>()
for (let i = 2; i < process.argv.length; i++) if (process.argv[i].startsWith('--')) args.set(process.argv[i], process.argv[++i] ?? '')
const apply = process.argv.includes('--apply')
if (!apply || args.get('--confirm') !== 'YES') throw new Error('REQUIRES_EXPLICIT --apply --confirm YES')
const pageSize = Number(args.get('--page-size') ?? 250)
const maxPages = Number(args.get('--max-pages') ?? 4)
const stateFile = resolve(args.get('--state-file') ?? 'artifacts/opportunity-universe/reconciliation-cursor.json')
if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 250 || !Number.isInteger(maxPages) || maxPages < 1 || maxPages > 100) throw new Error('BOUNDED_ARGUMENT_REQUIRED')
const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) throw new Error('SUPABASE_SERVICE_ROLE_CONFIGURATION_REQUIRED')
const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
let state: { cursor_id: string | null; examined: number; changed: number; complete: boolean } = { cursor_id: null, examined: 0, changed: 0, complete: false }
if (existsSync(stateFile)) state = { ...state, ...JSON.parse(readFileSync(stateFile, 'utf8')) }
if (state.complete) { console.log(JSON.stringify({ ...state, resumed: true })); process.exit(0) }
for (let page = 0; page < maxPages; page++) {
  const result = await supabase.rpc('reconcile_opportunity_universe_page', { p_after_id: state.cursor_id, p_page_size: pageSize, p_apply: true })
  if (result.error) throw new Error(`PAGE_FAILED cursor=${state.cursor_id ?? 'START'} code=${result.error.code ?? 'UNKNOWN'}`)
  const payload = result.data as { examined: number; cursor_id: string | null; complete: boolean; changed_lifecycle_flags: number }
  if (!payload || !Number.isInteger(payload.examined) || payload.examined < 0 || payload.examined > pageSize || (payload.examined > 0 && !payload.cursor_id)) throw new Error('INVALID_PAGE_RESULT_CURSOR_UNCHANGED')
  state = { cursor_id: payload.cursor_id, examined: state.examined + payload.examined, changed: state.changed + payload.changed_lifecycle_flags, complete: payload.complete }
  writeFileSync(stateFile, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify({ page: page + 1, ...state, page_examined: payload.examined, page_changed: payload.changed_lifecycle_flags }))
  if (state.complete || payload.examined === 0) break
}
