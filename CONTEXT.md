# Contexto completo del proyecto CVitae

> Última actualización: 2026-06-25 · Rama activa: `feature/aws-migration`

---

## Visión general del negocio

**CVitae** es un ecosistema de gestión de talento con IA para Paraguay y Latinoamérica. Tiene dos lados que se alimentan entre sí (círculo virtuoso B2C ↔ B2B):

- **B2C** — profesionales (perfil "Camila", 22–30 años) suben su CV, reciben un Score de Empleabilidad, matching con oportunidades, recomendación de cursos personalizados, y un CV Vivo adaptado por IA para cada vacante.
- **B2B** — empresas (perfil "Martín", retail/logística/turismo con alta rotación) suben lotes de hasta 30 CVs, reciben un ranking comparativo con Top 3, y acumulan un banco de talento propio.
- **El círculo virtuoso**: cada vacante B2B genera un link de postulación único (`/vacante/:slug`). Los candidatos que aplican se registran automáticamente en la base B2C. Más empresas → más vacantes → más candidatos → mejores datos para la IA.

---

## Stack tecnológico

| Capa | Tecnología |
|---|---|
| Frontend | React 19, TypeScript, Vite 7, Wouter, Tailwind CSS v4, Framer Motion |
| Backend serverless | Netlify Functions (~17 funciones en `netlify/functions/`) |
| Base de datos + Auth | Supabase (PostgreSQL, RLS, Auth magic link) |
| IA | AWS Bedrock — modelo `global.anthropic.claude-sonnet-4-6` (us-east-1) |
| Despliegue | Netlify (CI/CD desde GitHub, rama `feature/aws-migration`) |
| Emails | Resend API (from: `noreply@cvitae.lat`, notif admin: `contacto@cvitae.lat`) |

---

## Estado actual del desarrollo

### ✅ Fase 1 — Bedrock (completo)

- `analyze-cv-candidate.ts`, `generate-cv-vivo.ts`, `compare-candidates.ts`, `analyze-recruiters-batch.ts` migradas a `BedrockRuntimeClient`.
- Credenciales AWS pasan **explícitamente** al constructor (no se confía en auto-discovery del SDK):
  ```ts
  new BedrockRuntimeClient({
    region: process.env.CVITAE_AWS_REGION || "us-east-1",
    credentials: {
      accessKeyId: process.env.CVITAE_AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.CVITAE_AWS_SECRET_ACCESS_KEY!,
    },
  })
  ```
- Razón para nombres personalizados `CVITAE_AWS_*`: Netlify reserva `AWS_ACCESS_KEY_ID` y `AWS_SECRET_ACCESS_KEY` para su propio uso interno.

### ✅ Fase 4 — SEO + Analytics (completo)

- GA4 (`G-BZ16ZLP8ZZ`) en `index.html`.
- `react-helmet-async` con `<HelmetProvider>` en `main.tsx`.
- Meta tags únicos en todas las páginas públicas. `noindex` en `/mi-carrera/*`.
- `src/lib/analytics.ts`: eventos `cvAnalyzed`, `b2bLeadSent`, `batchStarted`.
- **Pendiente revisar**: confirmar eventos custom en GA4 → Tiempo real → Eventos.

### ✅ Fase 5 — Rediseño frontend (completo)

Páginas rediseñadas con el sistema visual unificado: LandingPage, Recruiters, BatchAnalysis, VacantePage, Dashboard, ProfileBuilder, CVVivo.

### ✅ Ruta de carrera + cursos contextuales (sesión 2026-06-22)

- **`ProfileBuilder.tsx`** — Paso 2: selector de ruta de carrera (6 opciones). Guardado en `profile_data.career_route`.
- **`ROUTE_GAPS`**: brechas detectadas automáticamente por ruta.
- **`gemini-courses.ts`**: recibe `careerRoute`, adapta el prompt.

### ✅ GrowthLine animada (`src/components/cv/visuals.tsx`)

SVG puro, tres capas: breathing opacity, traveling glow (stroke-dashoffset), pulsing dot (solo variant="score"). `useId()` por instancia para IDs únicos.

### ✅ Beta cerrada + Límites free/pro (sesión 2026-06-25, commit c18a9b2b)

- **`netlify/functions/submit-beta.ts`**: inserta en `beta_waitlist`, envía email de confirmación al usuario + notif a `contacto@cvitae.lat`.
- **`BetaB2CForm`** en `LandingPage.tsx`: formulario inline con 4 estados (idle/success/already/error).
- **`submit-lead.ts`**: ahora envía email branded de confirmación al reclutador B2B al recibir una solicitud.
- **`Dashboard.tsx`**: free users ven solo 1 match; el resto aparece como card blurred + CTA WhatsApp Pro ($9/mes). WA: `595992954169`.
- **`CVVivo.tsx`**: 1 adaptación CV/día para free. Botón "Límite diario alcanzado" al agotar cuota.
- Uso almacenado en `profile_data.daily_usage = { date, matches_shown, cv_vivo }`. Reset automático cuando la fecha cambia. Sin nueva tabla.

### ✅ Admin Briefing Room (sesión 2026-06-25, commit c18a9b2b)

- **`src/pages/Admin.tsx`** rediseñado como OPS Console: `bg-[#080808]`, texto off-white `#e8e8e0`, números `font-mono`, sin glass ni border-radius.
- **SignalLines SVG**: 3 líneas animadas en background, `viewBox="0 0 800 400"`, coordenadas absolutas (no `%`).
- **Sidebar**: dots de estado, badge contador usuarios, indicador ACTIVO pulsante.
- **Tabs**: `brief` (métricas + señales), `usuarios` (tabla con toggle PRO/FREE, TEST/REAL), `beta` (beta_waitlist + recruiter_leads), `contenido`, `tokens`, `skills`.
- **`netlify/functions/admin-data.ts`**: todas las operaciones del admin usan service role key (no anon key). Acciones: `list_users`, `metrics`, `list_beta`, `toggle_subscribed`, `toggle_test`, `mark_beta_invited`. Protegidas con `ADMIN_PASSWORD`.
- Snapshot guardado en `.superpowers/sdd/admin-snapshot-2026-06-25.tsx`.

### ✅ Fix visibilidad texto (sesión 2026-06-25)

`text-muted` → `text-white/60` en `DashboardLayout.tsx`, `Footer.tsx`, `Admin.tsx`.

### ✅ Scrapers nuevos (sesión 2026-06-25, commit 5ad7e3fa)

- `scrapers/jooble_scraper.py` — REST API, 11 búsquedas Paraguay. Requiere secret `JOOBLE_API_KEY`.
- `scrapers/talentcom_scraper.py` — HTML scraping, 14 búsquedas, sin API key.
- `scrapers/googlejobs_v2.py`, `googlejobs_v3.py` — Playwright.
- `.github/workflows/scrapers.yml` — 34 scrapers total, cron diario 10:00 UTC.

---

## Pendientes de código (próximo commit — reservado para urgencias hasta 12 julio)

| Tarea | Descripción |
|---|---|
| Admin → botón Eliminar usuario | `admin-data.ts` acción `delete_user` → `auth.admin.deleteUser(userId)` + confirmación |
| Admin → columna Notas | Campo `notes text` en tabla (SQL ya aplicado), editable inline |
| Admin → fix card Pro blurred | `min-h-[80px]` al preview, ajustar overlay en Dashboard.tsx |
| Admin → fix botón Invitar beta | Verificar que `beta_waitlist.invited_at` exista; `mark_beta_invited` en admin-data.ts ya está |
| Admin → separar contenido manual vs scraper | Filtro visual en tab Contenido: `tipo='blog'` = manual, resto = scraper/actions |
| Footer | Columna "Para empresas", quitar links `#` placeholder, campo newsletter, GrowthLine decorativa |
| Link `/demo` desde navbar | Existe y funciona pero sin enlace desde ningún lugar del sitio |
| GA4 eventos custom | Confirmar que `cvAnalyzed`, `b2bLeadSent`, `batchStarted` llegan a GA4 Tiempo real |

---

## SQL aplicado en producción (Supabase)

```sql
-- Sesión 2026-06-25
ALTER TABLE user_master_profiles
  ADD COLUMN IF NOT EXISTS is_test boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS user_type text DEFAULT 'free';

-- Aplicar también (pendiente confirmar):
ALTER TABLE beta_waitlist
  ADD COLUMN IF NOT EXISTS invited_at timestamptz,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending';

ALTER TABLE user_master_profiles
  ADD COLUMN IF NOT EXISTS notes text;
```

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
| `submit-lead.ts` | Lead B2B + postulación via vacante + email confirmación al reclutador |
| `submit-beta.ts` | ← NUEVO: inserta en beta_waitlist, envía confirmación B2C + notif admin |
| `validate-recruiter-token.ts` | Valida token, guarda análisis, historial, toggle estrella, lista vacantes, lista postulantes |
| `analyze-recruiters-batch.ts` | Análisis masivo de lote desde `/empresas/masivo` |
| `gemini-courses.ts` | Recomendación de cursos según perfil y ruta de carrera |
| `generate-token.ts` | Genera tokens B2B (formato `REC-XXXXXX-2026`) |
| `admin-auth.ts` | Valida ADMIN_PASSWORD para acceso a `/admin` |
| `admin-data.ts` | ← NUEVO: operaciones admin con service role (list, toggle, delete) |
| `subscribe-newsletter.ts` | Suscripción al newsletter |

---

## Base de datos (Supabase)

### Tablas principales

| Tabla | Descripción |
|---|---|
| `user_master_profiles` | Perfiles B2C. Columnas clave: `user_id`, `email`, `full_name`, `profile_data` (jsonb — incluye `habilidades`, `experiencia`, `badges[]`, `daily_usage`, `career_route`), `is_subscribed`, `is_test`, `user_type`, `notes` |
| `opportunities` | Pool de oportunidades. Fuentes: scrapers Python, `recruiter_b2b`, `imported_b2c`. |
| `recruiter_tokens` | Tokens de acceso B2B. `access_token`, `token_balance`, `plan_type`, `is_active`. |
| `recruiter_vacancies` | Vacantes publicadas por empresas. |
| `vacancy_applications` | Postulantes por vacante con scores IA. |
| `recruiter_analyses` | Historial de análisis individuales del panel B2B. |
| `generated_cvs` | Caché de CVs generados (7 días) por `user_id` + `vacancy_id`. |
| `content_hub` | Blog, oportunidades, becas, foros. `tipo` distingue la fuente. |
| `beta_waitlist` | Lista de espera B2C. `email`, `name`, `status (pending/invited/rejected)`, `invited_at`. |
| `recruiter_leads` | Solicitudes B2B desde la landing. |
| `newsletter_subscribers` | Suscriptores del newsletter. |
| `skill_candidates` | Skills candidatas para aprobar/rechazar desde admin. |

---

## Sistema de diseño (NO modificar sin autorización)

### Tokens base

```css
--background: oklch(0.16 0.012 60)  /* ≈ #0f0e0d — warm dark */
--gold:       oklch(0.78 0.13 82)   /* ≈ #c9a84c */
--gold-soft:  oklch(0.86 0.10 86)   /* ≈ #e6cf8a */
--cream:      oklch(0.96 0.015 85)  /* ≈ #f5f4f0 */
--ink:        oklch(0.10 0.008 60)  /* ≈ #0a0a0a */
```

### Superficies

| Clase | Uso |
|---|---|
| `glass-panel` | Glassmorphism — elementos secundarios, listas, cards informativas |
| `editorial-panel` | Fondo sólido oscuro — secciones de contenido neutral |
| `gold-panel` | Borde dorado + gradiente — score hero, veredicto IA, pricing Pro |

**Nota**: `glass-card` tiene `padding: 1.5rem` hardcoded. Usar `glass-panel` + padding manual en casos nuevos.

### Tipografía

- **Playfair Display** (`font-display`) para títulos, scores, y el logo.
- **Inter** para body text.
- Logo: `<span class="font-black">CV</span><span class="italic font-normal">itae</span>` — siempre en `text-gold`.

### Admin OPS Console (estilo separado del resto del sitio)

- `bg-[#080808]`, texto `#e8e8e0`, números en `'JetBrains Mono', monospace`.
- Bordes hairline `border-white/[0.07]`. Sin border-radius estructural, sin glass.
- Gold `#c9a84c` usado con extrema reserva (solo alertas y KPIs clave).
- SignalLines SVG: `viewBox="0 0 800 400"` con coordenadas absolutas (no `%`).

### Regla inviolable

> NUNCA mezclar dos colores dentro de la misma frase. El énfasis va con peso, itálica, tamaño, o la GrowthLine — jamás con color mixto en texto.

---

## Estructura de archivos clave

```
src/
  pages/
    LandingPage.tsx      # Marketing público principal + BetaB2CForm
    Recruiters.tsx       # Login B2B + panel autenticado (/empresas)
    BatchAnalysis.tsx    # Análisis masivo (/empresas/masivo)
    VacantePage.tsx      # Postulación pública (/vacante/:slug)
    Admin.tsx            # OPS Console (/admin) — Briefing Room design
    Opportunities.tsx
    Blog.tsx / BlogPost.tsx
    About.tsx, Privacy.tsx, Terms.tsx, Cookies.tsx
  hub/
    Dashboard.tsx        # Hub B2C — matching con límite 1/día free
    ProfileBuilder.tsx   # Wizard de perfil
    CVVivo.tsx           # CV Vivo adaptado — límite 1/día free
    Alertas.tsx, Configuracion.tsx, JobMatcher.tsx
  components/
    cv/
      visuals.tsx        # GrowthLine, CompatibilityTrace, ScoreRing, Logo, Eyebrow
      SiteShell.tsx      # Navbar + Footer para páginas públicas
    cvitae/
      UI-Elements.tsx    # GlassCard, GoldButton, Badge, MatchArc (legacy)
      DashboardLayout.tsx
      Navbar.tsx, Footer.tsx
  lib/
    supabase.ts
    analytics.ts
    utils.ts
  App.tsx
  index.css

netlify/functions/
  _supabase.ts           # makeSupabaseAdmin() / makeSupabaseAnon()
  admin-auth.ts          # Valida ADMIN_PASSWORD
  admin-data.ts          # ← NUEVO: operaciones admin con service role
  submit-beta.ts         # ← NUEVO: lista de espera B2C
  submit-lead.ts         # Lead B2B + postulación vacante + email confirmación
  analyze-cv-candidate.ts
  analyze-recruiters-batch.ts
  compare-candidates.ts
  generate-cv-vivo.ts
  extract-pdf-text.ts
  generate-token.ts
  validate-recruiter-token.ts
  analyze-vacancy-applicants.ts
  gemini-courses.ts
  subscribe-newsletter.ts
  create-vacancy.ts

scrapers/
  computrabajo_scraper.py
  buscojobs_scraper.py
  jooble_scraper.py       # ← NUEVO: REST API, requiere JOOBLE_API_KEY
  talentcom_scraper.py    # ← NUEVO: HTML scraping, sin API key
  googlejobs_v2.py / v3.py
  ... (30+ scrapers)

.github/workflows/
  scrapers.yml            # Cron diario 10:00 UTC + workflow_dispatch, 34 scrapers

.superpowers/sdd/
  admin-snapshot-2026-06-25.tsx  # Snapshot del admin para referencia de venta/demo
```

---

## Variables de entorno

### Frontend (`.env` local, Netlify UI)

```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

### Backend (Netlify UI — Environment variables)

```
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=      # RLS bypass — solo server-side
CVITAE_AWS_ACCESS_KEY_ID=       # IAM user: cvitae-dev
CVITAE_AWS_SECRET_ACCESS_KEY=
CVITAE_AWS_REGION=us-east-1
ADMIN_PASSWORD=                 # Para /admin OPS Console
RESEND_API_KEY=                 # Emails transaccionales (Resend)
GEMINI_API_KEY=                 # Para gemini-courses.ts
JOOBLE_API_KEY=                 # Para jooble_scraper.py (GitHub Secret)
```

> **Nota Netlify:** `AWS_ACCESS_KEY_ID` y `AWS_SECRET_ACCESS_KEY` son reservadas por Netlify. Usar `CVITAE_AWS_*`.

---

## Cómo levantar el entorno local (Windows)

**NO usar `netlify dev` solo** — en Windows causa `EBUSY` por el watcher de archivos.

**Abrir DOS terminales separadas:**

```bash
# Terminal 1 — Frontend (Vite)
cd C:\proyectos\cvitae-unified
npm run dev
# → http://localhost:5173

# Terminal 2 — Funciones serverless
cd C:\proyectos\cvitae-unified
netlify functions:serve
# → http://localhost:9999/.netlify/functions/*
```

---

## Estrategia beta cerrada

- **B2C**: formulario `BetaB2CForm` en landing → inserta en `beta_waitlist` → admin puede invitar desde tab Beta/Leads.
- **B2B**: siempre fue cerrado por diseño — tokens `REC-XXXXX-2026` se crean manualmente desde el admin.
- Para abrir registro público B2C: activar "Enable email signup" en Supabase Auth Settings.
- WhatsApp upgrade Pro: `https://wa.me/595992954169?text=Hola! Quiero activar CVitae Pro por USD 9/mes.`

---

## Respuestas a preguntas específicas

### ¿Cómo funciona `/vacante/:slug`?

1. Empresa crea vacante → genera `/vacante/:slug`
2. Candidato abre la página, completa nombre + email + sube PDF
3. Al enviar: extrae texto PDF, guarda en `vacancy_applications`, hace upsert en `user_master_profiles`, genera magic link, envía email "Tu acceso a CVitae está listo ✦"
4. Empresa analiza postulantes con IA → ranking + badges

### ¿Por qué los scrapers usan `CVITAE_AWS_*`?

Netlify reserva `AWS_ACCESS_KEY_ID` y `AWS_SECRET_ACCESS_KEY`. Los scrapers corren en GitHub Actions, no en Netlify, así que ahí sí se pueden usar nombres estándar.

### ¿Cómo funcionan los límites free/pro?

Almacenados en `user_master_profiles.profile_data.daily_usage = { date, matches_shown, cv_vivo }`. Si la fecha no coincide con hoy (timezone America/Asuncion), se trata como 0. Sin nueva tabla. Pro (`is_subscribed=true`) no tiene límite.
