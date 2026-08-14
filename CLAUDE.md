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
