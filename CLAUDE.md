# CVitae — CLAUDE.md

## Estado operativo post-deploy (2026-08-14)

Leer primero [`docs/POST-DEPLOY-HANDOFF-2026-08-14.md`](docs/POST-DEPLOY-HANDOFF-2026-08-14.md). El QA P13-P19 esta cerrado localmente y desplegado desde `feature/aws-migration`; Netlify publica automaticamente cada push. No crear otro sitio.

Produccion tiene 133 oportunidades verificadas y 556 en `in_review` con `is_active=false`. No activar fuentes, matching, alertas, SEO, migraciones ni variables privadas sin autorizacion explicita. El siguiente trabajo operativo es moderacion gradual y sink compliance de scrapers legacy.

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
After modifying code: `graphify update .` to keep graph current.

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
