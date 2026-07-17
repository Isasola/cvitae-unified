# CVitae v1.0 — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pasar CVitae de beta a producto v1.0 — landing clara, analizador de CV con IA real, B2B profesional, Admin con datos reales, SEO/GEO técnico y sistema de invitaciones B2B.

**Architecture:** SPA React 19 + Vite 7 en Netlify. Las funciones de backend son Netlify Functions TypeScript que llaman a AWS Bedrock y Supabase via service role. Todo el SEO crítico vive en el `<head>` estático de `index.html` porque Google no renderiza JS. Un solo commit al final — probar localmente primero.

**Tech Stack:** React 19, Vite 7, Tailwind v4, TypeScript, Wouter (routing), Supabase (postgres + auth), Netlify Functions, AWS Bedrock (`@aws-sdk/client-bedrock-runtime`), Resend (email), React Helmet Async.

## Global Constraints

- Rama activa: `feature/aws-migration` — todos los cambios van aquí
- Un solo commit al final — NO commitear por tarea
- Probar con `netlify dev` en local antes de cualquier deploy
- Modelo B2B: `global.anthropic.claude-sonnet-4-6` (ya configurado en `analyze-cv-candidate.ts`)
- Modelo B2C público: `us.anthropic.claude-haiku-4-5-20251001`
- Credenciales Bedrock: `CVITAE_AWS_ACCESS_KEY_ID`, `CVITAE_AWS_SECRET_ACCESS_KEY`, `CVITAE_AWS_REGION`
- Supabase admin: usar siempre `makeSupabaseAdmin()` de `./_supabase.ts` en funciones Netlify
- Resend: `sendResendEmail(to, subject, html)` — patrón de `submit-beta.ts`, from siempre `"CVitae <contacto@cvitae.lat>"`
- Diseño: dark `#0a0a0a`, gold `#c9a84c`, cream `#f5f4f0`, font-display = Playfair Display
- No palabra "beta" en ninguna página pública

---

## Mapa de archivos

| Archivo | Acción | Responsabilidad |
|---------|--------|-----------------|
| `public/robots.txt` | Reemplazar | Permitir bots AI (GPTBot, ClaudeBot, PerplexityBot) |
| `public/llms.txt` | Crear | Descripción GEO para AIs |
| `index.html` | Modificar | FAQ schema precio USD 9, og:description actualizado |
| `src/App.tsx` | Modificar | Ruta `/sobre-cvitae`, redirect `/about` |
| `src/pages/About.tsx` | Modificar | Canonical + og:url a `/sobre-cvitae` |
| `src/pages/LandingPage.tsx` | Modificar | Hero nuevo, analizador real, pricing free tier, sin beta |
| `src/pages/Recruiters.tsx` | Modificar | Sin beta, BUG-03, dashboard stats, embudo, búsqueda, exportar CSV, token URL |
| `src/pages/Admin.tsx` | Modificar | Métricas con deltas, scrapers semáforo, sección B2B Prospects |
| `src/hub/Configuracion.tsx` | Modificar | BUG-06 email real, plan real, CTA upgrade Pro |
| `netlify/functions/analyze-cv-public.ts` | Crear | Analizador público con Haiku, sin auth, rate limit por IP |
| `netlify/functions/send-b2b-invite.ts` | Crear | Generar token empresa + enviar email invitación |
| `netlify/functions/admin-data.ts` | Modificar | Métricas con deltas (usuariosHoy, semana, etc), acción `send_b2b_invite`, `list_b2b_prospects` |
| `netlify/functions/validate-recruiter-token.ts` | Modificar | Acción `get_dashboard_stats`, auto-activar prospect |
| `docs/email-templates/magic-link.html` | Crear | Template HTML para Supabase Auth (referencia) |

---

## Tarea 1 — SEO/GEO técnico estático

**Archivos:**
- Modificar: `public/robots.txt`
- Crear: `public/llms.txt`
- Modificar: `index.html`
- Modificar: `src/App.tsx`
- Modificar: `src/pages/About.tsx`

**Interfaces:**
- Produce: rutas `/sobre-cvitae` funcional, `/about` redirige, `robots.txt` con bots AI, `llms.txt` accesible, FAQ schema con precio correcto

- [ ] **Paso 1: Reemplazar `public/robots.txt`**

Reemplazar el contenido completo con:
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

- [ ] **Paso 2: Crear `public/llms.txt`**

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

- [ ] **Paso 3: Corregir `index.html` — FAQ schema y og:description**

Encontrar en `index.html` la pregunta del FAQ que dice `"USD 5/mes"` y cambiarla:
```json
// ANTES:
{ "@type": "Question", "name": "¿CVitae es gratuito?", "acceptedAnswer": { "@type": "Answer", "text": "Sí, CVitae tiene un plan gratuito. El plan Pro (USD 5/mes) incluye matches ilimitados, CV Vivo con IA y alertas proactivas." } }

// DESPUÉS:
{ "@type": "Question", "name": "¿CVitae es gratuito?", "acceptedAnswer": { "@type": "Answer", "text": "Sí, CVitae tiene un plan gratuito con analizador ilimitado de CV, 3 matches diarios y 1 CV adaptado por día. El plan Pro (USD 9/mes) incluye matches ilimitados, CV Vivo con IA y alertas proactivas." } }
```

Encontrar la línea `og:description` en `index.html` y actualizar:
```html
<!-- ANTES: -->
<meta property="og:description" content="El primer agente de carrera con IA para Paraguay. Matching automático con +1000 oportunidades, CV Vivo adaptado por IA y alertas proactivas." />

<!-- DESPUÉS: -->
<meta property="og:description" content="Analizá tu CV gratis con IA y obtené tu score ATS real. 3 matches de empleo por día, CV adaptado a cada vacante — sin configuración. El primer agente de carrera para Paraguay y LATAM." />
```

Actualizar también el `featureList` del SoftwareApplication schema para agregar análisis gratuito:
```json
// ANTES:
"featureList": ["Matching automático con +1000 oportunidades", "CV Vivo adaptado por IA", "Recomendación de cursos con IA", "Alertas proactivas por email"]

// DESPUÉS:
"featureList": ["Analizador de CV gratuito sin registro", "3 matches de empleo por día gratis", "CV Vivo adaptado por IA", "Matching automático con +4500 oportunidades", "Recomendación de cursos con IA", "Alertas proactivas por email"]
```

- [ ] **Paso 4: Agregar ruta `/sobre-cvitae` y redirect `/about` en `src/App.tsx`**

En `src/App.tsx`, después de la línea `<Route path="/about" component={About} />`, agregar:
```tsx
// REEMPLAZAR esta línea:
<Route path="/about" component={About} />

// POR estas dos:
<Route path="/sobre-cvitae" component={About} />
<Route path="/about"><Redirect to="/sobre-cvitae" /></Route>
```

- [ ] **Paso 5: Corregir canonical en `src/pages/About.tsx`**

En `src/pages/About.tsx`, dentro del `<Helmet>`, cambiar:
```tsx
// ANTES:
<link rel="canonical" href="https://cvitae.lat/about" />
<meta property="og:url" content="https://cvitae.lat/about" />

// DESPUÉS:
<link rel="canonical" href="https://cvitae.lat/sobre-cvitae" />
<meta property="og:url" content="https://cvitae.lat/sobre-cvitae" />
```

- [ ] **Paso 6: Verificar en local**

Correr `netlify dev` y verificar:
- `http://localhost:8888/robots.txt` — muestra GPTBot, ClaudeBot
- `http://localhost:8888/llms.txt` — muestra el contenido
- `http://localhost:8888/sobre-cvitae` — abre la página About
- `http://localhost:8888/about` — redirige a `/sobre-cvitae`

---

## Tarea 2 — Función `analyze-cv-public.ts`

**Archivos:**
- Crear: `netlify/functions/analyze-cv-public.ts`

**Interfaces:**
- Consume: `makeSupabaseAdmin` de `./_supabase.ts` (para rate limit opcional), `BedrockRuntimeClient` de `@aws-sdk/client-bedrock-runtime`
- Produce:
  ```ts
  // POST body recibido:
  { cvText: string }
  
  // Response exitosa:
  {
    atsScore: number,          // 0-100
    nombre: string,
    rolDetectado: string,
    strengths: string[],       // 3 items
    criticalImprovements: string[], // 3 items
    missingKeywords: string[], // 5 items
    recommendation: string     // 1 frase
  }
  
  // Response error:
  { error: string }
  ```

- [ ] **Paso 1: Crear `netlify/functions/analyze-cv-public.ts`**

```typescript
import { Handler } from "@netlify/functions"
import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime"

const MODEL_ID = "us.anthropic.claude-haiku-4-5-20251001"

const bedrockClient = new BedrockRuntimeClient({
  region: process.env.CVITAE_AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.CVITAE_AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.CVITAE_AWS_SECRET_ACCESS_KEY!,
  },
})

// Rate limit en memoria: max 10 requests/hora por IP
const ipCounts: Record<string, { count: number; resetAt: number }> = {}

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  if (!ipCounts[ip] || ipCounts[ip].resetAt < now) {
    ipCounts[ip] = { count: 1, resetAt: now + 60 * 60 * 1000 }
    return true
  }
  if (ipCounts[ip].count >= 10) return false
  ipCounts[ip].count++
  return true
}

function extractJSON(text: string): any {
  const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
  if (codeBlock) return JSON.parse(codeBlock[1].trim())
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (jsonMatch) return JSON.parse(jsonMatch[0])
  return JSON.parse(text.trim())
}

const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) }
  }

  const ip = event.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
             event.headers["cf-connecting-ip"] ||
             "unknown"

  if (!checkRateLimit(ip)) {
    return {
      statusCode: 429,
      body: JSON.stringify({ error: "Demasiados análisis. Intentá en una hora o creá tu cuenta para análisis ilimitados." }),
    }
  }

  try {
    const { cvText } = JSON.parse(event.body || "{}")

    if (!cvText || cvText.trim().length < 100) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "No se pudo extraer texto suficiente del CV. Asegurate de que el PDF no sea una imagen escaneada." }),
      }
    }

    const systemPrompt = `Sos un experto en recursos humanos y sistemas ATS (Applicant Tracking Systems) con 15 años de experiencia en el mercado laboral latinoamericano. Analizás CVs con criterio técnico y humano. Devolvés ÚNICAMENTE JSON válido, sin texto extra, sin markdown.`

    const userPrompt = `Analizá este CV y extraé:
1. Estructura: nombre completo, rol/título actual detectado
2. Score ATS (0-100): penalizá formato con tablas o columnas múltiples (-15), imágenes en el CV (-10), falta de keywords del rubro (-5 por keyword faltante), secciones ausentes como experiencia/educación/habilidades (-10 cada una), CV demasiado largo >3 páginas (-5) o muy corto <1 página (-10)
3. 3 fortalezas concretas y específicas de ESTE CV (no genéricas)
4. 3 mejoras críticas específicas y accionables para ESTE CV
5. 5 keywords importantes que faltan según el rubro detectado
6. Una recomendación concisa de 1 frase

CV:
---
${cvText.substring(0, 4000)}
---

Respondé ÚNICAMENTE con este JSON:
{
  "atsScore": <número entre 0 y 100>,
  "nombre": "<nombre completo detectado o 'No detectado'>",
  "rolDetectado": "<título/rol principal detectado>",
  "strengths": ["<fortaleza 1>", "<fortaleza 2>", "<fortaleza 3>"],
  "criticalImprovements": ["<mejora 1>", "<mejora 2>", "<mejora 3>"],
  "missingKeywords": ["<keyword 1>", "<keyword 2>", "<keyword 3>", "<keyword 4>", "<keyword 5>"],
  "recommendation": "<recomendación de 1 frase>"
}`

    const command = new InvokeModelCommand({
      modelId: MODEL_ID,
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify({
        anthropic_version: "bedrock-2023-05-31",
        max_tokens: 800,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    })

    const response = await bedrockClient.send(command)
    const raw = JSON.parse(new TextDecoder().decode(response.body))
    const text = raw.content[0]?.text ?? ""
    const result = extractJSON(text)

    // Validar campos obligatorios
    if (typeof result.atsScore !== "number" || !Array.isArray(result.strengths)) {
      throw new Error("Respuesta del modelo inválida")
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(result),
    }
  } catch (err: any) {
    console.error("analyze-cv-public error:", err)
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Error al analizar el CV. Intentá de nuevo." }),
    }
  }
}

export { handler }
```

- [ ] **Paso 2: Verificar que el modelo existe en la región configurada**

Correr en terminal:
```bash
cd /c/proyectos/cvitae-unified
netlify dev
```

En otra terminal, probar la función con un texto de CV de muestra:
```bash
curl -X POST http://localhost:8888/.netlify/functions/analyze-cv-public \
  -H "Content-Type: application/json" \
  -d '{"cvText": "Juan Pérez\nDesarrollador Full Stack\nExperiencia: 3 años en React y Node.js\nEducación: Ingeniería en Informática, UNA 2021\nHabilidades: JavaScript, TypeScript, SQL, Git\nProyectos: Sistema de gestión para empresa retail"}'
```

Resultado esperado: JSON con `atsScore`, `nombre`, `strengths`, etc. (no hardcodeado).

---

## Tarea 3 — Landing Page v1.0

**Archivos:**
- Modificar: `src/pages/LandingPage.tsx`

**Interfaces:**
- Consume: `analyze-cv-public` (nueva función de Tarea 2), `extract-pdf-text` (ya existe)
- Produce: landing sin "beta", hero con headline nuevo, analizador real, free tier correcto, CTA post-análisis con score real

- [ ] **Paso 1: Reemplazar el componente `Hero`**

En `src/pages/LandingPage.tsx`, reemplazar la función `Hero` completa:
```tsx
function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="mx-auto max-w-6xl px-6 pb-10 pt-16 sm:pb-16 sm:pt-24">
        <Eyebrow>Paraguay &amp; LATAM · IA de carrera</Eyebrow>
        <h1 className="font-display mt-3 max-w-3xl text-4xl leading-[1.05] text-cream sm:text-6xl">
          Analizá tu CV <em>gratis</em>.
          <br />Después, encontrá el trabajo
          <br />que te <em>corresponde</em>.
        </h1>
        <p className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
          CVitae analiza tu CV con IA, te muestra tu score ATS real y te hace
          3 matches de empleo por día — gratis. Sin configuración, sin formularios.
        </p>
        <div className="relative mt-10 max-w-2xl">
          <GrowthLine className="absolute -top-6 left-0 right-0 h-20 opacity-50" />
        </div>
        <div className="mt-10 flex flex-wrap gap-3">
          <a
            href="#analizador"
            className="inline-flex h-11 items-center gap-2 rounded-full bg-[#c9a84c] px-6 text-sm font-medium text-[#0a0a0a] transition hover:bg-[#e6cf8a] hover:shadow-[0_0_40px_-4px_rgba(201,168,76,0.5)]"
          >
            <Sparkles className="h-4 w-4" /> Analizar mi CV gratis
          </a>
          <a
            href="#registro"
            className="inline-flex h-11 items-center gap-2 rounded-full border border-white/10 px-6 text-sm text-cream transition hover:border-white/25"
          >
            Crear mi perfil <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Paso 2: Reemplazar el componente `Analizador` con IA real**

Reemplazar la función `Analizador` completa en `LandingPage.tsx`:
```tsx
interface PublicAnalysisResult {
  atsScore: number
  nombre: string
  rolDetectado: string
  strengths: string[]
  criticalImprovements: string[]
  missingKeywords: string[]
  recommendation: string
}

function Analizador() {
  const [cv, setCv] = useState<File | null>(null)
  const [step, setStep] = useState<'idle' | 'extracting' | 'analyzing' | 'done' | 'error'>('idle')
  const [result, setResult] = useState<PublicAnalysisResult | null>(null)
  const [errorMsg, setErrorMsg] = useState('')

  const handleAnalyze = async () => {
    if (!cv) return
    setStep('extracting')
    setErrorMsg('')
    try {
      // Paso 1: extraer texto del PDF
      const reader = new FileReader()
      const base64: string = await new Promise((resolve, reject) => {
        reader.onload = (e) => {
          const ab = e.target?.result as ArrayBuffer
          resolve(btoa(new Uint8Array(ab).reduce((d, b) => d + String.fromCharCode(b), '')))
        }
        reader.onerror = reject
        reader.readAsArrayBuffer(cv)
      })

      const extractRes = await fetch('/.netlify/functions/extract-pdf-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdfBase64: base64, fileName: cv.name }),
      })
      const { text } = await extractRes.json()

      if (!text || text.trim().length < 100) {
        throw new Error('No se pudo extraer texto del PDF. Asegurate de que no sea una imagen escaneada.')
      }

      // Paso 2: analizar con IA
      setStep('analyzing')
      const analyzeRes = await fetch('/.netlify/functions/analyze-cv-public', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cvText: text }),
      })
      const data = await analyzeRes.json()

      if (!analyzeRes.ok) throw new Error(data.error || 'Error al analizar')
      setResult(data)
      setStep('done')
    } catch (err: any) {
      setErrorMsg(err.message || 'Error inesperado. Intentá de nuevo.')
      setStep('error')
    }
  }

  const stepLabel = step === 'extracting'
    ? 'Leyendo tu CV…'
    : step === 'analyzing'
    ? 'Calculando tu score ATS…'
    : 'Analizar ahora'

  return (
    <section id="analizador" className="mx-auto max-w-6xl border-t border-white/8 px-6 py-20">
      <Eyebrow>Sin registro · Sin guardar datos</Eyebrow>
      <h2 className="font-display mt-2 max-w-2xl text-3xl text-cream sm:text-4xl">
        Analizador de CV <em>gratis</em>.
      </h2>
      <p className="mt-3 max-w-xl text-muted-foreground">
        Subí tu CV y mirá en segundos tu score ATS real, tus fortalezas y qué mejorar.
        Procesado por IA — no guardamos nada.
      </p>
      <div className="mt-10 grid gap-6 lg:grid-cols-2">
        {/* Upload panel */}
        <div className="editorial-panel p-8">
          <label className="block cursor-pointer rounded-2xl border border-dashed border-white/15 p-10 text-center transition hover:border-[#c9a84c]/50">
            <Upload className="mx-auto h-6 w-6 text-[#c9a84c]" />
            <p className="font-display mt-3 text-lg text-cream">
              {cv?.name ?? 'Subí tu CV en PDF'}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">PDF · hasta 5 MB</p>
            <input
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => {
                setCv(e.target.files?.[0] ?? null)
                setStep('idle')
                setResult(null)
              }}
            />
          </label>
          <div className="mt-4">
            <button
              className="inline-flex w-full h-11 items-center justify-center gap-2 rounded-full bg-[#c9a84c] text-sm font-medium text-[#0a0a0a] transition hover:bg-[#e6cf8a] disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={handleAnalyze}
              disabled={!cv || step === 'extracting' || step === 'analyzing'}
            >
              {(step === 'extracting' || step === 'analyzing')
                ? <><Loader2 className="h-4 w-4 animate-spin" /> {stepLabel}</>
                : <><Sparkles className="h-4 w-4" /> {stepLabel}</>
              }
            </button>
            {!cv && (
              <p className="mt-2 text-center text-xs text-muted-foreground">
                Primero subí tu PDF para poder analizar
              </p>
            )}
          </div>
          {errorMsg && (
            <p className="mt-3 text-xs text-red-400">{errorMsg}</p>
          )}
        </div>

        {/* Result panel */}
        <div className="editorial-panel p-8">
          {result ? (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-5"
            >
              <CompatibilityTrace score={result.atsScore} label="Score ATS real" />
              <div className="space-y-2 text-sm">
                {result.strengths.map((s, i) => (
                  <p key={i} className="text-cream">
                    <span className="mr-2 font-display italic text-[#c9a84c]">+</span>{s}
                  </p>
                ))}
                {result.criticalImprovements.map((m, i) => (
                  <p key={i} className="text-cream">
                    <span className="mr-2 font-display italic text-red-400">!</span>{m}
                  </p>
                ))}
              </div>
              {result.missingKeywords.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-2">Keywords que faltan:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {result.missingKeywords.map((kw) => (
                      <span key={kw} className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-xs text-white/60">
                        {kw}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {/* CTA post-análisis */}
              <div className="rounded-2xl border border-[#c9a84c]/25 bg-[#c9a84c]/[0.05] p-4">
                <p className="text-sm text-cream">
                  Tu CV tiene <strong className="text-[#c9a84c]">{result.atsScore}/100</strong>.{' '}
                  Creá tu cuenta gratis y adaptamos tu CV a una vacante hoy mismo — 1 gratis por día.
                </p>
                <a
                  href="#registro"
                  className="mt-3 inline-flex items-center gap-2 rounded-full bg-[#c9a84c] px-4 py-2 text-xs font-medium text-[#0a0a0a] transition hover:bg-[#e6cf8a]"
                >
                  Crear mi perfil gratis <ArrowRight className="h-3 w-3" />
                </a>
              </div>
            </motion.div>
          ) : (
            <div className="grid min-h-[280px] place-items-center text-center">
              <div>
                <Sparkles className="mx-auto h-6 w-6 text-[#c9a84c]" />
                <p className="font-display mt-3 text-lg text-cream">Tu análisis aparecerá aquí</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Score ATS real, fortalezas y mejoras críticas.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
```

Agregar `Loader2` a los imports de lucide-react si no está (ya está en `RegistroBlock`).

- [ ] **Paso 3: Actualizar Pricing con free tier correcto**

Reemplazar el array `tiers` en la función `Pricing`:
```tsx
const tiers = [
  {
    name: 'Free', price: 'Gs. 0', per: 'para siempre',
    features: [
      'Analizador de CV ilimitado (sin registro)',
      '3 matches de empleo por día',
      '1 CV Vivo adaptado por día',
      'Alertas semanales por email',
      'Acceso a +4.500 oportunidades activas',
    ],
    note: 'Volvé mañana para tus próximos matches — el listado se actualiza cada día.',
    cta: 'Empezar gratis', featured: false,
  },
  {
    name: 'Pro', price: 'USD 9', per: '/ mes',
    features: [
      'Matches ilimitados',
      'CV optimizado para ATS por vacante',
      'Análisis de vacante con IA',
      'Recomendación de cursos personalizada',
      'Soporte prioritario',
    ],
    note: null,
    cta: 'Probar Pro', featured: true,
  },
]
```

En el JSX de la tarjeta Free, después del `<ul>` de features, agregar la nota:
```tsx
{t.note && (
  <p className="mt-4 text-xs text-muted-foreground italic">{t.note}</p>
)}
```

- [ ] **Paso 4: Eliminar `BetaB2CForm` y actualizar sección Para Empresas**

1. Eliminar la función `BetaB2CForm` completa del archivo.
2. En `LandingPage()` (al final del archivo), eliminar `<BetaB2CForm />` del JSX.
3. En la función `ParaEmpresas`, reemplazar el formulario de "Acceso a la Beta" por un CTA directo. Reemplazar el bloque `<div className="glass-card rounded-3xl p-8">` completo con:
```tsx
<div className="glass-card rounded-3xl p-8 flex flex-col justify-center items-center text-center gap-6">
  <Building2 className="h-10 w-10 text-[#c9a84c]" />
  <div>
    <h3 className="font-display text-2xl text-cream">Panel disponible ahora</h3>
    <p className="mt-2 text-sm text-muted-foreground max-w-xs">
      Ingresá con tu token de empresa o contactanos para obtener acceso.
    </p>
  </div>
  <div className="flex flex-col gap-3 w-full max-w-xs">
    <Link
      href="/empresas"
      className="inline-flex w-full h-11 items-center justify-center gap-2 rounded-full bg-[#c9a84c] text-sm font-medium text-[#0a0a0a] transition hover:bg-[#e6cf8a]"
    >
      Acceder al panel <ChevronRight className="h-4 w-4" />
    </Link>
    <a
      href="mailto:contacto@cvitae.lat?subject=Acceso%20Panel%20Empresas"
      className="inline-flex w-full h-11 items-center justify-center gap-2 rounded-full border border-white/10 text-sm text-cream transition hover:border-white/25"
    >
      Escribinos
    </a>
  </div>
</div>
```

5. En el `<Helmet>` de `LandingPage()`, actualizar la meta description:
```tsx
<meta name="description" content="Analizá tu CV gratis con IA. 3 matches de empleo por día, 1 CV adaptado — gratis. El primer agente de carrera para Paraguay y LATAM." />
```

- [ ] **Paso 5: Verificar en local que no aparece "beta" en ninguna parte**

```bash
grep -r "beta\|Beta\|BETA" src/pages/LandingPage.tsx
```

Resultado esperado: sin matches (o solo en comentarios de código).

- [ ] **Paso 6: Probar la landing en `http://localhost:8888`**

- Hero muestra el nuevo headline
- Botón "Analizar mi CV gratis" hace scroll al analizador
- Subir un PDF real → ver score real (no 72 hardcodeado)
- Pricing muestra free tier con analizador ilimitado y nota de "volvé mañana"
- Sección empresas muestra botón "Acceder al panel" en vez del form

---

## Tarea 4 — Configuracion.tsx — BUG-06 + UX-05

**Archivos:**
- Modificar: `src/hub/Configuracion.tsx`

**Interfaces:**
- Consume: `auth.getUser()` de `@/lib/supabase`, `supabase.from('user_master_profiles')` 
- Produce: email real del usuario, plan real (Free/Pro), CTA de upgrade

- [ ] **Paso 1: Reemplazar `Configuracion.tsx` completo**

```tsx
import { useState, useEffect } from 'react'
import { Helmet } from 'react-helmet-async'
import { DashboardLayout } from '@/components/cvitae/DashboardLayout'
import { GlassCard, GoldButton } from '@/components/cvitae/UI-Elements'
import { auth, supabase } from '@/lib/supabase'
import { Settings, Crown } from 'lucide-react'

export default function Configuracion() {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<{ is_subscribed?: boolean } | null>(null)

  useEffect(() => {
    auth.getUser().then((u) => {
      setUser(u)
      if (u?.id) {
        supabase
          .from('user_master_profiles')
          .select('is_subscribed')
          .eq('user_id', u.id)
          .single()
          .then(({ data }) => setProfile(data))
      }
    })
  }, [])

  const plan = profile?.is_subscribed ? 'Pro' : 'Free'

  return (
    <DashboardLayout>
      <Helmet>
        <title>Configuración | CVitae</title>
        <meta name="description" content="Gestioná tu cuenta, plan y preferencias en CVitae." />
        <meta name="robots" content="noindex" />
      </Helmet>
      <GlassCard className="max-w-lg">
        <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
          <Settings size={20} className="text-gold" />
          Configuración de cuenta
        </h2>
        <div className="space-y-4">
          <div>
            <label className="text-xs text-muted/70 uppercase tracking-widest mb-2 block">Email</label>
            <input
              type="text"
              value={user?.email ?? 'Cargando…'}
              readOnly
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white"
            />
          </div>
          <div>
            <label className="text-xs text-muted/70 uppercase tracking-widest mb-2 block">Plan actual</label>
            <div className="flex items-center gap-3">
              <input
                type="text"
                value={plan}
                readOnly
                className="flex-1 px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white"
              />
              {plan === 'Free' && (
                <a
                  href="/#registro"
                  className="inline-flex items-center gap-1.5 rounded-full bg-[#c9a84c] px-4 py-2.5 text-xs font-medium text-[#0a0a0a] transition hover:bg-[#e6cf8a] whitespace-nowrap"
                >
                  <Crown size={12} /> Pasate a Pro — USD 9/mes
                </a>
              )}
            </div>
          </div>
          <p className="text-xs text-muted/70 italic">
            Los datos de cuenta se sincronizan con tu acceso por magic link.
          </p>
          <GoldButton
            variant="outline"
            onClick={async () => { await auth.signOut(); window.location.href = '/' }}
          >
            Cerrar sesión
          </GoldButton>
        </div>
      </GlassCard>
    </DashboardLayout>
  )
}
```

- [ ] **Paso 2: Verificar en local**

Ir a `http://localhost:8888/mi-carrera/configuracion` (logueado):
- Email muestra el email real del usuario
- Plan muestra "Free" o "Pro" según `is_subscribed`
- Si plan es Free, aparece botón "Pasate a Pro"

---

## Tarea 5 — B2B: sin beta + BUG-03 + token por URL + funcionalidades nuevas

**Archivos:**
- Modificar: `src/pages/Recruiters.tsx`
- Modificar: `netlify/functions/validate-recruiter-token.ts`

**Interfaces:**
- Consume: `validate-recruiter-token` con nueva acción `get_dashboard_stats`
- Produce: sesión persistida en `sessionStorage`, token pre-cargado desde URL param, dashboard KPIs, embudo por vacante, búsqueda en historial, exportar CSV

- [ ] **Paso 1: Agregar `get_dashboard_stats` a `validate-recruiter-token.ts`**

Al final de los bloques `if (action === ...)` en `validate-recruiter-token.ts`, antes del return final, agregar:

```typescript
// ─── Acción: Dashboard stats ───
if (action === "get_dashboard_stats") {
  const [vacanciesRes, analysesRes, applicantsRes] = await Promise.all([
    supabase
      .from("recruiter_vacancies")
      .select("id", { count: "exact", head: true })
      .eq("recruiter_token_id", data.id)
      .eq("is_active", true),
    supabase
      .from("recruiter_analyses")
      .select("id", { count: "exact", head: true })
      .eq("token_id", data.id),
    supabase
      .from("vacancy_applications")
      .select("id, recommendation, recruiter_action, vacancy_id")
      .in(
        "vacancy_id",
        (await supabase
          .from("recruiter_vacancies")
          .select("id")
          .eq("recruiter_token_id", data.id)
          .eq("is_active", true)
        ).data?.map((v: any) => v.id) || []
      ),
  ])

  const applicants = applicantsRes.data || []
  return {
    statusCode: 200,
    body: JSON.stringify({
      vacantesActivas: vacanciesRes.count || 0,
      totalPostulantes: applicants.length,
      cvsAnalizados: analysesRes.count || 0,
      paraLlamar: applicants.filter((a: any) => a.recommendation === "Llamar").length,
    }),
  }
}
```

- [ ] **Paso 2: Fix BUG-03 — persistir sesión en sessionStorage**

En `Recruiters.tsx`, encontrar la función/componente principal `export default function Recruiters()` donde se declara el estado `session`. Agregar lectura y escritura de `sessionStorage`:

```tsx
// Al inicio del componente Recruiters (donde está el useState de session):
const [session, setSession] = useState<RecruiterSession | null>(() => {
  try {
    const saved = sessionStorage.getItem('recruiter_session')
    return saved ? JSON.parse(saved) : null
  } catch { return null }
})

// Donde se llama setSession con la sesión válida (después de validar token exitosamente):
// Buscar la línea: setSession({ valid: true, ... })
// DESPUÉS de esa línea agregar:
sessionStorage.setItem('recruiter_session', JSON.stringify({ valid: true, ...datosSession }))

// En la función de logout (onLogout):
sessionStorage.removeItem('recruiter_session')
setSession(null)
```

- [ ] **Paso 3: Token pre-cargado desde URL param**

En el componente de login (donde está el `<input>` del token), agregar en el `useEffect` del componente raíz:
```tsx
useEffect(() => {
  const params = new URLSearchParams(window.location.search)
  const t = params.get('token')
  if (t) setTokenInput(t)
}, [])
```

Encontrar dónde está declarado `tokenInput` (state para el input del token) y agregar este efecto si no existe.

- [ ] **Paso 4: Dashboard KPIs en `RecruiterPanel`**

En `RecruiterPanel`, después del heading "análisis de candidatos", antes de los "Quick links", agregar un estado y carga de stats:

```tsx
// Agregar estado:
const [dashStats, setDashStats] = useState<{
  vacantesActivas: number
  totalPostulantes: number
  cvsAnalizados: number
  paraLlamar: number
} | null>(null)

// Agregar useEffect al montar:
useEffect(() => {
  fetch('/.netlify/functions/validate-recruiter-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: session.token, action: 'get_dashboard_stats' }),
  })
    .then(r => r.json())
    .then(d => setDashStats(d))
    .catch(() => {})
}, [session.token])

// Agregar JSX de KPIs después del heading h1, antes de los quick links:
{dashStats && (
  <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
    {[
      { label: 'Vacantes activas', value: dashStats.vacantesActivas },
      { label: 'Postulantes', value: dashStats.totalPostulantes },
      { label: 'CVs analizados', value: dashStats.cvsAnalizados },
      { label: 'Para llamar', value: dashStats.paraLlamar },
    ].map(({ label, value }) => (
      <div key={label} className="rounded-2xl border border-white/8 bg-white/[0.02] p-4 text-center">
        <p className="font-display text-3xl text-[#c9a84c]">{value}</p>
        <p className="mt-1 text-[10px] uppercase tracking-[0.15em] text-white/40">{label}</p>
      </div>
    ))}
  </div>
)}
```

- [ ] **Paso 5: Embudo de contratación en `ApplicantsPanel`**

En `ApplicantsPanel`, después del bloque de stats/CTA (el `glass-card` con total de postulantes), agregar el embudo visual:

```tsx
{applicants.length > 0 && (
  <div className="glass-card rounded-2xl p-5">
    <p className="text-[10px] uppercase tracking-[0.18em] text-white/35 mb-4">Pipeline de contratación</p>
    <div className="flex items-center gap-1 flex-wrap">
      {[
        { label: 'Postulantes', value: applicants.length, color: 'text-white/70' },
        { label: 'Analizados', value: applicants.filter(a => a.analyzed_at).length, color: 'text-sky-400' },
        { label: 'Para llamar', value: counts['Llamar'], color: 'text-emerald-400' },
        { label: 'Entrevistando', value: applicants.filter(a => a.recruiter_action === 'interviewing').length, color: 'text-[#c9a84c]' },
        { label: 'Contratados', value: applicants.filter(a => a.recruiter_action === 'hired').length, color: 'text-emerald-300' },
      ].map(({ label, value, color }, i, arr) => (
        <div key={label} className="flex items-center gap-1">
          <div className="text-center">
            <p className={`font-display text-2xl ${color}`}>{value}</p>
            <p className="text-[9px] uppercase tracking-[0.12em] text-white/30">{label}</p>
          </div>
          {i < arr.length - 1 && <span className="mx-2 text-white/20">→</span>}
        </div>
      ))}
    </div>
  </div>
)}
```

- [ ] **Paso 6: Búsqueda en `HistoryPanel`**

En `HistoryPanel`, agregar estado de filtros y UI de búsqueda. Después del `useState<AnalysisRecord[]>([])`, agregar:

```tsx
const [search, setSearch] = useState('')
const [scoreFilter, setScoreFilter] = useState<'all' | 'high' | 'mid' | 'low'>('all')
```

Antes del `return` del componente, calcular filtered:

```tsx
const filtered = history.filter(h => {
  const nameMatch = !search || (h.candidate_name || h.file_name || '').toLowerCase().includes(search.toLowerCase())
  const scoreMatch = scoreFilter === 'all'
    || (scoreFilter === 'high' && h.ats_score >= 80)
    || (scoreFilter === 'mid' && h.ats_score >= 60 && h.ats_score < 80)
    || (scoreFilter === 'low' && h.ats_score < 60)
  return nameMatch && scoreMatch
})
```

Agregar UI de filtros antes de `<ol className="space-y-4">`:

```tsx
<div className="flex flex-wrap gap-3 mb-4">
  <div className="relative flex-1 min-w-[200px]">
    <input
      value={search}
      onChange={e => setSearch(e.target.value)}
      placeholder="Buscar por nombre o archivo…"
      className="w-full rounded-xl border border-white/10 bg-white/[0.02] px-4 py-2 text-sm text-white placeholder:text-white/30 focus:border-[#c9a84c]/50 focus:outline-none transition"
    />
  </div>
  <div className="flex gap-1.5">
    {(['all', 'high', 'mid', 'low'] as const).map(f => (
      <button
        key={f}
        onClick={() => setScoreFilter(f)}
        className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
          scoreFilter === f ? 'bg-white/10 text-white' : 'border border-white/10 text-white/40 hover:border-white/25'
        }`}
      >
        {f === 'all' ? 'Todos' : f === 'high' ? '80+' : f === 'mid' ? '60-79' : '<60'}
      </button>
    ))}
  </div>
</div>
```

Cambiar `history.map(...)` en el render por `filtered.map(...)`.

- [ ] **Paso 7: Exportar CSV en `ApplicantsPanel`**

En `ApplicantsPanel`, agregar botón "Exportar CSV" junto al botón de "Re-analizar todos". Agregar la función y el botón:

```tsx
const exportCSV = () => {
  const headers = ['Nombre', 'Email', 'ATS Score', 'Fit Score', 'Recomendación', 'Fecha', 'Skills que encajan', 'Skills que faltan']
  const rows = applicants.map(a => [
    a.name,
    a.email,
    a.ats_score ?? '',
    a.fit_score ?? '',
    a.recommendation ?? '',
    new Date(a.applied_at).toLocaleDateString('es-PY'),
    (a.key_matches || []).join('; '),
    (a.key_gaps || []).join('; '),
  ])
  const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `candidatos-${vacancyTitle.replace(/\s+/g, '-')}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// En el JSX, junto al botón "Re-analizar todos", agregar:
{applicants.length > 0 && (
  <button
    onClick={exportCSV}
    className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-xs text-white/50 transition hover:border-white/25 hover:text-white"
  >
    <FileText strokeWidth={1.5} className="h-3.5 w-3.5" /> Exportar CSV
  </button>
)}
```

- [ ] **Paso 8: Eliminar todo texto de "beta" en Recruiters.tsx**

```bash
grep -n "beta\|Beta\|BETA\|acceso anticipado\|período de prueba" /c/proyectos/cvitae-unified/src/pages/Recruiters.tsx
```

Reemplazar cada instancia con texto de producto terminado. Por ejemplo:
- `"Período de prueba"` → `"Plan activo"`
- `"acceso beta"` → `"acceso empresas"`

---

## Tarea 6 — Admin: métricas reales con deltas + scrapers semáforo

**Archivos:**
- Modificar: `netlify/functions/admin-data.ts`
- Modificar: `src/pages/Admin.tsx`

**Interfaces:**
- Consume: `makeSupabaseAdmin()` de `./_supabase.ts`
- Produce:
  ```ts
  // action: "metrics" nueva respuesta:
  {
    usuarios: number,
    oportunidades: number,
    suscriptores: number,
    usuariosHoy: number,
    usuariosEstaSemana: number,
    empresasActivas: number,
  }
  
  // scraper_report (sin cambios en estructura, se agrega estado en frontend)
  ```

- [ ] **Paso 1: Ampliar `metrics` en `admin-data.ts`**

Reemplazar el bloque `if (action === "metrics")` completo:

```typescript
if (action === "metrics") {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
  const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const [usersRes, oppsRes, subsRes, usuariosHoyRes, usuariosSemanRes, empresasRes] = await Promise.all([
    supabase.from("user_master_profiles").select("id", { count: "exact", head: true }),
    supabase.from("opportunities").select("id", { count: "exact", head: true }).eq("is_active", true),
    supabase.from("user_master_profiles").select("id", { count: "exact", head: true }).eq("is_subscribed", true),
    supabase.from("user_master_profiles").select("id", { count: "exact", head: true }).gte("created_at", todayStart),
    supabase.from("user_master_profiles").select("id", { count: "exact", head: true }).gte("created_at", weekStart),
    supabase.from("recruiter_tokens").select("id", { count: "exact", head: true }).eq("is_active", true).gt("token_balance", 0),
  ])

  return {
    statusCode: 200,
    body: JSON.stringify({
      usuarios: usersRes.count || 0,
      oportunidades: oppsRes.count || 0,
      suscriptores: subsRes.count || 0,
      usuariosHoy: usuariosHoyRes.count || 0,
      usuariosEstaSemana: usuariosSemanRes.count || 0,
      empresasActivas: empresasRes.count || 0,
    }),
  }
}
```

- [ ] **Paso 2: Agregar métricas al estado en `Admin.tsx`**

En `Admin.tsx`, encontrar el `useState` de métricas y ampliar el tipo:

```tsx
// ANTES:
const [metrics, setMetrics] = useState({ usuarios: 0, matches: 0, oportunidades: 0, suscriptores: 0 })

// DESPUÉS:
const [metrics, setMetrics] = useState({
  usuarios: 0,
  oportunidades: 0,
  suscriptores: 0,
  usuariosHoy: 0,
  usuariosEstaSemana: 0,
  empresasActivas: 0,
})
```

- [ ] **Paso 3: Actualizar la UI de KPIs del Admin**

Encontrar el bloque donde se renderizan los KPIs (tiene `USUARIOS TOTALES`, `PRO ACTIVOS`, `OPORTUNIDADES`). Reemplazar con:

```tsx
{[
  { label: 'USUARIOS TOTALES', value: metrics.usuarios, sub: 'en base de datos' },
  { label: 'NUEVOS HOY', value: metrics.usuariosHoy, sub: 'registros de hoy' },
  { label: 'ESTA SEMANA', value: metrics.usuariosEstaSemana, sub: 'últimos 7 días' },
  { label: 'PRO ACTIVOS', value: metrics.suscriptores, sub: 'is_subscribed = true' },
  { label: 'OPORTUNIDADES', value: metrics.oportunidades, sub: 'activas' },
  { label: 'EMPRESAS ACTIVAS', value: metrics.empresasActivas, sub: 'con créditos' },
].map(({ label, value, sub }) => (
  <div key={label} style={{ fontFamily: MONO }} className="border border-white/[0.07] p-5">
    <p className="text-[10px] uppercase tracking-[0.2em] text-white/35">{label}</p>
    <p className="mt-2 text-4xl text-[#c9a84c]">{value}</p>
    <p className="mt-1 text-[11px] text-white/30">{sub}</p>
  </div>
))}
```

- [ ] **Paso 4: Semáforo de scrapers en Admin**

En el componente/sección de scrapers del Admin, donde se renderizan las filas de `scraperReport.bySource`, agregar función de estado y color:

```tsx
function scraperStatus(lastSeen: string): { label: string; color: string; dot: string } {
  const hours = (Date.now() - new Date(lastSeen).getTime()) / (1000 * 60 * 60)
  if (hours < 24) return { label: 'Activo', color: 'text-emerald-400', dot: 'bg-emerald-400' }
  if (hours < 168) return { label: 'Desfasado', color: 'text-[#c9a84c]', dot: 'bg-[#c9a84c]' }
  return { label: 'Sin datos', color: 'text-red-400', dot: 'bg-red-400' }
}
```

En el render de cada fila de scraper, agregar columna de estado:
```tsx
const status = scraperStatus(source.lastSeen)
// En la fila agregar:
<td className="px-4 py-2">
  <div className="flex items-center gap-2">
    <span className={`h-2 w-2 rounded-full ${status.dot}`} />
    <span className={`text-xs ${status.color}`}>{status.label}</span>
  </div>
</td>
```

---

## Tarea 7 — Sistema de invitaciones B2B

**Archivos:**
- Crear: `netlify/functions/send-b2b-invite.ts`
- Modificar: `netlify/functions/admin-data.ts`
- Modificar: `src/pages/Admin.tsx`

**Interfaces:**
- Consume: `makeSupabaseAdmin()`, `RESEND_API_KEY`, `ADMIN_PASSWORD`
- Produce:
  ```ts
  // POST a admin-data con action: "list_b2b_prospects"
  // Response: { prospects: B2BProspect[] }
  
  // POST a send-b2b-invite con { password, id }
  // Response: { ok: true, token: string } | { error: string }
  
  interface B2BProspect {
    id: string
    nombre: string
    empresa: string
    email: string
    status: 'pending' | 'invited' | 'activated'
    invited_at: string | null
    activated_at: string | null
    token: string | null
  }
  ```

- [ ] **Paso 1: Crear tabla `b2b_prospects` en Supabase**

Ejecutar en el SQL Editor de Supabase:
```sql
CREATE TABLE IF NOT EXISTS b2b_prospects (
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

Luego insertar los 5 contactos (reemplazar con los datos reales del Google Form):
```sql
INSERT INTO b2b_prospects (nombre, empresa, email, cargo) VALUES
  ('Nombre 1', 'Empresa 1', 'email1@empresa.com', 'RRHH'),
  ('Nombre 2', 'Empresa 2', 'email2@empresa.com', 'Gerente'),
  ('Nombre 3', 'Empresa 3', 'email3@empresa.com', 'RRHH'),
  ('Nombre 4', 'Empresa 4', 'email4@empresa.com', 'Director'),
  ('Nombre 5', 'Empresa 5', 'email5@empresa.com', 'RRHH')
ON CONFLICT (email) DO NOTHING;
```

- [ ] **Paso 2: Agregar `list_b2b_prospects` a `admin-data.ts`**

Después del bloque `if (action === "scraper_report")`, agregar:

```typescript
if (action === "list_b2b_prospects") {
  const { data, error } = await supabase
    .from("b2b_prospects")
    .select("id, nombre, empresa, email, cargo, status, invited_at, activated_at, token, notes, created_at")
    .order("created_at", { ascending: false })
  if (error) throw error
  return { statusCode: 200, body: JSON.stringify({ prospects: data || [] }) }
}
```

- [ ] **Paso 3: Crear `netlify/functions/send-b2b-invite.ts`**

```typescript
import { Handler } from "@netlify/functions"
import { makeSupabaseAdmin } from "./_supabase"

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD!
const RESEND_KEY = process.env.RESEND_API_KEY

async function sendInviteEmail(to: string, nombre: string, empresa: string, token: string): Promise<boolean> {
  if (!RESEND_KEY) { console.error("RESEND_API_KEY not set"); return false }

  const activationUrl = `https://cvitae.lat/empresas?token=${token}`

  const html = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#0a0a0a;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0a0a;min-height:100vh;">
    <tr><td align="center" style="padding:40px 20px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
        <!-- Logo -->
        <tr><td style="padding-bottom:32px;">
          <p style="margin:0;font-family:Georgia,serif;font-size:22px;font-weight:700;color:#c9a84c;letter-spacing:0.02em;">CVitae</p>
          <p style="margin:4px 0 0;font-size:11px;text-transform:uppercase;letter-spacing:0.2em;color:rgba(255,255,255,0.3);">Agente de carrera con IA</p>
        </td></tr>
        <!-- Divider -->
        <tr><td style="padding-bottom:32px;"><div style="height:1px;background:rgba(201,168,76,0.2);"></div></td></tr>
        <!-- Body -->
        <tr><td style="background-color:#111;border:1px solid rgba(255,255,255,0.07);border-radius:16px;padding:40px;">
          <p style="margin:0 0 8px;font-size:11px;text-transform:uppercase;letter-spacing:0.2em;color:rgba(255,255,255,0.35);">Invitación exclusiva</p>
          <h1 style="margin:0 0 24px;font-family:Georgia,serif;font-size:28px;font-weight:400;color:#fff;line-height:1.3;">Hola ${nombre},<br>tu acceso a CVitae está listo.</h1>
          <p style="margin:0 0 16px;font-size:15px;color:rgba(255,255,255,0.65);line-height:1.7;">
            Cuando completaste nuestra encuesta sobre herramientas de RRHH, nos dijiste que uno de los mayores desafíos era filtrar CVs y encontrar candidatos calificados sin perder horas en el proceso.
          </p>
          <p style="margin:0 0 28px;font-size:15px;color:rgba(255,255,255,0.65);line-height:1.7;">
            Hoy CVitae está listo. Y queremos que <strong style="color:#fff;">${empresa}</strong> sea una de las primeras empresas en probarlo — con <strong style="color:#c9a84c;">1 mes completamente gratis</strong>.
          </p>
          <!-- Features -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
            ${[
              'Análisis individual de CVs con IA',
              'Carga masiva de hasta 30 CVs — ranking automático',
              'Vacantes con link de postulación propio',
              'Historial y banco de talento acumulado',
              'Sin tarjeta de crédito requerida',
            ].map(f => `<tr><td style="padding:6px 0;">
              <span style="color:#c9a84c;margin-right:10px;">✓</span>
              <span style="font-size:14px;color:rgba(255,255,255,0.7);">${f}</span>
            </td></tr>`).join('')}
          </table>
          <!-- CTA -->
          <table cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
            <tr><td style="background-color:#c9a84c;border-radius:50px;text-align:center;">
              <a href="${activationUrl}" style="display:inline-block;padding:14px 36px;font-size:14px;font-weight:700;color:#0a0a0a;text-decoration:none;letter-spacing:0.02em;">
                Activar mi acceso →
              </a>
            </td></tr>
          </table>
          <!-- Feedback note -->
          <p style="margin:0 0 8px;font-size:13px;color:rgba(255,255,255,0.45);line-height:1.6;border-top:1px solid rgba(255,255,255,0.07);padding-top:20px;">
            No necesitamos que sea perfecto todavía — necesitamos que nos digas qué le falta. Tu feedback en este mes define el producto.
          </p>
          <p style="margin:0;font-size:13px;color:rgba(255,255,255,0.45);">
            ¿Preguntas? Respondé este correo o escribinos a <a href="mailto:contacto@cvitae.lat" style="color:#c9a84c;text-decoration:none;">contacto@cvitae.lat</a>
          </p>
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding-top:24px;text-align:center;">
          <p style="margin:0;font-size:11px;color:rgba(255,255,255,0.2);">CVitae · cvitae.lat · contacto@cvitae.lat</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "CVitae <contacto@cvitae.lat>",
        to: [to],
        subject: `${nombre}, tu acceso a CVitae está listo — 1 mes gratis`,
        html,
      }),
    })
    if (!res.ok) { const t = await res.text(); console.error("Resend error:", t); return false }
    return true
  } catch (err) {
    console.error("Email send error:", err)
    return false
  }
}

function generateToken(empresa: string): string {
  const slug = empresa.toLowerCase().replace(/[^a-z0-9]+/g, '-').substring(0, 20)
  const rand = Math.random().toString(36).substring(2, 8)
  return `cvitae-b2b-${slug}-${rand}`
}

const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) }
  }

  const { password, id } = JSON.parse(event.body || "{}")
  if (password !== ADMIN_PASSWORD) {
    return { statusCode: 401, body: JSON.stringify({ error: "No autorizado" }) }
  }
  if (!id) {
    return { statusCode: 400, body: JSON.stringify({ error: "id requerido" }) }
  }

  const supabase = makeSupabaseAdmin()

  // Obtener prospect
  const { data: prospect, error } = await supabase
    .from("b2b_prospects")
    .select("*")
    .eq("id", id)
    .single()

  if (error || !prospect) {
    return { statusCode: 404, body: JSON.stringify({ error: "Prospect no encontrado" }) }
  }

  // Generar o reusar token
  const token = prospect.token || generateToken(prospect.empresa || "empresa")

  // Insertar en recruiter_tokens si no existe
  const { data: existing } = await supabase
    .from("recruiter_tokens")
    .select("id")
    .eq("access_token", token)
    .single()

  if (!existing) {
    await supabase.from("recruiter_tokens").insert({
      access_token: token,
      company_name: prospect.empresa || "Empresa",
      email: prospect.email,
      token_balance: 999,
      plan_type: "trial",
      is_active: true,
      created_at: new Date().toISOString(),
    })
  }

  // Actualizar prospect
  await supabase
    .from("b2b_prospects")
    .update({
      status: "invited",
      invited_at: new Date().toISOString(),
      token,
    })
    .eq("id", id)

  // Enviar email
  const sent = await sendInviteEmail(prospect.email, prospect.nombre || "equipo de RRHH", prospect.empresa || "su empresa", token)

  return {
    statusCode: 200,
    body: JSON.stringify({ ok: true, token, emailSent: sent }),
  }
}

export { handler }
```

- [ ] **Paso 4: Agregar auto-activación en `validate-recruiter-token.ts`**

Al inicio del handler, después de que se valida exitosamente el token (línea donde se confirma `data` existe), agregar:

```typescript
// Auto-activar prospect si existe
supabase
  .from("b2b_prospects")
  .update({ status: "activated", activated_at: new Date().toISOString() })
  .eq("token", token.trim())
  .eq("status", "invited")
  .then(() => {}) // fire-and-forget
```

- [ ] **Paso 5: Agregar sección "B2B PROSPECTS" al Admin**

En `Admin.tsx`, agregar un nuevo tab en la lista de tabs existente. Buscar donde están definidos los tabs (array con `id: 'usuarios'`, `id: 'contenido'`, etc.) y agregar:
```tsx
{ id: 'b2b', label: 'B2B PROSPECTS', dotColor: 'bg-emerald-400', badge: prospects.length.toString() }
```

Agregar estado y carga:
```tsx
const [prospects, setProspects] = useState<any[]>([])

// En loadTokens() o en el useEffect principal, agregar:
const prospectsJson = await adminFetch('list_b2b_prospects')
if (prospectsJson?.prospects) setProspects(prospectsJson.prospects)
```

Agregar render de la sección cuando `activeTab === 'b2b'`:
```tsx
{activeTab === 'b2b' && (
  <div className="space-y-4">
    <div className="flex items-center justify-between mb-4">
      <p style={{ fontFamily: MONO }} className="text-xs uppercase tracking-[0.2em] text-white/40">
        {prospects.length} prospectos registrados
      </p>
      <button
        onClick={async () => {
          const pending = prospects.filter(p => p.status === 'pending')
          for (const p of pending) {
            await adminFetch('send_b2b_invite_direct', { id: p.id })
          }
        }}
        className="text-xs border border-[#c9a84c]/30 text-[#c9a84c] px-4 py-2 hover:bg-[#c9a84c]/10 transition"
      >
        Invitar a todos los pendientes
      </button>
    </div>
    {prospects.map(p => {
      const statusColor = p.status === 'activated' ? 'text-emerald-400' : p.status === 'invited' ? 'text-[#c9a84c]' : 'text-white/40'
      return (
        <div key={p.id} className="border border-white/[0.07] p-4 flex items-center justify-between gap-4">
          <div className="flex-1 min-w-0">
            <p style={{ fontFamily: MONO }} className="text-sm text-[#e8e8e0] truncate">{p.nombre} — {p.empresa}</p>
            <p style={{ fontFamily: MONO }} className="text-xs text-white/40 mt-0.5">{p.email}</p>
          </div>
          <span style={{ fontFamily: MONO }} className={`text-[10px] uppercase tracking-[0.15em] ${statusColor} shrink-0`}>
            {p.status}
          </span>
          {p.status === 'pending' && (
            <button
              onClick={async () => {
                await fetch('/.netlify/functions/send-b2b-invite', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ password: adminPassword, id: p.id }),
                })
                const prospectsJson = await adminFetch('list_b2b_prospects')
                if (prospectsJson?.prospects) setProspects(prospectsJson.prospects)
              }}
              className="text-[10px] border border-[#c9a84c]/30 text-[#c9a84c] px-3 py-1.5 hover:bg-[#c9a84c]/10 transition shrink-0"
            >
              Enviar invitación
            </button>
          )}
          {p.invited_at && (
            <p style={{ fontFamily: MONO }} className="text-[10px] text-white/25 shrink-0">
              Invitado: {new Date(p.invited_at).toLocaleDateString('es-PY')}
            </p>
          )}
        </div>
      )
    })}
  </div>
)}
```

Nota: `adminPassword` es el estado que ya existe en Admin.tsx para guardar la contraseña ingresada.

- [ ] **Paso 6: Guardar template de email de referencia**

```bash
mkdir -p /c/proyectos/cvitae-unified/docs/email-templates
```

Crear `docs/email-templates/magic-link.html` con el template HTML completo para configurar en Supabase → Auth → Email Templates:

```html
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#0a0a0a;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0a0a;min-height:100vh;">
    <tr><td align="center" style="padding:40px 20px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
        <tr><td style="padding-bottom:32px;">
          <p style="margin:0;font-family:Georgia,serif;font-size:22px;font-weight:700;color:#c9a84c;letter-spacing:0.02em;">CVitae</p>
          <p style="margin:4px 0 0;font-size:11px;text-transform:uppercase;letter-spacing:0.2em;color:rgba(255,255,255,0.3);">Tu agente de carrera con IA</p>
        </td></tr>
        <tr><td style="padding-bottom:32px;"><div style="height:1px;background:rgba(201,168,76,0.2);"></div></td></tr>
        <tr><td style="background-color:#111;border:1px solid rgba(255,255,255,0.07);border-radius:16px;padding:40px;">
          <p style="margin:0 0 8px;font-size:11px;text-transform:uppercase;letter-spacing:0.2em;color:rgba(255,255,255,0.35);">Acceso a tu cuenta</p>
          <h1 style="margin:0 0 16px;font-family:Georgia,serif;font-size:24px;font-weight:400;color:#fff;line-height:1.4;">Tu enlace de acceso está listo.</h1>
          <p style="margin:0 0 28px;font-size:14px;color:rgba(255,255,255,0.55);line-height:1.7;">Hacé click en el botón para ingresar a CVitae. El enlace es válido por 1 hora y solo puede usarse una vez.</p>
          <table cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
            <tr><td style="background-color:#c9a84c;border-radius:50px;text-align:center;">
              <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:14px 36px;font-size:14px;font-weight:700;color:#0a0a0a;text-decoration:none;letter-spacing:0.01em;">
                Ingresar a CVitae →
              </a>
            </td></tr>
          </table>
          <p style="margin:0;font-size:12px;color:rgba(255,255,255,0.3);line-height:1.6;">Si no solicitaste este acceso, podés ignorar este correo.</p>
        </td></tr>
        <tr><td style="padding-top:24px;text-align:center;">
          <p style="margin:0;font-size:11px;color:rgba(255,255,255,0.2);">CVitae · cvitae.lat · contacto@cvitae.lat</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
```

**Nota para Isaias:** Ir a Supabase → Authentication → Email Templates → Magic Link, y pegar el contenido de este archivo. La variable `{{ .ConfirmationURL }}` es la de Supabase para el enlace mágico.

---

## Tarea 8 — Verificación final y commit

- [ ] **Paso 1: Checklist de "sin beta"**

```bash
grep -rn "beta\|Beta\|BETA\|acceso anticipado\|plazas limitadas\|período de prueba" \
  src/pages/LandingPage.tsx \
  src/pages/Recruiters.tsx \
  src/pages/About.tsx
```

Resultado esperado: sin matches en páginas públicas.

- [ ] **Paso 2: Checklist de criterios de aceptación**

Verificar en `http://localhost:8888`:
- [ ] El analizador devuelve score real (diferente para cada CV)
- [ ] No aparece "beta" en la landing ni en `/empresas`
- [ ] `/sobre-cvitae` abre Without 404
- [ ] `/about` redirige a `/sobre-cvitae`
- [ ] `http://localhost:8888/robots.txt` contiene `GPTBot` y `Claude-Web`
- [ ] `http://localhost:8888/llms.txt` muestra el contenido de CVitae
- [ ] FAQ schema en `index.html` dice "USD 9/mes"
- [ ] Configuracion.tsx muestra email real del usuario
- [ ] Configuracion.tsx muestra plan Free con botón de upgrade

- [ ] **Paso 3: Verificar funciones nuevas en local**

```bash
# Probar analyze-cv-public
curl -X POST http://localhost:8888/.netlify/functions/analyze-cv-public \
  -H "Content-Type: application/json" \
  -d '{"cvText":"Juan López\nAnalista de Datos\n5 años experiencia en SQL, Python, Power BI\nLicenciado en Estadística UNA 2019\nProyectos: dashboard ventas retail, modelo predicción churn"}'

# Probar list_b2b_prospects (después de crear la tabla y datos en Supabase)
# Desde el Admin en localhost

# Probar send-b2b-invite (con un prospect real de la tabla)
curl -X POST http://localhost:8888/.netlify/functions/send-b2b-invite \
  -H "Content-Type: application/json" \
  -d '{"password":"TU_ADMIN_PASSWORD","id":"UUID_DEL_PROSPECT"}'
```

- [ ] **Paso 4: Commit único**

```bash
cd /c/proyectos/cvitae-unified
git status
git add public/robots.txt public/llms.txt index.html
git add src/App.tsx src/pages/About.tsx src/pages/LandingPage.tsx
git add src/pages/Recruiters.tsx src/pages/Admin.tsx src/hub/Configuracion.tsx
git add netlify/functions/analyze-cv-public.ts
git add netlify/functions/send-b2b-invite.ts
git add netlify/functions/admin-data.ts
git add netlify/functions/validate-recruiter-token.ts
git add docs/
git status
git commit -m "$(cat <<'EOF'
feat: CVitae v1.0 — landing clara, analizador real, B2B sin beta, Admin renovado, invitaciones B2B, SEO/GEO

- Landing: hero con propuesta de valor directa, analizador con IA real (Haiku), free tier correcto, sin beta
- Analizador público: nueva función analyze-cv-public con Claude Haiku, score ATS real, rate limit por IP
- B2B: sin lenguaje de beta, BUG-03 fix (sessionStorage), dashboard KPIs, embudo pipeline, búsqueda historial, exportar CSV, token por URL
- Admin: métricas con deltas (usuariosHoy, semana, empresasActivas), scrapers con semáforo de estado, sección B2B Prospects
- Invitaciones B2B: tabla b2b_prospects, función send-b2b-invite, email branded con Resend, auto-activación
- SEO/GEO: robots.txt con bots AI, llms.txt nuevo, FAQ schema corregido USD 9, canonical /sobre-cvitae
- BUG-06: Configuracion.tsx muestra email y plan reales + CTA upgrade Pro

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Acciones manuales (fuera del repo)

Estas acciones no son código — se hacen directamente en las plataformas:

1. **Supabase SQL:** Ejecutar `CREATE TABLE b2b_prospects` e insertar los 5 contactos (Tarea 7, Paso 1)
2. **Supabase Auth Templates:** Copiar el HTML de `docs/email-templates/magic-link.html` al template de Magic Link en Supabase Dashboard
3. **Supabase SQL (limpieza de datos):** Ejecutar las queries de limpieza de fechas absurdas y duplicados documentadas en `project_cvitae_pending.md`
