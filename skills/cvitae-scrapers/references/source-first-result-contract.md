# CVitae — Source-First Acquisition and Product Result Contract

> Applies together with `WORKING_PRINCIPLES.md`, `AGENTS.md`, current Grand
> Checkpoint, `SKILL.md`, `references/contract.md`, and
> `references/operational-maintenance.md`. No new source authority, pipeline,
> or independent data truth is created here.

## 0. The outcome is opportunities, not scrapers

When the user asks to obtain opportunities, the first deliverable is knowledge
of a **real accessible source**, the authoritative places where each required
field exists, and its measurable capacity to deliver genuinely usable records.
Then implement the **source-specific** adapter and connect it to existing
CVitae tools. Do not stop at source reconnaissance, a standalone JSONL, a
successful crawler, or a new profile; those are intermediate evidence.

**Completion ladder:**

- `DISCOVERY_PROVEN`: live endpoints, native identities, listing/details,
  page/cursor/EOF, actual current denominator and evidence recorded.
- `SOURCE_ADAPTER_VALIDATED`: correct source-specific facts and negative cases.
- `LOCAL_WIRED`: opportunity crosses the current Registry, Sink, normalization,
  lineage/observation, quality/Universe and consumer decision in integration
  evidence. Fake/mock persistence is labelled local.
- `PROD_READ_ONLY_RECONCILED`: actual records compared with prod, version/
  schema/gates reconciled and deduped; **no writes**.
- `CANARY_READY_PENDING_AUTH`: one valid target, exact minimal release,
  migrations/rights, source control, safe one-ID canary, kill switch and
  independent verification commands. Explicit authorization required.
- `PROD_VERIFIED`: authorized real one-ID run with saved record, provenance,
  observation, effective independent consumer and user-facing evidence.
- `AUTO_PROVEN`: approved scheduled next run reaches same path, resumes,
  deduplicates and does not regress; full source coverage is eventually reached.

Each level must be named honestly. No source is `PROD_VERIFIED` from a passing
fixture, compile, remote HTTP 200 or audit-mode Sink.

## 1. Source research: do the hard work before writing an adapter

Build a compact **Source Evidence Card** per material source, based on live
responses dated in the source timezone. Don't assert legacy evidence is
current merely because a previous log reported it. Reuse recent evidence and
investigate new gaps only.

Required card fields:

| Field | What to prove |
|---|---|
| `owner_and_authority` | Original employer/official issuer, ATS, aggregator or discovery portal; third-party canonical/original job URL |
| `source_scope` | Country, opportunity kinds, employer tenants, whether external/public applicants are eligible to apply |
| `entrypoint` | Real official listing/search/feed/API URL (redirect and canonical origin) |
| `access_contract` | Robots/terms/API/license/auth/rate/pagination limits; collection, private matching, catalog, alerts, SEO/JobPosting and redistribution **independently** |
| `method` | JSON/API/ATS, RSS/XML, server HTML, JSON-LD/hydration, JS-browser, PDF; why the selected method actually yields each required fact |
| `denominator` | Total discovered vs pages examined vs EOF, actual individual posts, explicit open/closed/future, stable ID count, duplication and source drift |
| `native_identity` | Complete identity, including tenant/concurso/position component, not only last URL fragment; changes/aliases and collision test |
| `listing_authority` | Fields reliably found on index/listing, with sample raw evidence |
| `detail_authority` | Fields reliably found on detail/API/PDF, differences from listing, mismatch and missing-detail behavior |
| `application_route` | Real working apply/posting URL, no generated or dummy links, shared application URL collision risk |
| `dates_and_freshness` | Source-provided publish/open/close times + timezone; TTL/poll timestamp **separate** from source expiry |
| `job_geo_eligibility_arrangement` | Job location, candidate eligible locations and work arrangement as separate dimensions; raw evidence class for each |
| `description_and_rights` | Availability/quality of meaningful description; conditions for storing, private processing, public excerpts and redistribution, without false legal inference |
| `failure_model` | 404/410, login, 403, 429, 5xx, JavaScript, robots, changed schema, generic pages, source-only counters, retry/resume semantics |
| `output_prospect` | Expected **new current unique usable** postings, confidence and exact binding constraint |

Don't implement from a landing page's marketing count. For example, 312
competitions across mixed stages or 119 vacancies advertised by a site do not
mean 312 or 119 live, public, independently extractable postings. A position
listing and number of vacancies in it are different metrics.

### Research stop/go decision

A source is **GO** when it has a demonstrated path from real individual
records to trustworthy fields and at least one legitimate authorized target
consumer (or recorded availability for future certification). **HOLD** when
access/rights/verification is unresolved; keep its discoveries and reasons,
not an invented DENIED. **NO-GO** for current execution when blocked by proven
provider policy, 403/login without permitted access, repeated empty feed,
no relevant current individuals, or an unsuitable source. Move to the next
source rather than spending a whole pass on an idle connector. No CAPTCHA,
login, rate-limit or bot-protection bypass.

A provider's explicit restriction for public SEO **does not automatically**
block privately authorized matching; a verified blanket restriction does not
become UNKNOWN. A permission lookup and a source-quality gate are distinct.

## 2. Select the extraction technology PER SITE, based on evidence

| Source architecture | Default approach | Do not do |
|---|---|---|
| Official public ATS REST/JSON (Lever, Greenhouse, etc.) | Python `requests.Session`/`httpx`, native `id`, tenant, `next/skip/limit`, structured fields; detailed GET only where needed | Browser automation or HTML scraping when native API provides complete data |
| XML/RSS/feed/sitemap | `feedparser`, `ElementTree` or XML parser, source-specific identity/date and follow detail when feed is partial | Treat feed absence as dead or assume feed count equals portal count |
| Server-rendered HTML | `requests.Session` + BeautifulSoup/lxml, listing pagination and detail fusion with source-specific selectors | Universal parser using `h1` and last URL number for all sources |
| JSON-LD or embedded hydration state | Validate schema/types and exact job ID, extract structured content, confirm individual URL and source timestamps | Use Schema.org existence alone as evidence of an open vacancy |
| JavaScript-only after simpler methods tested | Playwright with bounded navigation, selectors/waits, reusable session and respect for source policy | Browser as default or an evasion mechanism |
| PDF/public notice | Extract text/tables per approved source and map to a verified public listing/ID; inspect layout/attachments where important | Infer 1 PDF = 1 job, OCR indiscriminately, or assign organization as title |
| Aggregator with original job links | Use metadata/URLs as discovery; verify authoritative employer/ATS and producer permissions independently | Copy complete proprietary descriptions into public catalog with unknown rights |
| Login-gated or disallowed API | Official access or employer agreement; leave in review with exact access reason | Fake vacancy records from general news, defeat authentication, endlessly retry 403 |

A single source may need mixed tools (index HTML + detail JSON + PDF), but
one **source-specific adapter** is responsible for assembling the truthful
`AdapterResult`. Inspect the *current* parser, registry, cleaner and Sink
contracts before extending them. Explicitly confirm whether each field
survives persistence; don't assume `source_native_id` is accepted by a
particular Sink version.

### Listing/detail reconciliation is mandatory

Extract source truth where it is genuinely authoritative. Some official
portals display the position name, native identifier, institution, vacancy
count, public/internal category and application period in the **index**, while
an individual detail's first heading is the institution. Preserve index title
and native identity; use the detail for job requirements, location, applying
mechanism and supplemental evidence. When list/detail contradict, record both
and a source-specific mismatch reason, not an arbitrary overwrite. For paths
such as `/publicaciones/info12620/4687` vs `/publicaciones/info12619/4687`,
validate the *actual* competition identity rather than reducing both to
`4687`. These are examples; source truth, not a hardcoded URL pattern, rules.

## 3. Follow the existing CVitae pipeline; never make a parallel product

Full path, including authority and provenance:

`Owner/source → Registry V2 → scout → adapter/cleaner → normalizer →
OpportunitySink → persisted opportunity + ingestion lineage → source
observation → quality/factory/fingerprint/embedding where appropriate →
Universe/source-policy → matching/catalog/alerts/SEO independently →
observable Admin + real candidate journey`.

Inspect **only** relevant current code and evidence for the changed boundary:

- `scrapers/source_registry.json`, `scrapers/source_registry_v2.py`,
  `scrapers/source_identity.py`, `scrapers/source_cleaners/profiles.py`.
- `scrapers/source_adapters.py`, `scrapers/opportunity_sink.py`,
  `scrapers/observation_writer.py`, `scrapers/source_policy.py`.
- `scripts/run_scraper_monitored.py`, `scripts/run_source_maintenance.py`,
  `scrapers/runtime_policy/sitecustomize.py` and affected workflows.
- Current source scraper, corresponding gates/migrations and actual consumer
  view/route, *not* all files in the repo by default.

Keep native/source/tenant ID, emitted and canonical source, original canonical
source link, apply URL, provider facts and evidence categories across creation,
updates, no-ops, observations, lineage and consumer resolution. `application_url`
may be shared by different vacancies; preserve distinct native identities and
follow the currently enforced DB uniqueness/constraint. A shared identity fix
needs compatibility analysis for existing rows and authorized migration if
needed; no silent global-key rewrite or fake per-job URL.

One source can be `ACTIVE` but have zero catalog/SEO due to consumer-specific
policy; that is not a license to alter matching. A row can be stored `in_review`
for actual certification; that is not synonymous with source-rights DENIED.
Scrapers do not grant verification, consumers, SEO, ranking, `is_active=true`
or AUTO status by force. Use admin approval/policy and its audit trail only
when specifically authorized. Preserve all discovered/source inventory even
when some records are not ready for a consumer.

For each source prove the *same* path on an existing matching historical row,
one future new input, one negative/no-go row and an idempotent next run. Show
both a single candidate's user-facing query and Admin gate/reason, not merely
a count in `opportunities`. Do not add frontend UI simply to make a test pass.

## 4. Denominators, budgets and the 6 result numbers

Never confuse a safe per-run budget with a truncated product. Enumerate the
real universe via listing/next/cursor to EOF, and persist continuation. Failures
of one detail request count toward attempt budget and become retryable evidence;
they do not silently disappear or change total discovered.

Reconcile source-wise and globally:

- `DISCOVERED`: distinct source listing posts actually enumerated; separate
  advertised total and number of HTTP detail attempts.
- `UNIQUE_CURRENT`: distinct jobs, with genuine current/open or separately
  documented fresh status; exclude closed, internal-only for external audiences,
  generic news, expired and duplicate IDs. Unknown deadline **is not expired**
  but needs evidence/TTL and a consumer-specific readiness decision.
- `NEW_VS_PRODUCTION`: dedupe verified through read-only actual DB comparisons
  using canonical source + native identity and URLs; if no production
  comparison, `UNVERIFIED`, **not 0**.
- `INSERTED`: real persisted new rows, distinct from updated/unchanged,
  auditor output and reconstructed historical data.
- `EFFECTIVE_PRIVATE_MATCHING`: actual private B2C routed opportunity count
  under matching's own authorized quality/policy, no SEO/catalog veto.
- `VISIBLE_CATALOG`: live public catalog when authorized. `SEO_EFFECTIVE` is
  separate and must respect provider restrictions.

Also account for `ATTEMPTED`, `HTTP_200`, `DETAIL_VALID`, `REJECTED`, `FAILED`,
`RATE_LIMITED`, `QUEUED`, `SKIPPED_BUDGET`, `SINK_SUBMITTED`, `UPDATED`,
`UNCHANGED`, `OBSERVED`, `FACTORY_SEALED`, `MATCHING_ROW_READY`,
`MATCHING_FINAL_EFFECTIVE`. Numbers must reconcile, not be renamed to improve
optics. `PROD_NEW` and `HISTORICAL_RECOVERED` are separate KPIs; neither can
be relabeled as the user's goal of new opportunities.

For zero-yield execution, answer concretely: how many real listings exist,
how many could be retrieved, the first material gate per rejected row/source,
how many truly eligible and why the exact next step is sufficient. Fix a
systemic producer defect in one pass and resume; if external rights or access
blocks source, choose a permitted different provider **within scope** rather
than generating an unused connector.

## 5. Work pattern — one coherent pass, one operator decision

**Before editing:** Read authorities and current checkpoint, define the
business invariant, complete source/row universe, expected consumer, current
last proven gate and first unproven gate. Do targeted live reconnaissance
before writing code. Reuse prior source cards where source facts remain fresh.

**During work:** Define the full field authority, method and failure model for
all in-scope sources; group structural causes; design one coherent change;
implement adapters, live bounded source collection, normalization, identity,
policy/routing integration and discriminating negative/positive tests. Do
not re-audit completed C09/C20/SEO/blog work without regression. Don't waste
a full run adding a connector that produces no current usable records.

**Before release:** Extract the full external dependency set of this exact
release/migration/runner and check it **in one guarded read-only pass** against
target schema and version. Prepare a minimum release/canary package with
exact SHA, source + ID, authorizations/rights, switch only for that source,
real ingestion path, database and consumer checks, observable rollback or
recovery-forward action, and stop criteria. Do not create staging or procure
paid services without an express request.

**After explicit production authorization:** Perform the minimum approved
change, one native-ID canary through **non-audit** monitored Sink, inspect DB
upsert + lineage + observations + Universe + effective consumer + real
candidate user journey. If it fails, fix the **first** failing gate of the
same canary and retry safely; do not start from research or switch to another
source. When passing, expand with cursor across the source and prove second
scheduled run + recovery. Never turn on global release gates to bypass a
source-specific blocker.

**Session handoff must be executable, not philosophical:**

```
BUSINESS_TARGET:
CURRENT_DENOMINATOR:
SOURCE_CARDS_AND_REAL_VOLUMES:
LAST_PROVEN_GATE:
FIRST_UNPROVEN_GATE_AND_REASON:
HISTORICAL_RECOVERED:
DISCOVERED / UNIQUE_CURRENT / NEW_VS_PRODUCTION:
SUBMITTED / INSERTED / UPDATED / UNCHANGED:
EFFECTIVE_PRIVATE_MATCHING / VISIBLE_CATALOG:
EVIDENCE_LEVEL_AND_SHA:
PROD_AUTHORIZATION_SCOPE:
EXACT_NEXT_COMMAND_OR_OPERATOR_DECISION:
DO_NOT_REOPEN:
```

Do not say "solved" or "finished" if `INSERTED=0` and `PROD_VERIFIED`
is absent. Do not invent rights, credentials, tenant approvals or eligibility.
Do not promise that a portal contains 2,000 jobs when the observed source
volume is smaller. If the only blocker is production permission, present
**one** precise yes/no scope decision rather than another build/refactor.
