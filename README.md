# CVitae

Plataforma de inteligencia de carrera con IA para Paraguay y LatAm. Conecta candidatos (B2C) con empresas (B2B) en un círculo virtuoso donde cada acción de un lado enriquece al otro.

**Stack:** React 19 + Vite 7 + Wouter · Tailwind CSS v4 · Supabase (Postgres + Auth + Edge Functions) · Netlify Functions (migrando a AWS Lambda) · AWS Bedrock (Claude Sonnet 4.6) · Resend

---

## Flujo del círculo virtuoso

```
Candidato sube CV → Score ATS + matching de vacantes
                                    ↓
                  Empresa publica vacante → link propio /vacante/:slug
                                    ↓
                  Candidato postula → CV guardado en vacancy_applications
                                    ↓
                  Empresa analiza postulantes con IA → ranking + decisión
                                    ↓
                  Candidato accede a CVitae → perfil B2C enriquecido
                                    ↑
                  Vacante B2B también aparece en matching B2C (opportunities)
```

---

## B2C — Candidatos (`/mi-carrera/*`)

| Feature | Ruta | Estado |
|---|---|---|
| Score de empleabilidad ATS (0–100) | `/mi-carrera/analisis` | ✅ |
| Matching con oportunidades (embeddings) | `/mi-carrera/oportunidades` | ✅ |
| CV Vivo — adaptado por IA a cada vacante | `/mi-carrera/cv-vivo` | ✅ |
| CV Vivo — modo custom (pegar vacante externa) | `/mi-carrera/cv-vivo` | ✅ (se guarda en opportunities con `source=imported_b2c`) |
| Alertas de empleo por keyword matching | `/mi-carrera/alertas` | ✅ |
| Toggle de alertas por email semanal | `/mi-carrera/alertas` | ✅ (requiere `is_subscribed` en `user_master_profiles`) |
| Perfil B2C con habilidades, experiencia, etc. | `/mi-carrera/perfil` | ✅ |

---

## B2B — Empresas (`/reclutadores`, `/empresas/*`)

| Feature | Ruta | Estado |
|---|---|---|
| Acceso con token (REC-XXXXX-2026) | `/reclutadores` | ✅ |
| Análisis individual de CV (ATS score) | `/reclutadores` → tab Analizar | ✅ |
| Análisis masivo de hasta 30 CVs | `/empresas/masivo` | ✅ |
| Historial de análisis con estrellas | `/reclutadores` → tab Historial | ✅ |
| Comparación Top 3 entre candidatos | `/reclutadores` → Historial | ✅ |
| Crear vacante con link de postulación propio | `/reclutadores` → tab Mis Vacantes | ✅ |
| Vacante B2B también aparece en matching B2C | automático al crear | ✅ |
| Lista de postulantes por vacante | `/reclutadores` → Mis Vacantes → Postulantes | ✅ |
| Análisis automático de todos los postulantes | `/reclutadores` → Postulantes → "Analizar con IA" | ✅ |
| Ranking con fit score (0–100) + recomendación | idem | ✅ (Llamar / Considerar / No llamar) |
| Resumen ejecutivo de la IA (top pick, red flags) | idem | ✅ |
| Filtro por recomendación | idem | ✅ |
| Ver skills que encajan / skills que faltan | idem | ✅ |
| Análisis individual desde postulante | idem → "Análisis individual" | ✅ |

---

## Flujo de postulación via vacante B2B

1. Empresa crea vacante en panel → genera `/vacante/:slug`
2. Comparte el link (WhatsApp, email, redes)
3. Candidato abre la página, completa nombre + email + sube PDF + carta opcional
4. Al enviar:
   - CV se extrae a texto plano (pdf-parse)
   - Se guarda en `vacancy_applications` con cv_text
   - Se hace upsert en `user_master_profiles` (candidato queda en la base B2C)
   - Se genera magic link via Supabase Admin API
   - Resend envía email con asunto "Tu acceso a CVitae está listo ✦"
5. Empresa hace click en "Analizar X CVs con IA" → todos se procesan en paralelo via Bedrock

---

## Funciones serverless (`netlify/functions/`)

| Función | Descripción |
|---|---|
| `analyze-cv-candidate.ts` | Análisis individual (modo `analyze`) y batch por vacante (modo `batch_analyze`) |
| `analyze-vacancy-applicants.ts` | Analiza todos los postulantes de una vacante en paralelo + genera resumen ejecutivo |
| `compare-candidates.ts` | Comparación Top 3 desde historial (modo legacy) + batch_summary |
| `create-vacancy.ts` | Crea vacante en `recruiter_vacancies` y la espeja en `opportunities` |
| `extract-pdf-text.ts` | Extrae texto de PDF (base64 → pdf-parse) |
| `generate-cv-vivo.ts` | Genera CV adaptado por IA; guarda vacantes externas en `opportunities` |
| `submit-lead.ts` | Dos flujos: lead B2B y postulación via vacante (guarda en `vacancy_applications`, envía magic link) |
| `validate-recruiter-token.ts` | Valida token, guarda análisis, historial, toggle estrella, lista vacantes, lista postulantes |
| `analyze-recruiters-batch.ts` | Análisis masivo de lote desde `/empresas/masivo` |
| `gemini-courses.ts` | Recomendación de cursos para candidatos |

---

## Base de datos (Supabase)

### Tablas principales

| Tabla | Descripción |
|---|---|
| `user_master_profiles` | Perfiles B2C. Columnas clave: `user_id`, `email`, `full_name`, `profile_data` (jsonb con `habilidades`, `experiencia`, etc.), `is_subscribed` |
| `opportunities` | Pool de oportunidades. Fuentes: `scraper` (Python), `recruiter_b2b` (panel empresa), `imported_b2c` (vacante externa pegada en CV Vivo). Columna `is_active=false` para importadas pendientes de validación |
| `recruiter_tokens` | Tokens de acceso B2B. Columnas: `access_token`, `token_balance`, `plan_type`, `is_active` |
| `recruiter_vacancies` | Vacantes publicadas por empresas. Columnas: `title`, `company`, `slug`, `recruiter_token_id`, `description`, `requirements`, `location`, `modality`, `rubro` |
| `vacancy_applications` | Postulantes por vacante. Columnas: `vacancy_id`, `name`, `email`, `cv_text`, `cv_file_name`, `cover_letter`, `ats_score`, `fit_score`, `recommendation`, `ai_summary`, `strengths`, `key_matches`, `key_gaps`, `analyzed_at` |
| `recruiter_analyses` | Historial de análisis individuales del panel B2B |
| `generated_cvs` | Caché de CVs generados (7 días) por `user_id` + `vacancy_id` |
| `content_hub` | Blog y artículos (tipo `blog`) |
| `newsletter_subscribers` | Suscriptores del newsletter |

### Migraciones por correr

Ver `supabase/pending-migrations.sql` — contiene:
- `ALTER TABLE user_master_profiles ADD COLUMN IF NOT EXISTS is_subscribed`
- `ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS description`
- `ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS recruiter_vacancy_id`
- `ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS source`

---

## Variables de entorno

### Frontend (`VITE_*`)
```
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_EMAILJS_SERVICE_ID
VITE_EMAILJS_TEMPLATE_ID
VITE_EMAILJS_PUBLIC_KEY
```

### Backend (Netlify / Lambda)
```
ANTHROPIC_API_KEY          # fallback directo (no usado si Bedrock está activo)
CVITAE_AWS_ACCESS_KEY_ID   # credenciales IAM para Bedrock (usuario: cvitae-dev)
CVITAE_AWS_SECRET_ACCESS_KEY
CVITAE_AWS_REGION          # us-east-1
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
RESEND_API_KEY             # envío de emails transaccionales
SITE_URL                   # https://cvitae.lat (para links en emails y magic links)
```

> **Nota Netlify:** `AWS_ACCESS_KEY_ID` y `AWS_SECRET_ACCESS_KEY` son reservadas por Netlify. Por eso se usan los nombres `CVITAE_AWS_*`.

---

## Plan de migración AWS (rama `feature/aws-migration`)

| Fase | Estado | Descripción |
|---|---|---|
| Fase 1 — Bedrock | ✅ | Todas las funciones usan AWS Bedrock en lugar de Anthropic directo |
| Fase 2 — S3 | ⏳ Pendiente | Reemplazar base64 por presigned URLs para subida de PDFs |
| Fase 3 — Lambda | ⏳ Pendiente | Mover funciones pesadas a Lambda (batch analysis, timeout risk) |
| Fase 4 — SEO | ⏳ Pendiente | react-helmet-async en todas las páginas, GA4, eventos custom |
| Fase 5 — Rediseño | ✅ Parcial | Sistema de diseño aprobado aplicado a B2B y B2C |

Script de deploy: `scripts/deploy-lambda.sh`

---

## Scraping (Python — pendiente integración)

El pool de oportunidades (`opportunities`) se alimenta de tres fuentes:
1. **Scrapers Python** (`source = 'scraper'`) — bolsas de empleo locales, LinkedIn, clasificados
2. **Vacantes B2B** (`source = 'recruiter_b2b'`) — creadas desde el panel empresa, visibles inmediatamente en B2C
3. **Vacantes externas B2C** (`source = 'imported_b2c'`, `is_active = false`) — pegadas por candidatos en CV Vivo, quedan en cola para validación manual o automática

Los scrapers Python deben insertar con los campos mínimos: `titulo`, `organization`, `rubro`, `tags`, `application_url`, `is_active = true`, `source = 'scraper'`.

---

## Comandos

```bash
pnpm dev       # Dev server en http://localhost:3000
pnpm build     # Build de producción (Vite)
pnpm preview   # Preview del build local
```

Post-build (Netlify CI):
```bash
node scripts/prerender.mjs         # Pre-render blog y vacantes para SEO
node scripts/generate-sitemap.mjs  # Genera sitemap.xml
node scripts/generate-robots.mjs   # Genera robots.txt
```
