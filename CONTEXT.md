# Contexto completo del proyecto CVitae

> Última actualización: 2026-06-19 · Rama activa: `feature/aws-migration`

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

- GA4 (`G-BZ16ZLP8ZZ`) en `index.html`.
- `react-helmet-async` con `<HelmetProvider>` en `main.tsx`.
- Meta tags únicos (title, description, og:*, canonical) en todas las páginas públicas.
- `<meta name="robots" content="noindex" />` en todas las páginas del hub `/mi-carrera/*`.
- `src/lib/analytics.ts`: eventos `cvAnalyzed`, `b2bLeadSent`, `batchStarted` wired.

### ✅ Fase 5 — Rediseño frontend (completo)

Páginas rediseñadas con el sistema visual unificado:
- `src/pages/LandingPage.tsx`
- `src/pages/Recruiters.tsx` (login B2B + panel autenticado)
- `src/pages/BatchAnalysis.tsx`
- `src/pages/VacantePage.tsx` ← nueva
- `src/hub/Dashboard.tsx`
- `src/hub/ProfileBuilder.tsx`
- `src/hub/CVVivo.tsx`

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

## Pendientes concretos (próxima sesión)

### Alta prioridad

- [ ] **Conectar `/vacante/:slug` al backend**: crear `submit-candidate.ts` o modificar `submit-lead.ts`. Ver sección "Respuestas → pregunta 1" arriba.
- [ ] **Unificar background token**: `--background: oklch(0.10 0.008 60)` en `index.css` para que coincida con `#0a0a0a`.

### Media prioridad

- [ ] **Mejorar footer**: agregar columna "Para empresas", quitar links placeholder, agregar GrowthLine.
- [ ] **Resolver rutas B2B**: `App.tsx` ya tiene `/empresas` y `/empresas/masivo`. Confirmar que los redirects legacy (`/reclutadores`, `/reclutadores/batch`) siguen activos — ya están en `App.tsx` con `<Redirect>`.
- [ ] **Batch paralelo**: cambiar `for/await` en `BatchAnalysis.tsx` por `Promise.all` para procesar los CVs en paralelo y reducir tiempo total.

### Baja prioridad (post-pruebas)

- [ ] **Fase 2 (S3)**: reemplazar base64 en BatchAnalysis y ProfileBuilder por presigned URL upload.
- [ ] **Fase 3 (Lambda)**: mover funciones pesadas a Lambda para superar el límite de 26s de Netlify.
- [ ] **Merge a `main`**: cuando las pruebas en Netlify preview sean satisfactorias.
- [ ] **Eliminar `ANTHROPIC_API_KEY` de Netlify**: ya no se usa desde la migración a Bedrock.

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
