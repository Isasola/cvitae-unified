# 📊 ANÁLISIS SISTEMÁTICO COMPLETO - CVitae B2C/B2B
**Fecha:** 2026-11-19  
**Metodología:** Systematic Debugging (Superpowers)  
**Objetivo:** Pulido completo pre-lanzamiento

---

## 🔴 PROBLEMAS CRÍTICOS (Bloquean lanzamiento)

### 1. **CALIDAD POBRE DEL CV GENERADO** ⚠️ CRÍTICO
**Problema confirmado con screenshots:**
- CV original: Rico en métricas (15+ programas, 500+ personas), experiencias detalladas con bullets
- CV CVitae: Contenido genérico, solo lista de habilidades, FALTA experiencia profesional completa

**Root Cause:**
```typescript
// netlify/functions/generate-cv-vivo.ts línea 155
const cvMarkdown = await invokeModel(prompt, 1500)
```

**Problemas identificados:**
1. **Max tokens muy bajo:** 1500 tokens insuficiente para CVs ricos
2. **Prompt genérico:** No fuerza extracción completa de experiencias
3. **Sin validación:** No verifica que el perfil tenga toda la info cargada
4. **Sin ejemplos:** Prompt no tiene ejemplos de calidad esperada

**Impacto:** 🔴 **BLOQUEANTE** - CVs pobres = usuarios no recomiendan el producto

**Solución propuesta:**
```typescript
// Cambios necesarios:
1. Aumentar max_tokens: 1500 → 3000 (permite CVs completos)
2. Mejorar prompt con:
   - Instrucción explícita: "Extraé TODA la experiencia profesional, no resumas"
   - Forzar bullets por cada rol: "Mínimo 3 logros cuantificados por experiencia"
   - Ejemplos concretos de formato rico
   - Validación de completitud antes de generar
3. Agregar paso previo: verificar que profile.experience[] tenga datos
4. Mejorar rendering visual (secundario pero suma):
   - Destacar métricas numéricas con formato especial
   - Usar iconos/bullets más visibles
   - Mejor jerarquía tipográfica
```

**Código de solución detallada preparada para aplicar después de tu aprobación.**

---

### 2. **ERROR 503/504 en Diagnóstico ATS** ⚠️ CRÍTICO
**Problema reportado:**
```
Error: "El proveedor no pudo completar el análisis"
Console: /.netlify/functions/cv-ats-workspace → 503/504
```

**Root Cause probable:**
- Función no encontrada en codebase actual → componente faltante o ruta incorrecta
- Si existe: timeout de Netlify (30s límite) + modelo lento

**Investigación pendiente:**
- No encontré `cv-ats-workspace.ts` en `/netlify/functions/`
- No encontré componente `ATSDiagnostic.tsx` en `/src/hub/`
- Posible función deprecada o renombrada

**Pregunta:** ¿Diagnóstico ATS es una función activa? ¿Está en otra ubicación?

**Solución temporal:** Verificar si esta función existe o fue reemplazada por `analyze-cv-candidate.ts`

---

### 3. **ERROR en "Mejorar CV"** ⚠️ CRÍTICO
**Problema reportado:**
- A veces: "Algo salió mal"
- Console: Error 500/504 en `generate-cv-vivo`
- Falta: Poder subir CV nuevo (solo usa versiones guardadas)
- UX confuso

**Root Cause probable:**
1. Misma función que Task #1 (`generate-cv-vivo.ts`)
2. Errores por timeout o max_tokens bajo
3. No hay upload de CV nuevo → solo regenera desde perfil existente

**Solución:**
- Mismo fix que Task #1 (aumentar tokens, mejorar prompt)
- Agregar opción de subir CV nuevo
- Mejorar UX con estados claros (loading, error, success)
- Agregar retry automático en caso de timeout

---

## 🟡 PROBLEMAS ALTOS (Afectan UX significativamente)

### 4. **Botón "Oportunidades" sale del perfil (B2C)** ✅ ROOT CAUSE ENCONTRADO
**Problema:**
```tsx
// src/App.tsx línea 54
<Route path="/mi-carrera/oportunidades">
  <Redirect to="/oportunidades" />
</Route>
```
Manda a página pública en vez de dashboard privado.

**Solución:** ELIMINAR botón del sidebar (redundante, dashboard ya muestra oportunidades)

**Código:**
```tsx
// src/components/cvitae/DashboardLayout.tsx línea 12-19
// ELIMINAR esta línea:
{ href: '/mi-carrera/oportunidades', label: 'Oportunidades', icon: Briefcase },
```

---

### 5. **Botones "Atrás" mandan al index (B2C)**
**Problema:** Algunos botones Atrás salen del dashboard a página principal

**Root Cause:** Uso inconsistente de navegación
- Algunos usan: `<a href="/">` (sale del dashboard)  
- Correcto: `<Link href="/mi-carrera">` (vuelve al dashboard)

**Solución:** Auditar TODOS los botones Atrás y usar routing consistente

**Archivos a revisar:**
- `/src/hub/*.tsx` - todos los componentes del dashboard
- Buscar: `href="/"` y reemplazar por `href="/mi-carrera"` donde corresponda

---

### 6. **Botón "pedir saldo" permite múltiples clicks (B2B)** 🟡 ALTO
**Problema:** Se puede apretar varias veces → llegan múltiples mensajes

**Root Cause:** No hay estado de loading/disabled después del primer click

**Solución:**
```tsx
// Patrón a aplicar:
const [requesting, setRequesting] = useState(false)

const handleRequestBalance = async () => {
  if (requesting) return
  setRequesting(true)
  try {
    await sendBalanceRequest()
    // Mostrar check visual de "Solicitud enviada"
  } finally {
    setRequesting(false)
  }
}

<button 
  onClick={handleRequestBalance}
  disabled={requesting}
  className={requesting ? 'opacity-50 cursor-not-allowed' : ''}
>
  {requesting ? '✓ Solicitado' : 'Pedir saldo'}
</button>
```

---

### 7. **Botón "Atrás" sale de B2B al index**
**Mismo problema que Task #5, pero en vistas B2B**

**Solución:** 
```tsx
// Cambiar:
<a href="/">← Atrás</a>

// Por:
<Link href="/empresas/dashboard">← Atrás</Link>
```

---

## 🟢 MEJORAS UX (No bloquean pero suman mucho)

### 8. **Guardar token B2B (mejora comodidad)**
**Sugerencia:** Permitir guardar token de empresa para no ingresarlo siempre

**Solución:**
```typescript
// Usar localStorage de forma segura:
// 1. Guardar token hasheado (no plain text)
// 2. Validar en cada sesión
// 3. Expirar después de 7 días

const saveToken = (token: string) => {
  const expiry = Date.now() + 7 * 24 * 60 * 60 * 1000 // 7 días
  localStorage.setItem('cvitae_b2b_token', JSON.stringify({ 
    token: btoa(token), // encoding simple
    expiry 
  }))
}

const getToken = () => {
  const stored = localStorage.getItem('cvitae_b2b_token')
  if (!stored) return null
  const { token, expiry } = JSON.parse(stored)
  if (Date.now() > expiry) {
    localStorage.removeItem('cvitae_b2b_token')
    return null
  }
  return atob(token)
}
```

**Nota:** Solo para comodidad, NO para seguridad (usuario debe poder regenerar token siempre)

---

### 9. **Vista "Historial" B2B - mostrar CV + vacante**
**Sugerencia:** En historial debería verse el CV del candidato Y para qué llamado postuló

**Solución:** Modificar query/UI para incluir ambos datos
```tsx
// Agregar columnas en tabla:
<td>
  <button onClick={() => viewCV(applicant.cv_id)}>Ver CV</button>
</td>
<td>{applicant.vacancy_title}</td>
```

---

### 10. **Vista "Mis vacantes" UX (B2B)**
**Sugerencia:** Si ya hay vacante, mostrarla arriba. "Crear vacante" abajo expandible.

**Wireframe UX:**
```
┌─────────────────────────────┐
│ ✅ Vacante activa:          │
│ Ejecutivo Comercial         │
│ [Ver postulantes] [Editar]  │
└─────────────────────────────┘
         ↓
┌─────────────────────────────┐
│ + Crear nueva vacante       │ ← expandible
└─────────────────────────────┘
```

**Código:**
```tsx
const [showCreateForm, setShowCreateForm] = useState(false)

{vacancies.length > 0 && (
  <div className="space-y-4">
    {vacancies.map(v => (
      <VacancyCard key={v.id} vacancy={v} />
    ))}
  </div>
)}

<button 
  onClick={() => setShowCreateForm(!showCreateForm)}
  className="w-full"
>
  + Crear nueva vacante
</button>

{showCreateForm && <CreateVacancyForm />}
```

---

### 11. **Sistema de estados de candidatos (B2B)**
**Sugerencia:** Al marcar "Contactado", mostrar lista filtrada por estado

**Solución:**
```tsx
// Agregar tabs de filtrado:
const [statusFilter, setStatusFilter] = useState<Status | 'all'>('all')

<div className="flex gap-2">
  <Tab active={statusFilter === 'all'} onClick={() => setStatusFilter('all')}>
    Todos ({candidatos.length})
  </Tab>
  <Tab active={statusFilter === 'contactado'}>
    Contactado ({contactados.length})
  </Tab>
  <Tab active={statusFilter === 'entrevistando'}>
    Entrevistando ({entrevistando.length})
  </Tab>
  {/* etc */}
</div>

<CandidateList 
  candidates={
    statusFilter === 'all' 
      ? candidatos 
      : candidatos.filter(c => c.status === statusFilter)
  } 
/>
```

---

### 12. **Campo celular en resultado (B2B)**
**Sugerencia:** Mostrar número de celular del candidato si se capturó

**Investigación:** Verificar si formulario de postulación captura celular

**Solución:** Agregar campo en UI:
```tsx
<div className="candidate-contact">
  <Mail size={16} /> {candidate.email}
  {candidate.phone && (
    <Phone size={16} /> {candidate.phone}
  )}
</div>
```

---

### 13. **Sistema de correos automáticos (B2B)**
**Pregunta:** ¿Se envían correos cuando alguien postula?

**Investigación pendiente:** Buscar triggers de email en:
- Supabase triggers
- Netlify functions
- n8n workflows

**Correos deseados:**
1. Al candidato: "Tu postulación fue recibida"
2. Al empleador: "Nuevo candidato postuló a [vacante]"

**Solución:** Configurar triggers o usar servicio de email (ej: Resend, SendGrid)

---

### 14. **Recálculos innecesarios al actualizar página**
**Problema:** Funciones Netlify se ejecutan en cada refresh

**Root Cause:** useEffect sin dependencies o con dependencies incorrectas

**Solución:**
```tsx
// MAL:
useEffect(() => {
  fetchOpportunities()
}, []) // Se ejecuta en cada mount

// BIEN:
useEffect(() => {
  const lastFetch = localStorage.getItem('last_opportunities_fetch')
  const ONE_DAY = 24 * 60 * 60 * 1000
  
  if (!lastFetch || Date.now() - parseInt(lastFetch) > ONE_DAY) {
    fetchOpportunities()
    localStorage.setItem('last_opportunities_fetch', Date.now().toString())
  }
}, [])
```

**Implementar caché inteligente:**
- CV/perfil: solo refetch al editar
- Oportunidades: 1x al día
- Matches: 1x al día o al editar perfil

---

### 15. **Optimización cv-ats-workspace.ts (modelo + timeouts)**
**Si la función existe, aplicar:**
```typescript
// Cambiar:
MODEL_ID: "global.anthropic.claude-sonnet-4-6"
max_tokens: 3000
timeout: 25000

// A:
MODEL_ID: "global.anthropic.claude-haiku-4-5-20251001-v1:0" // 10x más rápido
max_tokens: 2000
timeout: 18000 // margen dentro de 30s Netlify
```

**Beneficio:** ~10x más rápido + ~90% más barato

---

### 16. **Sección "Aprender" / Cursos Recomendados** ✅ FUNCIONA BIEN
**Estado:** Implementada y funcional en Dashboard (sidebar derecho)

**Funcionalidad actual:**
- Usa Gemini AI para recomendar cursos personalizados
- Analiza skills faltantes del usuario
- Muestra cursos de plataformas reales (Udemy, Coursera, etc)
- Se adapta a la ruta de carrera elegida

**Código:**
```tsx
// src/hub/Dashboard.tsx líneas 530-572
// Llama a: netlify/functions/gemini-courses.ts
```

**Sugerencias de mejora UX:**
1. **Agregar filtros:** Por plataforma, duración, nivel
2. **Mostrar precio:** Gratis vs Pagado
3. **Guardar favoritos:** Permitir marcar cursos para después
4. **Progreso:** Si el usuario ya hizo un curso, marcarlo como completado
5. **Link directo:** Botón "Inscribirme" que abra en nueva pestaña
6. **Feedback:** "¿Este curso te sirvió?" para mejorar recomendaciones

**Estado:** 🟢 NO BLOQUEANTE - Funciona bien, mejoras son opcionales

---

## 💰 ANÁLISIS ENCUESTA + PRECIO B2B

### Datos de encuesta (9 respuestas, 5 interesados en beta)

**Perfil de empresas:**
- 44% abre 3-10 vacantes/mes
- 33% abre <3 vacantes/mes
- 44% invierte >Gs. 2M/mes en selección
- 44% usa solo canales gratuitos

**Dolor principal:**
- 33% pierde 5-14 hrs/proceso en trabajo manual
- 33% pierde <5 hrs
- 55% reporta pérdida de ventas/retrasos operativos si vacante desierta

**Percepción de precio Gs. 500k/mes (≈USD 67):**
- 44% dice "Excelente"
- 44% dice "Razonable"
- 11% "No pagaría"

**Features más valoradas:**
- 77% quiere "% de compatibilidad con explicación detallada"
- 55% quiere "coordinar agendas" (mayor pérdida de tiempo)

---

### 🎯 JUSTIFICACIÓN USD 67/mes

**Comparación de mercado:**
- **Portales tradicionales:** Gs. 300k+ por anuncio individual (USD 40+)
  - Resultado: inundan email con PDFs desordenados
  - Sin análisis inteligente
  
- **Consultoras RRHH:** Gs. 2.7M+ por proceso (USD 360+)
  - Resultado: alta calidad pero muy caro
  
- **CVitae B2B:** Gs. 500k/mes = USD 67/mes
  - **Uso ilimitado** (vs 1 anuncio en portales)
  - **IA analiza y rankea** (vs PDF manuales)
  - **Ahorro promedio:** 10+ hrs/proceso × 3 procesos/mes = 30 hrs ahorradas
  - **ROI:** Si HR cobra USD 10/hr → ahorra USD 300/mes, paga USD 67 → 348% ROI

**Valor agregado vs competencia:**
1. **Análisis IA:** Score de compatibilidad con explicación (competencia no tiene)
2. **Ilimitado:** Vs 1 anuncio pagado en portales
3. **Integrado:** Un solo sistema vs múltiples herramientas
4. **Tiempo real:** Candidatos llegan ya analizados

**Recomendación:** 
- **Precio OK:** USD 67 está bien posicionado
- **Agregar tier superior:** USD 120/mes con features premium:
  - Entrevistas automáticas por IA
  - Video-presentaciones de candidatos
  - Integración WhatsApp Business
  - Soporte prioritario

---

## 🔍 SEO - Problemas Search Console

**Reportado:**
- Soft 404: 56 páginas
- Not found 404: 1,847 páginas
- Excluded by noindex: 1,675
- Blocked by robots.txt: 455
- Crawled - currently not indexed: 848

**Investigación pendiente:** 
- Revisar `robots.txt`
- Auditar meta tags `noindex`
- Identificar qué páginas dan Soft 404

**Skill disponible:** `seo-technical` - usar para análisis completo

---

## 📋 RESUMEN EJECUTIVO

### 🔴 Crítico (hacer ANTES de lanzar):
1. ✅ Mejorar calidad CV generado (prompt + tokens)
2. ⚠️ Investigar/Fix Diagnóstico ATS (¿existe?)
3. ✅ Fix "Mejorar CV" errores

### 🟡 Alto (hacer en mismo deploy):
4. ✅ Eliminar botón Oportunidades sidebar
5. ✅ Fix botones Atrás (B2C + B2B)
6. ✅ Fix botón pedir saldo (doble click)

### 🟢 Mejoras UX (hacer después):
7. Guardar token B2B
8. Vista Historial completa
9. UX Mis Vacantes
10. Sistema estados candidatos
11. Campo celular
12. Correos automáticos
13. Optimizar recálculos
14. Optimizar timeouts

### 💰 Estrategia B2B:
- **Precio USD 67:** APROBADO (buen posicionamiento)
- **5 empresas interesadas:** Lista para beta
- **Next:** Preparar demo + oferta 3 meses con descuento por feedback

---

## 🎥 ESTRATEGIA DE CONTACTO EMPRESAS BETA

### **5 Empresas Interesadas:**
1. **Vitalmed SA** - Fanny Mendoza - 0984638102 - fannyjuliamendozapenayo@gmail.com
2. **Grupo Dicsa S.A** - Sofia Raquel Villamayor Rodas - 0974568257 - dicsarrhh2022@gmail.com
3. **IMUT** - Alberto Gaona - 0981436997 - accesotalento@gmail.com
4. **Quality Travel** - Jonathan Amarilla - 0992685795 - ventas@qualitygroup.com.py
5. **Manantial S.R.L.** - Carlos Keudell - 0981347637 - aguamineral7colinas@gmail.com

### **Script para Video Demo (2-3 minutos)**

**ESTRUCTURA:**

**Intro (15 seg):**
```
"Hola [Nombre], soy Isaias de CVitae. 
Vi que te interesa optimizar tu proceso de selección. 
Te muestro en 2 minutos cómo CVitae te ahorra 30+ horas al mes."
```

**Problema (20 seg):**
```
"Sabemos que cada vacante te toma 5-14 horas de trabajo manual:
- Descargar PDFs del correo
- Ordenar en Excel
- Leer CV por CV
- Coordinar llamadas

Y si la vacante queda desierta 25+ días, perdés ventas o pagás horas extras."
```

**Demo en vivo (90 seg):**
```
1. [Pantalla: Crear vacante]
   "Publicás tu vacante en 30 segundos."

2. [Pantalla: Candidatos llegan]
   "Los candidatos postulan desde el link que compartís."

3. [Pantalla: IA analiza]
   "CVitae analiza cada CV automáticamente y te da un score de 0-100."

4. [Pantalla: Lista rankeada]
   "Ves los mejores candidatos primero, con explicación de por qué encajan."

5. [Pantalla: Ver CV completo]
   "Un click y ves el CV completo + contact info."
```

**Cierre (30 seg):**
```
"CVitae es USD 67/mes, uso ilimitado.
Vs portales que cobran USD 40 por anuncio sin análisis.

Te ofrezco:
✅ 3 meses a USD 50/mes (25% descuento)
✅ A cambio de feedback semanal
✅ Empezás con una vacante real de [empresa]

¿Te parece que agendemos 15 min esta semana para que lo pruebes?"
```

**HERRAMIENTAS PARA GRABAR:**
- Loom (gratis, fácil)
- OBS Studio (más profesional)
- Zoom (grabar presentación)

**TIPS:**
- Usar vacante de ejemplo creíble (ej: "Vendedor para retail")
- Mostrar 3-4 candidatos ficticios pero realistas
- Enfatizar "ves el mejor candidato en 10 segundos vs 2 horas"

---

### **Email de Contacto (plantilla)**

**Asunto:** [Nombre empresa] - CVitae B2B: Probá gratis tu primera vacante

```
Hola [Nombre],

Gracias por tu interés en CVitae durante la encuesta.

Soy Isaias, fundador de CVitae. Desarrollamos una plataforma que lee CVs con IA y te da los mejores candidatos rankeados automáticamente.

**Te ahorras 10+ horas por proceso.**

Te grabé un video de 2 minutos mostrando cómo funciona:
[LINK AL VIDEO]

**Propuesta para [Empresa]:**
✅ Probás gratis tu próxima vacante real
✅ Si te sirve: 3 meses a USD 50/mes (25% descuento vs USD 67)
✅ A cambio de feedback semanal rápido

Solo tengo 5 cupos para beta. 

¿Agendamos 15 min esta semana para que lo pruebes?

Podés responder este email o escribirme al WhatsApp: +595 992 954 169

Saludos,
Isaias Solaeche
Fundador, CVitae
cvitae.lat/empresas
```

---

### **WhatsApp Script (alternativa directa)**

```
Hola [Nombre]! Soy Isaias de CVitae 👋

Vi que te interesó la plataforma de selección con IA en la encuesta.

Te grabé un demo rápido (2 min) para que veas cómo funciona:
[LINK VIDEO]

Básicamente: la IA lee los CVs y te da los mejores candidatos rankeados.
Te ahorrás 10+ horas por proceso.

Tengo 5 cupos beta para probar gratis con una vacante real de [Empresa].

Si te sirve → 3 meses a USD 50/mes (descuento 25%)

¿Te parece útil? ¿Cuándo podemos agendar 15 min?
```

---

## 🎬 PRÓXIMOS PASOS

**Esperando tu aprobación para:**
1. ✅ ¿Aplicar fixes críticos en un solo commit?
2. ⚠️ ¿Investigar si Diagnóstico ATS existe o fue deprecado?
3. 📊 ¿Usar skill SEO para análisis profundo?
4. 🎥 ¿Grabar video demo con estas pautas?
5. 📧 ¿Enviar emails a las 5 empresas?

**NO DEPLOY hasta tu confirmación de cada punto.**

---

## 📝 CHECKLIST FINAL PRE-LANZAMIENTO

### 🔴 Crítico (DEBE estar antes de contactar empresas):
- [ ] Fix calidad CV generado (prompt mejorado + 3000 tokens)
- [ ] Verificar/Fix Diagnóstico ATS
- [ ] Fix error "Mejorar CV"
- [ ] Test end-to-end B2B: crear vacante → recibir postulante → ver análisis

### 🟡 Alto (hacer en mismo deploy):
- [ ] Eliminar botón Oportunidades del sidebar
- [ ] Fix todos los botones "Atrás"
- [ ] Fix botón "pedir saldo" (evitar doble click)

### 🟢 Nice-to-have (pueden esperar):
- [ ] Guardar token B2B
- [ ] Mejorar UX vistas B2B
- [ ] Correos automáticos
- [ ] SEO fixes

### 🎥 Marketing:
- [ ] Grabar video demo 2-3 min
- [ ] Preparar email/WhatsApp templates
- [ ] Agendar llamadas con 5 empresas

**Estado actual:** Análisis completo ✅ | Fixes pendientes ⏳ | NO DEPLOY ⚠️
