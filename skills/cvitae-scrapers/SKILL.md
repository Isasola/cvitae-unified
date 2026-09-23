---
name: cvitae-scrapers
description: Auditar, reparar, probar y operar scrapers, identidad de fuente, ingesta, telemetría, reconciliación y routing de oportunidades de CVitae. No usar para expandir una tarea ajena en una auditoría de scrapers.
---

# CVitae Scrapers

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
scope. Read the exact current master-checklist item before substantial work.

## When to use

Use this skill for work materially involving scrapers, Source Registry V2,
source identity, adapters, OpportunitySink, source telemetry, maintenance,
inventory reconciliation, source-policy boundaries, or routing of
scraper-derived opportunities. If another subsystem is primary, use this skill
only for its exact shared source boundary; do not turn an incidental source
reference into a scraper audit.

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

## Detailed references

- Read [references/checkpoint-methodology.md](references/checkpoint-methodology.md)
  for scope gates, universe/accounting, routing, and reporting details.
- Read [references/contract.md](references/contract.md) for opportunity
  fields, lifecycle, and ingestion constraints.
- Read [references/operational-maintenance.md](references/operational-maintenance.md)
  only for source maintenance, observations, adapters, or operational recovery.

For actual scraper changes, inspect the current `scrapers/opportunity_sink.py`,
`scripts/run_scraper_monitored.py`, and
`scrapers/runtime_policy/sitecustomize.py` before acting. New sources remain
in review until evidence supports gradual activation; a scraper never directly
publishes, verifies, ranks, or grants catalog/matching/SEO permission.
