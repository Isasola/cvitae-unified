# 🎥 PROMPT PARA GENERAR GUIÓN VIDEO DEMO B2B

## PROMPT PARA IA GRATUITA (Claude.ai, ChatGPT, Gemini)

```
Sos un experto en marketing B2B para SaaS de RRHH en América Latina.

Necesito que me generes un guión completo para un video demo de 2-3 minutos para CVitae B2B.

CONTEXTO:
- Producto: CVitae B2B - Plataforma de análisis de CVs con IA
- Target: Gerentes de RRHH y dueños de PyMEs en Paraguay
- Problema que resuelve: Ahorra 10+ horas por proceso de selección
- Precio: USD 67/mes (uso ilimitado)
- Competencia: Portales cobran USD 40+ por anuncio SIN análisis, Consultoras cobran USD 360+ por proceso

DATOS DE VALIDACIÓN (encuesta real):
- 44% de empresas gasta >Gs. 2M/mes en selección
- 55% pierde ventas/paga horas extras si vacante queda desierta >25 días
- 77% valora "% de compatibilidad con explicación de IA"
- 88% calificó el precio como "Excelente" o "Razonable"

ESTRUCTURA DEL VIDEO:
1. INTRO (15 seg): Hook + presentación
2. PROBLEMA (20 seg): Dolor actual del cliente
3. DEMO EN VIVO (90 seg): Mostrar producto funcionando
4. COMPARACIÓN (20 seg): CVitae vs competencia
5. OFERTA (30 seg): Propuesta beta con descuento
6. CIERRE (10 seg): CTA claro

TONO:
- Directo, sin fluff
- Enfocado en ROI y ahorro de tiempo
- Datos concretos, no promesas vacías
- Profesional pero cercano (Latinoamérica, no corporativo gringo)

GENERÁ:
1. Guión palabra por palabra para narración en off
2. Descripción de qué mostrar en pantalla en cada momento
3. Textos overlays/títulos que aparecen en video
4. Tiempos aproximados por sección

EJEMPLO DE LO QUE QUIERO:
"[00:00-00:15] INTRO
Narración: 'Hola [Nombre], soy Isaias de CVitae. Vi que tu empresa [Empresa] publica X vacantes por mes. Te muestro cómo ahorrar 10 horas en cada una.'
Pantalla: Logo CVitae + foto del contacto
Overlay: 'Ahorrá 30+ horas/mes en selección'"

Ahora generá el guión completo siguiendo esta estructura.
```

---

## 🎨 PROMPT PARA GENERAR IMAGEN DEMO (IA GRATUITA)

**Para usar en:** Leonardo.ai (gratis), Ideogram.ai (gratis), Bing Image Creator (gratis)

```
Professional screenshot mockup of a modern web dashboard for an HR recruitment platform. 

Main elements:
- Clean white/dark interface with gold (#c9a84c) accent colors
- Left side: List of 3 candidate cards showing:
  * Candidate photo placeholder
  * Name: "María González"
  * Score badge: "87/100" in gold
  * Skills tags: "Excel", "CRM", "Ventas"
  * "Ver CV" button

- Right side: Detailed candidate analysis panel showing:
  * Profile header with score
  * Section "Habilidades que encajan" with checkmarks
  * Section "Experiencia relevante" with bullet points
  * AI-generated recommendation text in Spanish
  * "Contactar candidato" gold button

Style: Modern SaaS UI, glassmorphism effects, professional typography, realistic but clean design, Paraguay/LATAM market, desktop view 1920x1080

Colors: Dark background (#0a0a0a), white text, gold accents (#c9a84c), subtle borders

Text in Spanish, professional but accessible design.
```

**Alternativa más simple (si la primera es muy compleja):**

```
Modern web dashboard screenshot showing:
- HR recruitment interface
- 3 candidate cards with scores (72, 85, 91)
- Dark theme with gold accents
- Clean professional design
- Spanish text
- Realistic but minimalist style
```

---

## 📧 PROMPT PARA MEJORAR OFERTA BETA

```
Sos un copywriter experto en ofertas B2B para SaaS. 

Necesito que mejores esta oferta para empresas beta de CVitae:

OFERTA ACTUAL:
"Probá gratis tu próxima vacante real. Si te sirve: 3 meses a USD 50/mes (25% descuento vs USD 67). A cambio de feedback semanal."

CONTEXTO:
- Producto: Análisis de CVs con IA + ranking automático
- Target: PyMEs en Paraguay (5-50 empleados)
- Competencia cobra USD 40+ por anuncio, USD 360+ por proceso
- Nuestro precio normal: USD 67/mes ilimitado
- Beneficio clave: Ahorra 10+ horas por proceso

MEJORÁ LA OFERTA para que sea:
1. Más específica en qué incluye
2. Más clara en el valor (ROI)
3. Más urgente (escasez limitada)
4. Más fácil de decir "sí"

DAME 3 VERSIONES:
- Versión A: Corta y directa (email subject)
- Versión B: Media (body de email)
- Versión C: Larga (página de landing)

Incluí:
- Números concretos de ahorro
- Comparación vs alternativas
- Testimonial o caso de uso
- Garantía/reducción de riesgo
- CTA claro

Formato: Listo para copy/paste
```

---

## 🔄 RESUMEN COMPLETO DE TODOS LOS PUNTOS

| # | Punto | Estado | Acción |
|---|-------|--------|--------|
| 1 | Calidad CV + visual | ✅ Analizado | Aumentar tokens, mejorar prompt, mejor rendering |
| 2 | Migrar a GitHub Actions | ✅ Entendido | Mover enrichment/scrapers, dejar APIs en Netlify |
| 3 | No parches, línea lógica | ✅ Documento completo | 3 fases priorizadas con plan detallado |
| 4 | Botón Oportunidades | ✅ Analizado | ELIMINAR del sidebar |
| 5 | Botones Atrás | ✅ Analizado | Fix navegación consistente |
| 6-7 | Botones B2B | ✅ Analizado | Fix doble click + navegación |
| 8 | Tokens B2B | ❓ ACLARADO | Panel admin para habilitar tokens post-pago |
| 9 | Funciones Supabase | ✅ Entendido | No romper nada, atender compatibilidad |
| 10 | Vista Historial | ✅ Analizado | Mostrar CV + vacante |
| 11 | Comparar competencia | ✅ INVESTIGADO | Falta pipeline visual, calendarios |
| 12 | Estados candidatos | ✅ Analizado | Sistema filtros por estado |
| 13 | Correos automáticos | ✅ INVESTIGADO | YA FUNCIONAN (Resend) |
| 14 | Optimizar recálculos | ✅ Analizado | Caché inteligente + useEffect correcto |
| 15 | Eficiencia general | ✅ Analizado | Haiku + timeouts + caché |
| 16 | Cursos internet general | ✅ Solución | Ampliar fuentes en prompt Gemini |
| **SEO** | **TODO** | ✅ **COMPLETO** | **Doc técnico 52→85/100 con plan 3 fases** |
| **VIDEO** | **Demo + Oferta** | ✅ **PROMPTS** | **3 prompts listos para IA gratuita** |

---

## 🎯 SIGUIENTE PASO CRÍTICO

**Necesitás decidir:**

1. ¿Aprobás el plan SEO de 3 fases?
2. ¿Empezamos con Fase 1 (JobPosting + Canonical + Sitemap)?
3. ¿Querés que genere el código de JobPosting structured data ahora?

**⚠️ RECORDATORIO:** NO DEPLOY hasta tu aprobación punto por punto.

¿Revisás los 3 documentos generados y me decís cómo seguimos?