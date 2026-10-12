# Known source coverage gaps

This is a narrow static diagnostic list for the next collection tranche, not a source inventory.

| source | issue | status | next_fix |
| --- | --- | --- | --- |
| jooble | earlier evidence described page 1 only; current adapter already advances until empty/repeated identities | EXISTING_CONTRACT_VERIFIED_LOCAL | retain fixture/live-authorized continuation canary |
| workday_multinacionales | earlier evidence described offset 0 only; current adapter already advances offset until a short page | EXISTING_CONTRACT_VERIFIED_LOCAL | retain per-tenant bounded canary |
| opportunitydesk | legacy category walk was capped at 3 pages | FIX_LOCAL / PROD_VALIDATION_PENDING | configurable bounded budget (default 50); prove provider EOF and resume behavior in isolated/live-authorized canary |
| computrabajo | earlier fixed cap is now configuration-controlled | EXISTING_CONTRACT_VERIFIED_LOCAL | validate budget/resume with provider-safe canary; do not call budget EOF |
| buscojobs | legacy loop was fixed to pages 1-5 | FIX_LOCAL / PROD_VALIDATION_PENDING | configurable bounded budget, repeat-page stop and explicit budget-not-EOF signal |
| arbeitnow | legacy loop was fixed to pages 1-10 | FIX_LOCAL / PROD_VALIDATION_PENDING | configurable bounded budget and explicit budget-not-EOF signal; canonical sink modernization remains open |
| becal | legacy listing walk was capped at 3 pages | FIX_LOCAL / PROD_VALIDATION_PENDING | configurable bounded budget, repeated-URL stop and explicit budget-not-EOF signal |
| zonajobs / trabajos.com.py | listing walk is capped at 5 pages | CONFIRMED_LIMIT | continue until empty |
| jobicy | requests 50 per industry without continuation | CONFIRMED_LIMIT | inspect provider continuation |
| oya | homepage-only extraction | UNKNOWN | establish whether an inventory exists |
| snj / mitic / innovando / ucom / empleapy | configured WordPress `per_page` limits | UNKNOWN | inspect `X-WP-TotalPages` before changing |
| scrapers workflow | 81 sequential steps under a 60-minute job timeout | CONFIRMED_LIMIT | shard/matrix only in a dedicated workflow-scale change |
| write collectors | production Supabase URL fallback literals | CONFIRMED_LIMIT | require explicit URL or audit/local default in a dedicated security pass |

## 2026-10-12 — reinforced sources and two additional connectors (PLAN, NOT ACTIVE)

Use the existing certified source registry/identity/adapter/observation/sink/consumer policy system, not a replacement crawler. Reinforce documented collection coverage gaps above. A one-run page cap is a processing budget; require cursor/resume to EOF, bounded rate/cost, duplicate IDs, idempotency, failure/recovery, and both historical reconciliation and future ingestion. This section expands BUG-006/007/008; it is NOT a second bug registry.

| provider family | public read interface (official documentation) | planned adapter | source and permission safeguards | status |
| --- | --- | --- | --- | --- |
| Greenhouse | `GET https://boards-api.greenhouse.io/v1/boards/{board_token}/jobs?content=true` for known employer board tokens; public job-board GET requires no API credentials | Implemented company-board-scoped `greenhouse_scraper.py`, stable provider+board+post identity, factual content and coverage total | Empty explicit allowlist; authentication-free GET does not grant republication/SEO/Google Jobs/matching rights; verify per board and consumer; no application POST | `FIX_LOCAL / REVIEW_REQUIRED / ALL_CONSUMERS_OFF` |
| Lever | `GET https://api.lever.co/v0/postings/{SITE}?mode=json&skip={offset}&limit={page_size}` with global/EU base selection and `skip/limit` | Implemented `lever_scraper.py`, stable provider+site+post identity, repeated-page protection and continuation to short page | Empty explicit allowlist; no unsupported LATAM/remote eligibility assertion; no applications | `FIX_LOCAL / REVIEW_REQUIRED / ALL_CONSUMERS_OFF` |

Official documentation: Greenhouse `https://docs.greenhouse.io/job-board.html`; Lever `https://github.com/lever/postings-api`. Before implementation re-check current API field contracts, provider guidance, legal basis and employer permissions. A company board having public JSON is NOT approval for indexing or redistribution.

Do not automatically turn on WWR, Fundación Carolina, Impactpool, or any other denied/unknown permission; preserve the exact permission matrix and the Himalayas SEO-versus-JobPosting distinction. Candidate/source eligibility may stay UNKNOWN. Greenhouse/Lever are **additional integrations**, not replacements for repairing Jooble, Workday, OpportunityDesk, Computrabajo, Buscojobs, Arbeitnow, Becal, Jobicy or the existing pipeline.
