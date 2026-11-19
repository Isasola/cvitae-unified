import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '../.cvitae-state/cable-sql-test/node_modules/@electric-sql/pglite/dist/index.js';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const migration = read('supabase/migrations/202610140001_paraguayconcursa_source_operation.sql');
const historical = read('supabase/migrations/202610040001_source_switch_wiring.sql');

function functionDdl(name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = historical.match(new RegExp(`create or replace function public\\.${escaped}\\([\\s\\S]*?end \\$\\$;`, 'i'));
  assert.ok(match, `fixture must extract the existing ${name} function`);
  return match[0];
}

const schema = `
create table public.opportunity_sources (
  source text primary key, display_name text not null, country_code text,
  trust_level text not null default 'review', auto_verify boolean not null default false,
  is_enabled boolean not null default true, verification_criteria jsonb not null default '[]'::jsonb,
  notes text, updated_at timestamptz not null default now(), updated_by text,
  source_tier text, catalog_enabled boolean not null default false,
  matching_enabled boolean not null default false, alerts_enabled boolean not null default false,
  seo_enabled boolean not null default false, allowed_country_codes text[] default '{}',
  allowed_opportunity_types text[] default '{}', max_items_per_day integer default 100,
  retention_days integer default 90
);
create table public.admin_policy_events (
  id bigserial primary key, entity_type text not null, entity_key text not null,
  before_state jsonb not null, after_state jsonb not null, impacted_rows integer not null default 0,
  actor text not null, created_at timestamptz not null default now()
);
create table public.scraper_controls (
  scraper_id text primary key, scraper_name text not null, script_path text not null,
  collection_enabled boolean not null default false, max_items_per_run integer not null default 250,
  max_runtime_seconds integer not null default 600, consecutive_failures_before_pause integer not null default 3,
  auto_pause_on_failure boolean not null default true, require_review boolean not null default true,
  allowed_country_codes text[] not null default array['PY']::text[], paused_reason text,
  updated_at timestamptz not null default now(), updated_by text
);
create table public.opportunity_source_identity_aliases (
  emitted_source text primary key, canonical_source text not null
);
create table public.opportunity_source_consumer_permissions (
  canonical_source text not null, consumer text not null, permission_state text not null
);
`;

async function makeDb() {
  const db = new PGlite();
  await db.exec(schema);
  await db.exec(functionDdl('stored_opportunity_source_policy'));
  await db.exec(functionDdl('canonical_opportunity_source_policy'));
  await db.exec(functionDdl('admin_update_source_policy_atomic'));
  return db;
}

async function apply(db) {
  await db.exec(migration);
}

async function one(db, sql, params = []) {
  const result = await db.query(sql, params);
  return result.rows[0];
}

async function sourceRow(db, source) {
  return one(db, 'select * from public.opportunity_sources where source = $1', [source]);
}

async function effective(db, source) {
  return (await one(db, 'select public.canonical_opportunity_source_policy($1) as policy', [source])).policy;
}

async function testBootstrapAndIdempotence() {
  const db = await makeDb();
  try {
    await db.exec(`
      insert into public.opportunity_sources (source,display_name,country_code,trust_level,auto_verify,is_enabled,catalog_enabled,matching_enabled,alerts_enabled,seo_enabled)
      values ('weworkremotely','WWR','US','review',false,true,false,false,false,false),
             ('himalayas','Himalayas','US','review',false,true,true,true,true,true);
      insert into public.admin_policy_events(entity_type,entity_key,before_state,after_state,impacted_rows,actor)
      values
        ('source','weworkremotely','{}','{"explicit_consumer_switches":{"catalog":false}}',0,'official'),
        ('source','weworkremotely','{}','{"explicit_consumer_switches":{"matching":false}}',0,'official'),
        ('source','weworkremotely','{}','{"explicit_consumer_switches":{"alerts":false}}',0,'official'),
        ('source','weworkremotely','{}','{"explicit_consumer_switches":{"seo":false}}',0,'official');
    `);
    const otherBefore = {
      weworkremotely: await effective(db, 'weworkremotely'),
      himalayas: await effective(db, 'himalayas'),
    };

    await apply(db);
    const source = await sourceRow(db, 'paraguayconcursa_mef');
    assert.ok(source, 'missing source is bootstrapped');
    assert.deepEqual(
      [source.is_enabled, source.catalog_enabled, source.matching_enabled, source.alerts_enabled, source.seo_enabled],
      [false, false, false, false, false],
      'stored five switches are closed',
    );
    assert.equal(source.auto_verify, false);
    assert.equal(source.trust_level, 'review');
    assert.equal(source.country_code, 'PY');

    const auditCount = await one(db, `select count(*)::int as count from public.admin_policy_events
      where entity_type='source' and entity_key='paraguayconcursa_mef'`);
    const audit = await one(db, `select after_state->'explicit_consumer_switches' as switches from public.admin_policy_events
      where entity_type='source' and entity_key='paraguayconcursa_mef'`);
    assert.equal(auditCount.count, 1, 'the existing admin RPC created exactly one event');
    assert.deepEqual(audit.switches, { source: false, catalog: false, matching: false, alerts: false, seo: false });
    const policy = await effective(db, 'paraguayconcursa_mef');
    assert.deepEqual(
      [policy.is_enabled, policy.catalog_enabled, policy.matching_enabled, policy.alerts_enabled, policy.seo_enabled],
      [false, false, false, false, false],
      'effective five switches are closed',
    );

    const control = await one(db, 'select * from public.scraper_controls where scraper_id=$1', ['paraguayconcursa_mef_scraper']);
    assert.ok(control, 'scraper control is created');
    assert.equal(control.collection_enabled, false);
    assert.equal(control.max_items_per_run, 20);
    assert.equal(control.require_review, true);

    const eventCountBeforeRepeat = auditCount.count;
    const sourceBeforeRepeat = source;
    const controlBeforeRepeat = control;
    await apply(db);
    const eventCountAfterRepeat = await one(db, `select count(*)::int as count from public.admin_policy_events
      where entity_type='source' and entity_key='paraguayconcursa_mef'`);
    assert.equal(eventCountAfterRepeat.count, eventCountBeforeRepeat, 'repeat creates no duplicate audit event');
    assert.deepEqual(await sourceRow(db, 'paraguayconcursa_mef'), sourceBeforeRepeat, 'repeat does not rewrite source row');
    assert.deepEqual(await one(db, 'select * from public.scraper_controls where scraper_id=$1', ['paraguayconcursa_mef_scraper']), controlBeforeRepeat,
      'repeat does not rewrite scraper control');

    assert.deepEqual(await effective(db, 'weworkremotely'), otherBefore.weworkremotely,
      'MEF migration does not change WWR consumer policy');
    assert.deepEqual(await effective(db, 'himalayas'), otherBefore.himalayas,
      'MEF migration does not change another source consumer policy');
    console.log('PASS bootstrap absent source: stored/effective OFF, official audit, closed control, idempotent repeat, other-source policy unchanged');
  } finally {
    await db.close();
  }
}

async function testPreexistingClosedSourcePreserved() {
  const db = await makeDb();
  try {
    await db.exec(`
      insert into public.opportunity_sources (source,display_name,country_code,trust_level,auto_verify,is_enabled,catalog_enabled,matching_enabled,alerts_enabled,seo_enabled,notes)
      values ('paraguayconcursa_mef','Operator label','PY','trusted',true,false,false,false,false,false,'operator note');
      insert into public.scraper_controls (scraper_id,scraper_name,script_path,collection_enabled,max_items_per_run,paused_reason)
      values ('paraguayconcursa_mef_scraper','Operator control','operator.py',false,77,'operator pause');
    `);
    await apply(db);
    const source = await sourceRow(db, 'paraguayconcursa_mef');
    assert.equal(source.display_name, 'Operator label');
    assert.equal(source.trust_level, 'trusted');
    assert.equal(source.auto_verify, true);
    assert.equal(source.notes, 'operator note');
    assert.deepEqual(
      [source.is_enabled, source.catalog_enabled, source.matching_enabled, source.alerts_enabled, source.seo_enabled],
      [false, false, false, false, false],
      'already-closed source remains closed while metadata is preserved',
    );
    const control = await one(db, 'select * from public.scraper_controls where scraper_id=$1', ['paraguayconcursa_mef_scraper']);
    assert.equal(control.scraper_name, 'Operator control');
    assert.equal(control.max_items_per_run, 77);
    assert.equal(control.paused_reason, 'operator pause');
    assert.equal((await one(db, `select count(*)::int as count from public.admin_policy_events where entity_key='paraguayconcursa_mef'`)).count, 1);
    console.log('PASS pre-existing closed source/control: event audited without overwriting existing metadata or control settings');
  } finally {
    await db.close();
  }
}

async function testActiveSourceWithoutClosedEventAborts() {
  const db = await makeDb();
  try {
    await db.exec(`insert into public.opportunity_sources (source,display_name,country_code,is_enabled,catalog_enabled,matching_enabled,alerts_enabled,seo_enabled)
      values ('paraguayconcursa_mef','Operator activation','PY',true,false,false,false,false);`);
    await assert.rejects(() => apply(db), /paraguayconcursa_existing_policy_requires_admin_review/);
    const source = await sourceRow(db, 'paraguayconcursa_mef');
    assert.equal(source.is_enabled, true, 'migration does not overwrite an explicit activation');
    assert.equal((await one(db, `select count(*)::int as count from public.admin_policy_events where entity_key='paraguayconcursa_mef'`)).count, 0);
    assert.equal((await one(db, `select count(*)::int as count from public.scraper_controls where scraper_id='paraguayconcursa_mef_scraper'`)).count, 0);
    console.log('PASS active pre-existing source without closed audit: aborts and preserves activation');
  } finally {
    await db.close();
  }
}

async function testLaterAdminActivationSurvivesRerun() {
  const db = await makeDb();
  try {
    await apply(db);
    await db.query(`select public.admin_update_source_policy_atomic(
      'paraguayconcursa_mef',
      '{"is_enabled":true,"catalog_enabled":true,"matching_enabled":true,"alerts_enabled":true,"seo_enabled":true}'::jsonb,
      null, 'operator')`);
    await db.exec(`update public.scraper_controls set collection_enabled=true,updated_by='operator'
      where scraper_id='paraguayconcursa_mef_scraper'`);
    const beforePolicy = await effective(db, 'paraguayconcursa_mef');
    const beforeControl = await one(db, 'select * from public.scraper_controls where scraper_id=$1', ['paraguayconcursa_mef_scraper']);
    const beforeEvents = await one(db, `select count(*)::int as count from public.admin_policy_events where entity_key='paraguayconcursa_mef'`);
    await apply(db);
    assert.deepEqual(await effective(db, 'paraguayconcursa_mef'), beforePolicy, 'later policy activation remains effective');
    assert.deepEqual(await one(db, 'select * from public.scraper_controls where scraper_id=$1', ['paraguayconcursa_mef_scraper']), beforeControl,
      'later collection activation is not overwritten');
    assert.equal((await one(db, `select count(*)::int as count from public.admin_policy_events where entity_key='paraguayconcursa_mef'`)).count,
      beforeEvents.count, 'repeat adds no event and does not rewrite the administrative decision');
    console.log('PASS post-migration administrative activation: rerun preserves switches, collection and audit history');
  } finally {
    await db.close();
  }
}

await testBootstrapAndIdempotence();
await testPreexistingClosedSourcePreserved();
await testActiveSourceWithoutClosedEventAborts();
await testLaterAdminActivationSurvivesRerun();
console.log('verify_paraguayconcursa_bootstrap: PASS PGlite isolated schema; no production connection or writes');
