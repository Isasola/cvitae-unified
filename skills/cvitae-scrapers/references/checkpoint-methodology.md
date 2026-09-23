# Grand Checkpoint methodology

This reference supplies durable operating rules for source and opportunity
work. It supports the current Grand Checkpoint item and never replaces it.

## Scope and evidence

Read the exact current item first. Work only that item or an explicit adjacent
dependency. Do not repeat a completed audit without concrete regression
evidence, and do not turn an example, fixture, or source name into the full
scope. Reuse accumulated evidence whenever it answers the current question.

Use evidence labels exactly: `STATIC`, `CONTRACT`, `FIXTURE`,
`INTEGRATION_LOCAL`, `BROWSER_E2E`, `READ_ONLY_REAL_DATA`, `PRODUCTION`.
Their lifecycle labels are `DESIGNED`, `IMPLEMENTED`, `TESTED_LOCAL`, `PUSHED`,
`DEPLOYED`, `EXECUTED_PROD`, and `VERIFIED_PROD`. Local evidence is not
production verification.

## End-to-end and universe checks

Trace `UPSTREAM → TRANSFORMATION → PERSISTENCE → POLICY → CONSUMERS → OUTPUT
QUALITY → OBSERVABILITY → FAILURE → RECOVERY`. Verify both the historical
population and future automatic ingestion when a pipeline boundary changes.

For inventory operations, identify the real source/row universe; paginate or
cursor through end of data whenever that is an acceptance criterion. Do not
substitute a page limit, processing budget, or synthetic fixture for coverage.
Report duplicate and unexplained accounting explicitly. Discovery coverage and
processing coverage are independent.

## Routing and truth

Keep these layers distinct:

1. Source capability/permission.
2. Intrinsic row readiness.
3. Stored operational row gate.
4. Effective consumer decision.
5. Downstream reachability.

Unknown mandatory permission fails closed. Configuration false does not by
itself prove an external restriction. Evaluate catalog, matching, alerts, SEO,
JobPosting, Google Jobs, and any implemented AEO/GEO surface independently;
do not infer a global denial from one consumer.

Registry V2 owns canonical identity. Resolve exact aliases and declared family
patterns only. Preserve raw/emitted identity for diagnostics, and surface a
new unresolved identity rather than guessing.

## Accounting and telemetry

Require reconcilable accounting such as `GLOBAL_TOTAL = SUM(PER_SOURCE_TOTAL)`.
Do not collapse discovered, detail attempted, parsed, submitted to Sink,
inserted, updated, unchanged, rejected, failed, or budget skipped. If an
equation does not reconcile, investigate the data boundary rather than
renaming metrics.

For field survival, null persistence may be valid source absence. Classify
only with evidence: `NOT_PROVIDED`, `EXTRACTION_FAILURE`,
`LOST_BEFORE_PERSISTENCE`, `DOWNSTREAM_DERIVED`, `UNKNOWN`, `PERSISTED`.

## Safety

Read-only production validation needs explicit scope and a technical guard
that rejects mutation methods. It may create local artifacts only. No policy
mutation, deployment, production workflow, migration application, scraper
run, publication, or destructive action follows from a local test unless the
user authorizes it explicitly.
