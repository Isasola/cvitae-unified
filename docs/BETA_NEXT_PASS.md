# CVitae beta — next authorized pass

Status: `PLAN_ONLY / IMPLEMENTATION_NOT_AUTHORIZED`

Production base: `ce6dc7aba3dec35c6785fb7100d6125cd0962dab`.
Canonical bugs: `docs/BUG_REGISTRY.md`.

## Objective

Restore the real beta journeys for at least the current nine users by finding
shared failure boundaries once and repairing them end to end. Do not implement
from screenshots, change scoring, broaden source permissions, or treat a page
limit as the product universe.

## Pass 1 — grouped P0 diagnosis: ATS and CV rewrite

Scope: BUG-002 and BUG-003, with BUG-004 as the downstream journey contract.

Map once:

`selected CV/version → request producer → validation/parser → provider → normalized result/proposal → persistence → UI state → retry/reload/download`

Required evidence before a fix:

- exact client action and endpoint/function for each flow;
- sanitized request correlation, HTTP status/body contract, and stage-safe log;
- provider invocation/result separated from database persistence;
- whether ATS diagnosis and rewrite preparation share a producer, parser,
  provider, persistence table, or only user-facing copy;
- successful, invalid-input, timeout/provider, persistence-failure, retry, and
  reload branches;
- user ownership and absence of CV/PII in logs.

Decision gate: group the implementation only where the same proven cable is
broken. Otherwise preserve separate failures and contracts.

## Pass 2 — real matching delivery

Scope: BUG-001 only after the P0 provider/persistence boundary is understood.

Trace:

`Candidate Truth → eligibility → final Matching Universe → retrieval → ranking → persisted diagnostic/result → authenticated profile`

Required accounting:

- last proven and first unproven gate for the affected profile, without
  exporting private evidence;
- complete applicable denominator versus processing window;
- lifecycle, source identity/operational state, matching-specific restriction,
  candidate eligibility, professional compatibility, abstention, and delivery;
- `ERROR`, `NO_RUN`, `SUCCESS_ZERO`, `STALE`, `DENY`, `ABSTAIN/POTENTIAL`, and
  `MATCH` remain distinct;
- a second user cannot access the first user’s results.

Do not apply C4 merely because zero matches are observed. C4 remains a
separately reviewed, not-deployed proposal until its database dependencies and
write authorization are approved.

## Pass 3 — opportunity coverage and operator truth

Scope: BUG-005, BUG-006, BUG-007.

Use one denominator map:

`producer/source → Opportunity Truth → classification → lifecycle → independent consumer gates → catalog/matching/Admin → UI totals/filters`

Prove stored, source-resolved, lifecycle-valid, consumer-allowed, classified,
filtered, displayed, and excluded-by-reason totals. Preserve:

- `JOB LOCATION != CANDIDATE ELIGIBILITY != WORK ARRANGEMENT`;
- Catalog, Matching, Alerts, SEO, JobPosting, Google Jobs, and third-party
  decisions are independent;
- UNKNOWN remains evidence-bearing and never becomes permission;
- a batch/page budget never becomes the total universe;
- Admin projects existing authorities rather than creating a new one.

## Pass 4 — evidence-based SEO recovery

Scope: BUG-008 after a Search Console evidence capture approved by the user.

Compare the last 28 days with the previous 28 for impressions, clicks,
position, query, and page. Reconcile those changes with the authorized SEO
Universe, sitemap denominator, canonicals, robots/noindex, lifecycle/expiry,
404/soft-404 and actual indexed coverage. The previously observed 6,038 preview
URLs are historical preview evidence, not an indexing or traffic target.

No valid page is removed and no denied/unknown source is published merely to
increase counts.

## Pass 5 — CV journey clarity and shared loading pattern

Scope: BUG-004 and BUG-009 after P0 operations function reliably.

Make the actual state machine visible:

`select → request improvement → review factual proposal → accept/reject → find version → download/use`

The original remains immutable. One accessible loader reflects real stages,
errors and retry; mobile and reduced-motion behavior are acceptance criteria.
Do not add a UI library solely for aesthetics.

## Evidence and release gates

For every implemented block, require:

1. focused local discriminating tests;
2. real dependency preflight where infrastructure is involved;
3. build/compile appropriate to changed paths;
4. Deploy Preview only when explicitly authorized;
5. production smoke with real consumer action, error/retry, persistence and
   reload;
6. bug registry update with fixed SHA and production closure evidence.

`LOCAL CODE != PASS`; `PASS != CLOSED_LOCAL` without E2E;
`CLOSED_LOCAL != PROD_VALIDATED`.

## NEXT_EXACT_ACTION

In the next conversation, authorize one read-only diagnostic pass for
BUG-002/BUG-003. Capture the exact endpoints and sanitized production request
correlation/log stages for one ATS failure and one rewrite-preparation failure.
Do not change code until their last common proven gate and first divergent
failure are known.
