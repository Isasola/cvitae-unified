/** Actual additive SQL and existing delivery RPC, in isolated local PostgreSQL. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '../.cvitae-state/cable-sql-test/node_modules/@electric-sql/pglite/dist/index.js'
const db = new PGlite()
const query = async (sql, params = []) => (await db.query(sql, params)).rows
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create function auth.role() returns text language sql as $$ select 'service_role'::text $$;
    create table user_master_profiles(id uuid primary key,user_id uuid,email text,full_name text,professional_title text,
      summary text,cv_text text,profile_data jsonb,is_test boolean,match_alerts_enabled boolean,match_alert_threshold int);
    create table opportunities(id text primary key,source text,deleted_at timestamptz,archived_at timestamptz);
    create table matching_retrieval_candidates(user_id uuid,candidate_class text,evaluated_at timestamptz,opportunity_id text);
    create table matching_retrieval_scheduler_state(singleton boolean primary key,profile_cursor uuid);
    insert into matching_retrieval_scheduler_state values(true,'ffffffff-ffff-ffff-ffff-ffffffffffff');
    create table scraper_runs(scraper_id text,started_at timestamptz,finished_at timestamptz,extraction_metrics jsonb);
    create table opportunity_enrichment_events(opportunity_id text,created_at timestamptz);
    create index opportunity_enrichment_events_opportunity_created_idx on opportunity_enrichment_events(opportunity_id,created_at desc);
    insert into user_master_profiles select ('00000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
      ('00000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'fixture@example.test','Fixture','Role',null,null,'{}',n=1,n<>2,85
      from generate_series(1,253) n;
    insert into opportunities values('row-1','himalayas',null,null),('row-2','himalayas',null,null);
  `)
  await db.exec(readFileSync('supabase/migrations/202608130002_high_match_email_alerts.sql', 'utf8'))
  const migration = readFileSync('supabase/migrations/202610050001_bounded_alert_progress.sql', 'utf8')
  await db.exec(migration)
  await db.exec(migration) // additive migration repeat is safe
  const claim = async () => (await query('select claim_match_alert_scan() scan'))[0].scan
  const save = (scan, checkpoint, release = true) => query('select save_match_alert_scan($1,$2,$3::jsonb,$4)', [scan.profile.id, scan.lease_token, JSON.stringify(checkpoint), release])
  const seen = []
  const first = await claim()
  assert.ok(first.profile.match_alert_threshold === 85)
  const progress = { cutoff: '2026-10-05', pending: [{ id: 'row-1' }], recentCursor: { id: 'row-1', updated_at: '2026-10-04' } }
  await save(first, progress)
  seen.push(first.profile.id)
  for (let i = 1; i < 251; i++) {
    const scan = await claim(); seen.push(scan.profile.id); await save(scan, { pending: [], complete: true })
  }
  assert.equal(new Set(seen).size, 251, 'selector reaches consenting profiles beyond first 250')
  const resumed = await claim()
  assert.equal(resumed.profile.id, first.profile.id)
  assert.deepEqual(resumed.checkpoint, progress, 'durable continuation survives complete profile rotation')
  const competing = await claim()
  assert.notEqual(competing.profile.id, resumed.profile.id, 'unexpired lease cannot be reclaimed by concurrent sender')
  await save(competing, { pending: [] })
  await assert.rejects(() => save({ ...resumed, lease_token: 'ffffffff-ffff-ffff-ffff-ffffffffffff' }, progress), /lease_lost/)
  await assert.rejects(() => save(resumed, { pending: Array.from({ length: 101 }, () => ({ id: 'row-1' })) }), /check constraint/)
  await save(resumed, progress)
  assert.equal((await query('select profile_cursor from matching_retrieval_scheduler_state'))[0].profile_cursor, 'ffffffff-ffff-ffff-ffff-ffffffffffff', 'Matching selector untouched')
  for (const role of ['anon', 'authenticated']) {
    assert.equal((await query("select has_table_privilege($1,'match_alert_scan_progress','select') allowed", [role]))[0].allowed, false)
    assert.equal((await query("select has_function_privilege($1,'claim_match_alert_scan()','execute') allowed", [role]))[0].allowed, false)
  }
  const deliveryArgs = [first.profile.user_id, first.profile.id, 'row-1', first.profile.email, 95, '[]']
  const delivery = await query('select * from claim_match_alert_delivery($1,$2,$3,$4,$5,$6::jsonb)', deliveryArgs)
  assert.equal(delivery.length, 1)
  assert.equal((await query('select * from claim_match_alert_delivery($1,$2,$3,$4,$5,$6::jsonb)', deliveryArgs)).length, 0, 'processing delivery not duplicated')
  await query("update match_alert_deliveries set status='sent' where id=$1", [delivery[0].id])
  assert.equal((await query('select * from claim_match_alert_delivery($1,$2,$3,$4,$5,$6::jsonb)', deliveryArgs)).length, 0, 'sent delivery never resent')
  await db.exec("insert into opportunity_enrichment_events values('row-1','2026-10-03'),('row-1','2026-10-05T00:00:00Z'),('row-2','2026-10-04');")
  const evidence = await query('select * from latest_maintenance_enrichments($1::text[])', [['row-1']])
  assert.equal(evidence.length, 1); assert.equal(evidence[0].opportunity_id, 'row-1')
  assert.equal(new Date(evidence[0].created_at).toISOString(), '2026-10-05T00:00:00.000Z')
  await assert.rejects(() => query('select * from latest_maintenance_enrichments($1::text[])', [Array(251).fill('row-1')]), /page_limit_exceeded/)
  console.log('PASS C20 PostgreSQL: 251 eligible profiles; durable rotation/resume; leases; pending cap; privileges; existing delivery dedup; exact-ID latest evidence; Matching cursor unchanged')
} finally { await db.close() }
