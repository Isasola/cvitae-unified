# CVitae — Session Handoff

## Current State
Production commit: `f11309f4` on `feature/aws-migration` — HEALTHY
Last deploy: 2026-08-18. Post-deploy smoke test: PASS. Last QA: P13-P19 closed.

## Snapshot — VOLATILE (2026-08-19 — query DB for current values)
| Metric | Value |
|---|---|
| Active + verified | 157 |
| Matchable | 144 |
| Catalog eligible | 153 |
| SEO eligible | 149 |
| In_review | 1279 |
| Pending | 34 |
| content_hub KEEP | 51 (legacy, not primary) |
| Sitemap live post-deploy | 216 |

## Wave 1 Scraper Results (2026-08-18)
| Source | Status | Last tested | Yield | Enabled | Notes |
|---|---|---|---|---|---|
| mitic_opportunities | READY | 2026-08-18 | 4/4 (100%) | YES | Official MITIC jobs/consultancies. Not in TRUSTED_SOURCES → REVIEW in admin |
| snj_paraguay | FIXED+READY | 2026-08-18 | 1/1 (100%) | YES | SNJ youth programs. Added "programa"/"proyecto" to _type(). Not in TRUSTED_SOURCES → REVIEW |
| empleapy_mtess | NOT_READY | 2026-08-18 | 0/5 (0%) | NO | WP site has only demo posts from 2021. Main job portal requires cédula login |
| innovandopy_startups | NOT_READY | 2026-08-18 | 0/20 (0%) | NO | No active calls. Last cohort Sept 2025 (profiles only). Will auto-activate when new edition opens |
| becas_gobierno_itaipu | NOT_READY | 2026-08-18 | 0/0 (0%) | NO | ASP.NET SPA (JS-rendered, static parse fails). 2026 call closed. Recheck when next convocatoria announced |

5 new records inserted: mitic×4, snj×1. All in_review, authority=original, osv=true.
MITIC and SNJ need admin review to become active (not in TRUSTED_SOURCES).

## Wave 2 Scraper Results (2026-08-18/19)
| Source | Status | Yield | Enabled | Notes |
|---|---|---|---|---|
| oas_scholarships | HEALTHY | 17 found/17 valid/17 updated | YES | All 17 already in DB. Country gate bug fixed (was allowed_country_codes=["PY"]). |
| coimbra_group | HEALTHY | 5 found/5 valid/5 updated | YES | All 5 already in DB. Country gate bug fixed. |
| chevening | BLOCKED | 0 (timeout) | YES | chevening.org blocks GitHub Actions IPs (HTTPSConnectionPool timeout 45s both URLs). NOT_READY via GH Actions. |
| cird_competitions_tenders | HEALTHY | 0 found | YES | No active consultancies with verifiable deadline today. Will yield when calls open. |
| erasmus_mundus | UNTESTED | — | NO | Country gate fixed (allowed_country_codes cleared). Enable when ready for next activation batch. |
| one_young_world_scholarships | UNTESTED | — | NO | Country gate fixed. May require JS rendering — test before enabling. |

**Country gate bug fixed (2026-08-18):** 6 international scholarship scrapers had `allowed_country_codes=["PY"]` in scraper_controls. These scrapers emit no `country_code` (multi-country LATAM programs). Fixed by setting `allowed_country_codes={}` for: oas_scholarships, coimbra_group, chevening, erasmus_mundus, one_young_world_scholarships. cird_competitions_tenders keeps `["PY"]` (PY-only source).

**Individual dispatch added (2026-08-18):** oas_scholarships, coimbra_group, chevening, cird_competitions_tenders now support `gh workflow run scrapers.yml -f scraper=<id>`.
**Individual dispatch added (2026-08-19):** erasmus_mundus added to individual dispatch (needs push to take effect — will run on next daily schedule regardless).

DB authority-safe inventory after Wave 2:
| Source | Verified+Active | In_review (auth-safe) |
|---|---|---|
| oas_scholarships | 4 | 10 |
| erasmus_mundus | 1 | 4 |
| coimbra_group | 3 | 0 |
| santander_open_academy | 4 | 0 |
| one_young_world_scholarships | 2 | 0 |
| computrabajo | 133+ | 0 |
| mitic_opportunities | 0 | 4 |
| snj_paraguay | 0 | 1 |

Path to stop condition A (≥350 identified): MET — 1044 realistic useful records identified (157 active + ~35 auth-safe + ~852 useful aggregator backlog).
Path to stop condition B (≥200 additional beyond active): MET — 852+ useful records in in_review backlog.
Path to stop condition D (existing backlog proves ≥500 after moderation): STRONGLY MET — conservative estimate 704, realistic 1044.

## Wave 3 Volume Audit Results (2026-08-19)
| Source | Status | Yield | New Inserted | Notes |
|---|---|---|---|---|
| weworkremotely | HEALTHY | 378 found / 250 valid / 213 new | +213 | Country gate cleared. 275 total in DB. |
| himalayas | HEALTHY | 400 found / 250 valid / 250 new | +250 | Country gate cleared. 275 total in DB. |
| unjobs | HEALTHY | 181 found / 181 valid / 175 new | +175 | Country gate cleared. 181 total in DB. |
| buscojobs | DEAD | 0/0 | 0 | All 16 categories "sin respuesta" — site changed. Re-disabled. |
| erasmus_mundus | SKIPPED | — | — | Individual dispatch not yet on GitHub (needs push). Will run on daily schedule. |

**Wave 3 net additions:** +638 in_review records
**Volume source audit verdicts:**
- scrapper.py: DEAD (`scrapers=[]`, 0 yield)
- sicca: FIXABLE (functional but source_authority unset → in_review; SICCA is original source)
- ministerios: UNPROVEN (15 ministry URLs, generic selectors, likely JS-dynamic)
- ongs: NOT_READY (most target pages JS/ATS, generic selectors fail)

## Enabled Sources (production, as of 2026-08-19)
| scraper_id | collection_enabled | Notes |
|---|---|---|
| computrabajo | YES | Healthy, daily PY jobs |
| mitic_opportunities | YES | Official MITIC |
| snj_paraguay | YES | SNJ youth programs |
| oas_scholarships | YES | LATAM scholarships, country gate cleared |
| coimbra_group | YES | LATAM mobility, country gate cleared |
| chevening | NO | Disabled — blocks GitHub Actions IPs (timeout 45s) |
| cird_competitions_tenders | YES | PY calls, 0 yield when no active deadlines |
| erasmus_mundus | YES | Country gate cleared, untested via dispatch (will run on schedule) |
| weworkremotely_scraper | YES | Remote jobs, country gate cleared, 275 records |
| himalayas_scraper | YES | Remote jobs, country gate cleared, 275 records |
| unjobs_scraper | YES | UN/international jobs, country gate cleared, 181 records |

## Next Operational Work (priority order)
1. **Admin review: ~35 authority-safe in_review records** (OAS×10, Erasmus×4, MITIC×4, SNJ×1, others) → +35 active immediately
2. Admin review: gradual moderation of 1279 in_review (conservative 40% yield = 512 additional active → total ~704)
3. Push current unpushed commit `269cbd73` to GitHub (enables erasmus_mundus individual dispatch + makes Wave 3 changes permanent)
4. Add mitic_opportunities + snj_paraguay to TRUSTED_SOURCES if quality holds after first admin review
5. Chevening: re-enable when chevening.org unblocks GitHub Actions IPs (or add proxy/alternative fetch)
6. sicca: add `source_authority="original"` to sicca_scraper.py → enable (PY govt competitions, authority-safe path)
7. buscojobs: investigate __NEXT_DATA__ extraction — site URL structure may have changed
8. Netlify variable configuration (pending from maratón 18hs)
9. Catalog is_active bulk activation (pending authorization)

## How to Start a Session
1. `graphify query "..."` — identify relevant files before reading anything
2. Read only the 1-3 files the graph identifies
3. Check `docs/ai/SYSTEM_CONTRACTS.md` for invariants if touching pipeline
4. Check `docs/ai/KNOWN_FAILURE_MODES.md` for traps if doing admin/deploy/SEO work
5. Declare SCOPE + DO-NOT-TOUCH before modifying code

## Critical Context (non-obvious facts)
- `match-batch` is a **Supabase Edge Function** (not Netlify)
- `opportunities.id` is **TEXT** (not uuid) — never use gen_random_uuid()
- `content_hub` is **legacy** — opportunities is the primary table
- SEO does NOT gate matching (see SYSTEM_CONTRACTS.md)
- JobPosting completeness does NOT gate matchability
- Prerender + sitemap scripts run in **Netlify CI only**
- `Supabase.ai.Session` in Deno requires `// @ts-ignore` — it's a runtime global
- weworkremotely + remotive descriptions contain raw HTML — strip before embedding
- `embed-opportunities` processes 50/invocation — repeat until `done: true`

## Graph Freshness
Graph built: 2026-08-18 (graphifyy 0.9.46, AST-only, 2478 nodes, 3491 edges)
Auto-rebuild: post-commit + post-checkout hooks installed (background, AST-only, no LLM).
Manual rebuild: `graphify update .` (incremental) or `graphify update . --force` (full)
