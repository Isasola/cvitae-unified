# CVitae — CLAUDE.md

## Estado operativo (2026-08-19)

Commit de producción: `45377355` — fix(beta): gate founding rollout and prerender opportunity deep links.
Handoff de sesión: [`docs/HANDOFF_2026-08-19_FOUNDING_BETA.md`](docs/HANDOFF_2026-08-19_FOUNDING_BETA.md)

Produccion tiene 133 oportunidades verificadas. No activar fuentes, matching, alertas, ni migraciones sin autorizacion explicita.

**Deploy: git push a `feature/aws-migration` ÚNICAMENTE. NUNCA `netlify deploy`.**

## Comandos

```bash
pnpm dev          # Dev server en http://localhost:3000
pnpm build        # Build de producción (Vite)
pnpm preview      # Preview local del build
```

Post-build (corre Netlify en CI, no correr manualmente en dev):
```bash
node scripts/prerender.mjs
node scripts/generate-sitemap.mjs
node scripts/generate-robots.mjs
```

No hay test runner configurado.

## Stack

React 19 + Vite + Wouter · Tailwind CSS v4 · Supabase (Postgres + Auth + Edge Functions) · Netlify Functions · AWS Bedrock (`global.anthropic.claude-sonnet-4-6`, us-east-1) · Resend

## Estructura

```
src/
  hub/        # Rutas autenticadas B2C (/mi-carrera/*)
  pages/      # Rutas públicas + B2B
  components/
    cvitae/   # Design system: UI-Elements.tsx, DashboardLayout, Footer, Navbar
  layouts/    # CareerLayout (wrap de hub), SiteShell (wrap público)
  lib/        # supabase.ts (cliente + auth helpers)
netlify/functions/   # Serverless — ver .claude/agents/backend.md
supabase/            # Migrations SQL
```

## Rutas completas

| Ruta | Archivo | Notas |
|---|---|---|
| `/` | `LandingPage.tsx` | Público |
| `/demo` | `Demo.tsx` | Demo educativa B2C+B2B — **sin enlace desde navbar aún** |
| `/mi-carrera/*` | `src/hub/` | Requiere auth Supabase |
| `/mi-carrera/verificate` | `Assessments.tsx` | Tests opcionales + badges |
| `/empresas` | `Recruiters.tsx` | Token-gated (REC-XXXXX-2026) |
| `/empresas/masivo` | `BatchAnalysis.tsx` | Batch hasta 30 CVs |
| `/vacante/:slug` | `VacantePage.tsx` | Postulación pública B2B |
| `/oportunidades/:slug` | `OpportunityDetail.tsx` | Desde `content_hub`, no `opportunities` |

## Reglas críticas

- Rama activa: `feature/aws-migration` — nunca tocar `main`
- **No modificar** flujo de 4 pasos de `ProfileBuilder.tsx`
- **No modificar** Supabase Auth ni RLS
- **No cambiar** UI de pricing hasta julio 2026 (pendiente intel Moonshot Paraguay)
- El footer (`Footer.tsx`) **no va** dentro de `DashboardLayout` — solo en páginas públicas
- `match-batch` es **Supabase Edge Function**, no Netlify Function

## Gotchas de Edge Functions

- `Supabase.ai.Session` requiere `// @ts-ignore` — no es módulo importable, es global del runtime Deno
- Descriptions de `weworkremotely` y `remotive` contienen HTML crudo — stripear con regex antes de embeddear
- `embed-opportunities` procesa 50 por invocación — invocar repetidamente hasta `{ "done": true }`
- `match-batch` usa pgvector (`match_opportunities` RPC) con fallback a keyword si hay <5 resultados vectoriales
- `opportunities.id` es `TEXT`, no `uuid` — no usar `gen_random_uuid()` para insertar

## Contexto adicional

- Ver `.claude/agents/frontend.md` para design system y convenciones UI
- Ver `.claude/agents/backend.md` para functions, variables de entorno y patrones de IA
- Ver `.claude/agents/supabase.md` para schema, Edge Functions y gotchas de BD
- Ver `README.md` para estrategia de negocio, flujos y pendientes técnicos

## graphify

Knowledge graph at graphify-out/ (AST-only, auto-rebuilt post-commit/post-checkout, no LLM cost).

Navigation order — follow strictly:
1. `graphify query "<question>"` — BFS traversal, returns scoped subgraph
2. `graphify path "<A>" "<B>"` — shortest path between two nodes
3. `graphify explain "<concept>"` — focused explanation of a node
4. Targeted source read of the 1-3 files the graph identifies
5. `graphify-out/wiki/index.md` or `GRAPH_REPORT.md` — ONLY if steps 1-3 cannot provide enough broad context

NEVER: read `graphify-out/graph.json` directly (thousands of tokens, no value over CLI).
After modifying code: `graphify update .` then `graphify label` to keep graph and community names current.

## Token Policy

For architecture/recon questions:
1. Graphify query first.
2. Read only identified files/functions.
3. Do not re-audit stable subsystems.
4. Do not reread historical session logs unless required.
5. Prefer targeted reads over full-file reads.
6. Do not load all docs/ai/ files automatically — read only the one relevant to the task.
7. Stop exploration once dependencies are sufficiently mapped.

## Task Collision Protocol

Before modifying code, declare:
- **SCOPE**: what is being changed
- **DO-NOT-TOUCH**: neighboring systems
- **ACCEPTANCE CRITERIA**: when to stop

If a problem outside scope is found: **REPORT ONLY**.
Fix automatically only if P0: data loss, security compromise, production outage, direct regression from current task.

Applies especially to: SEO ≠ MATCHING ≠ CATALOG ≠ PUBLICATION ≠ JOBPOSTING ≠ SCRAPER

## Knowledge Layer

docs/ai/SYSTEM_CONTRACTS.md  — pipeline invariants, matching flags, subsystem separation
docs/ai/KNOWN_FAILURE_MODES.md  — failure catalog with root causes and DO-NOTs
docs/ai/OPERATIONS.md  — deploy model, build commands, env layers, graphify ops
docs/ai/SESSION_HANDOFF.md  — current state snapshot (dated), pending work, start-up checklist

## Founding Beta Operating System

Migrations applied through `202608190014` (migrations 010–014). Do not rerun.

Tables: `founding_beta_enrollments`, `user_events`, `email_log`, `b2c_acquisition`
New columns: `user_master_profiles` (lifecycle_state, ttfv_seconds, first_value_event, **founding_offer_enabled**), `b2b_prospects` (+7 funnel columns)
RPC functions: `accept_founding_beta`, `mark_founding_beta_offered` (both SET search_path='')
Netlify functions: `log-user-event`, `founding-beta-action`, `send-founding-email`, `notify-founder-signup`

### Sequential Rollout Gate

`founding_offer_enabled boolean DEFAULT true` on `user_master_profiles`.
- `true` (default) → normal auto Founding flow for all future genuine users.
- `false` → offer deferred; `get_status` returns ineligible/rollout_pending; `mark_offered` skips; `accept` returns 403.
- Gate is **fail-closed**: DB error on gate query = ineligible in all three handlers.
- Changing `false → true` via Admin Customer 360 "Habilitar Founding →" (requires confirmation) does NOT send email/offer/grant Pro — merely unblocks the next genuine login.

Current state (as of 2026-08-19):
- Rosarito Godoy (d5892885): `founding_offer_enabled = true` — ELIGIBLE / ENABLED
- Marcelo Vázquez (49ae16ef): `founding_offer_enabled = false` — ELIGIBLE · DEFERRED

### Automation Truth — Founding Email / Offer

All founding lifecycle emails are now automatically triggered. Wired in commit after `80b73d30`.

**Current auto-flow:**
- `useFoundingBeta` hook calls `get_status` on mount.
- If eligible and `showModal` would be true → fires `mark_offered` (fire-and-forget; modal shows immediately).
- `mark_offered` backend: on first offer → sends `founding_offer_v1` to user + `founder_founding_offered` alert to founder (both via `email_log`, idempotent key `founding_offer_v1:<userId>:v1` / `founder_founding_offered:<userId>:v1`).
- Repeated logins with status `offered` → `mark_offered` called again → idempotency dedup prevents duplicate emails.
- On `accept` → `founding_welcome_v1` to user + `founder_founding_accepted` alert to founder (keys `founding_welcome_v1:<userId>:v1` / `founder_founding_accepted:<userId>:v1`).
- On first `signed_up → activated` transition in `log-user-event` (non-test users only) → `founder_first_value` alert (key `founder_first_value:<userId>:v1`).

**Idempotency architecture:** All 5 emails use `email_log.idempotency_key` for dedup. Failure is logged; product state (Pro, enrollment, lifecycle) is NEVER rolled back due to email failure.

**Founder milestone alerts** (`contacto@cvitae.lat`): FOUNDING OFFERED, FOUNDING ACCEPTED, FIRST VALUE. No alerts for logins, pageviews, dismissals, or matching.

`send-founding-email.ts` and `notify-founder-signup.ts` remain available for admin/manual sends.

### Other Rules

Real user protection: `PROTECTED_REAL_USERS` in `netlify/functions/admin-data.ts`. Use `execute_mark_test` (not toggle_test) — enforces guard.
Lifecycle: `lifecycle_state` is a denormalized cache. Source of truth: `user_events`.
Email dedup: idempotency_key `<template>:<user_id>:v1`; never add UNIQUE constraint to email_log.
Founding status enum: `eligible/offered/accepted/active/completed/declined`.
"Ahora no" = dismiss only (no status change). "Prefiero no participar" = localStorage flag only (V1).

## Opportunity Routing

Jobs prerendered under BOTH `/empleos/:slug` (canonical for jobs-only facet) AND `/oportunidades/:slug` (canonical for catalog route).
Non-job opps and content_hub opps under `/oportunidades/:slug` only.
`netlify.toml`: unknown /oportunidades/:slug → real 404. Unknown /empleos/:slug → real 404. No `/* → /index.html` catch-all for deep routes.
jobLocation emitted in JSON-LD only when `job.city` is present — no fabricated country for remote/intl jobs.
