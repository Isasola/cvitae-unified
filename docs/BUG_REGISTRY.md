# CVitae canonical bug registry

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

- **Priority / state:** P0 / `OBSERVED_PROD`
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
- **Detected / fixed / closed:** detected `ce6dc7a`; fixed `—`; production
  closure `—`.

## BUG-002 — ATS diagnosis returns HTTP 502

- **Priority / state:** P0 / `OBSERVED_PROD`
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
- **Detected / fixed / closed:** detected `ce6dc7a`; fixed `—`; production
  closure `—`.

## BUG-003 — CV rewrite preparation fails

- **Priority / state:** P0 / `OBSERVED_PROD`
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
- **Detected / fixed / closed:** detected `ce6dc7a`; fixed `—`; production
  closure `—`.

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
