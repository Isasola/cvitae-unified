# Known source coverage gaps

This is a narrow static diagnostic list for the next collection tranche, not a source inventory.

| source | issue | status | next_fix |
| --- | --- | --- | --- |
| jooble | API was invoked only for page 1 | CONFIRMED_LIMIT | paginate until empty/repeated identities |
| workday_multinacionales | Workday request used `offset=0`, `limit=20` only | CONFIRMED_LIMIT | advance offset until short page |
| opportunitydesk | category walk is capped at 3 pages | CONFIRMED_LIMIT | make continuation explicit |
| computrabajo | category walk is capped at 5 pages | CONFIRMED_LIMIT | make continuation explicit |
| buscojobs | loop is fixed to pages 1-5 | CONFIRMED_LIMIT | continue to natural exhaustion |
| arbeitnow | loop is fixed to pages 1-10 | CONFIRMED_LIMIT | use provider continuation |
| becal | listing walk is capped at 3 pages | CONFIRMED_LIMIT | continue until empty |
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
| Greenhouse | `GET https://boards-api.greenhouse.io/v1/boards/{board_token}/jobs?content=true` for known employer board tokens; public job-board GET requires no API credentials | Company-board-scoped `greenhouse_scraper.py` adapter and source-scoped configurable allowlist, using existing sink/registry, employer + external post ID; preserve `absolute_url`, `updated_at`, title, location and only factual fields | Authentication-free GET does not grant republication/SEO/Google Jobs/matching rights; verify employer/provider terms and usage evidence per board and per consumer before enabling; no application POST | `PLANNED_REVIEW_REQUIRED / ALL_CONSUMER_SWITCHES_OFF` |
| Lever | `GET https://api.lever.co/v0/postings/{SITE}?mode=json&skip={offset}&limit={page_size}` (check regional endpoints/tenant configuration); official Postings API supports public posting retrieval and pagination | `lever_scraper.py` company-site adapter with provider `id`, `hostedUrl`/`applyUrl`, categories, description, location and next-offset continuation | Apply the same company-level registry/permission checks; do not make unsupported LATAM / remote eligibility assertions or submit applications | `PLANNED_REVIEW_REQUIRED / ALL_CONSUMER_SWITCHES_OFF` |

Official documentation: Greenhouse `https://docs.greenhouse.io/job-board.html`; Lever `https://github.com/lever/postings-api`. Before implementation re-check current API field contracts, provider guidance, legal basis and employer permissions. A company board having public JSON is NOT approval for indexing or redistribution.

Do not automatically turn on WWR, Fundación Carolina, Impactpool, or any other denied/unknown permission; preserve the exact permission matrix and the Himalayas SEO-versus-JobPosting distinction. Candidate/source eligibility may stay UNKNOWN. Greenhouse/Lever are **additional integrations**, not replacements for repairing Jooble, Workday, OpportunityDesk, Computrabajo, Buscojobs, Arbeitnow, Becal, Jobicy or the existing pipeline.
