# Contexto completo del proyecto CVitae

> Última actualización: 2026-06-22 · Rama activa: `feature/aws-migration`

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

### GitHub Actions cron

- **`.github/workflows/scrapers.yml`** — cron diario 10:00 UTC (06:00 PY). Incluye los **30 scrapers** totales con `continue-on-error: true`.
- **`.github/workflows/linkedin_poster.yml`** — cada hora 12:00-02:00 UTC (08:00-22:00 PY).
- Los scrapers nuevos se agregaron en commit `8d1c4b23` (2026-06-22) y ya fueron pusheados.

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

## Pendientes concretos (próxima sesión)

### COMMIT BATCH A — Fixes quirúrgicos frontend B2B (`src/pages/Recruiters.tsx`)

- [ ] **A1. Email clickeable en ApplicantsPanel** — línea ~707: envolver email en `<a href="mailto:...">` con hover gold
- [ ] **A2. company_name prefill en VacancyPanel** — pasar `companyName` como prop desde `RecruiterPanel`, usarlo como valor inicial del form
- [ ] **A3. Date locale en HistoryPanel** — cambiar `toLocaleDateString()` → `toLocaleDateString('es-PY')` (1 carácter)
- [ ] **A4. Conteo de postulantes en lista de vacantes** — backend: `validate-recruiter-token.ts` línea ~134, agregar `vacancy_applications(count)` al select; frontend: mostrar badge en cada vacante

### COMMIT BATCH B — Bug y email backend

- [ ] **B1. Fix bug company_name** — `validate-recruiter-token.ts` línea 22: agregar `company_name` al select; línea 152: devolver `data.company_name || "Sin nombre"` en lugar del hardcodeado `"Empresa"`
- [ ] **B2. Email al reclutador cuando llega postulación** — `submit-lead.ts` después del insert de `vacancy_applications`: buscar email del token por `recruiter_token_id` y enviar notificación Resend. Cambiar línea ~140 a `.select("id, title, recruiter_token_id")`

### COMMIT BATCH C — Estado de postulación (SQL ya ejecutado en Supabase 2026-06-25)

> SQL ✅ ejecutado: `recruiter_action text DEFAULT 'pending'` + `recruiter_notes text` + índice en `vacancy_applications`

- [ ] **C1. Endpoint `update_application_status`** — `validate-recruiter-token.ts`: nueva acción que actualiza `recruiter_action` + `recruiter_notes`, verifica que la app pertenezca al token vía join con `recruiter_vacancies`
- [ ] **C2. UI de estado por candidato** — `ApplicantsPanel` en `Recruiters.tsx`: dropdown/botones en el card expandido, dot coloreado + label (verde=hired, rojo=rejected, amber=interviewing)

### COMMIT BATCH D — Comparación head-to-head (`compare-candidates.ts`)

- [ ] **D1. Modo `head_to_head`** — nuevo modo que recibe `application_ids: [id1, id2]` + `vacancy_id`, compara los dos candidatos contra los requisitos de la vacante y devuelve `{ winner, verdict, a: { advantage, weakness }, b: { ... }, hire_recommendation }`

### COMMIT BATCH E — Badges B2C visibles al reclutador

> SQL ✅ índices email ejecutados en `user_master_profiles` y `vacancy_applications` (2026-06-25)

- [ ] **E1. Enriquecer `get_applicants`** — `validate-recruiter-token.ts`: después de traer aplicantes, hacer lookup en `user_master_profiles` por email y adjuntar `badges` al payload
- [ ] **E2. Mostrar badges en ApplicantsPanel** — chips en el card expandido del candidato

### COMMIT BATCH F — Rediseño visual B2B (anti-IA genérico)

Ver sección "Dirección de diseño B2B" más abajo para el sistema completo.

- [ ] **F1. Candidate cards como dossier** — layout asimétrico, score como elemento tipográfico dominante, left-edge accent en lugar de glass-card homogéneo
- [ ] **F2. Reducir blobs ambient** — menos decoración genérica, más estructura editorial
- [ ] **F3. Tercer tono funcional** — slate azulado `#2a3a4a` para estado "revisado/analizado", distinguible de gold (acción pendiente) y blanco (neutro)
- [ ] **F4. Vacancy list como tabla operativa** — dejar de usar cards para las vacantes, usar una tabla densa con bordes finos estilo herramienta interna

### Alta prioridad preexistente

- [ ] **LinkedIn n8n OAuth**: Docker está corriendo. Client ID `77az9mk9lw0ygi` + Client Secret en `localhost:5678`. Solo empresa `urn:li:organization:112507011`.
- [ ] **Sidebar + footer — texto invisible**: `text-muted` → `text-white/60` en `DashboardLayout.tsx` (~línea 82), `CareerLayout.tsx` (~línea 99), `Footer.tsx`
- [ ] **Analytics — verificar eventos**: confirmar que `cvAnalyzed`, `b2bLeadSent`, `batchStarted` llegan a GA4 → Tiempo real → Eventos

### Media prioridad

- [ ] **Blog — texto "nuestras bases de datos"**: cambiar en Supabase tabla `content_hub` → "las empresas con más presencia en el país"
- [ ] **Mejorar footer**: columna "Para empresas", quitar links `#`, GrowthLine decorativa, campo newsletter
- [ ] **Unificar background token**: `--background: oklch(0.10 0.008 60)` en `index.css`
- [ ] **Batch paralelo**: `for/await` → `Promise.all` en `BatchAnalysis.tsx`
- [ ] **Link a /demo desde navbar**: agregar en `SiteShell.tsx`

### Baja prioridad (post-pruebas)

- [ ] **Fase 2 (S3)**: reemplazar base64 por presigned URL en BatchAnalysis y ProfileBuilder
- [ ] **Fase 3 (Lambda)**: mover funciones pesadas para superar límite 26s de Netlify
- [ ] **Merge a `main`**: cuando pruebas en Netlify preview sean satisfactorias
- [ ] **Eliminar `ANTHROPIC_API_KEY` de Netlify**: ya no se usa desde Bedrock

### Completado en sesión 2026-06-22

- [x] Ruta de carrera en ProfileBuilder (commit `eee048f4`)
- [x] Cursos contextuales por ruta (`gemini-courses.ts` + `Dashboard.tsx`)
- [x] 15 scrapers nuevos + `scrapers.yml` con 30 scrapers totales (commit `8d1c4b23`)
- [x] `submit-lead.ts` flujo vacante separado funcionando

### Completado en sesión 2026-06-25 (sin commit aún)

- [x] pgvector habilitado, columna `embedding vector(384)` en `opportunities` y `user_master_profiles`
- [x] Función RPC `match_opportunities` en Supabase
- [x] Edge functions: `generate-embedding`, `embed-opportunities`, `match-batch`
- [x] Embeddings generados para todas las oportunidades activas
- [x] Matching B2C mejorado: pgvector + keyword hybrid
- [x] DNS Resend verificado — dominio cvitae.lat activo
- [x] CLAUDE.md reescrito + 3 agentes creados (frontend/backend/supabase)
- [x] SQL: `recruiter_action` + `recruiter_notes` en `vacancy_applications`
- [x] SQL: índices email en `vacancy_applications` y `user_master_profiles`
- [x] SQL: columna `company_name` en `recruiter_tokens` verificada

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
