# CVitae Opportunity Intelligence: source maintenance playbook

## B2C quality loop

The operational target is `source quality -> normalized semantic quality ->
embedding -> candidate fit -> catalog -> SEO/AEO/GEO -> user signals -> source
maintenance priority`. Do not optimize ingestion volume or source popularity.
Fit and data confidence are separate: confidence can explain or safely break a
tie, but cannot replace professional affinity or make unknown geography
ineligible. Use kind-aware quality profiles: job geo requirements do not apply
unchanged to scholarships, grants, training, or tenders. For every source
document authoritative fields, scout, identity, freshness/death, geo,
eligibility, arrangement, provenance, embedding input and catalog/SEO gates.

## Shared contract

This is the permanent Codex/Claude playbook for any source or scraper change.
CVitae gains B2C quality, B2B trust, matching and SEO/AEO/GEO only from source
evidence. A scraper never publishes, verifies, ranks, deletes, archives,
rejects, or directly changes catalog/matching/SEO.

`registry -> scout -> adapter -> cleaner -> normalized result -> observation -> policy -> enrichment -> suppression -> factory/embedding -> existing gates -> health -> cron`

Use `scrapers/source_cleaners/profiles.py` as the operational registry. A
source without a validated adapter remains registered and diagnosable, but is
not AUTO enabled.

## Canonical source identity and certification

Treat `canonical_source`, `emitted_source`, and `source_family` as different
facts. Resolve emitted identifiers in this order only: explicit alias,
explicit family pattern, then visible error. Never guess from a prefix. Each
profile has an adapter version and a semantic-contract version. AUTO means
certified autonomous maintenance: identity, scout/adapter/cleaner, kind quality
profile, observations, freshness/dead/restore policy, dry-run, matching and
SEO gate checks are all present and passing.

Suppress only latest `DEAD|REMOVED` with 404/410. A later confirmed 200 may
produce an auditable RESTORE event, but never reenables catalog, matching or
SEO; existing quality gates must decide those independently. Always produce a
diff-before-apply report and keep semantic golden fixtures per risky source.

## Invariants

`JOB LOCATION != CANDIDATE ELIGIBILITY != WORK ARRANGEMENT`.

- Job location: `location`, `country_code`, `onsite_country`.
- Eligibility: `eligible_countries`, `eligible_regions`, compact evidence.
- Arrangement: tri-state `remote` and `remote_scope`.
- Never infer remote => worldwide, no restriction => worldwide, search
  location => job location, many eligible countries => worldwide, or missing
  remote wording => onsite.
- HTTP 200 is not correct-detail proof. Validate source native ID, canonical
  URL and source-specific structure.
- Feed absence, 403, 429, timeout, DNS and 5xx are never death evidence.
- A source-specific confirmed 404/410 can be DEAD/REMOVED.

## Adapter, cleaner, scout and evidence

Use a source-specific adapter, not a universal HTML parser. Prefer public API,
JSON-LD, hydration state, source HTML, then metadata fallback. `AdapterResult`
holds stable identity, source/canonical/apply URLs, title, organization, clean
description, geo, eligibility, arrangement, dates, public compensation,
extraction method/status/confidence, compact evidence and recommendation.
`employment_type` remains evidence; do not overwrite legacy `type`.

Each profile defines adapter/cleaner/scout, source tier, discovery/detail
strategy, freshness TTL, bounded retry, concurrency, rate limits, hard-dead
semantics, expected quality and supported geo/remote/eligibility. The cleaner
addresses source-known historical defects only; it never decides publication.

A scout is cheap source-level evidence (API, RSS, sitemap, listing or none).
It returns current IDs/URLs/freshness hints. Absence from scout data is not
DEAD unless that source has an explicit validated semantic.

Evidence ladder: DB/fingerprint and recent enrichment -> latest observation ->
scout -> bounded detail -> bounded retry/exception. Do not fetch details when
fresh durable evidence already answers the question.

## Observations, policy and outcomes

Adapters persist compact append-only observations. Common policy owns durable
outcomes: `RESOLVED_FRESH`, `LIVE_OK`, `REMOVED`, `DEAD`,
`IDENTITY_MISMATCH`, `IDENTITY_UNRESOLVED`, `DETAIL_MISMATCH`,
`PARSER_FAILURE`, `NETWORK_TRANSIENT`, `RATE_LIMITED`, `UPSTREAM_5XX`,
`QUALITY_DEGRADED`, `RETRY_PENDING`, `EXCEPTION`.

Only the latest source observation may support hard-dead suppression. Latest
`REMOVED|DEAD` plus 404/410 uses the atomic source-policy RPC and changes only
`catalog_eligible` and `match_eligible`; no delete/archive/reject/content edit.
A later 200 confirmed observation supersedes old death. Transient or mismatch
states never suppress.

Use `AtomicEnricher` and the existing enrichment RPC for patches. Do not direct
UPDATE. The RPC owns locking, diff, audit and no-op behavior.

## Maintenance, concurrency and cron

`scripts/run_source_maintenance.py` is dry-run by default. It processes the
whole eligible source inventory through internal chunks <=50 and a per-source
work/runtime budget. Observations plus TTLs are durable resume state; never use
a magic offset. P0 match-degraded -> P1 catalog-degraded -> P2 review -> P3
other is priority, not abandonment; P3 remains eligible when higher work drains.

Use pooled `requests.Session` per worker, bounded source concurrency and
separate connect/read timeouts. Start conservatively; increase only after a
healthy chunk. Reduce/back off on 429/5xx. A slow/network-failing URL consumes
one worker and becomes retryable `NETWORK_TRANSIENT`; it never blocks the run.
High confirmed dead rate is a freshness metric, not a parser breaker. Live 200
parser emptiness, identity/detail mismatch, sustained 429 or systemic 5xx may
degrade/break a source.

`--explain` reports compact progress and summary. `--verbose-items` and `--id`
are deep diagnostics. Scheduled runs use only `auto_enabled` profiles. The
workflow uses one no-cancel maintenance lock; failures of a source are isolated
by profile state and never authorize unsafe fallback behavior.

## Matching, embeddings and SEO

Scrapers/cleaners do not alter matching ranking. Matching consumes normalized
records, `match_eligible` and semantic embeddings. Keep the existing semantic
fingerprint/factory pipeline. Build deterministic embedding text from title,
organization, meaningful description, type/rubro/tags, location/country,
remote scope and eligibility. Exclude raw HTML, tracking URLs and boilerplate.
Embed only active `match_eligible` rows whose semantic state changed or vector
is missing; never embed hard-dead/suppressed rows.

Catalog, SEO, AEO, GEO, sitemap and JobPosting use existing gates. A cleaner
never grants SEO eligibility. Hard-dead must not stay catalog-active,
match-active, sitemap-active or active JobPosting.

## New-source checklist

1. Inspect permitted public source structure and classify Tier A/B/C.
2. Define source registry/profile and leave `auto_enabled=false`.
3. Identify scout/discovery, stable native ID and detail strategy.
4. Define job geo, eligibility and arrangement independently.
5. Define provenance/application URL, freshness, retries and hard-dead rules.
6. Implement adapter plus source cleaner/profile.
7. Add sanitized fixtures: parsing, identity, geo, eligibility, remote,
   mismatch/transient, health and policy.
8. Run contract/registry/focused tests and read-only production diagnosis.
9. Do a small safety validation only for genuinely new behavior.
10. Enable AUTO only with evidence; cron maintains future rows.

Group failures by source/class first: 300 empty descriptions is an adapter
problem, not 300 human reviews. Human review is only for real ambiguity,
conflicting evidence or unsafe source semantics.

## Reporting

Report source, scout/discovery, native ID, detail strategy, source tier,
geo/eligibility/remote semantics, provenance, rate/freshness policy, health,
AUTO state, tests, production evidence and remaining risks. Never claim source
quality from compilation or HTTP status alone.

## Runtime evidence and automation V2 (2026-09-14)

Treat operational health, discovery coverage, row quality and opportunity
freshness as independent evidence. A configured cap (for example 250 of 400
valid records), with healthy provider/parser, is `HEALTHY` plus incomplete
coverage by policy; it is not degradation. Legacy unstructured warnings remain
`UNKNOWN`. Provider bulk/API inventory may create an append-only live
observation only for an exact canonical identity; it never implies feed absence
is death. Persist compact observations with a run id, TTL/dedup and state
transitions. Respect Retry-After, backoff, bounded budgets and resume cursors.

Trust dimensions are distinct: provenance (`source_authority`), adapter and
semantic certification, operational health and distribution policy. An
aggregator/original-unverified row is not automatically a human review when
technical evidence is strong. `CERTIFIED != AUTO_ENABLED`: certification is
auditable contract evidence; AUTO is a runtime mutation permission.

Runtime flow is provider -> discovery -> normalization -> identity -> quality
-> observation/freshness -> factory seal -> automation policy -> AUTO/HOLD/
REVIEW/BLOCK -> controlled executor. Admin is a control tower: cluster repeated
reasons, fix systemic defects once and reprocess source-wide. Seal first;
generate embeddings only after matching is policy-permitted and vector state
requires it. Keep web catalog, organic SEO, JobPosting/Google Jobs and
third-party distribution as separate source-policy gates.

Current source state: Himalayas is CERTIFIED/AUTO OFF with semantics and
observation planner validated; UNJobs remains previously certified/AUTO with
runtime-evidence adoption pending; WWR is contract-covered with remote
restriction/workplace work pending; Talent is contract-covered with
jobLocation/applicantLocationRequirements separation pending. Revalidate only
when the relevant invariant changes; do not repeat closed canaries/audits.
