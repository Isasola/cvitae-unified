---
name: cvitae-scrapers
description: Investigar primero las fuentes reales y conseguir oportunidades verificables para CVitae, eligiendo por portal el método correcto y usando Registry, Sink, observaciones, Universo y consumidores existentes hasta un resultado medido. También auditar/reparar mantenimiento sin ciclos de infraestructura ni cierres por PASS local.
---

# CVitae Scrapers

## Product-first invariant — READ BEFORE ACTING

**Information before implementation; product outcome before code completion.**
The task is not to build a scraper for its own sake. First establish that the
actual source exposes relevant, distinct, current records and determine exactly
how to retrieve their true fields. Then integrate **that source's** producer into
CVitae's existing contract and measure the resulting consumer outcome.

A scraper `PASS`, HTTP 200, 100 discovered URLs, local JSONL, a new registry
profile, a green cron, or an upsert audit is **NOT** an added opportunity.
Never declare the acquisition goal met without independently verified
`DISCOVERED -> UNIQUE_CURRENT -> NEW_VS_PROD -> SUBMITTED -> PERSISTED ->
OBSERVED/SEALED -> EFFECTIVE_CONSUMER -> USER_VISIBLE` evidence, as applicable.
Preserve unknown states instead of converting them into fabricated zeros.

If the request is to **obtain new opportunities**, do not finish merely after
an architecture audit, a bounded sample, fixtures, an unused adapter, or a
report that says another prompt is needed. Work the complete authorized local
path in one coherent pass. If production authorization or a real rights/access
constraint prevents the final step, prepare **one** executable, narrowly
scoped operator decision; never silently cross that boundary.

## Purpose and authority

This skill supplements the current master item; it never creates a replacement
roadmap or broadens authorization. Resolve conflicts in this order:

1. The user's current explicit instruction.
2. `docs/GRAND_CHECKPOINT.md` — position and scope ledger, when present.
3. `WORKING_PRINCIPLES.md` — reasoning constitution, when present.
4. `AGENTS.md` and repository safety rules.
5. This skill and its references.
6. Examples and fixtures.

The Grand Checkpoint wins over this skill unless the user explicitly changes
scope. Read `AGENTS.md`, **the full current `WORKING_PRINCIPLES.md`**, the
current Grand Checkpoint/item, then this SKILL and the relevant references.
Treat the principles as active constraints, not a generic reminder or a style
guide. Respect the current user's scope and the release/checkpoint evidence;
do not restart investigations already proven unless source content changed.

The shared repository skill is `skills/cvitae-scrapers/`. Codex may also have
an active user skill at `~/.codex/skills/cvitae-scrapers/`. Verify which copy is
loaded and synchronize **only after** preserving existing local differences.
Do not treat an updated copy in a ZIP as already installed in the workspace.

## When to use

Use this skill for work materially involving scrapers, Source Registry V2,
source identity, adapters, OpportunitySink, source telemetry, maintenance,
inventory reconciliation, source-policy boundaries, or routing of
scraper-derived opportunities. If another subsystem is primary, use this skill
only for its exact shared source boundary; do not turn an incidental source
reference into a scraper audit.

## MANDATORY GATE 0 — Source truth before writing code

For a new, repaired, or expanded producer, perform targeted **live external
source reconnaissance** before choosing tools or editing its adapter. Reuse
fresh source evidence rather than refetching what was just confirmed. Follow
[references/source-first-result-contract.md](references/source-first-result-contract.md).

For **each material source**, establish with dated evidence:

1. Source owner, original vs aggregator/discovery authority, source host and
   official listing/feed/API endpoint; verify redirects and canonical URLs.
2. Real collection contract: public access, robots/terms/API conditions,
   authentication, allowed rate/use, and **per-consumer** rights for private
   matching, catalog, SEO/JobPosting, alerts and redistribution. Public access
   or robots permission does not alone grant republication. `UNKNOWN` is
   recorded explicitly; it is not a global DENIED or affirmative permission.
3. Discovery **denominator**, pagination/next cursor/EOF, dates, actual number
   of individual current postings vs counters, multiple openings per post,
   duplicates and expected throughput. A sample is evidence, not coverage.
4. Exact field authority: whether title, native ID, employer, vacancy count,
   deadline, applying audience and apply URL live on the **listing**, detail,
   structured data, feed, API, hydration state or PDF. Never overwrite an
   authoritative listing title with an institution header on the detail.
5. Stable compound identity (tenant/source + native ID where needed), distinct
   canonical/detail/apply URLs, cross-source duplicates and current Sink/DB
   unique conflict behavior. Same application URL can serve several jobs.
6. Source-specific country/location, candidate eligibility, remote scope,
   publication/open/closing dates, employer, description and evidence classes.
   Never invent eligibility, expiry, job country or remote reach from context.
7. Failure and fallback behavior: 404/410 vs 403/429/5xx, pagination drift,
   dynamic rendering, source permission restrictions and a viable substitute.

**Method decision comes after inspecting the real source:** JSON/API/ATS ->
`requests`/`httpx` and native pagination; XML/RSS -> feed/XML parser; server
HTML -> `requests.Session` + BeautifulSoup and listing/detail fusion; embedded
state/JSON-LD -> verified structured extraction; client-rendered JS ->
Playwright **only if simpler supported methods cannot obtain the facts**;
PDF -> text extraction with source identity and explicit parsing safeguards.
Never prescribe Python, Playwright, generic HTML or a fixed scraper template
before discovering how that portal actually works. Each source has its own
adapter contract within a shared CVitae pipeline.

**Source viability decision** before building: proven useful coverage, source
truth/quality, actual access, consumer-specific use, cost of maintenance, and
expected NEW opportunities. Choose original employer/official/ATS feeds when
possible. For blocked/ineligible sources, record the exact reason and move to
another viable source in the same pass instead of building an idle connector.

## MANDATORY GATE 1 — End-to-end acquisition, not detached artifacts

Apply existing tools in this order, adapting only the source boundary:

`source/owner -> scout -> source-specific adapter/cleaner -> Registry V2
identity -> OpportunitySink -> DB + ingestion lineage -> source observation
-> quality/factory/Universe -> independent consumer policy -> private B2C
matching / catalog / alerts / SEO -> Admin/user evidence`.

Inspect relevant current files, especially `scrapers/source_registry.json`,
`scrapers/source_registry_v2.py`, `scrapers/source_identity.py`,
`scrapers/source_cleaners/profiles.py`, `scrapers/source_adapters.py`,
`scrapers/opportunity_sink.py`, `scrapers/observation_writer.py`,
`scripts/run_scraper_monitored.py`, and runtime policy. **Check the actual
checkout; a historical snapshot is not the current live contract.**
Never bypass the Sink by direct REST, parallel tables or a source-specific
consumer shortcut. Preserve native identity/provenance/description through
allowed fields and lineage; do not assume a Python property survives the Sink.

Keep matching private and independent from public catalog/SEO. Do not switch
off matching because SEO permission is DENIED/UNKNOWN; nor publish material
where an explicit, substantiated right blocks the target consumer. Do not
fabricate `verified`, `is_active`, `auto_enabled` or an admin policy event to
make a test green. Address a real certification gate through the existing
operator control and explicit authorization.

Prove: (a) incoming new row, (b) historical/backfill parity, (c) negative
unready/expired/restricted row with explicit reason, (d) next scheduled run
idempotent with durable cursor, (e) consumer's effective state + Admin trace.
If blocked, identify the last proven gate and **first** failed/unknown gate,
then fix or document only that boundary, without reopening unrelated items.

## MANDATORY GATE 2 — Measured outcome and single decision

Use the six business counters `DISCOVERED / UNIQUE_CURRENT /
NEW_VS_PRODUCTION / INSERTED / EFFECTIVE_PRIVATE_MATCHING / VISIBLE_CATALOG`.
Optionally add `SEO_EFFECTIVE` only when in scope/authorized. Report per-source
and global denominators; distinguish HTTP fetch, parsed fields, normalized,
Sink submitted, inserted/updated/unchanged, observations and final visibility.
`PROVEN_NEW=0` from a missing DB comparison is false: report `UNVERIFIED`.
Count historical recovered separately from **genuinely new** postings.

Before a production-dependent operation, prepare **one** full external
read-only compatibility check of schema, functions, roles, policies, secrets
presence (never values), runtime gates and target version; never discover one
assumption per failing deploy. Local fixture PASS is not PROD readiness.
Only after explicit authorization may a narrow one-ID monitored canary use
the real Sink, with exact release SHA, source control, kill switch and
post-write verification. An audit-mode run cannot be called insertion.

The terminal status is **PRODUCT_VERIFIED** only with independently observed
production persistence, lineage, factual observation, effective independent
consumer and user-facing evidence. Otherwise state `LOCAL_READY`,
`READ_ONLY_PROD`, `PROD_PENDING_AUTHORIZATION`, or the exact material blocker,
with ONE next command/decision, not another exploratory roadmap. Avoid
self-imposed loops of `research -> code -> PASS -> another report`.

## Scope discipline

- Work only the current item or an explicitly requested adjacent dependency.
- Do not re-audit closed items without concrete regression evidence.
- A checklist or historical procedure in a reference is not permission to run
  every maintenance step. Prefer the smallest targeted verification that
  resolves the current gate and reuse existing evidence.
- Named sources and fixtures are test cases, never the definition of the
  applicable universe.
- For substantial reports state `CHECKPOINT`, `CURRENT ITEM`, `CLOSED THIS
  PASS`, `NEXT`, and `EVIDENCE LEVEL`. Do not renumber or replace the master
  checklist. A truthful local state may be `OFFLINE_READY / PROD_VALIDATION_PENDING`.

## Systems reasoning

Trace the relevant path end to end:

`UPSTREAM → TRANSFORMATION → PERSISTENCE → POLICY → CONSUMERS → OUTPUT QUALITY → OBSERVABILITY → FAILURE → RECOVERY`

Before calling work done, identify what enters before the changed boundary and
what consumes it afterward. A passing component test is not downstream
completion. Progress in order: `CONNECTIVITY → COVERAGE → CORRECTNESS → QUALITY`.

For factual claims, trace `SOURCE FACT → PRODUCER BRANCHES → EVIDENCE CLASS →
NORMALIZATION → PROVENANCE → CREATE/UPDATE/NO-OP/HISTORICAL → ENTRYPOINT →
PERSISTENCE → POLICY → CONSUMERS → OBSERVABILITY → FAILURE/RECOVERY`. Field
survival alone is not semantic proof. Audit positive claims, source-wide
constants and fallbacks; never let source context, search geography, remote
work or operational TTL become a row fact without a source contract.

For bulk/inventory work, establish the real applicable universe, process to
end of data when required, and account for duplicates and unexplained rows.
Never promote a first page, `500`, `1000`, or fixture size into a universe.
Keep discovery coverage separate from processing budget. Consider both
historical persisted rows and future automatic ingestion: a backfill does not
prove future automation, and a future-path fix does not repair history.

## Permanent separations

- Source permission ≠ row readiness ≠ effective consumer permission.
- Source enabled ≠ consumer enabled ≠ row routable.
- Catalog ≠ matching ≠ alerts ≠ SEO ≠ JobPosting ≠ Google Jobs.
- SEO readiness ≠ SEO operational state ≠ search-engine permission.
- Job location ≠ candidate eligibility ≠ work arrangement; remote ≠ worldwide.
- UNKNOWN ≠ TRUE ≠ FALSE ≠ SUCCESS; queued ≠ running ≠ success.
- Discovered ≠ attempted ≠ submitted ≠ inserted.
- Tested locally ≠ deployed ≠ verified in production.

Do not let one consumer's denial disable unrelated consumers unless the actual
contract says so. Registry V2 is canonical identity authority: resolve aliases
and source families deterministically; unknown identity fails closed. Never
add source-specific downstream bias merely to make a source pass.

When routing is in scope, evaluate separately: source capability/permission,
row intrinsic readiness, stored operational gate, effective decision, and
downstream reachability. A stored false is configuration evidence, not proof
of contractual prohibition. Keep explicit restriction, configuration disabled,
and UNKNOWN distinct.

## Evidence and accounting

Label evidence precisely: `STATIC`, `CONTRACT`, `FIXTURE`,
`INTEGRATION_LOCAL`, `BROWSER_E2E`, `READ_ONLY_REAL_DATA`, or `PRODUCTION`.
Use lifecycle states where relevant: `DESIGNED`, `IMPLEMENTED`,
`TESTED_LOCAL`, `PUSHED`, `DEPLOYED`, `EXECUTED_PROD`, `VERIFIED_PROD`.
Never describe static, contract, or fixture evidence as E2E or production
verification.

Metrics must reconcile where applicable: for example,
`GLOBAL_TOTAL = SUM(PER_SOURCE_TOTAL)`. Keep discovery, detail attempts,
parsing, submission, and persistence outcomes distinct. Persistence accounting
must preserve inserted, updated, unchanged, rejected, failed, and
budget-skipped. Do not rename a narrower metric into a broader one to make
numbers align.

For field survival distinguish `NOT_PROVIDED`, `EXTRACTION_FAILURE`,
`LOST_BEFORE_PERSISTENCE`, `DOWNSTREAM_DERIVED`, `UNKNOWN`, and `PERSISTED`.
A static analyzer's UNKNOWN is not proof of a loss.

Source fact truth and source permission truth are separate. For a material
source, record evidence for collection/detail fetch, catalog, matching,
alerts, indexing/SEO, Google Jobs, third-party distribution, attribution,
application routing and polling limits. UNKNOWN is never permission.

## Safety and deployment economy

No production write, migration, deploy, push/merge that triggers production,
production scraper run, policy mutation, publication, or destructive action
without explicit user authorization. Read-only production work is allowed only
when explicitly scoped read-only and technically guarded; read-only scripts
must fail closed against mutation methods.

When deployment opportunities are constrained, exhaust reasonable local,
contract, and read-only evidence first, then batch compatible well-tested
changes into a release candidate. Do not encode temporary deployment quotas in
this reusable skill.

## Principles coverage check (mandatory, not optional)

At the end of a substantial source change, reconcile against the **entire**
`WORKING_PRINCIPLES.md`: one canonical trace; system before component;
example vs universe; invariant and denominator; historical plus future;
connectivity/coverage/correctness/quality; fact/semantic/provenance survival;
independent permissions/location/eligibility/arrangement; no guesses;
Admin observability and safe operator lifecycle; reuse rather than
reinvention; no closed-work reaudits; honest evidence levels; semantic
positive/negative/adversarial tests and CREATE/UPDATE/NO-OP/RESTORE; whole
universe and one external truth preflight; gate closure A/B/C/D; bounded cost
without silently truncating coverage; canonical incident/checkpoint handoff.
A checkmarked list is not proof: link each material claim to real evidence.

## Detailed references

- Read [references/checkpoint-methodology.md](references/checkpoint-methodology.md)
  for scope gates, universe/accounting, routing, and reporting details.
- Read [references/source-first-result-contract.md](references/source-first-result-contract.md) **first for acquisition or source expansion**: method-by-source, real-field reconnaissance, viability, intake and product outcome.
- Read [references/contract.md](references/contract.md) for opportunity
  fields, lifecycle, and ingestion constraints.
- Read [references/operational-maintenance.md](references/operational-maintenance.md)
  only for source maintenance, observations, adapters, or operational recovery.

For actual scraper changes, inspect the current `scrapers/opportunity_sink.py`,
`scripts/run_scraper_monitored.py`, and
`scrapers/runtime_policy/sitecustomize.py` before acting. New sources remain
in review until evidence supports gradual activation; a scraper never directly
publishes, verifies, ranks, or grants catalog/matching/SEO permission.
