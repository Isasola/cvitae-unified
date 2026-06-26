# CVitae

Plataforma de inteligencia de carrera con IA para Paraguay y LatAm. Conecta candidatos (B2C) con empresas (B2B) en un círculo virtuoso donde cada acción de un lado enriquece al otro.

**Stack:** React 19 + Vite 7 + Wouter · Tailwind CSS v4 · Supabase (Postgres + Auth) · Netlify Functions · AWS Bedrock (Claude Sonnet 4.6) · Resend

**Rama de producción:** `feature/aws-migration` (Netlify apunta aquí, no a `main`)

---

## Estrategia de negocio

- **B2C:** Beta cerrada — formulario en landing → `beta_waitlist` → admin aprueba manualmente
- **B2B:** USD por token — acceso con código `REC-XXXXX-2026` creado desde el admin
- **Pro B2C:** USD 9/mes via WhatsApp (`595992954169`) — activa límites de matching y CV Vivo ilimitados
- **Pricing UI:** Sin cambios hasta ~julio 2026

---

## Flujo del círculo virtuoso

```
Candidato sube CV → Score ATS + matching de vacantes
                                    ↓
                  Empresa publica vacante → link propio /vacante/:slug
                                    ↓
                  Candidato postula → CV guardado en vacancy_applications
                                    ↓
                  Empresa analiza postulantes con IA → ranking + badges
                                    ↓
                  Candidato accede a CVitae → perfil B2C enriquecido
                                    ↑
                  Vacante B2B también aparece en matching B2C (opportunities)
```

---

## B2C — Candidatos (`/mi-carrera/*`)

| Feature | Estado |
|---|---|
| Score de empleabilidad ATS (0–100) | ✅ |
| Matching con oportunidades — 1/día free, ilimitado Pro | ✅ |
| CV Vivo adaptado por IA — 1/día free, ilimitado Pro | ✅ |
| Ruta de carrera (6 opciones) + cursos contextuales | ✅ |
| Alertas de empleo por keyword | ✅ |
| Tests de competencias (Verificate) + badges | ✅ |

---

## B2B — Empresas (`/empresas/*`)

| Feature | Estado |
|---|---|
| Acceso con token REC-XXXXX-2026 | ✅ |
| Análisis individual + masivo (hasta 30 CVs) | ✅ |
| Vacante con link de postulación propio | ✅ |
| Ranking IA de postulantes + fit score | ✅ |
| Historial + comparación Top 3 | ✅ |

---

## Admin OPS Console (`/admin`)

Panel Briefing Room con autenticación por `ADMIN_PASSWORD`. Todas las operaciones usan service role key via `admin-data.ts` (no anon key — RLS no aplica).

Tabs: **Brief** (métricas del día) · **Usuarios** (toggle PRO/FREE, TEST/REAL) · **Beta/Leads** (gestión lista de espera) · **Contenido** · **Tokens B2B** · **Skills IA**

---

## Levantar localmente (Windows)

Dos terminales separadas — NO usar `netlify dev` solo (causa EBUSY en Windows):

```bash
# Terminal 1
npm run dev          # → http://localhost:5173

# Terminal 2
netlify functions:serve   # → http://localhost:9999/.netlify/functions/*
```

---

## Variables de entorno requeridas

```
# Frontend
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY

# Backend (Netlify)
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
CVITAE_AWS_ACCESS_KEY_ID     # NO usar AWS_ACCESS_KEY_ID — reservada por Netlify
CVITAE_AWS_SECRET_ACCESS_KEY
CVITAE_AWS_REGION=us-east-1
ADMIN_PASSWORD
RESEND_API_KEY
GEMINI_API_KEY

# GitHub Actions (scrapers)
JOOBLE_API_KEY
```

---

## Scrapers

Pool de ~34 scrapers Python en `scrapers/`, cron diario 10:00 UTC via GitHub Actions.

Fuentes principales: Computrabajo, BuscoJobs, Jooble, Talent.com, UNJobs, Remotive, Himalayas, Arbeitnow, Jobicy, WeWorkRemotely + sector público/financiero/salud/educación Paraguay.

Ver `.github/workflows/scrapers.yml` para la lista completa.
