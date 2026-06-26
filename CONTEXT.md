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
| Backend serverless | Netlify Functions (~15 funciones en `netlify/functions/`) |
| Base de datos + Auth | Supabase (PostgreSQL, RLS, Auth magic link) |
| IA | AWS Bedrock — modelo `global.anthropic.claude-sonnet-4-6` (us-east-1) |
| Despliegue | Netlify (CI/CD desde GitHub, rama `feature/aws-migration`) |
| Emails | Resend API |

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
- Razón para nombres personalizados `CVITAE_AWS_*`: Netlify reserva `AWS_ACCESS_KEY_ID` y `AWS_SECRET_ACCESS_KEY` para su propio uso interno, causaban 401 si se usaban esos nombres exactos.
- Pruebas: B2C (analizador individual) y B2B (batch) funcionando con datos reales.

### ✅ Fase 4 — SEO + Analytics (completo)

- GA4 (`G-BZ16ZLP8ZZ`) en `index.html` — ver datos en [analytics.google.com](https://analytics.google.com) con esa propiedad.
- `react-helmet-async` con `<HelmetProvider>` en `main.tsx`.
- Meta tags únicos (title, description, og:*, canonical) en todas las páginas públicas.
- `<meta name="robots" content="noindex" />` en todas las páginas del hub `/mi-carrera/*`.
- `src/lib/analytics.ts`: eventos `cvAnalyzed`, `b2bLeadSent`, `batchStarted` wired.
- **Pendiente revisar**: confirmar que los eventos custom llegan correctamente a GA4 (hacer prueba real desde `/` y verificar en GA4 → Tiempo real → Eventos).

### ✅ Fase 5 — Rediseño frontend (completo)

Páginas rediseñadas con el sistema visual unificado:
- `src/pages/LandingPage.tsx`
- `src/pages/Recruiters.tsx` (login B2B + panel autenticado)
- `src/pages/BatchAnalysis.tsx`
- `src/pages/VacantePage.tsx` ← nueva
- `src/hub/Dashboard.tsx`
- `src/hub/ProfileBuilder.tsx`
- `src/hub/CVVivo.tsx`

### ✅ Ruta de carrera + cursos contextuales (sesión 2026-06-22)

Commit: `eee048f4`

- **`ProfileBuilder.tsx`** — Paso 2 ahora incluye selector "¿Hacia dónde querés crecer?" con 6 rutas:
  `empleo-local` · `remoto` · `beca-posgrado` · `organismos` · `emprendimiento` · `cambio-area`
  Se guarda en `profile_data.career_route` en Supabase.
- **`ROUTE_GAPS`**: por cada ruta se detectan automáticamente brechas de habilidades (ej: remoto → Inglés obligatorio).
- **`gemini-courses.ts`**: acepta `careerRoute`, inyecta contexto al prompt de Gemini ("el objetivo del usuario es conseguir trabajo remoto…"). Fallback Haiku también usa la ruta.
- **`Dashboard.tsx`**: `loadGeminiCourses` pasa la ruta, el panel de cursos muestra la etiqueta de objetivo actual.

### ✅ GrowthLine animada (`src/components/cv/visuals.tsx`)

La línea orgánica de marca tiene tres capas de animación SVG puro (sin dependencia JS):

1. **Breathing**: `<animate attributeName="opacity" values="0.45;0.9;0.45" dur="4s" repeatCount="indefinite" />` sobre el path base.
2. **Traveling glow**: path con `stroke-dasharray="150 960"` + `stroke-dashoffset` de 1110 a -150 en 3.5s + `feGaussianBlur` filter.
3. **Pulsing dot** (solo `variant="score"`): `<circle>` con animate en `r` y `opacity`.
4. **CompatibilityTrace**: `clipPath` con `<rect>` cuyo `width` anima de 0 al valor real al montar (fill-and-freeze).
5. `useId()` en cada instancia → IDs únicos → sin colisiones cuando hay múltiples líneas en pantalla.

### ✅ Backend helpers

- `netlify/functions/_supabase.ts`: helper centralizado con `ws` como WebSocket transport (requirido en Node.js 20 para evitar warning del SDK de Supabase).
- `netlify.toml`: timeouts por función (`analyze-cv-candidate`: 30s, `analyze-recruiters-batch`: 26s), `node_bundler = "esbuild"`, `NODE_VERSION = "20"`.
- `.npmrc`: `minimum-release-age=0` para evitar bloqueos del supply-chain policy de pnpm con paquetes AWS recién publicados.

### ✅ Admin y tokens

- Panel admin en `/admin` con auth por `ADMIN_PASSWORD`.
- Generación de tokens: formato `REC-XXXXXX-2026`, guardados en tabla `recruiter_tokens`.
- Validación de token + historial + toggle estrella en `validate-recruiter-token.ts`.

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
| `glass-card` | = glass-panel + padding 1.5rem (legacy) |

**Nota sobre `glass-card`**: tiene `padding: 1.5rem` hardcoded en el `@utility`. Si se le agrega `p-7` o `p-8`, hay conflicto. Usar `glass-panel` + padding manual en los casos B2B nuevos. Solo usar `glass-card` donde el padding de 1.5rem está bien.

### Tipografía

- **Playfair Display** (`font-display`) para títulos, scores, y el logo.
- **Inter** para body text.
- Logo: `<span class="font-black">CV</span><span class="italic font-normal">itae</span>` — siempre en `text-gold`.

### Regla inviolable

> NUNCA mezclar dos colores dentro de la misma frase. El énfasis va con peso, itálica, tamaño, o la GrowthLine — jamás con color mixto en texto.

---

## Estructura de archivos clave

```
src/
  pages/
    LandingPage.tsx      # Marketing público principal
    Recruiters.tsx       # Login B2B + panel autenticado (/empresas)
    BatchAnalysis.tsx    # Análisis masivo (/empresas/masivo)
    VacantePage.tsx      # Postulación pública (/vacante/:slug) ← nueva
    Opportunities.tsx    # Catálogo de oportunidades
    Blog.tsx / BlogPost.tsx
    About.tsx, Privacy.tsx, Terms.tsx, Cookies.tsx
  hub/
    Dashboard.tsx        # Hub B2C principal (/mi-carrera)
    ProfileBuilder.tsx   # Wizard de perfil
    CVVivo.tsx           # Generador de CV adaptado
    Alertas.tsx, Configuracion.tsx, JobMatcher.tsx
  components/
    cv/
      visuals.tsx        # GrowthLine, CompatibilityTrace, ScoreRing, Logo, Eyebrow
      SiteShell.tsx      # Navbar + Footer para páginas públicas
    cvitae/
      UI-Elements.tsx    # GlassCard, GoldButton, Badge, MatchArc (legacy, algunos componentes)
      DashboardLayout.tsx # Sidebar + layout para /mi-carrera/*
      Navbar.tsx, Footer.tsx (pendiente de mejorar)
  lib/
    supabase.ts          # Cliente Supabase + helpers auth
    analytics.ts         # Wrapper GA4
    utils.ts             # cn(), etc.
  App.tsx                # Rutas Wouter (flat list)
  index.css              # @theme, @utility, tokens

netlify/functions/
  _supabase.ts           # Helper makeSupabaseAdmin() / makeSupabaseAnon()
  analyze-cv-candidate.ts
  analyze-recruiters-batch.ts
  compare-candidates.ts
  generate-cv-vivo.ts
  extract-pdf-text.ts
  generate-token.ts
  validate-recruiter-token.ts
  submit-lead.ts
  subscribe-newsletter.ts
  admin.ts / admin-auth.ts
  gemini-courses.ts
```

---

## Cómo levantar el entorno local (Windows)

**NO usar `netlify dev` solo** — en Windows causa `EBUSY` por el watcher de archivos.

**Abrir DOS terminales separadas:**

```bash
# Terminal 1 — Frontend (Vite)
cd C:\proyectos\cvitae-unified
pnpm dev
# → http://localhost:3000

# Terminal 2 — Funciones serverless
cd C:\proyectos\cvitae-unified
netlify functions:serve
# → http://localhost:9999/.netlify/functions/*
```

- Admin: `http://localhost:3000/admin`
- Panel B2B: `http://localhost:3000/empresas`
- Batch: `http://localhost:3000/empresas/masivo`

---

## Variables de entorno

### Frontend (`.env` local, Netlify UI)

```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_EMAILJS_SERVICE_ID=        # (no crítico, legacy)
VITE_EMAILJS_TEMPLATE_ID=
VITE_EMAILJS_PUBLIC_KEY=
```

### Backend (`.env` local, Netlify UI — Environment variables)

```
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=      # RLS bypass — solo en funciones server-side
SUPABASE_KEY=                   # (alias de ANON_KEY para algunas funciones)
CVITAE_AWS_ACCESS_KEY_ID=       # IAM user: cvitae-dev
CVITAE_AWS_SECRET_ACCESS_KEY=
CVITAE_AWS_REGION=us-east-1
ADMIN_PASSWORD=                 # Para /admin
RESEND_API_KEY=                 # Emails de leads B2B (opcional)
ANTHROPIC_API_KEY=              # Ya no se usa — reemplazado por Bedrock
GEMINI_API_KEY=                 # Para gemini-courses.ts (cursos recomendados)
```

---

## Respuestas a preguntas específicas

### 1. ¿Cómo funciona `/vacante/:slug`? ¿Está conectada al backend?

**Estado actual**: parcialmente conectada, pero con un bug crítico.

La página `VacantePage.tsx` llama a `/.netlify/functions/submit-lead` con:
```json
{
  "name": "...",
  "email": "...",
  "source": "vacante:nombre-vacante",
  "cv_base64": "...",
  "cv_file_name": "archivo.pdf"
}
```

**El bug**: `submit-lead.ts` solo acepta `{ name, email, company }` y valida `if (!email || !company)`. Como `VacantePage` envía `company_name: ""` (cadena vacía), la validación falla con 400. El candidato nunca queda registrado.

**Qué falta para el círculo virtuoso completo:**

1. Crear `netlify/functions/submit-candidate.ts` que:
   - Acepte `{ name, email, vacancy_slug, cv_base64, cv_file_name }`
   - Extraiga texto del CV (llamando a `extract-pdf-text` internamente o inline)
   - Haga upsert en `user_master_profiles` (o en `recruiter_leads` con `source = "vacante"`)
   - Opcionalmente dispare análisis rápido con Bedrock
2. Alternativamente: modificar `submit-lead.ts` para que `company` sea opcional cuando hay `vacancy_slug`.
3. Conectar el slug a la tabla `opportunities` de Supabase para mostrar título, empresa y descripción reales (actualmente se deriva del string del slug).

### 2. ¿Qué mejoraría del footer?

El footer en `SiteShell.tsx` ya tiene buena estructura (Logo, descripción, 3 columnas, socials, barra inferior con ping "Vivo y activo"). Lo que falta:

- **Columna "Para empresas"**: agregar una 4ª columna con links a `/empresas`, `/empresas/masivo`, y la sección de pricing B2B. Actualmente el footer no menciona la propuesta de valor B2B.
- **Items placeholder**: "Prensa" y "Carreras" apuntan a `#` — eliminarlos o reemplazar por links reales.
- **Link a CVitae Pro**: faltan links a pricing/upgrade en la columna Producto.
- **GrowthLine decorativa**: agregar la línea orgánica como `absolute` en el top del footer, con opacidad baja, para consistencia de marca.
- **Fondo inconsistente**: el footer usa `bg-[oklch(0.13_0.010_60)]` mientras los paneles B2B nuevos usan `bg-[#0a0a0a]`. Son visualmente similares pero no idénticos — unificar a `bg-[#0a0a0a]` o al token `--background`.
- **Texto "Newsletter"**: agregar campo de email para `subscribe-newsletter` (la función ya existe).

### 3. ¿Hay colores o estilos que aún no se vean bien?

**Sí, hay 3 inconsistencias concretas:**

1. **`glass-card` tiene padding hardcodeado** (`padding: 1.5rem` en el `@utility`). En los nuevos componentes B2B usamos `<div class="glass-card rounded-3xl p-7">` — Tailwind v4 sobrescribe el padding del `@utility` con la clase utilitaria, así que en la práctica funciona, pero es confuso. Solución: en código nuevo, usar `glass-panel` + padding manual.

2. **Navbar de SiteShell** sigue usando las clases CSS-variable antiguas (`bg-gold text-ink hover:bg-gold-soft`) en el botón "Entrar". Funciona porque los tokens están mapeados, pero si algún token cambia, rompe. Las páginas B2B nuevas usan `bg-[#c9a84c]` directo. No hay urgencia pero es técnica deuda de consistencia.

3. **`--background` vs `#0a0a0a`**: el CSS token `--background` resuelve a `oklch(0.16 0.012 60)` (levemente más cálido y luminoso que `#0a0a0a` puro). Las páginas B2B usan `bg-[#0a0a0a]` en el `<div>` raíz, ignorando el token. El resultado visual es casi imperceptible, pero si alguien abre el DevTools ve dos valores distintos. Para resolverlo: cambiar `--background` de `oklch(0.16 0.012 60)` a `oklch(0.10 0.008 60)` (≈ #0a0a0a) en `index.css`.

---

---

## Lambda deployment

### Compatibilidad Netlify → Lambda

Las funciones en `netlify/functions/*.ts` usan la interface `Handler` de `@netlify/functions`, que recibe `{ httpMethod, body, headers, queryStringParameters, path }`. El shape de `event` es idéntico al del APIGateway Payload Format 1.0 de Lambda, lo que hace la migración casi transparente.

El script `scripts/deploy-lambda.sh` agrega automáticamente un adaptador al bundle que convierte el evento Lambda a la forma Netlify esperada:

```js
// Adapter injected at build time
exports.handler = async (event, context) => {
  const netlifyEvent = {
    httpMethod: event.httpMethod || event.requestContext?.http?.method,
    body: event.body,
    headers: event.headers,
    ...
  }
  return await netlifyHandler(netlifyEvent, context)
}
```

### Funciones prioritarias para Lambda (timeout risk)

| Función | Timeout Netlify | Riesgo | Acción |
|---|---|---|---|
| `analyze-recruiters-batch` | 26s | Alto (loop secuencial 30 CVs) | Lambda 5 min + parallelizar con `Promise.all` |
| `generate-cv-vivo` | 30s | Medio (stream Bedrock) | Lambda 3 min |
| `analyze-cv-candidate` | 30s | Bajo | Lambda 1 min |
| `compare-candidates` | 30s | Bajo | Lambda 1 min |

### Pasos para desplegar a Lambda

1. Crear las funciones Lambda en AWS console con nombre `cvitae-<nombre-función>` (Node.js 20.x, arquitectura x86_64).
2. Asignar rol IAM con permisos: `bedrock:InvokeModel`, `bedrock:InvokeModelWithResponseStream`.
3. Configurar variables de entorno en cada función (ver sección Variables de entorno arriba).
4. Configurar API Gateway HTTP API apuntando a cada Lambda.
5. Ejecutar el script de despliegue:

```bash
# Desplegar todas las funciones
chmod +x scripts/deploy-lambda.sh
./scripts/deploy-lambda.sh

# Desplegar solo una función
./scripts/deploy-lambda.sh analyze-cv-candidate
```

6. Actualizar las URLs en el frontend: buscar `/.netlify/functions/` y reemplazar por la URL del API Gateway.

### Paralelizar `analyze-recruiters-batch`

El `for/await` actual procesa CVs de forma secuencial. Para Lambda, cambiar a:
```ts
const results = await Promise.all(cvList.map(cv => analyzeSingleCV(cv)))
```
Esto reduce el tiempo total de ~90s (30 CVs × 3s) a ~3s (todos en paralelo), eliminando el riesgo de timeout.

---

## Sistema de Scrapers (rama feature/aws-migration)

### Scrapers activos (carpeta `scrapers/`)

#### Paraguay — bolsas de empleo
| Archivo | Fuente | Estado |
|---|---|---|
| `scrapper.py` | Clasipar, MTESS, Tigo, Personal, Itaú, Copaco | ✅ listo |
| `abc_scrapper.py` | ABC Color empleos (Playwright) | ✅ listo |
| `fundacion_scraper.py` | Fundación Paraguaya (Playwright) | ✅ listo |
| `buscojobs_scraper.py` | BuscoJobs Paraguay — 16 categorías | ✅ listo |
| `computrabajo_scraper.py` | Computrabajo Paraguay — 13 categorías × 3 páginas | ✅ listo (~650/run) |

#### Paraguay — sector público (agregados 2026-06-22)
| Archivo | Fuente | Estado |
|---|---|---|
| `sicca_scraper.py` | SICCA / SFP — concursos del sector público | ✅ listo |
| `ministerios_scraper.py` | 15 ministerios (MEC, MSP, MOPC, Hacienda, MAG…) | ✅ listo |

#### Paraguay — sector financiero (agregados 2026-06-22)
| Archivo | Fuente | Estado |
|---|---|---|
| `bancos_scraper.py` | BNF, Continental, Sudameris, GNB, Vision, Atlas, BASA, Regional… | ✅ listo |
| `cooperativas_scraper.py` | Universitaria, Medalla Milagrosa, San Cristóbal, Capiibary… | ✅ listo |
| `seguros_scraper.py` | Aseguradora del Este, Sancor, IPS, MAPFRE, Allianz… | ✅ listo |

#### Paraguay — servicios (agregados 2026-06-22)
| Archivo | Fuente | Estado |
|---|---|---|
| `callcenters_scraper.py` | Atento, Teleperformance, Konecta, Visionary, Skytel… | ✅ listo |
| `universidades_scraper.py` | UNA, UCN, UAP, UCOM, UCSA, FPUNE, Uninorte… | ✅ listo |
| `constructoras_scraper.py` | Itaipú, Yacyretá, MOPC, CPI, Parcon, Tecnoedil… | ✅ listo |
| `hospitales_scraper.py` | Bautista, Italiano, Francés, INERAM, HPF, Sanatorio Italiano… | ✅ listo |
| `supermercados_scraper.py` | Stock, SuperSeis, Biggie, Paris, DIA, Shopping del Sol… | ✅ listo |

#### Paraguay — grupos empresariales (agregados 2026-06-22)
| Archivo | Fuente | Estado |
|---|---|---|
| `grupovierci_scraper.py` | La Nación, GEN TV, MegaSuper, Nación Media | ✅ listo |
| `grupocarteshs_scraper.py` | Tabacalera, Frigomerc, RPC, Canal 9, BEPSA | ✅ listo |

#### Paraguay — tech, ONGs y foros (agregados 2026-06-22)
| Archivo | Fuente | Estado |
|---|---|---|
| `tech_local_scraper.py` | SODEP, LSD, Roshka, Codedge, Nubisis, Avantica… | ✅ listo |
| `ongs_scraper.py` | PNUD, UNICEF, BID, Cruz Roja, CARE, Plan, GIZ, OEA… | ✅ listo |
| `foros_scraper.py` | Reddit r/Paraguay, r/trabajoparaguay, foros locales | ✅ listo |

#### Internacional — becas y organismos
| Archivo | Fuente | Estado |
|---|---|---|
| `oya_scraper.py` | OYA Opportunities | ✅ vivo |
| `opportunitydesk_scraper.py` | OpportunityDesk — becas, grants, cursos | ✅ listo (~300/run) |
| `becal_scraper.py` | BECAL Paraguay | ✅ listo |
| `fundacion_carolina_scraper.py` | Fundación Carolina España | ✅ listo |
| `unjobs_scraper.py` | UNJobs — ONU, UNDP, UNICEF, BID | ✅ listo |

#### Internacional — remotos
| Archivo | Fuente | Estado |
|---|---|---|
| `remotive_scraper.py` | Remotive API — 11 categorías | ✅ listo |
| `arbeitnow_scraper.py` | Arbeitnow API — hasta 1000/run | ✅ listo |
| `himalayas_scraper.py` | Himalayas API — hasta 2000/run | ✅ listo |
| `jobicy_scraper.py` | Jobicy API — 12 industrias × 50 | ✅ listo |
| `weworkremotely_scraper.py` | WeWorkRemotely RSS — 14 feeds | ✅ listo |

#### Agregadores globales con foco LatAm (agregados 2026-06-25)
| Archivo | Fuente | Estado |
|---|---|---|
| `jooble_scraper.py` | Jooble API — 11 búsquedas Paraguay (requiere JOOBLE_API_KEY) | ✅ listo (pendiente secret) |
| `talentcom_scraper.py` | Talent.com — 14 búsquedas HTML Paraguay, sin key | ✅ listo |

### GitHub Actions cron

- **`.github/workflows/scrapers.yml`** — cron diario 10:00 UTC (06:00 PY). Incluye los **30 scrapers** totales con `continue-on-error: true`.
- **`.github/workflows/linkedin_poster.yml`** — cada hora 12:00-02:00 UTC (08:00-22:00 PY).
- Los scrapers de Paraguay se agregaron en commit `8d1c4b23` (2026-06-22).
- Jooble + Talent.com agregados en commit `5ad7e3fa` (2026-06-25). Total: 32 scrapers.

### Schema de `opportunities` (tabla Supabase)

```
id, titulo, organization, location, rubro, type, description,
application_url (UNIQUE — crítico para upserts),
source, is_active, tags[], recruiter_vacancy_id, created_at
```

**Migración ya aplicada en Supabase** (ejecutada en SQL Editor el 2026-06-20):
- Columnas `description`, `source`, `is_active`, `location`, `tags` agregadas
- UNIQUE constraint en `application_url` creada
- Tabla `linkedin_posts` creada (sin FK — `opportunity_id text` sin REFERENCES para evitar incompatibilidad de tipos: `id` en opportunities es `text` no `uuid`)

### Estado real de la BD (al 2026-06-19)

Antes de correr scrapers de Paraguay: ~1,385 oportunidades (solo remotos internacionales).
Los scrapers de Paraguay (computrabajo, buscojobs, etc.) devolvían HTTP 400 porque faltaba la UNIQUE constraint. **Ahora que la migración fue aplicada, el próximo cron va a poblar correctamente.**

### LinkedIn Bot

- **`scrapers/linkedin_poster.py`** — bot Python para GitHub Actions (alternativa de backup)
- **`scrapers/n8n-linkedin-workflow.json`** — workflow n8n listo para importar (opción principal)
- **`scrapers/get_linkedin_token.py`** — script one-shot para obtener OAuth token vía browser

**Estado LinkedIn API:**
- LinkedIn Developer App "CVitae-Bot" (Client ID: `77jb4u04hs2916`) — para perfil personal
- LinkedIn Developer App nueva (Client ID: `77az9mk9lw0ygi`) — para página empresa
- Scope `w_organization_social` requiere producto **"Community Management API"** pero LinkedIn no lo permite si hay otros productos en la app (error: "must be the only product")
- **Solución elegida**: usar **n8n self-hosted con Docker** — n8n tiene integración LinkedIn aprobada, evita toda la burocracia de la API
- **PENDIENTE**: levantar Docker Desktop (se congeló la PC) y correr: `docker run -d --name n8n -p 5678:5678 -v n8n_data:/home/node/.n8n n8nio/n8n`
- Página empresa CVitae.lat: `urn:li:organization:112507011`

### Resend / Emails

- DNS records en estado **pendiente de verificación** (sin cambios al 2026-06-22):
  - DKIM (`resend._domainkey`) — presente pero no verificado aún
  - MX record (`send.cvitae.lat`) — **FALTA AGREGAR** en el panel DNS del dominio
  - SPF (`send.cvitae.lat`) — **FALTA AGREGAR** en el panel DNS del dominio
- Hasta que se verifiquen, los emails de leads B2B no se envían
- **Qué agregar exactamente** (obtener los valores exactos en resend.com → Domains → cvitae.lat):
  - `TXT` en `send.cvitae.lat` → `"v=spf1 include:spf.resend.com ~all"`
  - `MX` en `send.cvitae.lat` → `feedback-smtp.us-east-1.amazonses.com` (priority 10)
  - Verificar en panel Resend tras agregar (puede tardar hasta 24h en propagar)

---

## Completado (commits pusheados en feature/aws-migration)

### Sesión 2026-06-22
- [x] Ruta de carrera en ProfileBuilder (commit `eee048f4`)
- [x] Cursos contextuales por ruta (`gemini-courses.ts` + `Dashboard.tsx`)
- [x] 15 scrapers nuevos + `scrapers.yml` con 30 scrapers totales (commit `8d1c4b23`)
- [x] `submit-lead.ts` flujo vacante separado funcionando

### Sesión 2026-06-25 — SQL ejecutado en Supabase (sin commit)
- [x] pgvector habilitado, columna `embedding vector(384)` en `opportunities` y `user_master_profiles`
- [x] Función RPC `match_opportunities` en Supabase
- [x] Embeddings generados para todas las oportunidades activas
- [x] DNS Resend verificado — dominio cvitae.lat activo
- [x] CLAUDE.md reescrito + 3 agentes creados (frontend/backend/supabase)
- [x] SQL: `recruiter_action` + `recruiter_notes` en `vacancy_applications`
- [x] SQL: índices email en `vacancy_applications` y `user_master_profiles`
- [x] SQL: columna `company_name` en `recruiter_tokens` verificada

### Sesión 2026-06-25 — Commits Batches A-F (commit `7f125326` + `42d88b2f`)
- [x] **A** — email clickeable, company_name prefill, fecha locale es-PY, conteo postulantes
- [x] **B** — fix company_name desde DB, email al reclutador vía Resend en submit-lead.ts
- [x] **C** — endpoint `update_application_status` + UI de estado por candidato (5 botones pill)
- [x] **D** — modo `head_to_head` en compare-candidates.ts con security ownership check
- [x] **E** — badges B2C en get_applicants + chips en card del candidato
- [x] **F** — rediseño visual dossier: border-left accent, score tipográfico, tabla hairline vacantes, ambient solo en TokenLogin
- [x] Sidebar text invisible fix (`text-muted` → `text-white/60`) en Footer.tsx
- [x] Batch analysis paralelo (`Promise.all` en BatchAnalysis.tsx)
- [x] Link `/demo` en navbar (SiteShell.tsx)

### Sesión 2026-06-25 — Scrapers nuevos (commit `5ad7e3fa`)
- [x] `scrapers/jooble_scraper.py` — API REST aggregator Paraguay (requiere secret JOOBLE_API_KEY en GitHub)
- [x] `scrapers/talentcom_scraper.py` — HTML scraper Paraguay, 14 búsquedas, sin API key
- [x] workflow `scrapers.yml` actualizado: 32 scrapers totales, JOOBLE_API_KEY env

---

## Pendientes — próximo commit

### Alta prioridad
- [ ] **Footer mejorado**: columna "Para empresas" (links a /empresas, /empresas/masivo), quitar links `#` placeholder (Prensa, Carreras), campo newsletter (`subscribe-newsletter` ya existe), GrowthLine decorativa en top
- [ ] **Página /demo**: hay link en navbar pero no existe la ruta — crear o conectar
- [ ] **Googlejobs**: `scrapers/googlejobs_v2.py` y `googlejobs_v3.py` ya existen, agregarlos al `scrapers.yml`
- [ ] **Jooble API key**: registrar en jooble.org/api/about (gratuito) → agregar secret `JOOBLE_API_KEY` en GitHub Actions → Settings → Secrets

### Media prioridad
- [ ] **Analytics GA4**: confirmar que `cvAnalyzed`, `b2bLeadSent`, `batchStarted` llegan → GA4 panel → Tiempo real → Eventos
- [ ] **Blog text**: en Supabase `content_hub` cambiar "nuestras bases de datos" → "las empresas con más presencia en el país"
- [ ] **LinkedIn n8n OAuth**: Docker con n8n en `localhost:5678`. Client ID `77az9mk9lw0ygi`, org `urn:li:organization:112507011`

### Baja prioridad (post-beta)
- [ ] **S3 migration**: reemplazar base64 por presigned URLs en BatchAnalysis.tsx y ProfileBuilder.tsx (límite efectivo actual ~4MB)
- [ ] **Lambda migration**: `analyze-recruiters-batch` y `generate-cv-vivo` para superar timeouts Netlify
- [ ] **Merge a `main`**: Netlify ya apunta a `feature/aws-migration` — no urgente
- [ ] **Eliminar `ANTHROPIC_API_KEY`** de Netlify env vars — ya no se usa

### Beta cerrada (sin código nuevo requerido)
- Supabase → Auth → Settings → desactivar "Enable email signup" para B2C controlado
- B2B ya es cerrado por diseño: tokens `REC-XXXXX-2026` se crean manualmente
- Opcional (1 commit): tabla `beta_waitlist(email, name, created_at)` + formulario en landing

---

## Dirección de diseño B2B (para Commit Batch F)

El panel B2B actual tiene el problema de sentirse "dark SaaS template": glass-cards homogéneos, ambient blobs decorativos repetidos, uppercase tracking en todo, números 01/02 en secciones que no son secuencias. Pulido, pero intercambiable con cualquier otro producto AI.

### El problema de fondo

El reclutador usa el panel como herramienta de decisión de contratación — una decisión con consecuencias reales. La interfaz debería sentirse como un **dossier de candidatos**, no como un dashboard de startup. La diferencia: un dossier es denso, informativo, sin decoración gratuita. Un dashboard de startup tiene gradientes, blobs y cartas flotantes.

### Tokens nuevos (solo B2B)

Estos se suman al sistema base (gold, cream, ink). No reemplazan nada existente.

```
--slate:      oklch(0.28 0.04 230)   /* ≈ #1e2d3d — fondo de estado analizado */
--slate-edge: oklch(0.38 0.06 230)   /* ≈ #2a3a4a — borde izquierdo accent */
--ink-mid:    oklch(0.18 0.010 60)   /* ≈ #111110 — superficie de tabla */
```

### Candidate card → formato dossier

```
ANTES (glass-card simétrico):
┌─────────────────────────────────────────┐
│ [01]  Nombre         [badge] [score]    │
│       email · fecha                     │
│       resumen IA...                     │
└─────────────────────────────────────────┘

DESPUÉS (dossier asimétrico):
│ ▌ Nombre                    87          │
│   email · fecha aplicó       FIT        │
│   "resumen IA en cursiva"               │
│   [Llamar] [matches] [gaps]             │
```

El `▌` es un `border-left: 3px solid` en color según estado:
- gold `#c9a84c` → pendiente de revisar
- `--slate-edge` → analizado
- `oklch(0.75 0.18 145)` verde → Llamar
- `oklch(0.65 0.22 25)` rojo → No llamar

El score **no** va en un cuadro con label. Va tipográfico: número grande (`font-display text-5xl`) con `/100` chico al lado, sin borde, sin background.

### Vacancy list → tabla operativa

```
ANTES (cards con shadow):
┌──────────────────────────────────────────┐
│ Desarrollador Frontend React             │
│ Asunción · Presencial · 12/06/2026       │
│ link...                    [Postulantes] │
└──────────────────────────────────────────┘

DESPUÉS (tabla con bordes hairline):
──────────────────────────────────────────────
 Título                  Lugar     CVs   Acción
──────────────────────────────────────────────
 Desarrollador Frontend  Asunción   4     Ver →
 Analista Contable       Remoto     0     Ver →
──────────────────────────────────────────────
```

Tabla con `border-collapse`, `border-color: rgba(255,255,255,0.08)`, sin rounded corners, sin hover shadow — hover solo cambia el background de la fila.

### Lo que se elimina

- Ambient blobs (`<div className="absolute ... blur-[160px]">`) — sacar de `RecruiterPanel`, dejar solo en `TokenLogin` donde cumple función de orientar al visitante nuevo
- Grid decorativo (líneas de fondo) — solo en `TokenLogin`
- `text-[11px] uppercase tracking-[0.2em]` como label de TODAS las secciones — reservar solo para labels de datos (score, fecha, estado), no para encabezados de panel

### El riesgo de diseño (la apuesta)

El panel de postulantes después del análisis muestra un **resumen ejecutivo de la IA**. En el diseño actual es un card más, con blobs y glass. La apuesta: convertirlo en el elemento más austero de la pantalla — fondo completamente negro `#0a0a0a`, sin bordes, sin glass, solo tipografía grande Playfair Display en `text-white/85`, con la recomendación principal en una sola línea grande al centro. Todo lo demás (callList, redFlag) en texto pequeño debajo. La austeridad le da más peso que cualquier card decorado.

---

## Decisiones clave (no re-discutir)

| Decisión | Razón |
|---|---|
| Bedrock en vez de Anthropic API directo | Crédito AWS de $5,000 disponible; elimina costo por llamada |
| `CVITAE_AWS_*` en lugar de `AWS_*` | Netlify reserva los nombres estándar — causaban 401 |
| Credenciales explícitas en `BedrockRuntimeClient` | El SDK auto-discovery no funciona en Netlify con nombres custom |
| Supabase permanece igual | No hay razón para migrar la BD — solo las funciones de compute |
| `ws` en `_supabase.ts` | Node.js 20 no tiene WebSocket nativo — sin esto, warnings en cada función |
| DOS terminales locales | `netlify dev` causa EBUSY en Windows por el watcher de archivos |
| Un solo color por frase | Regla de diseño de Lovable — el énfasis va con tipografía, no color |
| `useId()` en visuals.tsx | Múltiples instancias de GrowthLine necesitan IDs SVG únicos |

---

## Links importantes

- **Repo principal**: `https://github.com/Isasola/cvitae-unified` (rama: `feature/aws-migration`)
- **Repo de referencia UI** (privado): `Isasola/cvitae-talent-pipeline` — TanStack Start + bun, solo extraer UI/diseño
- **Sitio en producción**: `https://cvitae.lat` (aún en `main` sin los cambios del rediseño)
- **Deploy preview**: generado automáticamente por Netlify desde `feature/aws-migration`
- **Supabase**: tablas clave: `user_master_profiles`, `opportunities`, `recruiter_tokens`, `recruiter_analyses`, `recruiter_leads`, `newsletter_subscribers`
- **IAM user AWS**: `cvitae-dev` (us-east-1, acceso solo a Bedrock)
