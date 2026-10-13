# CVitae canonical bug registry

## R3 local implementation evidence — 2026-10-12

This updates the existing bugs; it does not create another registry.

- **BUG-001 — `FIX_LOCAL / PROD_VALIDATION_PENDING`.** Semantic top-N is now selected inside the requested canonical private consumer universe through new, unapplied `match_consumer_opportunities`; Matching and Alerts stay separate and Catalog/SEO cannot consume it. Shared freshness reasons distinguish profile change, age, both, missing signature, no run, run error and invalid timestamp. Current counts are null unless the run is valid/current; historical results are explicitly historical. RR. II., coordination and project-management canaries cover confirmed MATCH and eligibility-unknown POTENTIAL. Recovery of the real anonymous beta case remains pending.
- **BUG-002 — `FIX_LOCAL / PROD_VALIDATION_PENDING`.** ATS has request correlation and first-failing-stage diagnostics, a bounded provider call below the platform ceiling, and distinct validation/provider-timeout/provider/persistence errors. It never retries expensive generation internally. The observed production 502 remains uncorrelated and is not attributed to Bedrock.
- **BUG-003 — `FIX_LOCAL / PROD_VALIDATION_PENDING`.** New idempotent migration `202610120001_remove_legacy_generated_cvs_uniqueness.sql` removes only the exact proven legacy constraint, preserving the version triple, non-null normalized vacancy identity, advisory locking, immutable history and owner-scoped endpoints. SQL is prepared, not applied.
- **BUG-004 — `FIX_LOCAL / PROD_VALIDATION_PENDING`.** The existing choose → prepare → compare → attest → accept flow remains. Acceptance now classifies persistence/legacy-constraint failure without losing the proposal; success reloads the immutable resulting version. Deployed E2E remains required.
- **BUG-005 — `FIX_LOCAL / PROD_VALIDATION_PENDING`.** An exact filtered Catalog count RPC feeds `X-Total-Count`; the UI no longer calls the current page length the inventory total. SQL is prepared, not applied.
- **BUG-006 — `FIX_LOCAL / PROD_VALIDATION_PENDING`.** OpportunityDesk, Buscojobs, Becal and Arbeitnow have configurable larger budgets and repeat/EOF-versus-budget semantics. Greenhouse and Lever adapters, fixtures and Registry identities use an empty explicit allowlist. Collection and every consumer permission remain off/review-required. Jobicy and any unverified continuation contract remain open.
- **BUG-007 — `FIX_LOCAL / PROD_VALIDATION_PENDING`.** `user_detail` now exposes confirmed-only candidate intelligence, exact freshness reason, current-versus-historical results and evidence-backed actions. “Actualizar matching” reuses the existing retrieval state with dedupe, cooldown and compare-before-update; no parallel queue, email or benefit grant. Sample and exact-total scopes remain distinct.
- **BUG-008 — `FIX_LOCAL / PROD_VALIDATION_PENDING`.** Shared truth/SEO gates now reject captured navigation, generic titles, repeated-title descriptions and fact-free descriptions, and Eight Gates reports these reasons. The EU Delegation fixture rejects `Breadcrumb`, keeps job location separate and no longer invents candidate eligibility or independent verification. Google validation is pending.

Directed evidence: `verify_r3_cv_version_migration.ts`, `verify_r3_matching_freshness.ts`, `verify_r3_matching_profile_canaries.ts`, `verify_item57_matching_observability.ts`, `verify-public-opportunity-pagination.ts`, `verify_eu_delegation_opportunity_truth.py`, `verify_ats_connectors.py`, source Registry/coverage/field-survival verifiers and a direct Vite production bundle. No production write was performed.

Consolidation note: `git diff --check` passed (only LF/CRLF notices). The final `UserDetailDrawer.tsx` change was presentation-only and has no visual rerun; earlier desktop/mobile visual checks remain scoped to the prior presentation. No BUG is marked closed or production-validated by this evidence.

This is the single canonical registry for observed product defects after the
SEO/B2C production release at `ce6dc7aba3dec35c6785fb7100d6125cd0962dab`.
It records evidence and acceptance criteria; it is not proof of diagnosis,
implementation, closure, or production validation.

## Governance

- Stable IDs are never reused or renumbered.
- Allowed states: `OBSERVED_PROD`, `DIAG_PENDING`, `FIX_LOCAL`,
  `PROD_VALIDATED`, `BLOCKED`.
- Facts, hypotheses, first proven failure, and evidence level remain separate.
- A screenshot or message can establish a symptom, not its upstream cause.
- A fix is closed only after the real producer-to-consumer path, negative
  cases, retry/recovery, persistence, reload, and production behavior pass.
- Do not copy private CVs, emails, tokens, raw user evidence, or identifiable
  screenshots into this registry or portable checkpoints.
- `docs/POST_RELEASE_BACKLOG.md` tracks deferred work. It may reference these
  IDs but must not duplicate this registry as a second bug authority.

## Summary

| Priority | Count | IDs |
|---|---:|---|
| P0 | 3 | BUG-001, BUG-002, BUG-003 |
| P1 | 5 | BUG-004, BUG-005, BUG-006, BUG-007, BUG-008 |
| P2 | 1 | BUG-009 |

## BUG-001 — Profile produces no matches

- **Priority / state:** P0 / `DIAG_PENDING`
- **Affected route and symptom:** authenticated candidate profile/dashboard;
  a real account enters the profile but receives no recommendations.
- **Expected:** the UI distinguishes a genuine zero-result outcome from a
  loading, retrieval, eligibility, ranking, persistence, or delivery failure;
  eligible and relevant opportunities reach the private profile with factual
  explanations.
- **Evidence:** operator observation after production release. Previous
  checkpoint evidence also records real-data matching and observability gaps.
  No private profile data is retained here.
- **Flow:** Candidate Truth → candidate eligibility → final Matching Universe
  → retrieval → Matching V2/V2.1 → persisted result/diagnostic → private
  profile consumer.
- **Data authority:** candidate-owned profile/Candidate Truth; canonical
  Opportunity Truth; `opportunity_final_matching_universe`; canonical matching
  decision and retrieval state.
- **Facts:** recommendations are absent for the observed account. Production
  release, authentication, and complete matching E2E have not been jointly
  validated.
- **Hypotheses, not facts:** empty eligible supply, artificial exclusion,
  stale or incomplete retrieval, missing Candidate Truth, matcher abstention,
  endpoint failure, or UI delivery failure.
- **First proven failure:** not yet localized. Last proven gate and first
  unproven gate must be captured without exposing candidate evidence.
- **E2E acceptance:** authenticated profile loads; current Candidate Truth is
  used; full applicable denominator is accounted; eligible excellent/medium
  candidates are ranked correctly; hard-ineligible is denied; insufficient
  evidence abstains/presents POTENTIAL per contract; true zero is explicit;
  errors retry; results and explanations survive reload; no scoring or
  permission change occurs without evidence.
- **Minimum discriminating tests:** one excellent, one medium, one hard-denied,
  one insufficient-evidence candidate; DB error versus success-zero; stale
  profile versus current signature; retrieval coverage accounting; different
  authenticated user isolation.
### Evidence update — 2026-10-12

- Status remains P0 / `DIAG_PENDING`; the previously recorded initial symptom is now backed by **read-only production diagnostics**, not merely the UI screenshot.
- `matching_diagnostic_snapshots` default mode: 5 successful runs in 7 days (1 distinct account), latest 2026-10-12 00:45 UTC. Each: 388 unique candidates evaluated from windows of up to 300 recent + 120 semantic (these windows are NOT universe totals); 0 confirmed matches, 0 visible potential, 376 abstentions, 12 denials, `DATA_COVERAGE_GAP`, `NO_SCAN`, embedding `READY`, 70 potential-scoreable and 70 professional-fit-known. Repeated run counts are **not** additional inventory rows.
- Same-time read-only source/Universe reconciliation, checked 2026-10-12 01:17 UTC: `opportunity_universe_state` 16,541; `matching_row_state=READY` 6,224; final matching 203; final catalog 204; final SEO 6,021. Matching final's 203 rows all report canonical source **himalayas**, remote=true; 202/203 have neither explicit eligible countries nor eligible regions; 21 have `remote_scope`; 1 has eligible countries. Remote is NOT eligibility or global permission.
- Per-source first-gate query for the 6,224 matching-ready rows: 5,830 failed the queried matching-switch condition; 191 passed those queried source gates but did not reach `final_matching_state=READY` (UNJobs 105, Computrabajo 86); 203 final READY. Key blocked counts: Himalayas 5,238; We Work Remotely 472; OpportunityDesk 33; Arbeitnow 27; Jobicy 21; others. A matching switch denial may be intentional: NEVER bulk-activate it. Read exact policy, overrides, effective switches, permits, historical versions and lifecycle first.
- Caution: `source_matching_state` uses values such as `ALLOWED/DENIED/UNKNOWN`; a previous count filtered on literal `READY` returned zero and is **not evidence of a fault**. `HARD_REQUIREMENTS_UNKNOWN=388` is recorded by the current diagnostics but was not independently proven to be the unique blocking gate. The 388 evaluated and 203 final rows may use different read paths, times and denoms; reconcile the actual match-batch RPC/joins and source set before claiming 185 rows lost.
- The Learning Plan UI showed opportunity-backed learning suggestions (a 5-opportunity gap and 2-opportunity gaps), but it can consume a different or historical candidate set. Mark only that narrow UI outcome observed; it does NOT prove Dashboard matching, relevance or clickthrough. The shown customer-service suggestions may be poorly fitted to this candidate and need a professional-family factual canary.
- First proven boundary: engine responds `SUCCESS_ZERO`, not client-only invisibility. Exact divergence between retrieval, source-policy/effective authority, eligibility evidence, professional fit and delivered `MATCH/POTENTIAL` remains to be localized.
- Next targeted proof: stage-accounting against the same timestamped denominator and immutable opportunity IDs, historical & future reconciliation, no cross-user disclosure, explicit `MATCH/POTENTIAL/ABSTAIN/DENY/ERROR` states; do not merge/apply C4 merely to change this zero.

- **Detected / fixed / closed:** detected `ce6dc7a`; fixed `—`; production
  closure `—`.

## BUG-002 — ATS diagnosis returns HTTP 502

- **Priority / state:** P0 / `DIAG_PENDING`
- **Affected route and symptom:** ATS diagnosis flow shows “No pudimos
  completar la operación”; browser console reports HTTP 502.
- **Expected:** a supported CV request reaches the actual ATS endpoint and
  provider, returns or persists a factual diagnostic, and exposes a safe,
  retryable stage/reason on failure.
- **Evidence:** operator-visible production message and HTTP 502. No function
  logs or provider response have yet been correlated.
- **Flow:** selected CV/input → client request → Netlify function/API → input
  validation → provider → normalized ATS result → persistence → UI.
- **Data authority:** user-scoped CV/version and the endpoint’s persisted ATS
  result contract; provider output is evidence, not automatic Candidate Truth.
- **Facts:** production request returns 502 to the client.
- **Hypotheses, not facts:** provider outage, timeout, invalid payload,
  environment/configuration, function exception, Supabase failure, or response
  size. It is not attributed to Bedrock or Supabase without logs.
- **First proven failure:** HTTP boundary returns 502; internal stage unknown.
- **E2E acceptance:** valid and invalid input branches; authenticated user
  isolation; provider timeout/error and DB error remain distinguishable;
  retry is bounded and idempotent; success persists and reloads; secrets and
  CV text are absent from diagnostics.
- **Minimum discriminating tests:** capture request correlation ID, function
  name/status/body shape, stage-safe log, provider timeout fixture, validation
  failure, persistence failure, retry and successful reload.
### Evidence update — 2026-10-12

- Operator supplied Netlify execution times with one **30,000 ms timeout** on 2026-10-11 at about 20:30 local, and an independently observed browser HTTP 502 on ATS. The timed-out entry did not include function identification in the supplied copy; the connection to `cv-ats-workspace` is therefore **plausible but unconfirmed**. Other invocations finished more quickly.
- Function configuration/code should be consulted to correlate function name, request ID, timestamp, provider start/end and persistence stage; do not assert Bedrock caused the timeout. Avoid repeating paid generation only to reproduce an error. Timeout, provider error, server exception and database failure must produce safe, distinguishable UI states.
- Remains P0 / `DIAG_PENDING`. No deployed fix or successful ATS E2E has been demonstrated.

- **Detected / fixed / closed:** detected `ce6dc7a`; fixed `—`; production
  closure `—`.

## BUG-003 — CV rewrite preparation fails

- **Priority / state:** P0 / `DIAG_PENDING`
- **Affected route and symptom:** CV improvement flow reports “No pudimos
  preparar la reescritura en este momento”.
- **Expected:** the chosen CV and improvement intent produce a reviewable,
  user-scoped proposal without overwriting the original; generation, save,
  display, retry, and reload states are explicit.
- **Evidence:** operator-observed production message. No correlated HTTP or
  provider evidence yet proves common cause with BUG-002.
- **Flow:** selected CV/version → prior diagnostic/evidence → proposal
  preparation → generation → version persistence → review consumer.
- **Data authority:** user-owned CV/version/evidence and persisted rewrite
  proposal/version. Generated claims require grounding in candidate evidence.
- **Facts:** preparation does not complete for the observed flow.
- **Hypotheses, not facts:** shared provider or shared CV parser with BUG-002,
  missing prerequisite diagnostic, payload/timeout, persistence, or UI state.
- **First proven failure:** user-facing preparation stage; endpoint and
  internal stage not yet localized.
- **E2E acceptance:** original remains intact; each stage is distinguishable;
  factual proposal is reviewable; cancel/failure does not save a false
  version; retry is idempotent; accepted version persists, reloads, downloads,
  and is usable.
- **Minimum discriminating tests:** preparation without diagnostic, provider
  error, persistence error, duplicate retry, user isolation, grounded success,
  acceptance and reload.
### Evidence update — 2026-10-12

- Netlify `cv-rewrite-workspace` logs: a Bedrock `global.anthropic.claude-sonnet-4-6` call completed with telemetry status `success`; subsequent attempts logged repeated `duplicate key value violates unique constraint "generated_cvs_user_vacancy"` during the rewrite/version flow. This proves a persistence incompatibility in the observed workflow; the precise failed request action (prepare vs accept) must still be correlated before conflating the two UI states.
- Operator's read-only PostgreSQL catalog confirms the **legacy** constraint `UNIQUE (user_id, vacancy_id)` named `generated_cvs_user_vacancy`, while `generated_cvs_user_vacancy_version_uidx` already uniquely indexes `(user_id, vacancy_id, version_number)`; `generated_cvs_pkey` also exists. This is incompatible with retaining multiple versions for the same user/vacancy.
- Historical migration `202608130005_cv_versions_and_evidence.sql` reportedly drops an old differently named constraint; do not edit that migration in place. Next implementation: inspect dependencies, indexes, NULL vacancy semantics, versions/unique race handling, idempotent retry and legacy callers; prepare a **new migration** removing only obsolete uniqueness after a read-only preflight and explicit operator authorization. No production SQL write now.
- Test across CV Vivo, rewrite acceptance, manual edit and Postulaciones with fake CVs. Preserve original and existing versions; verify exact new version ID, reload, download and at-most-once accept. Repeated AI generation is not required to validate the DB repair.
- Remains P0 / `DIAG_PENDING` (root DB conflict evidenced, fix unapplied, full user flow not closed).

- **Detected / fixed / closed:** detected `ce6dc7a`; fixed `—`; production
  closure `—`.

## BUG-004 — Improve-CV journey is unclear

- **Priority / state:** P1 / `OBSERVED_PROD`
- **Affected route and symptom:** “Mejorar CV” review journey. Operator-provided
  nine-page PDF shows 14 confirmed evidence items, a 15-block proposal,
  “Pendiente de decisión”, and “Aceptar como nueva versión”, but the user does
  not know what was generated, where it is stored, or how to download/use it.
- **Expected:** select CV → choose improvement → review result → accept → find
  new version → download/use, with persistent state and no overwrite.
- **Evidence:** textual summary of the operator’s PDF. The original PDF is
  intentionally excluded because it may contain candidate data.
- **Flow:** CV selection → improvement choice → evidence/proposal → review →
  accept/reject → version persistence → workspace/download consumer.
- **Data authority:** user CV versions, confirmed evidence, and explicit user
  decision.
- **Facts:** the current presentation is confusing to the operator.
- **Hypotheses, not facts:** excessive information density, unclear hierarchy,
  missing post-accept navigation, or ambiguous version naming.
- **First proven failure:** comprehension/action handoff after proposal review.
- **E2E acceptance:** the five-step journey is explicit; original/new version
  identity is visible; comparisons are available but not overwhelming;
  acceptance is confirmable and idempotent; version survives reload and has a
  clear download/use action; cancellation preserves original.
- **Minimum discriminating tests:** first-time user walkthrough, accept/reject,
  reload, download, duplicate acceptance, mobile and accessible focus/order.
- **Detected / fixed / closed:** detected `ce6dc7a`; fixed `—`; production
  closure `—`.

## BUG-005 — Opportunities catalog shows 100 and JOB cards

- **Priority / state:** P1 / `OBSERVED_PROD`
- **Affected route and symptom:** `https://cvitae.lat/oportunidades/` displays
  “100 disponibles” and `JOB` cards inside an experience described as grants,
  programs, and funding.
- **Expected:** totals, category labels, filters, and pagination describe the
  complete authorized catalog accurately; employment and non-employment
  kinds are not conflated.
- **Evidence:** operator observation on production. It does not establish that
  inventory, permitted catalog, or total result count equals 100.
- **Flow:** Opportunity Truth → classification → independent Catalog gate →
  filtered/paginated API → total/count projection → listing cards.
- **Data authority:** canonical Opportunity Truth/classification and final
  Catalog Universe; source permissions remain independent by consumer.
- **Facts:** UI shows 100 and cards labeled JOB.
- **Hypotheses, not facts:** page-size presented as total, missing aggregate,
  category filter/default mismatch, classification issue, or mixed route copy.
- **First proven failure:** listing presentation/count semantics; upstream
  denominator remains unmeasured.
- **E2E acceptance:** reconcile stored → catalog-allowed → filtered → displayed
  denominators; keyset pagination reaches EOF without loss; totals are exact;
  category/filter changes are coherent; DB/policy errors fail closed; no LIMIT
  is relabeled as total and no permission is broadened.
- **Minimum discriminating tests:** more than 100 mixed-kind rows, page 2/EOF,
  exact aggregate, filters, classification UNKNOWN, denied source, DB failure,
  direct detail and reload.
### Evidence update — 2026-10-12

- Source-code investigation indicates `/oportunidades` requests mixed opportunity kinds (`all`) while page copy emphasizes grants/programs; the UI presents a 100-row loaded page as “100 disponibles”. This is not the authoritative total. Same-time production view returned final Catalog **204** (not an indexation or country denominator); exact filtered totals and cross-page continuity still require runtime proof.
- Proposed repair: keep category semantics truthful, account total filtered rows vs current page, support complete pagination and navigation; keep catalogs and permissions independent of Matching/SEO.

- **Detected / fixed / closed:** detected `ce6dc7a`; fixed `—`; production
  closure `—`.

## BUG-006 — Employment appears limited to Paraguay

- **Priority / state:** P1 / `OBSERVED_PROD`
- **Affected route and symptom:** employment discovery appears Paraguay-only,
  while product ambition is LATAM.
- **Expected:** the UI and inventory truthfully represent available LATAM
  coverage, candidate-specific eligibility, workplace arrangement, and chosen
  filters without implying unsupported access.
- **Evidence:** operator observation after release; no full source/country
  accounting has been performed for this bug.
- **Flow:** source discovery → factual job geography/work arrangement →
  Opportunity Truth → lifecycle/policy → catalog/matching → UI filters/results.
- **Data authority:** canonical source identity and provenance; opportunity job
  location; candidate eligibility; work arrangement; independent consumer
  permissions.
- **Facts:** current user experience appears Paraguay-focused.
- **Hypotheses, not facts:** UI default, source mix, missing geography,
  permission/routing exclusions, classification, or true authorized supply.
- **First proven failure:** perception at discovery consumer; upstream boundary
  not localized.
- **E2E acceptance:** full source/country denominator is reconciled; job
  location, candidate eligibility, and work arrangement remain distinct;
  LATAM filters work when factual rows exist; UNKNOWN remains UNKNOWN; no
  prohibited scraper/source is activated automatically.
- **Minimum discriminating tests:** PY, another LATAM country, factual remote
  regional, unknown geography, hard-ineligible candidate, filter reset,
  pagination and source-permission denial.
### Evidence update — 2026-10-12

- Product expansion decision: strengthen existing PY/LATAM/global candidate-appropriate collectors and add **Greenhouse Job Board API** and **Lever Postings API** integrations (company-scoped, documented public GET, no automated applications). See `docs/BETA_NEXT_PASS.md` and `docs/source-coverage-known-gaps.md` for gates.
- Source reality is not proven LATAM-wide by availability of an API. Discovery and a few demo employers are not publishing authorization; each employer board and usage must be validated. Job location ≠ applicant eligibility ≠ work arrangement; unknown does not mean worldwide, Paraguay eligibility, or source redistribution permission.
- A 2026-10-12 same-time production snapshot had final Matching 203 (all Himalayas), Catalog 204, SEO 6,021. These independent denominators must not be collapsed into “LATAM available jobs”.

- **Detected / fixed / closed:** detected `ce6dc7a`; fixed `—`; production
  closure `—`.

## BUG-007 — Admin and observability are incomplete

- **Priority / state:** P1 / `DIAG_PENDING`
- **Affected route and symptom:** Admin E2E remains pending; operators cannot
  yet rely on one validated view of total inventory, per-source processing,
  independent permissions, classification, routing, and exact exclusion
  causes.
- **Expected:** existing Admin projects each canonical pipeline authority and
  its reason/next action without creating parallel truth.
- **Evidence:** explicit postrelease state and prior checkpoint gaps. This is
  not a claim that every Admin panel is broken.
- **Flow:** producers/lineage/observations/Factory/Universe/permissions →
  bounded Admin projections → authenticated operator actions.
- **Data authority:** existing pipeline tables, source registry, observations,
  Universe states, permission policy, and operation audit.
- **Facts:** Admin production E2E has not been completed for this release.
- **Hypotheses, not facts:** missing projections, error-as-zero, stale samples,
  payload size, or absent drill-down.
- **First proven failure:** validation coverage gap; exact product failure must
  be captured in the later Admin pass.
- **E2E acceptance:** total and per-source denominators reconcile; each stage
  shows state/reason/evidence/next action; ERROR differs from ZERO/UNKNOWN;
  row inspector is exact; retries are audited; payloads remain bounded; access
  is authorized and no private candidate data leaks.
- **Minimum discriminating tests:** healthy, failed, skipped, stale, UNKNOWN,
  denied and conflicting source fixtures; exact row drill-down; DB error;
  pagination/aggregate reconciliation; unauthorized access.
### Evidence update — 2026-10-12

- Required operator reconciliation grounded by real data: 16,541 Universe state rows → 6,224 `matching_row_state=READY` → 5,830 stopped at matching-switch condition / 191 final-gap after checked gates / 203 final-ready. Provide per-source canonical identity, counts and first **effective** reason, with timestamps and override/permit provenance; do not display sample count as total or silently convert UNKNOWN to zero.
- Historical evaluated timestamps of some sources are 2026-10-02 through 2026-10-07, so future automation and historical backfill both need evidence. Existing Registry V2/Admin/maintenance/C09 work must be reused before any new implementation. No C3 reopen or new parallel authority.

- **Detected / fixed / closed:** detected `ce6dc7a`; fixed `—`; production
  closure `—`.

## BUG-008 — Organic SEO decline

- **Priority / state:** P1 / `OBSERVED_PROD`
- **Affected route and symptom:** impressions and clicks are reported as
  declining after release.
- **Expected:** authorized, factual, live public pages remain crawlable and
  useful; GSC trends are diagnosed against a comparable period before action.
- **Evidence:** operator-reported decline. Deploy Preview validated 6,038 URLs
  before merge, but that is neither an indexed-URL count nor traffic recovery.
- **Flow:** Opportunity Truth → SEO Universe/permission → inventory → sitemap
  → prerender/canonical/robots → search crawl/index → impression/click signal.
- **Data authority:** canonical SEO Universe and source search permission;
  Search Console for observed search performance.
- **Facts:** reported impressions/clicks decreased; the SEO/B2C release is
  deployed. Current GSC 28-day comparison has not been recorded here.
- **Hypotheses, not facts:** crawl lag, canonical changes, inventory churn,
  expired pages, query/position loss, sitemap errors, or demand seasonality.
- **First proven failure:** external performance symptom; technical boundary
  not yet localized.
- **E2E acceptance:** compare last 28 days versus prior 28 by clicks,
  impressions, position, pages and queries; reconcile sitemap/index coverage,
  canonicals, robots, expired lifecycle and authorization; corrections retain
  valid pages and never publish denied content merely to increase counts.
- **Minimum discriminating tests:** GSC page/query deltas, sitemap sample and
  full denominator, canonical uniqueness, noindex/robots, expired/closed rows,
  permission-denied sources, 404/soft-404 and recrawl follow-up.
### Evidence update — 2026-10-12

- Production read-only counts: final SEO Universe **6,021** as of 2026-10-12 01:17 UTC. Deploy Preview earlier generated 6,038 unique URLs; DIFFERENT run/time and scope, not an indexation drop of 17 and not proof of traffic recovery.
- The build already generates prerender/sitemap/robots, with dynamic Netlify sitemap routing in the current release. Routine manual sitemap editing is NOT indicated. Verify the live response/index pagination, canonical URL, structured data, permission gates, expiry/noindex and what happens when a newly eligible URL is in the dynamic sitemap before its HTML is prerendered. Avoid new duplicate generators.
- Search Console comparisons for last 28 days vs preceding 28 by page and query remain outstanding; do not prescribe re-submitting sitemap or assume a Google penalty. Check sitemap read-path efficiency using existing performance backlog item rather than creating a new issue.

- **Detected / fixed / closed:** detected `ce6dc7a`; fixed `—`; production
  closure `—`.

## Matching routing evidence update - 2026-10-13

- Operator-provided production baseline for this pass: inventory 16,541;
  `match_eligible=true` 6,225; final Matching 204; Catalog 205; Alerts 204;
  SEO 6,022; private CV histories 12; no new R3 migrations applied. The
  confirmed stale source-policy projection affects 5,266 rows across
  Himalayas (5,238), Jobicy (21), and Remotive (7); effective matching is
  enabled while the stored consumer switch is false and dirty reconciliation
  is queued. These are supplied production facts, not a new production query.
- Local code evidence: `run_matching_retrieval_expansion.ts` detects changed
  inventory from `opportunities.updated_at`; its COMPLETE path uses the same
  watermark. `refresh_opportunity_universe` updates `evaluated_at` on every
  evaluation, even when final routing is unchanged. The current retrieval
  schema has no durable matching-routing transition revision. Positive and
  negative recommendation refresh therefore remain unproven and are not
  marked fixed.
- This pass implemented only the bounded/resumable Universe maintenance
  worker and release-gated schedule. Matching invalidation is stopped for an
  architecture decision; see the 2026-10-13 session handoff.

## 2026-10-13 continuation — routing epoch implemented locally

The explicit routing-epoch decision in the continuation order supersedes the
architecture STOP above. A new additive migration now advances one global
matching epoch only on real READY membership transitions, and a service-role
RPC locks that epoch and candidate state before finalization. The retrieval
worker uses FULL scans for routing drift, preserves page cursors, and returns
RESUMABLE while the durable Universe queue remains pending. Matching cache
metadata is epoch-aware; live matching and alert eligibility still use their
own canonical Universes. Local PGlite and focused consumer contracts pass;
there is no production validation. See the current handoff for the remaining
end-to-end and Registry-route gaps.

## 2026-10-13 continuation — routing starvation resolved locally

- Additive, unapplied migration `202610130002_matching_routing_changes.sql`
  adds a transition ledger to the existing routing epoch and updates the
  existing trigger function (no second trigger). Each real matching-membership
  transition increments the singleton and inserts its event atomically. A
  migration baseline leaves legacy candidate baselines unverifiable, so each
  candidate must complete one FULL before using DELTA.
- The retrieval worker now keeps a fixed FULL start revision, then drains a
  bounded ledger interval per candidate with a durable revision cursor. Global
  epoch movement does not restart FULL, and the finalizer can record coverage
  at a target below the current epoch without claiming global freshness.
  Content `updated_at` DELTA remains separate. Routing reconciliation is
  labeled `FULL_BACKFILL` so it cannot masquerade as a new alert event; alerts
  retain their own Universe and delivery ledger.
- Evidence: new PGlite SQL canary validates baseline, trigger transitions,
  atomic rollback, fixed-target completion, ledger-gap rejection and service
  ACL. An isolated local PostgreSQL 17.6 database applied both routing
  migrations; two independent sessions verified a transition waiting behind
  finalization leaves coverage at the fixed target, and competing finalizers
  yield one COMPLETE plus one concurrency conflict, with no deadlock. Eight
  focused deterministic worker/cache fixtures pass. The worker was not driven
  through an HTTP/PostgREST candidate E2E in this pass; production remains
  untouched and unvalidated.

## BUG-009 — Duplicate and overlapping loaders

- **Priority / state:** P2 / `OBSERVED_PROD`
- **Affected route and symptom:** “Analizando tu CV” and “Mejorar CV” show
  overlapping boxes, repeated states, low-legibility text, and inconsistent
  loading presentation.
- **Expected:** one reusable, accessible, mobile-safe long-operation pattern
  reflects real stages without hiding failure or duplicating state.
- **Evidence:** operator visual observation. No personal screenshot is stored.
- **Flow:** operation state/event → shared loader/state projection → ATS and CV
  improvement consumers.
- **Data authority:** actual server operation status and error/retry contract;
  UI must not simulate progress unsupported by that state.
- **Facts:** duplicated/inconsistent presentation is visible.
- **Hypotheses, not facts:** nested loader ownership, duplicated async state,
  or route-specific wrappers.
- **First proven failure:** UI composition; owner component not yet localized.
- **E2E acceptance:** one loader per operation; readable contrast; correct
  stage/error/success/retry; reduced-motion support; keyboard/screen-reader and
  mobile checks; no new dependency solely for aesthetics.
- **Minimum discriminating tests:** both flows at loading/error/success,
  nested-route regression, mobile widths, reduced motion and focus order.
- **Detected / fixed / closed:** detected `ce6dc7a`; fixed `—`; production
  closure `—`.
