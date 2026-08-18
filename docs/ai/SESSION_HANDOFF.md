# CVitae — Session Handoff

## Current State
Production commit: `f11309f4` on `feature/aws-migration` — HEALTHY
Last deploy: 2026-08-18. Post-deploy smoke test: PASS. Last QA: P13-P19 closed.

## Snapshot — VOLATILE (2026-08-18 — query DB for current values)
| Metric | Value |
|---|---|
| Active + verified | 157 |
| Matchable | 144 |
| Catalog eligible | 153 |
| SEO eligible | 149 |
| Pending + in_review | 664 |
| content_hub KEEP | 51 (legacy, not primary) |
| Sitemap live post-deploy | 216 |

## Next Operational Work (priority order)
1. Gradual moderation of 664 pending/in_review records
2. Netlify variable configuration (pending from maratón 18hs)
3. Catalog is_active bulk activation (pending authorization)
4. Scraper audit: 40 existing + 6 new from P18

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
