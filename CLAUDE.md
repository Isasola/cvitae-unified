# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev          # Dev server at http://localhost:3000
pnpm build        # Vite build to dist/
pnpm preview      # Preview production build locally
```

The full production build pipeline (run by Netlify/CI) also runs after `pnpm build`:
```bash
node scripts/prerender.mjs          # Pre-render blog and opportunity pages for SEO
node scripts/generate-sitemap.mjs   # Generate sitemap.xml
node scripts/generate-robots.mjs    # Generate robots.txt
```

No test runner is configured.

## Architecture

**CVitae** is an AI-powered career intelligence platform for Paraguay/LatAm. It is a React SPA frontend backed by serverless functions (currently Netlify Functions, being migrated to AWS Lambda on the `feature/aws-migration` branch).

### Frontend (React + Vite)

- **Router**: Wouter (`src/App.tsx`) — flat route list, no nested routing
- **Auth**: Supabase magic links (OTP email). Session checked via `src/lib/supabase.ts`. Protected routes (`/mi-carrera/*`) check `auth.getUser()` before rendering.
- **Styling**: Tailwind CSS v4 + Radix UI primitives. Custom design-system components live in `src/components/cvitae/UI-Elements.tsx` (`GlassCard`, `GoldButton`, `MatchArc`, etc.).
- **Path alias**: `@/` maps to `src/`
- **State**: React local state only — no global store. No data-fetching library; direct `fetch` calls to serverless functions.
- **Forms**: React Hook Form + Zod validation via `@hookform/resolvers`

**Route structure:**
- `/` — public marketing pages (`src/pages/`)
- `/mi-carrera/*` — authenticated user hub (`src/hub/`), wrapped by `src/layouts/CareerLayout.tsx`
- `/reclutadores/*` — B2B recruiter tools (`BatchAnalysis`, token-gated)
- `/admin` — admin dashboard with its own token auth

### Backend (Serverless Functions)

Currently `netlify/functions/*.ts` — migrating to AWS Lambda. Functions call:
- **Anthropic Claude API**: CV analysis (`analyze-cv-candidate.ts`), CV generation (`generate-cv-vivo.ts`), batch recruiter analysis (`analyze-recruiters-batch.ts`)
- **Supabase** (service role): reading/writing profiles, recruiter tokens, leads, analyses
- **Resend API**: transactional email for B2B leads

**Key data flows:**
1. **CV Analysis**: Browser uploads file → `extract-pdf-text` (pdf-parse/mammoth) → `analyze-cv-candidate` (Claude) → structured JSON score returned to frontend
2. **CV Vivo**: User selects job → `generate-cv-vivo` streams a tailored CV (cached 7 days in Supabase)
3. **Recruiter tokens**: `generate-token` creates credits → `validate-recruiter-token` gates `analyze-recruiters-batch` per token balance
4. **Job matching**: Frontend calls Supabase Edge Function `match-batch` directly (not Netlify), passing profile embedding vs. opportunity embeddings

### Database (Supabase)

Key tables: `profiles`, `opportunities`, `recruiter_tokens`, `recruiter_analyses`, `recruiter_leads`, `newsletter_subscribers`. RLS is enforced at the database level.

### Environment Variables

**Frontend** (prefix `VITE_`):
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- `VITE_EMAILJS_SERVICE_ID`, `VITE_EMAILJS_TEMPLATE_ID`, `VITE_EMAILJS_PUBLIC_KEY`

**Backend** (serverless function secrets):
- `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`

### AWS Migration Context

The `feature/aws-migration` branch is replacing Netlify Functions with AWS Lambda. The function logic stays the same; the deployment target and endpoint URLs (`/.netlify/functions/*`) will change to API Gateway URLs. Supabase remains unchanged.

## Contexto de Negocio

CVitae es un ecosistema de gestión de talento con IA para Paraguay/LatAm con dos lados que se alimentan entre sí (círculo virtuoso B2C↔B2B):
- **B2C**: candidatos (22-30 años, perfil "Camila") suben CV, reciben Score de Empleabilidad, matching con oportunidades, recomendación de cursos, CV Vivo adaptado por IA
- **B2B**: empresas (perfil "Martín", retail/logística/turismo con alta rotación) suben lotes de hasta 30 CVs, reciben ranking comparativo con Top 3, banco de talento acumulado
- El link de postulación propio de cada vacante B2B alimenta automáticamente la base B2C (el círculo virtuoso)

## Sistema de Diseño Aprobado (NO modificar sin autorización)

Definido y aprobado en Lovable, debe aplicarse al rediseño del frontend:
- **Tipografía**: Playfair Display para títulos (logo: "CV" peso 900 + "itae" itálica peso 400, color #c9a84c)
- **Paleta**: fondo #0a0a0a, acento #c9a84c, texto blanco/gris
- **Motivo gráfico**: línea de progreso orgánica (trazo curvo a mano alzada) como elemento recurrente de marca — representa trayectoria de carrera. Animada con glow lento que la recorre en loop
- **Materiales**: glassmorphism solo en superficies secundarias; tratamiento sólido con borde dorado para elementos de decisión (CTAs, scores, pricing)
- **Regla estricta**: NUNCA mezclar dos colores dentro de la misma frase. Énfasis solo con peso/itálica/tamaño/motivo gráfico, nunca con color mixto en texto

## Plan de Migración AWS (rama feature/aws-migration)

### Fase 1 — Bedrock (PRIORIDAD)
Reemplazar llamadas directas a Anthropic API por AWS Bedrock en todas las Netlify Functions:
- Modelo: `global.anthropic.claude-sonnet-4-6` (inference profile ya habilitado)
- Región: us-east-1
- Archivos a migrar: `analyze-cv-candidate.ts`, `generate-cv-vivo.ts`, `analyze-recruiters-batch.ts`, `compare-candidates.ts`, `gemini-courses.ts`
- Credenciales AWS ya configuradas en la máquina local (usuario IAM: cvitae-dev)

### Fase 2 — S3
Reemplazar el patrón base64 en BatchAnalysis y ProfileBuilder por subida directa a S3:
- Frontend genera presigned URL → sube PDF directo → función recibe solo la referencia S3
- Elimina el cuello de botella de base64 en lotes de 30 CVs

### Fase 3 — Lambda
Mover funciones pesadas de Netlify a Lambda para eliminar riesgo de timeout:
- Prioridad: batch analysis (loop secuencial de 30 CVs, riesgo alto de timeout en Netlify)
- Paralelizar el procesamiento con Promise.all en vez del for/await actual

### Fase 4 — SEO + Analytics
- Implementar react-helmet-async en todas las páginas con meta tags únicos
- Confirmar que GA4 (G-BZ16ZLP8ZZ) apunta a la propiedad correcta
- Agregar eventos personalizados: CV analizado, lead B2B enviado, batch iniciado

### Fase 5 — Rediseño Frontend
- Aplicar el sistema de diseño aprobado (sección arriba) a todas las páginas
- Flujo de registro: CV + correo en un paso → IA autocompleta el perfil (ya existe en ProfileBuilder, mover al hero de la landing)
- NO modificar la lógica de Supabase Auth

## Reglas de Trabajo

- Siempre trabajar en la rama `feature/aws-migration`, nunca en `main`
- Antes de cada fase nueva, hacer commit de lo anterior
- Si algo puede romper auth o Supabase RLS, preguntar antes de ejecutar
- Mantener Supabase como está — no migrar base de datos
