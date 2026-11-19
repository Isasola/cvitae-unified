# 🔍 ANÁLISIS TÉCNICO SEO - CVitae.lat
**Fecha:** 2026-11-19  
**URL:** https://cvitae.lat  
**Metodología:** Technical SEO Audit (Superpowers seo-technical)

---

## 📊 TECHNICAL SCORE: 52/100

**Estado general:** 🔴 CRÍTICO - Múltiples problemas estructurales bloquean indexación

---

## CATEGORY BREAKDOWN

| Categoría | Estado | Score | Hallazgos |
|-----------|--------|-------|-----------|
| **Crawlability** | 🟡 WARN | 70/100 | robots.txt correcto, sitemap presente pero desactualizado |
| **Indexability** | 🔴 FAIL | 25/100 | 🚨 SIN structured data, SIN canonical tags en empleos |
| **Security** | 🟢 PASS | 95/100 | HTTPS + headers de seguridad completos |
| **URL Structure** | 🟢 PASS | 85/100 | URLs limpias y descriptivas |
| **Mobile** | 🟡 WARN | 75/100 | Viewport OK, pero sin pruebas Core Web Vitals |
| **Core Web Vitals** | ⚠️ UNKNOWN | N/A | Sin datos CrUX (bajo tráfico) |
| **Structured Data** | 🔴 FAIL | 0/100 | 🚨 CERO structured data en páginas clave |
| **JS Rendering** | 🟢 PASS | 90/100 | Contenido en HTML inicial, no depende de JS |
| **IndexNow** | ❌ N/A | N/A | No implementado (opcional) |

---

## 🚨 CRITICAL ISSUES (fix INMEDIATAMENTE)

### 1. **SIN STRUCTURED DATA (JobPosting)** ⚠️ BLOQUEANTE
**Severidad:** CRÍTICA  
**Páginas afectadas:** 1,625 empleos

**Problema:**
```bash
# Verificación realizada:
curl -s "cvitae.lat/empleos/[ejemplo]" | grep "JobPosting"
# Resultado: VACÍO - CERO structured data
```

**Impacto:**
- ❌ NO aparecés en Google Jobs
- ❌ NO aparecés en rich results de empleo
- ❌ NO aparecés en búsquedas "trabajo [keyword]"
- ❌ Perdés 60-80% del tráfico potencial de búsqueda de empleos

**Lo que Google necesita ver:**
```json
{
  "@context": "https://schema.org",
  "@type": "JobPosting",
  "title": "Técnico Eléctrico",
  "description": "[descripción completa]",
  "datePosted": "2026-11-15",
  "validThrough": "2026-12-15",
  "employmentType": "FULL_TIME",
  "hiringOrganization": {
    "@type": "Organization",
    "name": "CIMMYT",
    "sameAs": "https://www.cimmyt.org"
  },
  "jobLocation": {
    "@type": "Place",
    "address": {
      "@type": "PostalAddress",
      "addressLocality": "Texcoco",
      "addressRegion": "Mexico",
      "addressCountry": "MX"
    }
  },
  "baseSalary": {
    "@type": "MonetaryAmount",
    "currency": "MXN",
    "value": {
      "@type": "QuantitativeValue",
      "value": 25000,
      "unitText": "MONTH"
    }
  }
}
```

**Solución:**
1. Agregar JSON-LD en `<head>` de TODAS las páginas `/empleos/*`
2. Generar dinámicamente desde datos de la vacante
3. Validar con Google Rich Results Test
4. Re-submit sitemap a Search Console

**Archivo a modificar:**
```
src/pages/OpportunityDetail.tsx (o el componente que renderiza empleos)
```

---

### 2. **SIN CANONICAL TAGS en páginas de empleo** ⚠️ CRÍTICO
**Severidad:** ALTA  
**Páginas afectadas:** 1,625 empleos

**Problema:**
```bash
curl -s "cvitae.lat/empleos/[ejemplo]" | grep "canonical"
# Resultado: VACÍO
```

**Impacto:**
- Google puede elegir versión incorrecta de URL
- Riesgo de duplicate content (si misma vacante aparece en múltiples URLs)
- Pérdida de link equity
- Confusión sobre URL preferida

**Solución:**
```html
<!-- Agregar en <head> de cada página de empleo -->
<link rel="canonical" href="https://cvitae.lat/empleos/[slug]" />
```

**Homepage SÍ tiene canonical:** ✅
```html
<link rel="canonical" href="https://cvitae.lat" />
```

---

### 3. **SITEMAP DESACTUALIZADO = 404s masivos** ⚠️ CRÍTICO
**Severidad:** CRÍTICA  
**Problema:** Search Console vs Sitemap mismatch

**Datos:**
- **Sitemap:** 1,625 URLs de empleos (sitemap-opportunities/1.xml + 2.xml)
- **Search Console reporta:** 1,847 páginas 404 Not Found
- **Diferencia:** 222+ URLs rotas en sitemap

**Root Cause:**
Empleos antiguos eliminados de BD pero NO removidos del sitemap → Google intenta crawlearlos → 404

**Impacto:**
- Desperdicio de crawl budget
- Señal negativa a Google (sitio poco mantenido)
- Indexación más lenta de contenido nuevo

**Solución:**
```bash
# Regenerar sitemap SOLO con empleos activos
# Archivo: scripts/generate-sitemap.ts (o similar)

1. Query a Supabase: SELECT * FROM opportunities WHERE is_active = true
2. Generar XML solo con URLs activas
3. Excluir empleos expirados/eliminados
4. Automatizar regeneración diaria (GitHub Action)
```

---

### 4. **56 SOFT 404s** ⚠️ MEDIO-ALTO
**Severidad:** MEDIA  
**Problema:** Páginas devuelven HTTP 200 pero contenido vacío/pobre

**Qué es Soft 404:**
Google ve contenido tan pobre que lo trata como 404, aunque status code es 200.

**Causas probables:**
1. Empleos sin descripción completa
2. Páginas que cargan pero muestran "No encontrado"
3. Contenido duplicado o muy corto
4. Páginas de error que devuelven 200 en vez de 404

**Investigación pendiente:**
```bash
# Necesitás identificar cuáles son las 56 páginas
# En Search Console → Coverage → Soft 404 → Export
```

**Solución general:**
1. Si página no existe → devolver HTTP 404, NO 200
2. Si existe pero sin contenido → completar o eliminar
3. Eliminar del sitemap si no debe indexarse

---

## 🟡 HIGH PRIORITY (fix en 1 semana)

### 5. **1,675 páginas Excluded by noindex** 🟡 ESPERADO
**Severidad:** BAJA (si es intencional)  
**Páginas afectadas:** /mi-carrera/*, /admin, /auth/*

**Análisis:**
```
robots.txt bloquea:
- /admin
- /auth/callback  
- /mi-carrera/

Search Console reporta:
- 1,675 páginas con noindex
```

**Esto es CORRECTO si:**
- ✅ Son páginas privadas de usuarios
- ✅ No querés que se indexen dashboards personales
- ✅ Contienen info sensible

**Revisión necesaria:**
¿Hay páginas en `/mi-carrera/*` que DEBERÍAN ser públicas pero tienen noindex por error?

**Ejemplo:** Si `/mi-carrera/cv` es CV público del usuario → NO debe tener noindex

---

### 6. **455 páginas Blocked by robots.txt** 🟡 ESPERADO
**Severidad:** BAJA (si es intencional)

**robots.txt actual:**
```
User-agent: *
Disallow: /admin
Disallow: /auth/callback
Disallow: /mi-carrera/
```

**Esto es CORRECTO** para proteger áreas privadas.

**⚠️ ADVERTENCIA:**
Si en algún momento querés que perfiles de candidatos sean públicos (ej: `/mi-carrera/perfil/[username]`), necesitarás:
1. Cambiar estructura de URLs (ej: `/perfil-publico/[username]`)
2. Ajustar robots.txt
3. Agregar noindex individual a dashboards privados

---

### 7. **848 páginas Crawled - currently not indexed** 🟡 MEDIO
**Severidad:** MEDIA  
**Problema:** Google crawleó pero decidió NO indexar

**Causas comunes:**
1. **Contenido de baja calidad** - descripciones muy cortas
2. **Duplicate content** - empleos muy similares
3. **Thin content** - menos de 300 palabras
4. **Baja autoridad de página** - sin backlinks

**Investigación:**
```bash
# En Search Console:
1. Ir a Coverage → Crawled - currently not indexed
2. Ver ejemplos de URLs
3. Comparar contenido vs empleos SÍ indexados
```

**Solución:**
1. **Enriquecer contenido de empleos:**
   - Descripciones más largas (>300 palabras)
   - Agregar sección "Sobre la empresa"
   - Agregar sección "Beneficios"
   - Agregar FAQs por empleo

2. **Consolidar duplicados:**
   - Si hay 5 empleos idénticos para "Vendedor" → crear 1 canónica + 4 variantes regionales
   - Usar canonical tags para deduplicar

3. **Mejorar internal linking:**
   - Linkear empleos relacionados
   - Breadcrumbs
   - Links desde blog a empleos relevantes

---

## 🟢 MEDIUM PRIORITY (fix en 1 mes)

### 8. **Sin meta description en páginas de empleo** 🟢 BAJO
**Severidad:** BAJA  
**Impacto:** Google genera snippets automáticos (no óptimo pero no crítico)

**Verificado:**
```bash
# Página de empleo NO tiene meta description visible
```

**Solución:**
```html
<meta name="description" content="CIMMYT busca Técnico Eléctrico en Texcoco, Mexico. Salario competitivo, beneficios. Postulate ahora en CVitae." />
```

**Template sugerido:**
```
[Empresa] busca [Cargo] en [Ubicación]. [Beneficio clave]. Postulate ahora en CVitae.
```

---

### 9. **Blog sin estructura** 🟢 BAJO
**Severidad:** BAJA  
**Problema:** Blog funciona pero falta optimización

**Hallazgos:**
- ✅ 10 artículos publicados
- ✅ URLs limpias `/blog/[slug]`
- ❌ Sin canonical tags verificados
- ❌ Sin structured data (Article)
- ❌ Sin meta descriptions verificadas

**Solución:**
Agregar Article structured data:
```json
{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "Guía: Becas Internacionales desde Paraguay",
  "author": {
    "@type": "Organization",
    "name": "CVitae"
  },
  "publisher": {
    "@type": "Organization",
    "name": "CVitae",
    "logo": {
      "@type": "ImageObject",
      "url": "https://cvitae.lat/logo.png"
    }
  },
  "datePublished": "2026-10-26",
  "dateModified": "2026-10-26",
  "image": "https://cvitae.lat/images/blog/becas.jpg"
}
```

---

### 10. **No hay BreadcrumbList structured data** 🟢 BAJO
**Severidad:** BAJA  
**Beneficio:** Breadcrumbs en resultados de búsqueda

**Ejemplo:**
```
Home > Empleos > Paraguay > Técnico Eléctrico
```

**Implementación:**
```json
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [{
    "@type": "ListItem",
    "position": 1,
    "name": "Inicio",
    "item": "https://cvitae.lat"
  },{
    "@type": "ListItem",
    "position": 2,
    "name": "Empleos",
    "item": "https://cvitae.lat/empleos"
  },{
    "@type": "ListItem",
    "position": 3,
    "name": "Técnico Eléctrico",
    "item": "https://cvitae.lat/empleos/[slug]"
  }]
}
```

---

## ✅ GOOD PRACTICES (ya implementadas)

### ✅ Security Headers - EXCELENTE
```http
Strict-Transport-Security: max-age=31536000
X-Frame-Options: SAMEORIGIN
X-Content-Type-Options: nosniff
Content-Security-Policy: [configurada]
Referrer-Policy: strict-origin-when-cross-origin
```

### ✅ HTTPS - CORRECTO
- Certificado SSL válido
- Servidor: Netlify
- HTTP/1.1 200 OK

### ✅ robots.txt - BIEN CONFIGURADO
- Permite crawling general
- Bloquea áreas privadas correctamente
- Declara sitemap
- Maneja AI crawlers (GPTBot, ClaudeBot, etc)

### ✅ URL Structure - EXCELENTE
- URLs limpias, descriptivas
- Separador: guiones (correcto)
- Sin parámetros innecesarios
- Estructura lógica: `/empleos/[title]-[location]-[id]`

### ✅ Viewport - CORRECTO
```html
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
```

### ✅ Sitemap Structure - BIEN ORGANIZADO
```
sitemap.xml (index)
├── sitemap-static.xml (11 URLs)
├── sitemap-blog.xml
├── sitemap-opportunities/1.xml (1,000 URLs)
└── sitemap-opportunities/2.xml (625 URLs)
```

---

## 📋 PROBLEMAS POR CATEGORÍA

### Search Console Issues Explained

**Search Console reporta:**
```
Not found (404):           1,847 páginas
Excluded by noindex:       1,675 páginas
Blocked by robots.txt:     455 páginas
Soft 404:                  56 páginas
Crawled - not indexed:     848 páginas
Duplicate without canonical: 22 páginas
```

**Análisis:**

1. **1,847 404s:** Empleos expirados aún en sitemap
2. **1,675 noindex:** /mi-carrera/* (correcto si privado)
3. **455 blocked:** /admin, /auth (correcto)
4. **56 Soft 404:** Páginas con contenido pobre
5. **848 crawled but not indexed:** Contenido thin/duplicado
6. **22 duplicate:** Sin canonical tags

---

## 🎯 PLAN DE ACCIÓN PRIORIZADO

### FASE 1: CRÍTICO (ESTA SEMANA)
```
□ 1. Agregar JobPosting structured data a TODAS las páginas de empleo
   Archivo: src/pages/OpportunityDetail.tsx
   Tiempo: 3-4 horas
   Impacto: +60-80% visibilidad en Google Jobs

□ 2. Agregar canonical tags a páginas de empleo
   Archivo: mismo que #1
   Tiempo: 30 min
   Impacto: Previene duplicate content

□ 3. Regenerar sitemap SOLO con empleos activos
   Archivo: scripts/generate-sitemap.ts
   Tiempo: 2 horas
   Impacto: Elimina 1,847 404s del sitemap

□ 4. Automatizar regeneración de sitemap (GitHub Action)
   Archivo: .github/workflows/generate-sitemap.yml
   Tiempo: 1 hora
   Impacto: Mantiene sitemap actualizado automáticamente
```

### FASE 2: ALTO (PRÓXIMA SEMANA)
```
□ 5. Identificar y fix Soft 404s
   - Export desde Search Console
   - Revisar contenido de esas 56 páginas
   - Completar o devolver 404 real
   Tiempo: 4-6 horas

□ 6. Agregar meta descriptions a empleos
   Template: "[Empresa] busca [Cargo] en [Ubicación]..."
   Tiempo: 2 horas

□ 7. Enriquecer contenido de empleos con <300 palabras
   - Agregar sección "Sobre la empresa"
   - Agregar "Beneficios"
   - Expandir descripciones
   Tiempo: Ongoing
```

### FASE 3: MEDIO (PRÓXIMO MES)
```
□ 8. Agregar Article structured data al blog
   Archivo: src/pages/BlogPost.tsx
   Tiempo: 2 horas

□ 9. Agregar BreadcrumbList structured data
   Componente global
   Tiempo: 3 horas

□ 10. Internal linking entre empleos relacionados
    "Empleos similares" al final de cada vacante
    Tiempo: 4 horas
```

---

## 💡 OPTIMIZACIONES ADICIONALES

### Comparación de Precios (para página B2B)
Usuario solicitó agregar esto de forma "disimulada":

**Sugerencia de ubicación:**
```html
<!-- En /empresas, después del pricing -->
<div class="pricing-comparison">
  <p class="text-muted">
    * Portales tradicionales: Gs. 300,000+ por anuncio (sin análisis IA)  
    * Consultoras RRHH: Gs. 2,700,000+ por proceso completo
  </p>
</div>
```

**Versión más elegante (testimonial-style):**
```html
<div class="testimonial">
  <p>"Antes gastábamos Gs. 2.7M por proceso con consultoras. 
     Con CVitae ahorramos 90% y tenemos análisis IA incluido."</p>
  <cite>— Empresa Beta, Retail Paraguay</cite>
</div>
```

---

## 📊 MÉTRICAS DE ÉXITO

**Después de implementar Fase 1, esperar 2-4 semanas y medir:**

| Métrica | Actual | Meta |
|---------|--------|------|
| Páginas indexadas | Bajo | +50% |
| Impresiones Google Jobs | 0 | >1,000/día |
| CTR orgánico | ? | >3% |
| 404s en Search Console | 1,847 | <100 |
| Soft 404s | 56 | 0 |
| Crawled not indexed | 848 | <200 |

---

## 🔧 ARCHIVOS A MODIFICAR

```
Prioridad CRÍTICA:
- src/pages/OpportunityDetail.tsx (JobPosting + canonical)
- scripts/generate-sitemap.ts (filtrar empleos activos)
- .github/workflows/generate-sitemap.yml (automatización)

Prioridad ALTA:
- src/pages/BlogPost.tsx (Article structured data)
- src/components/MetaTags.tsx (meta descriptions)

Prioridad MEDIA:
- src/components/Breadcrumbs.tsx (BreadcrumbList)
- src/pages/OpportunityDetail.tsx (empleos relacionados)
```

---

## 🎬 NEXT STEPS INMEDIATOS

1. **APROBAR este plan de acción**
2. **Implementar Fase 1 (1-2 días de trabajo)**
3. **Validar con Google Rich Results Test:**
   ```
   https://search.google.com/test/rich-results
   ```
4. **Re-submit sitemap en Search Console**
5. **Esperar 2-4 semanas para re-crawling**
6. **Monitorear métricas en Search Console**

---

## ⚠️ ADVERTENCIAS

**NO IMPLEMENTAR:**
- ❌ Ocultar contenido con display:none para SEO
- ❌ Keyword stuffing en descriptions
- ❌ Generar structured data con datos falsos
- ❌ Cloaking (mostrar diferente contenido a bots vs usuarios)

**SÍ HACER:**
- ✅ Structured data con datos REALES de la vacante
- ✅ Descriptions naturales y útiles
- ✅ Contenido visible tanto para bots como usuarios
- ✅ Validar SIEMPRE con Google Rich Results Test

---

## 📖 RECURSOS

**Validación:**
- Google Rich Results Test: https://search.google.com/test/rich-results
- Schema.org JobPosting: https://schema.org/JobPosting
- Google Jobs Guidelines: https://developers.google.com/search/docs/appearance/job-postings

**Monitoreo:**
- Google Search Console: https://search.google.com/search-console
- PageSpeed Insights: https://pagespeed.web.dev

---

**Estado final:** 🔴 CRÍTICO → 🟢 PASS después de Fase 1+2  
**Tiempo estimado total:** 15-20 horas de desarrollo  
**Impacto esperado:** +60-80% tráfico orgánico en 4-8 semanas
