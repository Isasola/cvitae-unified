# SEO + Observation PROD Preflight Checkpoint — 2026-10-01 / 2026-10-02

Evidence level: read-only PROD preflight, as supplied for this checkpoint.
No PROD write, migration apply, historical apply, or deploy occurred.

## First-party SEO

```text
TOTAL_INVENTORY=16459
SEO_CONTENT_READY_INDEPENDENT_OF_LIFECYCLE=15095
SEO_ROW_READY=6285
SEO_EFFECTIVE_READY=6285
SEO_ROW_RECONCILIATION_DIFFERENCE=0
```

First-party SEO routing is `PROD_PREFLIGHT_VALIDATED`: `SEO_ROW_READY` equals
`SEO_EFFECTIVE_READY`. Source Permission and legacy `seo_enabled` do not veto
first-party SEO. Google Jobs and third-party distribution remain separate and
fail-closed. Do not reopen SEO without concrete regression evidence.

## Lifecycle and observation coverage

```text
LIFECYCLE_UNRESOLVED_TOTAL=9141
SEO_CONTENT_READY_WHILE_LIFECYCLE_UNRESOLVED=8690
LIFECYCLE_REFRESH_REQUIRED=8690
LIFECYCLE_CONTENT_NOT_READY=451
LIFECYCLE_RECOVERABLE_NOW=0
LIFECYCLE_SYSTEM_ERROR=0
NO_OBSERVATION=8996
```

Content-ready unresolved rows by leading source:

```text
himalayas=7726
unjobs=723
weworkremotely=92
computrabajo=53
```

The ordinary `OpportunitySink`/ingestion path persists opportunities but does
not produce per-row `opportunity_source_observations`. Enrichment and
maintenance do produce those observations. The database observation-to-
Opportunity-Universe refresh trigger is connected. The 8,996 `NO_OBSERVATION`
rows account for most lifecycle-unresolved rows; 8,690 have SEO factual content
ready but still require lifecycle evidence.

## Existing recovery mechanisms and safety

- Himalayas has a paginated API enumeration and an existing reconciliation
  planner. Exact identities actually seen can produce positive evidence. An
  absent ID must not be marked DEAD unless completeness of the relevant source
  snapshot is demonstrated.
- UNJobs has existing certified, bounded maintenance. Its scout is not a
  complete-snapshot proof.
- WWR RSS is discovery evidence, not lifecycle proof; a detail adapter exists,
  while automatic maintenance is disabled.
- Computrabajo does not yet have a sufficient V2 detail/observation cable.
- Do not invent `ACTIVE`; absence from an incomplete feed is not `DEAD`.
  The lifecycle reducer has no canonical maximum-age/TTL authority for
  reactivation. Old observations must not silently reactivate rows.

`REPAIRABLE_ROWS=346` is not equivalent to
`LIFECYCLE_RECOVERABLE_NOW=0`: the former primarily counts persisted-state
corrections toward inactive/HARD_DEAD, not positive SEO recovery. The latter
counts unresolved rows with sufficient current evidence for deterministic
positive recovery. These metrics describe different sets.

## State

`OBSERVATION_COVERAGE = POST_RELEASE_WORKSTREAM`. It does not block the 6,285
rows currently demonstrated SEO-ready. No source-specific recovery, scraping,
or historical apply was performed as part of this preflight checkpoint.
