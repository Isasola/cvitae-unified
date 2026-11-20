# Cambios Implementados - Verificación Punto por Punto

> **ESTADO:** En verificación QA (2026-11-20 a 2026-11-27)
> 
> **PROCESO:** Ir número por número, verificar funcionamiento, cuando se confirma → mover a MANUAL_FUNCIONAMIENTO.md

---

## CATEGORÍA 1: CV Generation & Quality

### ✅ #1 - Aumentar tokens para CV más extensos
**Commit:** d1b395a1  
**Cambio realizado:**
- `max_tokens: 1500` → `max_tokens: 3000` en `generate-cv-vivo.ts`

**Estado verificación:** ❌ NO FUNCIONA COMO ESPERADO
- CVs siguen siendo resumidos a pesar de 3000 tokens
- Falta instrucciones en prompt para expandir

**Archivo:** `netlify/functions/generate-cv-vivo.ts:324`

**Siguiente paso:** Modificar prompt (post-cuarentena)

---

### ⬜ #2 - Prompt mejorado para CVs con más detalle
**Commit:** d1b395a1 (incompleto)  
**Cambio realizado:**
- Se aumentaron tokens pero NO se modificó el prompt

**Estado verificación:** ❌ NO IMPLEMENTADO
- Falta agregar: "NO RESUMIR NADA"
- Falta agregar: "MÍNIMO 3-4 logros cuantificados por rol"
- Falta agregar: "Explicar funciones DETALLADAMENTE"

**Archivo:** `netlify/functions/generate-cv-vivo.ts:280-322`

**Siguiente paso:** Agregar instrucciones explícitas (post-cuarentena)

---

## CATEGORÍA 2: SEO & Indexación

### ✅ #3 - JobPosting structured data
**Commit:** d1b395a1  
**Cambio realizado:**
- Agregado schema JobPosting en `OpportunityDetail.tsx`
- Incluye: title, description, datePosted, validThrough, employmentType, etc.

**Estado verificación:** ⏳ ESPERANDO DATOS (7-14 días)

**Archivo:** `src/pages/OpportunityDetail.tsx:~50-80`

**Qué monitorear:**
- Google Search Console → Mejoras → Ofertas de empleo
- Rich results test: https://search.google.com/test/rich-results

---

### ✅ #4 - Canonical tags en páginas de empleos
**Commit:** d1b395a1  
**Cambio realizado:**
- Agregado `<link rel="canonical" href={...} />` en OpportunityDetail

**Estado verificación:** ⏳ ESPERANDO DATOS (7-14 días)

**Archivo:** `src/pages/OpportunityDetail.tsx`

**Qué monitorear:**
- Google Search Console → Cobertura → Duplicados
- Verificar que no haya páginas marcadas como "Duplicada, no seleccionada como canónica"

---

### ✅ #5 - Meta descriptions dinámicas
**Commit:** d1b395a1  
**Cambio realizado:**
- Meta description generada desde `opportunity.cuerpo.substring(0, 155)`

**Estado verificación:** ⏳ ESPERANDO DATOS (7-14 días)

**Archivo:** `src/pages/OpportunityDetail.tsx`

**Qué monitorear:**
- Google Search Console → Mejoras → Fragmentos de texto
- CTR en resultados de búsqueda

---

### ✅ #6 - Sitemap regenerado (solo empleos activos)
**Commit:** d1b395a1  
**Cambio realizado:**
- Agregado filtro `.gte('fecha_vencimiento', todayISO)` en `generate-sitemap.mjs`
- Límite aumentado de 200 a 5000

**Estado verificación:** ⏳ ESPERANDO DATOS (7-14 días)

**Archivo:** `scripts/generate-sitemap.mjs:~40`

**Qué monitorear:**
- Google Search Console → Sitemaps → Errores 404
- Antes: 1,847 errores 404
- Meta: 0 errores 404

---

## CATEGORÍA 3: Navegación & UX

### ✅ #7 - Eliminar botón "Oportunidades" redundante del sidebar
**Commit:** d1b395a1  
**Cambio realizado:**
- Removido botón duplicado en `DashboardLayout.tsx:15`

**Estado verificación:** ⏳ PENDIENTE PRUEBA MANUAL

**Archivo:** `src/components/cvitae/DashboardLayout.tsx`

**Cómo probar:**
1. Login B2C → ir a `/mi-carrera`
2. Ver sidebar
3. Verificar que NO hay dos botones "Oportunidades"

---

### ✅ #8 - Fix navegación B2B (todos los hrefs apuntan a /empresas)
**Commit:** d1b395a1  
**Cambio realizado:**
- Cambiados todos los `href="/"` → `href="/empresas"` en `Recruiters.tsx`

**Estado verificación:** ⏳ PENDIENTE PRUEBA MANUAL

**Archivo:** `src/pages/Recruiters.tsx`

**Cómo probar:**
1. Login B2B → ir a `/empresas`
2. Hacer click en botones/links del header
3. Verificar que NO redirige a landing (debería quedarse en /empresas)

---

## CATEGORÍA 4: Features B2B

### ✅ #9 - Botón "Pedir saldo" con protección doble-click
**Commit:** 75edeb5d  
**Cambio realizado:**
- Agregado estado `requesting` y `requested` en `Recruiters.tsx`
- Deshabilitado durante envío

**Estado verificación:** ⏳ PENDIENTE PRUEBA MANUAL

**Archivo:** `src/pages/Recruiters.tsx:102-103`

**Cómo probar:**
1. Login B2B → tab principal
2. Click rápido 2 veces en "Pedir saldo"
3. Verificar que solo envía 1 email (revisar inbox contacto@cvitae.lat)

---

### ✅ #10 - Dashboard de Analytics B2B
**Commit:** 5f43b683  
**Cambio realizado:**
- Agregado `AnalyticsPanel` con:
  - Funnel de conversión (Postulantes → Analizados → Para llamar)
  - Gráfico de actividad 30 días
  - Desglose por fuente (postulaciones directas, links, uploads manuales)
- Backend: acción `get_analytics` en `validate-recruiter-token.ts`

**Estado verificación:** ⏳ PENDIENTE PRUEBA MANUAL

**Archivos:**
- `src/pages/Recruiters.tsx:~400-550` (AnalyticsPanel component)
- `netlify/functions/validate-recruiter-token.ts:239-269` (get_analytics action)

**Cómo probar:**
1. Login B2B → tab "Reportes"
2. Verificar que carga:
   - Funnel con números reales
   - Gráfico con barras animadas
   - Desglose de fuentes

---

### ✅ #11 - Pipeline visual drag & drop
**Commit:** d66b17e7  
**Cambio realizado:**
- Agregado componente `PipelineBoard` con drag & drop HTML5
- 5 columnas: Nuevo (pending), Contactado (contacted), Entrevistando (interviewing), Contratado (hired), Descartado (rejected)
- Persiste estado en `vacancy_applications.recruiter_action`

**Estado verificación:** ⏳ PENDIENTE PRUEBA MANUAL

**Archivo:** `src/pages/Recruiters.tsx:~700-920`

**Cómo probar:**
1. Login B2B → seleccionar vacante → ver postulantes
2. Toggle "Pipeline"
3. Arrastrar candidato de "Nuevo" a "Contactado"
4. Refrescar página
5. Verificar que candidato sigue en "Contactado"

---

### ✅ #12 - Integración calendario (Google + Outlook)
**Commit:** 3c010cb9  
**Cambio realizado:**
- Agregado componente `CalendarScheduler` modal
- Genera deep-links para Google Calendar y Outlook
- Pre-población: título, candidato email, fecha/hora, duración, notas

**Estado verificación:** ⏳ PENDIENTE PRUEBA MANUAL

**Archivo:** `src/pages/Recruiters.tsx:~580-680`

**Cómo probar:**
1. Login B2B → Pipeline o Lista → expandir candidato
2. Click "Agendar"
3. Seleccionar fecha/hora/duración
4. Click "Google Calendar"
5. Verificar que abre nueva pestaña con evento pre-poblado

---

### ✅ #13 - Sistema de notas colaborativas
**Commit:** cc0e4dda  
**Cambio realizado:**
- Agregado textarea expandible para notas por candidato
- Timestamp automático en formato `[DD/MM/YYYY HH:mm]`
- Persistencia en `vacancy_applications.recruiter_notes`
- Historial de notas separadas por `\n\n`

**Estado verificación:** ⏳ PENDIENTE PRUEBA MANUAL

**Archivo:** `src/pages/Recruiters.tsx:~1340-1400`

**Cómo probar:**
1. Login B2B → expandir candidato (vista lista)
2. Click "+ Agregar nota"
3. Escribir texto → "Guardar nota"
4. Refrescar página
5. Verificar que nota persiste con timestamp

---

## CATEGORÍA 5: Emails & Comunicación

### ✅ #14 - Email post-aplicación con CTAs B2C
**Commit:** 9924058e  
**Cambio realizado:**
- Agregado sección "Mientras esperás respuesta" en email de confirmación
- CTAs: CVs ilimitados, Diagnóstico ATS, Matching inteligente, Alertas personalizadas

**Estado verificación:** ⏳ PENDIENTE PRUEBA MANUAL

**Archivo:** `netlify/functions/submit-lead.ts:~80-120`

**Cómo probar:**
1. Postular a una vacante desde `/vacante/:slug`
2. Revisar inbox del email usado
3. Verificar que email incluye sección con features B2C

---

## CATEGORÍA 6: Recomendaciones de Cursos

### ✅ #15 - Ampliar fuentes de cursos (toda internet)
**Commit:** 9924058e  
**Cambio realizado:**
- Prompt de Gemini expandido para incluir:
  - MDN Web Docs
  - freeCodeCamp
  - Khan Academy
  - Microsoft Learn
  - YouTube
  - Documentación oficial
- Instrucción: "Buscá en TODA internet, no solo Udemy/Coursera"

**Estado verificación:** ⏳ PENDIENTE PRUEBA MANUAL

**Archivo:** `netlify/functions/gemini-courses.ts:~50-70`

**Cómo probar:**
1. Login B2C → ir a `/mi-carrera/ruta` (o similar)
2. Ver recomendaciones de cursos
3. Verificar que incluye fuentes variadas (no solo Udemy)

---

## CATEGORÍA 7: Quality Control & Automation

### ✅ #16 - Quality gates automáticos
**Commit:** b017203c  
**Cambio realizado:**
- Sistema de scoring automático para oportunidades:
  - Descripción >300 palabras = 40pts
  - Ubicación clara = 20pts
  - Organización identificada = 20pts
  - Skills listados = 20pts
  - Score >= 70 → auto-aprobado
- Python helper: `quality_gate.py`
- Netlify function: `quality-gate.ts`

**Estado verificación:** ⏳ PENDIENTE VERIFICAR EN ADMIN

**Archivos:**
- `scrapers/quality_gate.py`
- `netlify/functions/quality-gate.ts`

**Cómo probar:**
1. Login Admin → tab "Contenido"
2. Ver distribución de `quality_status`:
   - `approved` = auto-aprobadas
   - `pending_review` = necesitan revisión manual
3. Verificar ratio aprobación automática

---

### ✅ #17 - Workflow enrichment con Gemini (GitHub Actions)
**Commit:** cae32fd1  
**Cambio realizado:**
- GitHub Actions workflow cada 6 horas (00:00, 06:00, 12:00, 18:00 UTC)
- Script Python: `scrapers/enrichment.py`
  - Extrae skills de descripción
  - Normaliza ubicaciones a "Ciudad, País"
  - Identifica organizaciones
  - Expande descripciones cortas (<100 palabras)
- Guarda en `opportunities.ai_enrichment` (JSONB)

**Estado verificación:** ⏳ PENDIENTE VERIFICAR EN GITHUB ACTIONS

**Archivos:**
- `.github/workflows/enrichment.yml`
- `scrapers/enrichment.py`

**Cómo probar:**
1. Ir a GitHub → Actions tab
2. Ver workflow "Opportunity Enrichment"
3. Verificar última ejecución (debería correr cada 6h)
4. Revisar logs → debe mostrar "X opportunities enriched"
5. En Admin → Contenido → verificar que `ai_enrichment` tiene datos

---

### ✅ #18 - Documentación de análisis completo
**Commit:** e7245fa9  
**Cambio realizado:**
- Creados archivos de documentación (no afectan funcionalidad)

**Estado verificación:** ✅ COMPLETADO (solo docs)

---

## RESUMEN DE ESTADOS

| Estado | Cantidad | Ítems |
|--------|----------|-------|
| ⏳ Pendiente prueba manual | 11 | #7, #8, #9, #10, #11, #12, #13, #14, #15, #16, #17 |
| ⏳ Esperando datos SEO | 4 | #3, #4, #5, #6 |
| ❌ No funciona como esperado | 1 | #1 |
| ❌ No implementado | 1 | #2 |
| ✅ Completado | 1 | #18 |

---

## ORDEN SUGERIDO DE VERIFICACIÓN

### Sesión 1 (Hoy - 20min)
- [ ] #7 - Sidebar sin duplicados
- [ ] #8 - Navegación B2B
- [ ] #1 - Generar CV largo (confirmar que sigue resumido)

### Sesión 2 (Mañana - 30min)
- [ ] #11 - Pipeline drag & drop
- [ ] #12 - Agendar entrevista
- [ ] #13 - Notas colaborativas

### Sesión 3 (En 2 días - 20min)
- [ ] #9 - Botón pedir saldo
- [ ] #10 - Dashboard Analytics
- [ ] #14 - Email post-aplicación

### Sesión 4 (En 3 días - 15min)
- [ ] #15 - Cursos variados
- [ ] #16 - Quality gates en Admin
- [ ] #17 - Enrichment workflow logs

### Sesión 5 (Día 7 - 10min)
- [ ] #3, #4, #5, #6 - Revisar métricas SEO en Google Search Console

---

**Próxima acción:** ¿Empezamos con #1 (CV generation) o con #7 (Sidebar)?
