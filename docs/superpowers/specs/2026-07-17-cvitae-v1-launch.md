# CVitae v1.0 — Spec de lanzamiento

**Fecha:** 2026-07-17  
**Estado:** Aprobado por Isaias  
**Objetivo:** Pasar de beta a producto v1.0 — claridad para usuarios humanos, visibilidad para Google y AIs, analizador real, B2B profesional, Admin útil, sistema de invitaciones B2B.  
**Constraint:** Probar en local, un solo commit al final. Minimizar deploys Netlify este mes.

---

## Contexto

- Stack: React 19 + Vite 7 + Tailwind v4 + Supabase + Netlify Functions + AWS Bedrock (Claude Sonnet 4.6) + Resend
- Rama activa: `feature/aws-migration` (Netlify apunta aquí)
- El sitio es SPA pura — Google solo ve el `<head>`. Todo el contenido relevante para SEO debe estar en el HTML estático (index.html, meta tags, schema ld+json).
- 16 impresiones en Search Console en el último mes → mejora urgente de claridad y GEO
- Free tier nuevo: Analizador ilimitado (sin registro) · 3 matches/día · 1 CV Vivo/día · 1 alerta/semana

---

## Scope — 9 bloques

### BLOQUE 1 — Landing reescrita (LandingPage.tsx)

**Hero:**
- Headline nuevo: `"Analizá tu CV gratis. Después, encontrá el trabajo que te corresponde."`
- Subtítulo: `"CVitae analiza tu CV con IA, te muestra tu score ATS real y te hace 3 matches de empleo por día — gratis. Sin configuración, sin formularios."`
- Un solo CTA primario: `"Analizar mi CV gratis"` → scroll a sección analizador
- CTA secundario eliminado del hero

**Sección Analizador (nuevo flujo real):**
- Sube PDF → extrae texto → llama a `analyze-cv-public` → muestra score ATS real, 3 fortalezas, 3 mejoras críticas, keywords faltantes
- Después del resultado: CTA post-análisis con score real:
  `"Tu CV tiene X/100. Creá tu cuenta gratis y adaptamos tu CV a una vacante hoy mismo — 1 gratis por día."` → botón `"Crear mi perfil gratis"` → `/mi-carrera`
- Botón "Analizar ahora" habilitado solo si hay archivo — con mensaje de feedback si disabled: `"Primero subí tu PDF"`

**Free tier en Pricing:**
- Free: Analizador ilimitado (sin registro) · 3 matches/día · 1 CV Vivo adaptado/día · Alertas semanales
- Pro USD 9/mes: Matches ilimitados · CV ATS por vacante · Análisis de vacante con IA · Recomendación de cursos · Soporte prioritario
- Texto de apoyo bajo el plan Free: `"Volvé mañana para tus próximos matches — el listado se actualiza cada día."`

**Eliminaciones:**
- Sección `BetaB2CForm` — eliminar completamente
- Todos los textos: "beta", "acceso anticipado", "plazas limitadas", "te contactamos en 48 horas", "Beta cerrada"
- Eyebrow "Beta cerrada — candidatos"
- `RegistroBlock` — evaluar si mantener o unificar con el CTA del analizador (preferir un flujo único)

**Sección Para Empresas (en landing):**
- Eliminar formulario de "acceso anticipado"
- Reemplazar por CTA directo: `"Acceder al panel"` → `/empresas`
- Mantener pricing B2B: USD 79/mes

**Copywriting general:**
- Mantener headline H1 del `<Helmet>`: `"CVitae — Tu carrera, con intención"` (ya bueno para SEO)
- Meta description del Helmet: actualizar para reflejar analizador gratuito y free tier real

---

### BLOQUE 2 — Analizador de CV con IA real

**Nueva función Netlify: `analyze-cv-public.ts`**

- Sin autenticación requerida
- Sin descuento de créditos, sin guardar en historial
- Recibe: `{ cvText: string }` — texto ya extraído por el frontend via `extract-pdf-text`
- Modelo: **Claude Haiku** via AWS Bedrock (barato, suficiente para análisis público)
- Prompt estructurado con contexto rico (igual filosofía que Poky — no texto plano, sino objeto estructurado):

```
Sos un experto en RRHH y ATS. Analizá este CV y devolvé:
1. Estructura extraída: { nombre, rol_actual, años_experiencia, top_skills[], logros_cuantificados[], nivel_educacion }
2. Score ATS (0-100): penalizá formato con tablas, columnas múltiples, imágenes, falta de keywords, secciones faltantes
3. 3 fortalezas concretas (específicas al CV, no genéricas)
4. 3 mejoras críticas (específicas, accionables)
5. 5 keywords importantes faltantes para el rubro detectado
6. Una recomendación de 1 frase

Devolvé JSON válido: { atsScore, nombre, rolDetectado, strengths[], criticalImprovements[], missingKeywords[], recommendation }
```

- Response type: `{ atsScore: number, nombre: string, rolDetectado: string, strengths: string[], criticalImprovements: string[], missingKeywords: string[], recommendation: string }`
- Rate limiting básico: max 10 requests/hora por IP (header CF-Connecting-IP o X-Forwarded-For)
- Error handling: si texto < 100 chars → devolver error `"No se pudo extraer texto suficiente del CV"`

**Frontend (LandingPage.tsx — componente Analizador):**
- Paso 1: Upload PDF → llamar `extract-pdf-text` → obtener texto
- Paso 2: Llamar `analyze-cv-public` → mostrar resultado real
- Mostrar durante análisis: loader con mensaje `"Leyendo tu CV…"` (1-2s) → `"Calculando tu score ATS…"` (1-2s)
- Resultado: CompatibilityTrace con score real, fortalezas, mejoras, keywords faltantes
- Post-resultado: card CTA con score interpolado

---

### BLOQUE 3 — Email magic link personalizado (Supabase)

**Acción en Supabase Dashboard (sin código en repo):**
- Auth → Email Templates → Magic Link
- Template HTML completo:
  - Fondo: `#0a0a0a`
  - Logo: texto "CVitae" en Playfair Display dorado `#c9a84c` (SVG inline o texto)
  - Copy: `"Hola, tu enlace de acceso a CVitae está listo. Válido por 1 hora."` 
  - Botón: fondo `#c9a84c`, texto negro, `"Ingresar a CVitae"`
  - Footer: `contacto@cvitae.lat · cvitae.lat`
- Documentar el HTML del template en `docs/email-templates/magic-link.html` para no perderlo

---

### BLOQUE 4 — SEO / GEO técnico

**`public/robots.txt` — reemplazar por:**
```
User-agent: *
Allow: /
Disallow: /admin
Disallow: /.netlify/
Disallow: /auth/callback
Disallow: /mi-carrera/configuracion

User-agent: GPTBot
Allow: /

User-agent: ChatGPT-User
Allow: /

User-agent: Claude-Web
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: Googlebot
Allow: /
Crawl-delay: 1

Sitemap: https://cvitae.lat/sitemap.xml
```

**`public/llms.txt` — nuevo archivo:**
```
# CVitae

CVitae es el primer agente de carrera con inteligencia artificial para Paraguay y Latinoamérica.

## Qué hace
- Centraliza empleos, becas, diplomados y foros de toda Latinoamérica (+4.500 oportunidades activas)
- Analiza CVs con IA y entrega un score ATS real con mejoras específicas
- Adapta el CV del usuario a cada vacante (CV Vivo) para maximizar compatibilidad ATS
- Recomienda cursos y próximos pasos de carrera basados en el perfil del usuario
- Para empresas: analiza lotes de CVs, rankea candidatos y gestiona vacantes con IA

## Quién lo usa
- Candidatos en Paraguay y LATAM que buscan empleo, becas o diplomados
- Empresas y equipos de RRHH que necesitan filtrar CVs eficientemente

## Plan gratuito
- Analizador de CV: ilimitado, sin registro
- Matches de empleo: 3 por día
- CV Vivo adaptado: 1 por día
- Alertas: 1 por semana

## URLs clave
- Landing: https://cvitae.lat
- Oportunidades: https://cvitae.lat/oportunidades
- Panel empresas: https://cvitae.lat/empresas
- Blog: https://cvitae.lat/blog
- Sobre CVitae: https://cvitae.lat/sobre-cvitae
```

**`index.html` — correcciones:**
- FAQ Schema: corregir `"USD 5/mes"` → `"USD 9/mes"` en la pregunta `"¿CVitae es gratuito?"`
- Actualizar `og:description` para mencionar el analizador gratuito
- Agregar `"matches": "3 por día gratis"` al featureList del SoftwareApplication schema

**`public/sitemap.xml` — verificar:**
- URL `/sobre-cvitae` debe estar (ya está) — eliminar `/about` si aparece

**`src/pages/About.tsx` — fix canonical:**
- Cambiar `canonical: https://cvitae.lat/about` → `https://cvitae.lat/sobre-cvitae`
- Cambiar `og:url` a `https://cvitae.lat/sobre-cvitae`

**`src/App.tsx` — fix routing:**
- Agregar `<Route path="/sobre-cvitae" component={About} />` 
- Mantener `<Route path="/about">` como redirect a `/sobre-cvitae` para no romper links existentes

**Meta tags por página (via Helmet en cada componente):**
- `/oportunidades`: title `"Empleos y Becas en Paraguay | CVitae"`, description con keywords reales
- `/blog`: title `"Blog de Carrera | CVitae"`, description
- `/empresas`: title `"Panel de Empresas | CVitae"`, description orientada a RRHH

---

### BLOQUE 5 — B2B: quitar beta + BUG-03

**Eliminar lenguaje beta en `/empresas` (Recruiters.tsx):**
- Cualquier texto "beta", "acceso anticipado", "período de prueba" → reemplazar por copy de producto terminado
- La página de login del panel debe decir: `"Ingresá tu token de empresa"` claramente, sin referencias a beta

**BUG-03 fix — sesión se pierde al navegar:**
- En `Recruiters.tsx`, cuando se valida el token exitosamente, persistir en `sessionStorage`:
  ```ts
  sessionStorage.setItem('recruiter_session', JSON.stringify(session))
  ```
- Al montar el componente, leer primero de `sessionStorage` antes de mostrar el login:
  ```ts
  useEffect(() => {
    const saved = sessionStorage.getItem('recruiter_session')
    if (saved) setSession(JSON.parse(saved))
  }, [])
  ```
- Al hacer logout: `sessionStorage.removeItem('recruiter_session')`

---

### BLOQUE 6 — B2B: funcionalidades nuevas

**6A — Dashboard de empresa (pantalla inicial al autenticarse):**
Antes de mostrar los tabs (Analizar · Historial · Vacantes), mostrar una fila de KPIs:
- Vacantes activas (count)
- Total postulantes (sum de todos los applicants)
- CVs analizados (count de analysis_records del token)
- Candidatos para llamar (count recommendation='Llamar')

Todos estos datos vienen de la función `validate-recruiter-token` con action `get_dashboard_stats` — nueva acción a agregar.

**6B — Embudo de contratación por vacante:**
En `ApplicantsPanel`, sobre la lista de candidatos, agregar barra visual de pipeline:
```
[Total postulantes] → [CVs analizados] → [Para llamar] → [Entrevistando] → [Contratados]
```
Números reales calculados del array `applicants` ya cargado — sin llamada extra.

**6C — Búsqueda en banco de talento (Historial):**
En `HistoryPanel`, agregar encima de la lista:
- Input de búsqueda por nombre/archivo (filtro local sobre el array `history`)
- Filtro por score: "Todos · 80+ · 60-79 · < 60"
- Filtro por vacante (dropdown con las vacante_labels únicas del historial)
Todo filtrado en el cliente — sin llamadas extra a Supabase.

**6D — Exportar ranking a CSV:**
En `ApplicantsPanel`, botón `"Exportar CSV"` que genera y descarga un archivo con:
`nombre, email, ats_score, fit_score, recommendation, applied_at, key_matches, key_gaps`
Generado en el cliente con `Blob` + `URL.createObjectURL` — sin backend.

**6E — Notificación email al llegar nuevo postulante:**
En la función `submit-lead.ts` (o la función que recibe postulaciones a vacantes), agregar:
- Después de guardar el applicant en Supabase, buscar el email del recruiter por token
- Enviar email via Resend a ese email:
  - Subject: `"Nuevo postulante para [título vacante] — CVitae"`
  - Body: nombre del candidato, fecha, link directo al panel `/empresas`
- Solo si el recruiter tiene email registrado en `recruiter_tokens`

**6F — Modelo Bedrock diferenciado:**
- `analyze-cv-public.ts` (landing) → `anthropic.claude-haiku-4-5-20251001` via Bedrock
- `analyze-cv-candidate.ts` (B2B individual) → `claude-sonnet-4-6` (ya usa Sonnet — mantener)
- `analyze-vacancy-applicants.ts` (B2B masivo) → `claude-sonnet-4-6` (ya usa Sonnet — mantener)

---

### BLOQUE 7 — Admin renovado

**Admin.tsx — nuevas métricas en Briefing Room:**

Datos nuevos que `admin-data.ts` debe devolver en `action: "metrics"`:
```ts
{
  usuarios: number,           // ya existe
  oportunidades: number,      // ya existe  
  suscriptores: number,       // ya existe
  usuariosHoy: number,        // created_at >= hoy 00:00
  usuariosEstaSemana: number, // created_at >= hace 7 días
  cvsSubidos: number,         // count de profile_data con cv_text no null
  empresasActivas: number,    // count de recruiter_tokens con balance > 0
  analisisB2cHoy: number,     // si existe tabla de usage, count de hoy (opcional)
}
```

UI — row de KPIs con deltas:
- "Usuarios hoy: 3 (+2 vs ayer)" 
- Números en JetBrains Mono, fondo hairline, sin glass

**Admin.tsx — Scrapers panel mejorado:**
- Tabla con columnas: Fuente · Count · Última vez · Estado
- Estado calculado: si `lastSeen` < 24h → punto verde "Activo"; 24h-7d → amarillo "Desfasado"; > 7d → rojo "Sin datos"
- Total al pie: "X oportunidades activas de Y fuentes"

**Admin.tsx — nueva sección "Invitaciones B2B":**
- Tab nuevo en el Admin: "B2B PROSPECTS"
- Lista los registros de `b2b_prospects` table
- Columnas: Nombre · Empresa · Email · Estado · Fecha invitación · Acción
- Botón por fila: "Enviar invitación" (llama a nueva acción `send_b2b_invite`)
- Botón global: "Invitar a todos los pendientes"
- Badge de estado: PENDIENTE (gris) · INVITADO (gold) · ACTIVADO (verde)

**Admin.tsx — Usuarios mejorado:**
- Columna "Último acceso" (si existe `last_sign_in_at` en auth.users — leer via `supabase.auth.admin.listUsers`)
- Columna Notas: campo `notes` text editable inline con botón guardar
- Botón "Eliminar" con confirm dialog → `supabase.auth.admin.deleteUser(userId)`

**Admin.tsx — Contenido mejorado:**
- Toggle "Manual / Scrapers" sobre la lista de contenido
- Manual: `tipo = 'blog'` o registros sin campo `source`
- Scrapers: registros con campo `source` no null

---

### BLOQUE 8 — Sistema de invitaciones B2B

**Nueva tabla Supabase: `b2b_prospects`**
```sql
CREATE TABLE b2b_prospects (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre text,
  empresa text,
  email text UNIQUE NOT NULL,
  cargo text,
  status text DEFAULT 'pending' CHECK (status IN ('pending','invited','activated')),
  invited_at timestamptz,
  activated_at timestamptz,
  token text,
  notes text,
  created_at timestamptz DEFAULT now()
);
```

Los 5 contactos se insertan manualmente via SQL en Supabase con los datos del Google Form.

**Nueva función Netlify: `send-b2b-invite.ts`**
- Recibe: `{ id: string }` (id del prospect) + password admin
- Genera un token único de empresa si no tiene uno: `cvitae-b2b-[empresa-slug]-[random6]`
- Inserta el token en `recruiter_tokens` con `balance: 999` (1 mes ilimitado), `company_name`, `email`
- Actualiza `b2b_prospects`: `status='invited'`, `invited_at=now()`, `token=token`
- Envía email via Resend al prospect:

**Template email de invitación B2B:**
```
Asunto: "[nombre], tu acceso a CVitae está listo — 1 mes gratis"

Fondo: #0a0a0a
Logo: CVitae (texto dorado)

"Hola [nombre],

Cuando completaste nuestra encuesta sobre herramientas de RRHH, nos dijiste que el problema más grande era [filtrar CVs / encontrar candidatos calificados].

Hoy CVitae está listo. Y queremos que [empresa] sea una de las primeras en probarlo.

Tu acceso incluye:
✓ Análisis individual de CVs con IA
✓ Carga masiva de hasta 30 CVs — ranking automático
✓ Vacantes con link de postulación propio
✓ Historial y banco de talento acumulado
✓ 1 mes completamente gratis, sin tarjeta

No necesitamos que sea perfecto para vos — necesitamos que nos digas qué le falta. Tu feedback en este mes define el producto.

[Botón dorado: Activar mi acceso →] → https://cvitae.lat/empresas?token=[TOKEN]

¿Preguntas o comentarios? Respondé este correo o escribinos a contacto@cvitae.lat

— El equipo de CVitae"
```

**Auto-activación:** Cuando el recruiter usa el token por primera vez y es validado exitosamente por `validate-recruiter-token`, actualizar `b2b_prospects` donde `token = token` → `status='activated'`, `activated_at=now()`.

**URL con token pre-cargado:** La URL `https://cvitae.lat/empresas?token=TOKEN` debe auto-rellenar el input de token en `Recruiters.tsx` al montar el componente:
```ts
useEffect(() => {
  const params = new URLSearchParams(window.location.search)
  const t = params.get('token')
  if (t) setTokenInput(t)
}, [])
```

---

## Bugs a corregir en este mismo commit

- **BUG-03:** Sesión B2B se pierde al navegar (cubierto en BLOQUE 5)
- **BUG-06:** Config cuenta — email y plan vacíos → verificar `user.email` y `profile_data.plan` en `Configuracion.tsx`
- **BUG-08:** Descarga PDF → investigar en Netlify Functions si el link de storage está firmado con expiración corta; renovar a signed URL on-demand
- **UX-03:** Botones disabled sin feedback → agregar texto explicativo bajo botones disabled en la landing
- **UX-05:** Plan "Free" sin CTA de upgrade en Configuración → agregar botón "Pasate a Pro — USD 9/mes"

---

## Archivos a crear/modificar

| Archivo | Acción |
|---------|--------|
| `src/pages/LandingPage.tsx` | Modificar — hero, analizador real, pricing, eliminar beta |
| `src/pages/About.tsx` | Modificar — canonical + og:url a /sobre-cvitae |
| `src/pages/Recruiters.tsx` | Modificar — sin beta, BUG-03, dashboard stats, embudo, búsqueda, exportar CSV, URL token |
| `src/pages/Admin.tsx` | Modificar — nuevas métricas, scrapers semáforo, sección B2B Prospects, mejoras usuarios/contenido |
| `src/App.tsx` | Modificar — agregar ruta /sobre-cvitae, redirect /about |
| `src/hub/Configuracion.tsx` | Modificar — BUG-06 + UX-05 |
| `netlify/functions/admin-data.ts` | Modificar — nuevas métricas con deltas, acción send_b2b_invite, get_dashboard_stats |
| `netlify/functions/analyze-cv-public.ts` | Crear — analizador público con Haiku |
| `netlify/functions/send-b2b-invite.ts` | Crear — envío invitación + generación token |
| `netlify/functions/validate-recruiter-token.ts` | Modificar — acción get_dashboard_stats, auto-activar prospect |
| `public/robots.txt` | Reemplazar — agregar bots AI |
| `public/llms.txt` | Crear — descripción GEO para AIs |
| `index.html` | Modificar — FAQ schema precio, og:description, featureList |
| `docs/email-templates/magic-link.html` | Crear — template HTML para Supabase |

---

## Orden de implementación recomendado

1. SEO/GEO técnico (robots, llms, schema, canonicals) — sin riesgo, puro static
2. `analyze-cv-public.ts` — nueva función, aislada
3. `LandingPage.tsx` — hero + analizador real + pricing + eliminar beta
4. `Recruiters.tsx` — BUG-03 + sin beta + funcionalidades nuevas
5. `Admin.tsx` + `admin-data.ts` — métricas reales + sección prospects
6. `send-b2b-invite.ts` — función de invitación
7. Bugs restantes (BUG-06, BUG-08, UX-03, UX-05)
8. Template email Supabase (manual, fuera del repo)
9. SQL: crear tabla `b2b_prospects` + insert 5 contactos (manual en Supabase)

---

## Lo que NO entra en este commit

- Scrapers nuevos (14 del plan de expansión) — sesión separada
- Tests de Verificate nuevos (UX-06) — sesión separada
- Análisis de producto con IA en Studio — sesión separada
- Prerendering SSR/SSG — evaluación futura

---

## Criterios de aceptación

- [ ] El analizador de la landing devuelve un score real y diferente por CV
- [ ] No aparece la palabra "beta" en ninguna página pública
- [ ] `/sobre-cvitae` abre About sin 404, `/about` redirige ahí
- [ ] `llms.txt` accesible en `https://cvitae.lat/llms.txt`
- [ ] `robots.txt` en producción tiene las entradas de GPTBot, ClaudeBot, PerplexityBot
- [ ] El precio en el FAQ Schema dice USD 9/mes
- [ ] La sesión B2B se mantiene al navegar entre `/empresas` y `/empresas/masivo`
- [ ] Desde el Admin se puede enviar una invitación B2B y llega el email
- [ ] El Admin muestra usuarios nuevos hoy con número real
- [ ] Los scrapers tienen indicador de color según cuándo corrieron por última vez
