# CVitae beta — next authorized pass

Status: `SCOPE_APPROVED_BY_USER / LOCAL_IMPLEMENTATION_ONLY / PROD_WRITE_AND_DEPLOY_NOT_AUTHORIZED`

## R3 implementation result — local only

The coherent local pass is implemented on `work/beta-hardening-postdeploy-20261011`. Three migrations are prepared and unapplied: exact legacy CV constraint removal, consumer-scoped semantic retrieval, and exact Catalog counting. Admin freshness/current-history separation, safe refresh request, ATS stage errors, quality gates, bounded collector continuation, and inactive Greenhouse/Lever connectors have focused fixtures. Full production E2E is intentionally not claimed.

Future beta communication contract: communicate only after a current profile-signature run proves new authorized MATCH rows; use the exact persisted count, consent/preferences/unsubscribe/frequency rules, and an idempotency key bound to user + profile signature + run. Operational notices and promotions are separate. A free-month benefit requires an explicit approved policy and audited grant. STALE, UNKNOWN, POTENTIAL, provider acceptance without delivery, Founding Beta `OFFERED`, FREE plan, and “Ahora no” cannot trigger a “new matches” claim. No email or benefit is sent in this pass.

`NEXT_EXACT_ACTION`: ChatGPT/operator reviews the local commit and ZIP, runs the three unapplied migrations in an isolated database, executes the CV accept/reload/download and matching refresh/persist/reload E2E with synthetic users, then decides whether to authorize a Deploy Preview. Do not publish yet.

Consolidation status: local checks were reused; only whitespace check was rerun for this handoff. The final Admin drawer wrapping/layout adjustment is not visually revalidated. Three migrations remain unapplied; production behavior, persisted multi-user isolation and Google outcomes remain unverified.

Production base: `ce6dc7aba3dec35c6785fb7100d6125cd0962dab`.
Canonical bugs: `docs/BUG_REGISTRY.md`.

## Updated decision — 2026-10-12

The user authorizes **planning/implementation of a coherent LOCAL correction pass** that strengthens existing scrapers and adds Greenhouse + Lever, along with P0 beta fixes and SEO/Universe reconciliation. This does NOT authorize deploy, push, SQL application or live consumer/source-policy switches. Minimize Codex calls: one pre-analyzed implementation pass, targeted fixtures/canaries, then operator review. Treat this as a change to previous `PLAN_ONLY`, not as permission to execute anything in production.

Read `docs/SESSION_HANDOFF_2026-10-12.md` before changing code; it records the latest exact real-data evidence that supersedes earlier speculative diagnostics.

## Objective

Restore the real beta journeys for at least the current nine users by finding
shared failure boundaries once and repairing them end to end. Do not implement
from screenshots, change scoring, broaden source permissions, or treat a page
limit as the product universe.

## Workstream A — P0 ATS timeout and CV version write failure

Scope: BUG-002 and BUG-003, with BUG-004 as the downstream journey contract.

Map once:

`selected CV/version → request producer → validation/parser → provider → normalized result/proposal → persistence → UI state → retry/reload/download`

New already-proven boundary: rewrite AI generation succeeded, then PostgreSQL rejected a new version because `generated_cvs_user_vacancy` `UNIQUE(user_id,vacancy_id)` conflicts with the newer version index. Prepare a new backward-compatible migration after checking NULL handling and all callers; never change old historical migrations. ATS has observed HTTP 502 and one 30s Netlify timeout not yet correlated to the ATS function. Do not conflate the two errors.

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

## Workstream B — real matching, Universe and source-gate reconciliation

Scope: BUG-001 (coordinated with BUG-006/007), retaining separate evidence and user outcomes. The read-only 2026-10-12 snapshot: 16,541 Universe states / 6,224 matching-row READY / 203 final Matching (all Himalayas) / 204 Catalog / 6,021 SEO. Of matching-row READY, 5,830 stopped on queried matching-switch gate, 191 remained final-gap after queried gates (UNJobs 105, Computrabajo 86), and 203 reached final. Do not equate mismatch with proof of broken policy: check effective source permissions, historical overrides, consumer switch provenance, eventual reconciliation and data freshness. Latest default match run evaluated 388 bounded candidates, 376 abstained, 12 denied, 0 MATCH, 0 POTENTIAL, `NO_SCAN` with 70 potentially scoreable. These are independent stage sets; track ID/timestamp lineage. C4 is still isolated and uninstalled.

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

## Workstream C — strengthen all relevant existing collectors + add Greenhouse/Lever + Admin truth

Scope: BUG-005, BUG-006, BUG-007 plus scraper coverage. Preserve documented gaps in `docs/source-coverage-known-gaps.md` and source permission authorities (`docs/source-permission-matrix.md`, Registry V2 and operational state).

**Required implementation intent, not permission to activate:**

- Fix documented pagination/coverage for existing providers in cohesive clusters, without launching 81 sequential jobs under a 60-minute ceiling; use bounded cursor/shards and retries with telemetry. Do not silently turn limits (20/50/100/1,000) into totals. Use current adapters and observation sink, not direct public-table inserts.
- Add two *company-scoped* adapters: `scrapers/greenhouse_scraper.py` (Greenhouse Board GET) and `scrapers/lever_scraper.py` (Lever Postings GET, `skip/limit` pagination). Introduce controlled board/site configuration resolved through the existing Registry V2 aliases and company attribution; no broad indiscriminate internet scanning. Prefer source identity that preserves original employer and ATS provider, and stable provider+employer+posting ID.
- Both integrations begin as **REVIEW_REQUIRED, switches OFF for Catalog/Matching/Alerts/SEO/JobPosting/third-party** until provider/employer permission and use-case are reviewed. Public GET is technical accessibility, not publishing or indexing permission. Original-link attribution mandatory. No application submission.
- Unit/canary tests: successful source pagination and EOF, rate/timeout/retry, duplicate/repeated page, HTTP 404/deleted job, updated/closed job, historical and future state, payload normalization/field survival, source denied/unknown, exact per-source counters and consumer decision.
- Preserve Himalayas first-party SEO permission and its separate JobPosting/Google Jobs restriction; respect WWR and other DENIED/UNKNOWN sources. Audit UNJobs and Computrabajo 191 post-gate rows without assuming authorization.
- Show from Admin the exact count at each gate, actual reason and authorized next action. UI count “100” must not mean full Catalog count; category `JOB` in grants/programs must be deliberate and truthful.



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

## Workstream D — SEO automation, HTML parity and GSC

Scope: BUG-008. Production read-only final SEO 6,021 at 2026-10-12 01:17 UTC, historical preview URLs 6,038 (different snapshot). Existing sitemap is dynamic/automatic; do not hand-edit or create another generator. Audit same-timestamp coverage/permission/expiry, keyset pagination, canonical and robots, and *sitemap discovery versus prerender build freshness* (a new URL must have real HTML/structured data/404 semantics). Use existing performance backlog for first-page scan; evaluate measured necessity, not arbitrary microoptimization.

Search Console verification remains a distinct external evidence requirement; do not assert traffic recovery from URL counts.

Compare the last 28 days with the previous 28 for impressions, clicks,
position, query, and page. Reconcile those changes with the authorized SEO
Universe, sitemap denominator, canonicals, robots/noindex, lifecycle/expiry,
404/soft-404 and actual indexed coverage. The previously observed 6,038 preview
URLs are historical preview evidence, not an indexing or traffic target.

No valid page is removed and no denied/unknown source is published merely to
increase counts.

## Workstream E — CV flow clarity and shared loading pattern

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
