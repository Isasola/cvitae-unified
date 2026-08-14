# Relevo completo para continuar QA desde el punto 13

Fecha de corte: 13 de agosto de 2026, zona `America/Asuncion`.

Este documento es el contrato operativo para que otro agente continúe el QA de
CVitae Unified sin reconstruir la sesión anterior ni repetir trabajo aprobado.

## 1. Objetivo y forma de trabajo acordada

El usuario quiere cerrar hoy el QA de `cvitae.lat`, trabajando de forma
secuencial:

1. continuar desde el punto 13;
2. terminar un punto de manera coherente;
3. informar resultado, pruebas y pendientes manuales;
4. detenerse hasta que el usuario diga `completo, tarea N+1`;
5. agrupar en un mismo punto todo lo estrechamente relacionado;
6. no acumular preguntas de distintos puntos;
7. dejar commit, deploy y tareas con credenciales reales para el cierre final,
   salvo que exista un bloqueo realmente urgente.

Política de pruebas acordada: después de cada edición ejecutar sólo pruebas
afectadas. No repetir PDF/B2B/créditos/scrapers/ATS si la edición actual no los
toca y ya pasaron. Ejecutar regresión completa sólo en el punto transversal
final y sobre el commit candidato exacto.

No hacer commit, push, deploy, activar cron, publicar oportunidades ni escribir
en Supabase productivo sin autorización explícita. Mantener una sola cola manual
para el final.

## 2. Workspace y estado Git

- Proyecto: `C:\Users\isaso\cvitae-unified`
- Producción: `https://cvitae.lat`
- Rama actual: `feature/aws-migration`
- HEAD actual: `0e25576b` (`docs: add complete beta handoff and approval checklist`)
- Remoto principal observado: `origin/feature/aws-migration`
- Supabase project ref documentado: `rbrirxbjbmdxflzaxxzp`
- El worktree está deliberadamente muy sucio: contiene todo el trabajo de los
  puntos anteriores y cambios del usuario. No resetear, no hacer checkout de
  archivos, no limpiar untracked y no sobrescribir cambios ajenos.
- El `git diff --stat` de archivos rastreados tiene aproximadamente 3.062
  inserciones y 1.078 eliminaciones en 44 archivos; además existen muchos
  archivos nuevos todavía untracked, incluyendo migraciones `202608130001` a
  `202608130012`.

Antes de editar:

```powershell
Set-Location C:\Users\isaso\cvitae-unified
git status --short
git rev-parse --abbrev-ref HEAD
git rev-parse HEAD
```

Preservar todo. Usar patches pequeños y revisar superposición con cambios
existentes. No usar `git reset --hard`, `git checkout --`, `git clean` ni borrados
masivos.

## 3. Fuentes de verdad que deben leerse primero

En este orden:

1. `docs/CLAUDE-HANDOFF-QA-POINT-13.md` (este documento).
2. `docs/BETA-DEPLOY-TEST-PLAN.md` (70 controles de salida).
3. `docs/BETA-STATUS-AND-SOURCE-HANDOFF.md` (estado real de catálogo y 40 fuentes).
4. `docs/QA-B2B-PDF-CREDITS.md` (matriz B2B-01 a B2B-21).
5. `docs/B2B-PROGRESSIVE-APPLICATION-REVIEW.md`.
6. `docs/ADMIN-OPERATIONS.md`.
7. `docs/SCRAPER-AUDIT-2026-08-13.md` y `docs/SCRAPER-ONBOARDING.md`.
8. `docs/DASHBOARD-MATCHING-INTELLIGENCE.md`.
9. `docs/ADSENSE-ACTIVATION.md`.
10. `docs/LOCAL-STAGING.md`.

Documentos antiguos como `FUNCTIONAL-AUDIT-AND-HANDOFF.md` y
`BETA-HANDOFF-2026-08-12.md` son contexto histórico. Cuando contradigan una
migración `20260813*` o este relevo, prevalece el estado más reciente.

## 4. Skills disponibles y skill faltante

Hay tres skills parciales en el equipo:

- Scrapers:
  `C:\Users\isaso\.codex\skills\cvitae-scrapers\SKILL.md`
- Calidad visual:
  `C:\Users\isaso\.codex\skills\cvitae-visual-quality\SKILL.md`
- Growth genérica:
  `C:\Users\isaso\cvitae-growth-skill\cvitae-growth\SKILL.md`

La skill `cvitae-growth` no sustituye el protocolo de QA Unified. No incluye:

- migraciones y pruebas transaccionales Supabase;
- Docker local y scripts SQL;
- ledger de créditos e idempotencia;
- privacidad de CV y propiedad B2B;
- ranking progresivo 30/30/N;
- moderación y activación gradual de scrapers;
- regla de pruebas por impacto;
- cola manual antes/después del deploy;
- secuencia de puntos 13 a 18.

Primera acción de Claude: crear una skill repo-local, sin detener el punto 13:

`C:\Users\isaso\cvitae-unified\.claude\skills\cvitae-unified-qa\SKILL.md`

La skill debe condensar las secciones 1, 5, 6, 7, 8, 9 y 12 de este documento.
Debe ordenar leer este handoff y prohibir commit/deploy/cron/publicación sin
autorización. No copiar secretos. Si el entorno de Claude no carga skills
repo-locales, conservar el archivo igualmente como documentación operativa y
seguir este documento como contrato.

No modificar `cvitae-growth` silenciosamente. Si se corrige, hacerlo en un diff
separado, conservando su alcance genérico y añadiendo sólo referencias seguras a
CVitae Unified.

## 5. Estado funcional completado hasta el punto 12

La numeración histórica exacta de los primeros cuatro puntos no debe usarse como
fuente técnica. El estado verificable es el siguiente.

### Infraestructura y QA reproducible

- Staging local con Supabase, Storage, Auth, Mailpit y Netlify Dev.
- PDFs ficticios reproducibles para B2B.
- Tests críticos y scripts SQL por área.
- Política de no usar CV reales en staging.

### Créditos B2B e idempotencia

Migración: `supabase/migrations/202608130001_recruiter_credit_ledger.sql`.

- `recruiter_credit_operations` y `recruiter_credit_ledger`.
- Reserva atómica con bloqueo de saldo.
- Resultado idempotente por `recruiter_token_id + operation_id`.
- Débitos, devoluciones, ajustes y reconciliación auditables.
- Liquidación parcial de lotes; los fallos no deben consumir crédito.
- Ruta legacy `save_analysis` responde 410.

### Emails por match alto

Migración: `202608130002_high_match_email_alerts.sql`.

- Consentimiento de alertas separado de plan pago.
- Umbral configurable, inicialmente 85.
- Unicidad `user_id + opportunity_id`.
- Estados y reintentos auditables; `Idempotency-Key` con Resend.
- Sólo oportunidades activas, verificadas y elegibles para alertas.

### Integridad y seguridad B2C

Migraciones:

- `202608130003_schema_integrity.sql`
- `202608130004_b2c_security.sql`

Incluyen límites persistentes, autorización de servidor, eliminación
transaccional de datos, CORS/orígenes protegidos y prevención de autoelevar el
plan desde el navegador.

### CV basado en evidencia

Migración: `202608130005_cv_versions_and_evidence.sql`.

- Evidencias pendientes/confirmadas/rechazadas.
- Versiones inmutables y numeración transaccional.
- Restaurar crea otra versión; no sobrescribe historia.
- No inventar logros, cargos, habilidades ni métricas.

Archivos principales:

- `netlify/functions/cv-workspace.ts`
- `netlify/functions/generate-cv-vivo.ts`
- `src/hub/CVVivo.tsx`

### Diagnóstico ATS y preguntas de mejora

Migración: `202608130006_cv_ats_diagnostics.sql`.

- Rúbrica persistida y deduplicada por contenido/versión.
- Preguntas derivadas del CV.
- Las respuestas crean evidencia pendiente, nunca hechos confirmados
  automáticamente.
- El score no se presenta como simulación de un ATS universal.

Archivos:

- `netlify/functions/cv-ats-workspace.ts`
- `src/hub/ATSDiagnostic.tsx`

### Reescritura honesta del CV

Migración: `202608130007_cv_rewrite_proposals.sql`.

- Propuestas separadas e inmutables.
- Cada bloque cita evidencia.
- Aceptar crea una versión nueva.
- El servidor descarta cifras o habilidades no respaldadas.

Archivos:

- `netlify/functions/cv-rewrite-workspace.ts`
- `src/hub/CVRewrite.tsx`

### Preparación de postulaciones B2C

Migración: `202608130008_application_workspaces.sql`.

- Expediente privado por usuario y oportunidad.
- CV adaptado y mensaje fundamentados sólo en evidencia.
- Cobertura de requisitos calculada en servidor.
- Aceptar revalida que la oportunidad siga vigente y sin cambios.
- Estado enviado es auto-reportado; CVitae no finge postulación automática.

Archivos:

- `netlify/functions/application-workspace.ts`
- `src/hub/ApplicationWorkspace.tsx`

### Loop match → brecha → aprendizaje → mejor match

Migración: `202608130009_learning_recommendations.sql`.

- Brechas repetidas entre mejores matches y perfil.
- Recomendaciones explicadas por impacto en oportunidades concretas.
- Evidencia y progreso permiten recalcular perfil/matching.
- Gemini devuelve enlaces de búsqueda seguros generados por servidor y fallback
  determinista si falla.

Archivos:

- `netlify/functions/gemini-courses.ts`
- `src/hub/LearningPlan.tsx`
- `src/hub/Dashboard.tsx`
- `supabase/functions/match-batch/index.ts`
- `docs/DASHBOARD-MATCHING-INTELLIGENCE.md`

### Reporte de errores y feedback B2C/B2B

Migración: `202608130010_product_feedback.sql`.

- Canal de feedback/error para B2C y B2B.
- Endpoint protegido y admin para seguimiento.
- No exponer secretos ni almacenar CV completo en reportes.

Archivos:

- `netlify/functions/submit-feedback.ts`
- `src/components/cv/FeedbackReporter.tsx`
- `scripts/verify-product-feedback.ts`
- `scripts/verify-product-feedback-database.sql`

### AdSense preparado pero apagado

- `src/components/cv/AdSlot.tsx`
- `src/components/cv/CookiePreferences.tsx`
- `src/lib/consent.ts`
- `docs/ADSENSE-ACTIVATION.md`

Sólo hay espacios en empleos, oportunidades y blog. No hay anuncios en Mi
Carrera, CV, matching, ATS, postulaciones ni B2B. Producción debe conservar
`VITE_GOOGLE_ADSENSE_READY=false` hasta aprobación, CMP y `ads.txt` reales.

### Admin operativo

Migración: `202608130011_admin_operations_brief.sql`.

- Brief orientado a decisiones, no métricas de vanidad.
- Nuevas oportunidades, usuarios, colas, feedback y estado de scrapers.
- Diferencia fallo, todo rechazado, advertencia, sin novedades, sin métrica y OK.
- Integración opcional, sólo lectura, con GA4 y Search Console.

Archivos:

- `netlify/functions/admin-data.ts`
- `netlify/functions/lib/google-reporting.ts`
- `src/pages/Admin.tsx`
- `docs/ADMIN-OPERATIONS.md`
- `scripts/verify-admin-operations.ts`
- `scripts/verify-admin-operations-database.sql`

### Punto 12: revisión progresiva B2B

Migración: `202608130012_progressive_vacancy_review.sql`.

- El enlace sigue aceptando postulaciones; no se expone un límite comercial.
- La cola procesa hasta 30 pendientes por operación.
- Secuencia probada con 65 candidatos: 30, 30, 5.
- Conserva todos los `fit_score >= 75` aunque sean muchos.
- Conserva y vuelve a comparar los mejores no fuertes entre tandas.
- Todos los demás siguen visibles para decisión manual.
- Nunca modifica `recruiter_action` ni rechaza/notifica automáticamente.
- `FOR UPDATE SKIP LOCKED`, advisory lock e `operation_id` impiden doble reclamo
  y doble cobro.
- El panel ya no trunca en 100; usa paginación y `Cargar más candidatos`.
- PDF privado, URL firmada 10 minutos y comprobación de propiedad.

Archivos:

- `netlify/functions/analyze-vacancy-applicants.ts`
- `netlify/functions/validate-recruiter-token.ts`
- `src/pages/Recruiters.tsx`
- `docs/B2B-PROGRESSIVE-APPLICATION-REVIEW.md`
- `scripts/verify-progressive-vacancy-review.ts`
- `scripts/verify-progressive-vacancy-review-database.sql`

Pruebas del punto 12 aprobadas localmente:

- test focalizado TypeScript/endpoint;
- SQL transaccional 65 candidatos;
- mismo `operation_id` sin segundo débito;
- saldo 100 → 35 por 65 resultados;
- ningún fuerte perdido y máximo 10 no fuertes en shortlist progresiva;
- cero decisiones humanas alteradas;
- `supabase db lint --local --level error` sin errores;
- `npm run build` aprobado.

La captura visual autenticada del panel debe repetirse en staging: el arnés
headless local agotó timeout después de varios procesos Chrome. No se detectó un
error de build o base, pero no se debe declarar certificación visual del punto 12
sin esa captura.

## 6. Staging local, Docker y Supabase

Docker Desktop debe estar iniciado.

Inicio normal:

```powershell
Set-Location C:\Users\isaso\cvitae-unified
npm.cmd run staging:local
```

Servicios:

- aplicación: `http://127.0.0.1:8888`
- Supabase Studio: `http://127.0.0.1:54323`
- Mailpit: `http://127.0.0.1:54324`
- API Supabase: `http://127.0.0.1:54321`
- Postgres: `127.0.0.1:54322`

Estado y cierre:

```powershell
npm.cmd run staging:status
npm.cmd run staging:stop
```

Si `powershell.exe` no está en PATH dentro de un sandbox:

```powershell
C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe `
  -NoProfile -ExecutionPolicy Bypass `
  -File scripts/start-local-staging.ps1
```

Si el script considera una advertencia de Docker como error, no ocultar el
problema: ejecutar primero `docker info`, `npx.cmd supabase status` y revisar
`scripts/start-local-staging.ps1`. No copiar claves productivas al entorno local.

Estado observado al entregar: Supabase local estaba activo y las migraciones
hasta `202608130012` estaban aplicadas localmente. Esto no confirma producción.

Ver migraciones locales:

```powershell
npx.cmd supabase migration list --local
```

Aplicar sólo pendientes locales:

```powershell
npx.cmd supabase migration up --local
```

Lint:

```powershell
npx.cmd supabase db lint --local --level error
```

No usar `supabase db reset` si hay fixtures locales que deban conservarse sin
avisar. Si se usa para una validación de esquema limpio, confirmar antes el
alcance: reconstruye la base local.

### Ejecutar verificaciones SQL dentro de Docker

Contenedor observado:

`supabase_db_cvitae-unified`

Patrón seguro:

```powershell
docker ps --format "{{.Names}}"
docker cp scripts/verify-progressive-vacancy-review-database.sql `
  supabase_db_cvitae-unified:/tmp/verify-progressive-vacancy-review-database.sql
docker exec supabase_db_cvitae-unified `
  psql -U postgres -d postgres -v ON_ERROR_STOP=1 `
  -f /tmp/verify-progressive-vacancy-review-database.sql
```

Los scripts de verificación usan `BEGIN ... ROLLBACK`; comprobar esto antes de
ejecutar cualquier SQL nuevo. Nunca probar con candidatos reales.

Scripts SQL disponibles:

- `verify-ats-database.sql`
- `verify-cv-rewrite-database.sql`
- `verify-application-workspace-database.sql`
- `verify-learning-plan-database.sql`
- `verify-product-feedback-database.sql`
- `verify-admin-operations-database.sql`
- `verify-progressive-vacancy-review-database.sql`

## 7. Comandos de pruebas y cuándo usarlos

### Focalizados

```powershell
npm.cmd run test:b2b-progressive-review
npx.cmd tsx scripts/verify-learning-plan.ts
npx.cmd tsx scripts/verify-product-feedback.ts
npx.cmd tsx scripts/verify-admin-operations.ts
npx.cmd tsx scripts/verify-consent-ads.ts
```

Ejecutar el SQL de la misma área cuando cambien migraciones/RPC/invariantes.

### B2B/PDF

```powershell
npm.cmd run qa:b2b-fixtures
npm.cmd run test:b2b-progressive-review
```

Los PDFs salen en `tmp/b2b-pdf-fixtures/` y son ficticios.

### Scrapers

```powershell
python scripts\validate_scraper_registry.py
python scripts\audit_scraper_contracts.py
python -m unittest tests.test_priority_scrapers -v
```

Auditoría sin persistencia:

```powershell
$env:CVITAE_AUDIT_MODE='1'
$env:CVITAE_REQUIRE_REVIEW='1'
$env:CVITAE_AUDIT_OUTPUT='tmp/source-audit.json'
python scrapers\NOMBRE_scraper.py
```

No convertir HTTP 200 o cero resultados en “funciona”. Medir encontrados,
válidos, únicos, duplicados, rechazados, causas y URLs originales.

### Regresión transversal final

Sólo al llegar al punto 16/final o cuando un cambio realmente cruce muchas áreas:

```powershell
npm.cmd run test:critical
npm.cmd run build
python -m unittest tests.test_priority_scrapers -v
python scripts\validate_scraper_registry.py
python scripts\audit_scraper_contracts.py
npx.cmd supabase db lint --local --level error
git diff --check
```

El repositorio no tiene un typecheck global confiable separado. `Vite` transpila
frontend; los tests `tsx` importan Functions focalizadas. Para Functions tocadas,
importarlas en un test focalizado o usar el empaquetado de Netlify antes del
commit candidato. No generar ZIP/manifest dentro de `netlify/functions` y luego
commitearlos.

## 8. Reglas de seguridad e invariantes

### Créditos

```text
saldo final = saldo inicial + créditos + reembolsos + ajustes - débitos
```

- Nunca saldo negativo.
- Un `operation_id` = una operación y un resultado.
- No cobrar si falla antes de producir/persistir el resultado.
- Timeout o respuesta ambigua debe quedar auditable; no reintentar con otro ID
  como si nada.
- No confiar en saldo enviado por frontend.

### CV y postulaciones

- No inventar experiencia, habilidades, métricas, educación o logros.
- Distinguir evidencia confirmada, pendiente y ausente.
- No guardar CV completo en logs/feedback/telemetría.
- Bucket de postulaciones privado; URL firmada sólo tras validar propietario.
- Perfil general del candidato sólo con consentimiento separado.
- Score/IA orientan; `recruiter_action` pertenece al humano.

### Oportunidades y scrapers

- Tier A oficial; Tier B agregador; Tier C discovery.
- Tier B/C debe resolver publicador y URL original antes de publicar.
- Toda fuente nueva nace desactivada y con revisión obligatoria.
- Activación gradual: recolección → catálogo → matching/alertas → SEO.
- No evadir CAPTCHA, login, 403, rate limit ni términos.
- No borrar físicamente; usar revisión, archivo, borrado lógico y auditoría.
- No publicar por cantidad. Verificar vigencia, país/elegibilidad, organización,
  tipo y destino de postulación.

### Frontend/visual

- Estados loading/error/empty/success y reintentos honestos.
- Teclado, foco visible, móvil y reduced motion.
- No afirmar que una vista está visualmente aprobada sin verla renderizada.
- Evitar popups que bloqueen flujos; ayuda contextual y cerrable.
- B2C y B2B deben mostrar `Reportar error`.

### Secretos

- Nunca imprimir ni documentar `service_role`, tokens B2B, claves AWS, Gemini,
  Resend, Google service account ni `ADMIN_PASSWORD`.
- Variables privadas nunca con prefijo `VITE_`.

## 9. Fuentes y scrapers: estado exacto

Registro: `scrapers/source_registry.json`.

- Contiene 40 fuentes investigadas, no 40 scrapers funcionales.
- Estado anterior: 20 paraguayas y 20 internacionales/LatAm.
- Scrapers históricos MEF/INAPP y FIUNA existen y tienen pruebas.
- Auditoría 2026-08-13 agregó o trabajó:
  - `mitic_opportunities_scraper.py`: 5 fichas oficiales, estado candidate,
    todo apagado; falta revisar TDR/deadline.
  - `snj_paraguay_scraper.py`: filtro estricto, cero convocatorias reales en la
    muestra; research_verified, no presentar cero como éxito.
  - `ipa_convocatorias_scraper.py`: 8 candidatas, Tier A, apagado/revisión.
  - `wwf_paraguay_calls_scraper.py`: 3 consultorías recientes, Tier A,
    apagado/revisión.
  - `aecid_paraguay_calls_scraper.py`: canal inestable, research_verified,
    cero publicación.
- EmpleaPY no tiene catálogo público automatizable verificado.
- InnovandoPY hallado era histórico 2024.
- CONACYT continúa bloqueado 403; no evadir.
- Auditoría masiva de 14 recolectores produjo 219 únicas potenciales y 78
  conservadoramente elegibles para Paraguay/LatAm. No fueron autorizadas para
  publicación; deben entrar como `in_review` con fuente y vigencia.
- VC4A/PES Latam sigue siendo esqueleto/pendiente según handoffs anteriores.

Cuando el usuario pide agregar oportunidades, espera volumen masivo, no cinco.
La solución segura no es aprobar masivamente: recolectar en volumen, deduplicar,
validar automáticamente y enviar el lote elegible a moderación. No activar SEO,
alertas o matching hasta aprobar calidad.

## 10. Continuación propuesta: puntos 13 a 18

La conversación sí fijó explícitamente el punto 17 como SEO/GEO/blog/comunicación
de beta gratuita y agregó después un punto masivo de scrapers si el catálogo
continúa por debajo de 1.000. Los nombres históricos exactos de 13 a 16 no quedaron
persistidos en un archivo. Para no fingir memoria, usar este orden, que cubre todos
los requisitos pendientes del usuario. Si el usuario conserva una lista distinta,
ajustar el rótulo sin perder el alcance.

### Punto 13 — Calibración B2C de matching y calidad de recomendaciones

Objetivo: demostrar con datos ficticios/controlados que el CV/perfil produce
matches útiles, abundantes y explicables.

1. Auditar `match-batch`, `Dashboard`, perfiles y filtros canónicos.
2. Crear una matriz reproducible con perfiles diversos y oportunidades positivas,
   negativas, vencidas, inelegibles, licitaciones, remotas y con skills variantes.
3. Medir al menos precision@10, falsos positivos de match alto, cobertura del
   catálogo, razones de exclusión, latencia y cambios después de modificar perfil.
4. Verificar que nunca entren archivadas, eliminadas, no verificadas, sin permiso,
   vencidas o geográficamente inelegibles.
5. Probar normalización Node/Node.js, Power BI, idiomas, seniority, ubicación y
   modalidad.
6. Confirmar el loop: match → brecha repetida → aprendizaje → evidencia/progreso
   → recálculo. No prometer que completar un curso prueba una habilidad sin
   evidencia.
7. Mejorar código sólo cuando la matriz exponga una falla; guardar fixture y test.
8. No tocar B2B progresivo ni scrapers si no hay salpicadura.

Criterio: matches altos sin falsos positivos críticos, razones comprensibles y
recalibración coherente al cambiar evidencia.

### Punto 14 — Calidad masiva de oportunidades y fuentes menos confiables

Objetivo: no perder oportunidades Tier B/C sin degradar el catálogo.

Implementar/validar una puntuación de confianza previa a moderación, basada en:

- resolución a fuente original;
- dominio/organización coherentes;
- HTTP y destino final válidos;
- fecha/vigencia;
- elegibilidad Paraguay/LatAm;
- coincidencia entre fuentes independientes;
- completitud de campos;
- detección de duplicados/fuzzy duplicates;
- antigüedad e historial de calidad de la fuente;
- lenguaje de convocatoria real, no noticia/resultado/evento histórico.

Política:

- alta confianza Tier A → `in_review`, nunca auto-publicación inicial;
- Tier B con original encontrado → `in_review` y evidencia de resolución;
- Tier C → discovery/quarantine;
- sin fecha → no inventar; revisión y expiración conservadora;
- discrepancias → cola prioritaria, no pérdida silenciosa.

Procesar candidatos en lotes grandes y mostrar en admin cuántos avanzaron y por
qué se rechazaron. Usar skill `cvitae-scrapers`.

### Punto 15 — Onboarding, ayudas, reportes y estados completos

Objetivo: verificar, no asumir, que ayudas/popups y reporte de error están en
B2C y B2B sin bloquear tareas.

Rutas mínimas:

- landing/analizador;
- registro y perfil;
- CV Vivo, ATS, reescritura, aprendizaje y postulación;
- dashboard/matching;
- empresas, análisis individual/masivo, vacantes y candidatos;
- admin.

Comprobar ayuda contextual, primer uso, persistencia de cierre, teclado, móvil,
mensajes de crédito, privacidad, decisión humana, errores externos y
`Reportar error`. No crear tours invasivos. Conectar feature/audience correctos
al feedback y verificar admin.

### Punto 16 — QA integrado local y preparación del commit candidato

Objetivo: consolidar sin desplegar todavía.

1. Ejecutar pruebas focalizadas faltantes.
2. Ejecutar los 70 controles que sean posibles localmente y marcar cada uno:
   pass/fail/manual/not-applicable, con evidencia.
3. Ejecutar regresión transversal completa una sola vez.
4. Auditar seguridad, autorización, RLS, storage privado, CORS, rate limits,
   idempotencia, reintentos, timeouts y logs.
5. Capturar rutas críticas desktop/móvil y estados loading/error/empty/success.
6. Revisar diff completo, artefactos generados, secretos y migraciones ordenadas.
7. Crear checklist pre-commit y post-deploy, pero no commitear hasta autorización.
8. Cero bugs críticos conocidos y cero diferencias inexplicables en ledgers.

### Punto 17 — SEO, GEO, herramientas, blog y beta gratuita

Este punto fue nombrado explícitamente por el usuario.

- Explotar búsquedas como becas para paraguayos, empleos, ATS, mejorar CV sin
  inventar y adaptación gratuita por vacante.
- Blog gratuito con contenido útil y verificable, no páginas thin ni spam.
- GEO: respuestas estructuradas, entidades, fuentes, FAQ honesta, schema válido
  y contenido citable; no manipular motores generativos.
- SEO técnico: canonical, sitemap selectivo, robots, OG, JSON-LD, internal links,
  slug, noindex para pendientes/vencidas/privadas.
- Comunicar con buena redacción que las funciones estarán gratuitas durante la
  beta, probablemente hasta diciembre de 2026, sujetas a capacidad y posible
  limitación futura. No prometer gratuidad permanente ni crear urgencia engañosa.
- Crear blogs basados en brechas y búsquedas reales, siempre borradores sujetos a
  revisión.
- AdSense es secundario: monetizar tráfico público que no convierte; no ponerlo
  en flujos privados. Seguir `ADSENSE-ACTIVATION.md`.
- Verificar GA4 y Search Console sólo con credenciales configuradas en cierre.

### Punto 18 — Expansión masiva de scrapers si hay menos de 1.000 oportunidades

Autorización conceptual del usuario: si después de los puntos anteriores el
inventario útil sigue por debajo de 1.000, incorporar más fuentes.

No medir sólo filas brutas. Consultar separadamente:

- activas y vigentes;
- verificadas;
- visibles en catálogo;
- elegibles para matching;
- por categoría y país;
- pendientes/rechazadas/duplicadas.

Trabajar por lotes paralelizables, pero cada fuente debe pasar el contrato. Usar
las 40 fichas para no repetir investigación. Recolectar masivamente a `in_review`,
deduplicar y moderar; no auto-publicar 1.000 registros. El objetivo es volumen
útil, no un contador artificial.

## 11. Cola manual final

No pedir estas acciones durante puntos 13–15 salvo bloqueo. Consolidarlas al
cerrar punto 16/17/18.

### Antes del commit

- Revisar `git status`, diff completo y secretos.
- Confirmar que no haya ZIP, manifest, screenshots temporales, CVs ni archivos
  de auditoría sensibles.
- Build, tests críticos, scrapers, DB lint y `git diff --check` sobre el estado
  exacto.
- Confirmar orden y reversibilidad de migraciones.
- Decidir mensaje y alcance de un único commit candidato.

### Después del commit y antes del deploy

- Backup reciente de Supabase productivo.
- Verificar proyecto vinculado y comparar migraciones locales/remotas.
- Aplicar en orden `202608130001` a `202608130012`; no asumir que producción las
  tiene porque local sí.
- Desplegar/actualizar `match-batch` si su diff sigue incluido:

```powershell
npx.cmd supabase functions deploy match-batch `
  --project-ref rbrirxbjbmdxflzaxxzp --use-api
```

- Configurar variables privadas faltantes en Netlify sin mostrarlas en chat.
- Crear Deploy Preview, no producción directa.

### Variables/servicios manuales

- Supabase frontend/backend y `service_role`.
- AWS Bedrock: `CVITAE_AWS_ACCESS_KEY_ID`,
  `CVITAE_AWS_SECRET_ACCESS_KEY`, `CVITAE_AWS_REGION`.
- `GEMINI_API_KEY` privada.
- `RESEND_API_KEY`, dominio/remitente y entrega real.
- `ADMIN_PASSWORD`.
- GA4/Search Console: `GA4_PROPERTY_ID`, `SEARCH_CONSOLE_SITE_URL`,
  `GOOGLE_SERVICE_ACCOUNT_JSON`; compartir propiedades con `client_email`.
- AdSense sólo después de aprobación/CMP/slots/ads.txt; mientras tanto READY=false.

### Después del deploy preview

- Ejecutar recorrido B2C real controlado.
- Ejecutar B2B con empresa verificada de prueba y PDFs ficticios.
- Punto 12: 65 PDFs, 30/30/5, reenvío de operation_id y dos solicitudes
  simultáneas.
- Verificar propietario/no propietario para descarga del CV.
- Verificar emails de match alto: consentimiento, idempotencia y unsubscribe.
- Verificar feedback B2C/B2B → admin.
- Verificar admin contra consultas directas, GA4 y Search Console.
- Verificar scraper con cero resultados y otro fallido.
- Capturas desktop/móvil y consola/logs.
- Ejecutar plan de 70 controles y documentar excepciones.

### Producción

- Sólo tras aprobación del preview.
- Mantener cron y fuentes nuevas pausados al inicio.
- Observar errores, ledger, emails, storage, costes IA y scrapers.
- Tener rollback del commit y de activaciones; no revertir migraciones con pérdida
  de datos improvisadamente.

## 12. Prompt operativo para Claude

Copiar el siguiente bloque como mensaje inicial en Claude Power/Code:

```text
Estamos continuando un QA largo y secuencial de CVitae Unified.

Workspace: C:\Users\isaso\cvitae-unified
Rama: feature/aws-migration
Producción: https://cvitae.lat
Retomá desde el PUNTO 13. Los puntos 1–12 ya tienen cambios importantes y no
deben rehacerse ni resetearse.

Antes de actuar, leé COMPLETO:
1. C:\Users\isaso\cvitae-unified\docs\CLAUDE-HANDOFF-QA-POINT-13.md
2. docs\BETA-DEPLOY-TEST-PLAN.md
3. docs\BETA-STATUS-AND-SOURCE-HANDOFF.md
4. docs\QA-B2B-PDF-CREDITS.md
5. docs\B2B-PROGRESSIVE-APPLICATION-REVIEW.md
6. docs\ADMIN-OPERATIONS.md
7. docs\SCRAPER-AUDIT-2026-08-13.md
8. docs\DASHBOARD-MATCHING-INTELLIGENCE.md
9. docs\ADSENSE-ACTIVATION.md
10. docs\LOCAL-STAGING.md

Después inspeccioná git status, rama, HEAD y diff sin modificar nada. El worktree
está deliberadamente sucio y contiene cambios del usuario y de 12 tareas. No
uses reset, checkout, clean ni sobrescribas cambios ajenos. No hagas commit,
push, deploy, cron, publicación masiva ni escrituras productivas sin permiso.

No existe todavía una skill completa para QA de CVitae Unified. Creá primero,
sin detener el trabajo, esta skill repo-local:
C:\Users\isaso\cvitae-unified\.claude\skills\cvitae-unified-qa\SKILL.md
Debe condensar el handoff: trabajo secuencial, pruebas por impacto, Docker/
Supabase, migraciones, idempotencia/créditos, privacidad B2B, evidencia B2C,
scrapers con revisión y cola manual. No copies secretos. También podés leer:
- C:\Users\isaso\.codex\skills\cvitae-scrapers\SKILL.md
- C:\Users\isaso\.codex\skills\cvitae-visual-quality\SKILL.md
- C:\Users\isaso\cvitae-growth-skill\cvitae-growth\SKILL.md
La skill Growth es genérica y NO reemplaza este protocolo; no la modifiques
silenciosamente.

Forma de trabajo obligatoria:
- Trabajamos UN PUNTO por vez.
- Completá el 13, informá cambios/pruebas/manuales y detenete.
- Esperá que el usuario diga “completo, tarea 14”. Repetí hasta el cierre.
- Tras cada cambio, ejecutá sólo pruebas afectadas. No repitas suites ya aprobadas
  si el cambio no salpica esa área. Regresión completa recién en punto 16/final.
- Todo lo que requiere credenciales, commit o deploy se agrega a una sola cola
  manual final, salvo bloqueo urgente.
- Usá datos ficticios; nunca CVs reales ni secretos en logs/chat.
- Un build verde no certifica visual; inspeccioná render cuando corresponda.
- Reportá con precisión qué se probó realmente y qué sigue manual.

PUNTO 13: calibración B2C de matching y calidad de recomendaciones.
Objetivo: crear una matriz reproducible de perfiles/oportunidades, medir
precision@10, falsos positivos de match alto, cobertura, exclusiones, latencia y
recálculo tras cambios de perfil/evidencia. Verificar activos, vigencia,
verificación, permisos, país/elegibilidad, no licitaciones, skills, seniority,
ubicación/modalidad y explicaciones. Validar el loop match → brecha repetida →
aprendizaje → evidencia/progreso → nuevo match. Mejorá código sólo donde el test
revele fallas y dejá el test reproducible. No toques B2B progresivo ni scrapers
si no hay dependencia.

Al cerrar el punto 13 entregá:
1. resultado primero;
2. archivos tocados con rutas;
3. matriz/métricas y hallazgos;
4. comandos ejecutados y resultados;
5. riesgos o manuales agregados a la fila final;
6. confirmación explícita de que no hiciste commit/deploy;
7. “Esperando: completo, tarea 14”.
```

## 13. Criterio de cierre global

No declarar QA terminado hasta cumplir:

- 0 bugs críticos conocidos;
- 100 % de flujos críticos pasando o excepción explícita;
- 0 diferencias inexplicables en ledger de créditos;
- errores externos recuperables sin corromper estado;
- autorización B2C/B2B/Admin comprobada;
- fuentes activas con calidad y telemetría;
- logs suficientes para reconstruir operaciones sin guardar CV completo;
- pruebas visuales y responsive reales;
- migraciones y deploy preview validados;
- cola manual completada y documentada.
