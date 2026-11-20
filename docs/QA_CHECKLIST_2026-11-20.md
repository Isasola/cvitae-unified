# CVitae QA Checklist — Cuarentena SEO (2026-11-20 a 2026-11-27)

> **REGLA:** No hacer cambios durante esta semana. Solo observar y documentar.

---

## 1. Cambios realizados (commit 218c7013 y anteriores)

### 1.1 SEO (esperamos resultados en 7-14 días)
- [ ] JobPosting structured data en `/oportunidades/:slug`
- [ ] Canonical tags
- [ ] Meta descriptions dinámicas
- [ ] Sitemap regenerado (solo empleos activos)
- [ ] Monitorear Google Search Console: impresiones, CTR, páginas indexadas
- [ ] Monitorear PageSpeed Insights: LCP, CLS, INP

### 1.2 CV Generation Quality
- [x] ❌ **NO FUNCIONÓ**: max_tokens aumentado a 3000 pero CVs siguen resumidos
- [ ] ❓ Verificar longitud promedio de CVs generados vs longitud de evidencias
- [ ] ❓ ¿Claude está cortando por límite de output o por prompt conservador?

**Problema detectado:**
- Prompt actual es demasiado conservador ("use exclusively facts", "if no evidence omit")
- Falta instrucción: "NO RESUMIR, expandir descripciones de responsabilidades"
- Falta instrucción: "MÍNIMO 3-4 logros cuantificados por rol"
- Falta: Pedir contexto adicional si faltan funciones/habilidades

**Próximo fix (post-cuarentena):**
```typescript
// Agregar al prompt después de línea 294:
- ${lang === 'en' ? 'DO NOT summarize. Extract ALL professional experience in full detail.' : 'NO RESUMIR NADA. Extraé TODA la experiencia profesional completa con todos los detalles.'}
- ${lang === 'en' ? 'MINIMUM 3-4 quantified achievements per role (numbers, percentages, team sizes).' : 'MÍNIMO 3-4 logros cuantificados por rol (números, porcentajes, tamaños de equipo).'}
- ${lang === 'en' ? 'Explain functions and responsibilities THOROUGHLY for each company. What were daily tasks? What tools? What team dynamics?' : 'Explicá funciones y responsabilidades DETALLADAMENTE por cada empresa. ¿Cuáles eran las tareas diarias? ¿Qué herramientas? ¿Qué dinámica de equipo?'}
```

### 1.3 Navegación B2C/B2B
- [ ] Botón "Oportunidades" removido de sidebar B2C
- [ ] Todos los hrefs en `/empresas` apuntan a `/empresas` (no `/`)
- [ ] Verificar que usuarios no se pierden al navegar

### 1.4 Features B2B
- [ ] Dashboard Analytics: conversión funnel, gráfico actividad, fuentes
- [ ] Pipeline drag & drop: 5 columnas (Nuevo, Contactado, Entrevistando, Contratado, Descartado)
- [ ] Calendario: Google + Outlook deep-links funcionan
- [ ] Notas colaborativas: timestamps, persistencia en `recruiter_notes`
- [ ] Botón "Pedir saldo" con protección doble-click

### 1.5 Emails B2C
- [ ] Email post-aplicación incluye CTAs a features B2C (CVs ilimitados, Diagnóstico ATS, etc.)
- [ ] Verificar tasa de apertura en próximos 7 días

### 1.6 Cursos Gemini
- [ ] Recomendaciones incluyen MDN, freeCodeCamp, Khan Academy, Microsoft Learn (no solo Udemy/Coursera)
- [ ] Verificar calidad de recomendaciones en próximos tests manuales

### 1.7 Quality Gates
- [ ] Oportunidades con score >= 70 se auto-aprueban
- [ ] Verificar en Admin → Contenido cuántas están en `pending_review` vs `approved`

### 1.8 Enrichment Workflow
- [ ] GitHub Actions corre cada 6 horas
- [ ] Verificar logs en Actions tab
- [ ] Verificar que `ai_enrichment` se llena en `opportunities`

---

## 2. Tests manuales a realizar esta semana

### Día 1 (Hoy - 2026-11-20)
- [ ] Test: Generar CV largo (perfil con 5+ años experiencia)
  - Expectativa: CV debería expandir funciones de cada rol
  - Resultado real: ___
  - ¿Cumplió?: ___

- [ ] Test: Navegar entre tabs B2B (Vacantes, Análisis, Historial, Analytics)
  - Expectativa: Sin crashes, datos cargan
  - Resultado real: ___
  - ¿Cumplió?: ___

### Día 2 (2026-11-21)
- [ ] Test: Drag & drop candidato en pipeline
  - Expectativa: Cambia de columna, se guarda estado
  - Resultado real: ___
  - ¿Cumplió?: ___

- [ ] Test: Agendar entrevista con Google Calendar
  - Expectativa: Se abre calendario pre-poblado
  - Resultado real: ___
  - ¿Cumplió?: ___

### Día 3 (2026-11-22)
- [ ] Test: Agregar nota a candidato
  - Expectativa: Guarda con timestamp, persiste al refrescar
  - Resultado real: ___
  - ¿Cumplió?: ___

- [ ] Test: Dashboard Analytics carga métricas
  - Expectativa: Funnel, gráfico 30 días, fuentes
  - Resultado real: ___
  - ¿Cumplió?: ___

### Día 4 (2026-11-23)
- [ ] Test: Verificar SEO en Google Search Console
  - Impresiones últimos 7 días: ___
  - CTR promedio: ___
  - Páginas indexadas: ___
  - Errores de cobertura: ___

### Día 5 (2026-11-24)
- [ ] Test: Recomendar cursos (perfil con ruta de carrera definida)
  - Expectativa: Include fuentes variadas (no solo Udemy)
  - Resultado real: ___
  - ¿Cumplió?: ___

### Día 6 (2026-11-25)
- [ ] Test: Solicitar saldo B2B (botón "Pedir saldo")
  - Expectativa: Email llega a contacto@cvitae.lat, no permite doble-click
  - Resultado real: ___
  - ¿Cumplió?: ___

### Día 7 (2026-11-26)
- [ ] Test: Quality gates en Admin
  - Oportunidades auto-aprobadas: ___
  - Oportunidades pending_review: ___
  - Ratio aprobación: ___

---

## 3. Métricas SEO a monitorear

### Google Search Console
- **Baseline (2026-11-19):**
  - Impresiones/día: ___
  - Clicks/día: ___
  - CTR: ___
  - Páginas indexadas: ___

- **Meta (2026-11-27):**
  - Impresiones/día: +20% (___) 
  - Clicks/día: +15% (___) 
  - CTR: +2pp (___) 
  - Páginas indexadas: Sin 404s en sitemap

### PageSpeed Insights
- **Baseline:**
  - LCP: ___
  - CLS: ___
  - INP: ___
  - Score móvil: ___

- **Meta (2026-11-27):**
  - LCP: < 2.5s
  - CLS: < 0.1
  - INP: < 200ms
  - Score móvil: 90+

---

## 4. Errores conocidos (NO corregidos aún)

### Error #1: CV Generation demasiado resumido
**Síntoma:** CVs generados son más cortos que las evidencias confirmadas. Faltan detalles de funciones y responsabilidades.

**Causa raíz:** Prompt es ultra-conservador ("use exclusively facts", "if no evidence omit"). Claude interpreta esto como "comprimir al mínimo".

**Fix planeado (post-cuarentena):**
- Agregar instrucción explícita: "NO RESUMIR"
- Agregar: "MÍNIMO 3-4 logros cuantificados por rol"
- Agregar: "Explicar funciones DETALLADAMENTE"
- Aumentar max_tokens solo NO es suficiente

**Prioridad:** P0 (afecta UX principal B2C)

---

### Error #2: [Espacio para próximos errores detectados]

---

## 5. Manual de pruebas (Work in Progress)

### Test: Generar CV Vivo
1. Ir a `/mi-carrera/cv-vivo`
2. Seleccionar vacante (o modo general)
3. Hacer click en "Generar CV"
4. **Validar:**
   - [ ] CV se genera en < 30s
   - [ ] Tiene nombre + título + contacto
   - [ ] Sección Experiencia tiene DETALLES (no solo bullets de 1 línea)
   - [ ] Al menos 3-4 logros cuantificados por rol
   - [ ] Funciones explicadas (no solo "Responsable de X")

### Test: Pipeline Drag & Drop
1. Ir a `/empresas` → login con token
2. Crear vacante → ver postulantes
3. Cambiar a vista "Pipeline"
4. Arrastrar candidato de "Nuevo" a "Contactado"
5. **Validar:**
   - [ ] Card se mueve visualmente
   - [ ] Refrescar página → estado persiste
   - [ ] `recruiter_action` en DB cambió a "contacted"

### Test: Agendar Entrevista
1. Desde Pipeline o Lista, expandir candidato
2. Click "Agendar"
3. Seleccionar fecha/hora/duración
4. Click "Google Calendar"
5. **Validar:**
   - [ ] Se abre nueva pestaña con Google Calendar
   - [ ] Título pre-poblado: "Entrevista: [nombre]"
   - [ ] Email del candidato como invitado
   - [ ] Fecha/hora correctas

### Test: Notas Colaborativas
1. Expandir candidato
2. Click "+ Agregar nota"
3. Escribir texto y guardar
4. **Validar:**
   - [ ] Nota aparece con timestamp
   - [ ] Refrescar → nota persiste
   - [ ] `recruiter_notes` en DB tiene formato `[fecha]\ncontenido`

---

## 6. Checklist de deploy (para DESPUÉS de cuarentena)

Cuando hagamos cambios de nuevo:
- [ ] `npm run build` pasa sin errores TS
- [ ] Verificar que NO hay `opacity: 0` en `index.html`
- [ ] Si tocaste Netlify Function, verificar timeout en `netlify.toml`
- [ ] Si agregaste hooks, todos están ANTES de returns condicionales
- [ ] Si usaste Gemini, modelo es `gemini-3.5-flash-lite`
- [ ] Si tocaste admin, verificar campos backend vs tipos frontend
- [ ] Git push a `feature/aws-migration` (NO `main`)

---

## 7. Próximas iteraciones (post-cuarentena)

### P0 (Urgente)
- [ ] Fix CV generation prompt (expandir en lugar de resumir)
- [ ] Verificar que enrichment workflow funciona

### P1 (Alta prioridad)
- [ ] Migrar más funciones pesadas de Netlify a GitHub Actions
- [ ] Implementar pre-cómputo de embeddings (DISABLE_EMBEDDINGS=true es temporal)

### P2 (Media prioridad)
- [ ] Reducir chunk sizes (warnings de 500kB+)
- [ ] Auditar vulnerabilities (`npm audit`)

### P3 (Backlog)
- [ ] Tests automatizados
- [ ] Monitoreo de errores (Sentry?)

---

**Última actualización:** 2026-11-20 01:30 UTC-3
**Próxima revisión:** 2026-11-27 (fin de cuarentena)
