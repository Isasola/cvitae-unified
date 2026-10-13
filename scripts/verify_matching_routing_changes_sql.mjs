/** Offline PostgreSQL execution of the incremental routing-ledger migration. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '../.cvitae-state/cable-sql-test/node_modules/@electric-sql/pglite/dist/index.js'

const db = new PGlite()
const sql = path => readFileSync(path, 'utf8').replaceAll('\r\n', '\n')
const query = async (text, params = []) => (await db.query(text, params)).rows
const epoch = async () => Number((await query('select routing_epoch from matching_retrieval_scheduler_state where singleton'))[0].routing_epoch)
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create function auth.role() returns text language sql as $$select 'service_role'::text$$;
    create table opportunities(id text primary key, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
    create table opportunity_universe_state(opportunity_id text primary key references opportunities(id) on delete cascade,
      final_matching_state text not null, catalog_state text, seo_state text, alerts_state text, evaluated_at timestamptz default now());
    create table matching_retrieval_scheduler_state(singleton boolean primary key default true, profile_cursor uuid,
      updated_at timestamptz not null default now());
    insert into matching_retrieval_scheduler_state(singleton) values(true);
    create table matching_retrieval_states(
      user_id uuid primary key, profile_signature text, source_policy_signature text,
      scan_kind text not null default 'FULL', scan_status text not null default 'PENDING',
      scan_cutoff timestamptz, cursor_at timestamptz, cursor_id text,
      scan_examined_count integer not null default 0, scan_target_count integer not null default 0,
      examined_count integer not null default 0, target_count integer not null default 0,
      candidate_count integer not null default 0, completed_at timestamptz, last_change_watermark timestamptz,
      inventory_funnel_at timestamptz, updated_at timestamptz not null default now(), last_error_code text
    );
    create table matching_retrieval_candidates(user_id uuid not null, opportunity_id text not null,
      profile_signature text not null, primary key(user_id,opportunity_id));
    create view opportunity_final_matching_universe as
      select o.id,o.created_at,o.updated_at,'READY'::text as universe_final_matching_state
      from opportunities o join opportunity_universe_state u on u.opportunity_id=o.id
      where u.final_matching_state='READY';
  `)
  await db.exec(sql('supabase/migrations/202610130001_matching_routing_epoch.sql'))
  await db.exec(sql('supabase/migrations/202610130002_matching_routing_changes.sql'))
  const baseline = await epoch()
  assert.equal(Number((await query('select routing_ledger_baseline_epoch from matching_retrieval_scheduler_state where singleton'))[0].routing_ledger_baseline_epoch), baseline)

  await query("insert into opportunities(id) values('oscillating')")
  const start = await epoch()
  await query("insert into opportunity_universe_state(opportunity_id,final_matching_state) values('oscillating','NOT_READY')")
  assert.equal(await epoch(), start, 'NOT_READY insert is not a matching transition')
  await query("update opportunity_universe_state set catalog_state='READY',seo_state='READY',alerts_state='READY' where opportunity_id='oscillating'")
  assert.equal(await epoch(), start, 'catalog/SEO/alerts changes do not increment matching routing')
  await query("update opportunity_universe_state set final_matching_state='READY' where opportunity_id='oscillating'")
  await query("update opportunity_universe_state set final_matching_state='NOT_READY' where opportunity_id='oscillating'")
  await query("update opportunity_universe_state set final_matching_state='READY' where opportunity_id='oscillating'")
  const target = await epoch()
  assert.equal(target, start + 3, 'oscillation creates one revision per real membership transition')
  const events = await query("select routing_epoch,opportunity_id,previous_ready,current_ready from matching_routing_changes order by routing_epoch")
  assert.deepEqual(events.map(row => [Number(row.routing_epoch), row.opportunity_id, row.previous_ready, row.current_ready]), [
    [start + 1, 'oscillating', false, true], [start + 2, 'oscillating', true, false], [start + 3, 'oscillating', false, true],
  ])
  await db.exec(`create function public.reject_routing_event() returns trigger language plpgsql as $$begin raise exception 'fixture_reject_event'; end$$;
    create trigger reject_routing_event before insert on public.matching_routing_changes for each row execute function public.reject_routing_event();`)
  await assert.rejects(query("update opportunity_universe_state set final_matching_state='NOT_READY' where opportunity_id='oscillating'"), error => error?.message === 'fixture_reject_event')
  assert.equal(await epoch(), target, 'epoch increment rolls back with a failed ledger insert')
  assert.equal((await query("select final_matching_state from opportunity_universe_state where opportunity_id='oscillating'"))[0].final_matching_state, 'READY')
  await db.exec('drop trigger reject_routing_event on public.matching_routing_changes; drop function public.reject_routing_event()')

  const userId = '00000000-0000-0000-0000-000000000001'
  await query(`insert into matching_retrieval_states(user_id,profile_signature,source_policy_signature,scan_kind,scan_status,
    scan_examined_count,scan_target_count,completed_routing_epoch,scan_routing_epoch,routing_ledger_baseline_epoch,routing_phase,
    routing_delta_from_epoch,routing_delta_cursor_epoch,routing_delta_target_epoch)
    values($1,'profile','policy','FULL','SCANNING',0,1,$2,$2,$3,'ROUTING_DELTA',$2,$4,$4)`, [userId, baseline, baseline, target - 1])
  // The global epoch moves past the fixed target before the worker commits its coverage.
  await query("update opportunity_universe_state set final_matching_state='NOT_READY' where opportunity_id='oscillating'")
  const globalAfterNewEvent = await epoch()
  await query("update matching_retrieval_states set routing_delta_target_epoch=$2,routing_delta_cursor_epoch=$2 where user_id=$1", [userId, target - 1])
  const completion = (await query(`select complete_matching_retrieval_scan($1,$2,null,null,'profile','policy') result`, [userId, target - 1]))[0].result
  assert.equal(completion.status, 'COMPLETE', 'coverage can finish at a fixed target while the global epoch has advanced')
  assert.equal(Number(completion.routing_epoch), target - 1)
  assert.equal(Number(completion.global_routing_epoch), globalAfterNewEvent)
  const state = (await query('select scan_status,completed_routing_epoch from matching_retrieval_states where user_id=$1', [userId]))[0]
  assert.equal(state.scan_status, 'COMPLETE')
  assert.equal(Number(state.completed_routing_epoch), target - 1, 'candidate is not falsely stamped at the current global epoch')

  await query('delete from matching_routing_changes where routing_epoch=$1', [start + 1])
  const user2 = '00000000-0000-0000-0000-000000000002'
  await query(`insert into matching_retrieval_states(user_id,profile_signature,source_policy_signature,scan_kind,scan_status,
    completed_routing_epoch,routing_ledger_baseline_epoch,routing_phase,routing_delta_from_epoch,routing_delta_cursor_epoch,routing_delta_target_epoch)
    values($1,'profile','policy','DELTA','SCANNING',$2,$3,'ROUTING_DELTA',$2,$4,$4)`, [user2, baseline, baseline, globalAfterNewEvent])
  await assert.rejects(query(`select complete_matching_retrieval_scan($1,$2,null,null,'profile','policy')`, [user2, globalAfterNewEvent]), error => error?.message === 'matching_routing_ledger_gap',
    'finalizer rejects an unprocessed ledger interval')

  // Content updated during routing DELTA must remain beyond the content scan cutoff.
  const contentUser = '00000000-0000-0000-0000-000000000003'
  const contentCutoff = '2026-10-13T10:00:00.000Z'
  const contentUpdatedAt = '2026-10-13T10:05:00.000Z'
  await query("insert into opportunities(id,created_at,updated_at) values('content-during-routing',$1,$2)", [contentCutoff, contentUpdatedAt])
  await query(`insert into matching_retrieval_states(user_id,profile_signature,source_policy_signature,scan_kind,scan_status,scan_cutoff,
    completed_routing_epoch,routing_ledger_baseline_epoch,routing_phase,routing_delta_from_epoch,routing_delta_cursor_epoch,routing_delta_target_epoch)
    values($1,'profile','policy','DELTA','SCANNING',$2,$3,$4,'ROUTING_DELTA',$3,$3,$3)`, [contentUser, contentCutoff, globalAfterNewEvent, baseline])
  const contentCompletion = (await query(`select complete_matching_retrieval_scan($1,$2,null,null,'profile','policy') result`, [contentUser, globalAfterNewEvent]))[0].result
  assert.equal(contentCompletion.status, 'COMPLETE')
  assert.equal(new Date((await query('select last_change_watermark from matching_retrieval_states where user_id=$1', [contentUser]))[0].last_change_watermark).toISOString(), new Date(contentCutoff).toISOString())
  const contentDelta = await query('select id from opportunities where updated_at > $1::timestamptz and updated_at <= $2::timestamptz', [contentCutoff, contentUpdatedAt])
  assert.deepEqual(contentDelta.map(row => row.id), ['content-during-routing'], 'the next content DELTA still selects an update made after the fixed scan cutoff')

  const acl = await query(`select has_table_privilege('anon','public.matching_routing_changes','select') anon_read,
      has_table_privilege('authenticated','public.matching_routing_changes','select') user_read,
      has_table_privilege('service_role','public.matching_routing_changes','select') service_read,
      has_function_privilege('anon','public.complete_matching_retrieval_scan(uuid,bigint,timestamp with time zone,text,text,text)','execute') anon_rpc,
      has_function_privilege('service_role','public.complete_matching_retrieval_scan(uuid,bigint,timestamp with time zone,text,text,text)','execute') service_rpc`)
  assert.equal(acl[0].anon_read, false)
  assert.equal(acl[0].user_read, false)
  assert.equal(acl[0].service_read, true)
  assert.equal(acl[0].anon_rpc, false)
  assert.equal(acl[0].service_rpc, true)
  console.log(JSON.stringify({ status: 'PASS', checks: ['baseline', 'transition-ledger', 'atomic-rollback', 'full-denominator-drift-via-ledger', 'consumer-independence', 'targeted-finalization', 'ledger-gap', 'content-update-during-routing-delta-watermark', 'service-acl'], baseline, fixed_target: target - 1, global_after_new_event: globalAfterNewEvent, content_scan_cutoff: contentCutoff, content_updated_at: contentUpdatedAt, content_delta_rows: contentDelta.length }, null, 2))
} finally {
  await db.close()
}
