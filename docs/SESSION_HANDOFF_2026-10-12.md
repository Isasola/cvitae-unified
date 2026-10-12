# CVITAE — SESIÓN MAESTRA / CONTINUIDAD 2026-10-12

**Estado:** `PROD_BASELINE_VERIFIED / P0_ROOT_EVIDENCE_OBTAINED / SOURCE_EXPANSION_APPROVED_LOCAL_ONLY / NO_DEPLOY`.

> Este documento es el puntero de sesión y registro de decisiones nuevas. No sustituye `AGENTS.md`, `WORKING_PRINCIPLES.md`, el histórico `GRAND_CHECKPOINT.md`, el registro canónico `BUG_REGISTRY.md`, el backlog ni el Registry V2. Leerlos en ese orden. Actualizado desde evidencia suministrada por el operador después del ZIP documental `36b722c4` y sin nuevas mutaciones de producción.

## 1. Identidad y límites

- Dominio: `https://cvitae.lat` / Netlify **cvitae-lata**, no confundir con `cvitae-lat`.
- PR #4 se fusionó vía squash; Netlify reportó **Published**, branch `feature/aws-migration` @ **`ce6dc7aba3dec35c6785fb7100d6125cd0962dab`** (2026-10-11). Confirmar si hay despliegue posterior antes de planificar release.
- Worktree LOCAL Windows del usuario: `C:\Users\isaso\cvitae-beta-postdeploy-20261011`, rama `work/beta-hardening-postdeploy-20261011`, commit base documental **`36b722c46170e9f90c66899abaaae82a9e2a95a2`** derivado directamente de producción. El ZIP de esta sesión contiene una actualización documental producida fuera de esa computadora; **NO PRESUMIR** que ya fue sincronizada o commiteada en el worktree Windows.
- Histórico Master 1–67 preservado, índice `docs/MASTER_1_67_STATUS_INDEX.md`; C3 `PROD_VALIDATED` limitado a su contrato (no reabrir); C4 branch `checkpoint/r2-c4-beta-wip-20261011` SHA `b014b3f278b5b68066170dbab4be5f2ee18a44da`, `001/002` NO instaladas; copia referencia `docs/PENDING_C4_NOT_DEPLOYED` no ejecutable.
- Cero push/deploy/Netlify/DB writes/cambios de permisos sin aprobación posterior explícita. Local docs/source edits y verificaciones focalizadas sí son el alcance aprobado. Evitar más auditorías generales y minimizar llamados a Codex.

## 2. Bugs y evidencia productiva — SIN datos personales

### P0 BUG-003 — CV Vivo/Mejorar CV: write de versiones

Netlify `cv-rewrite-workspace`: Bedrock Sonnet 4.6 respondió `success`; varias operaciones siguientes fallaron con `duplicate key value violates unique constraint "generated_cvs_user_vacancy"`. Supabase READ ONLY confirmó simultáneamente constraint `generated_cvs_user_vacancy UNIQUE(user_id,vacancy_id)` e índice `generated_cvs_user_vacancy_version_uidx UNIQUE(user_id,vacancy_id,version_number)`. Es una incompatibilidad real en persistence/versionado, **no prueba de fallo de IA**. La migración anterior eliminaba un nombre de constraint diferente. Proponer nueva migración quirúrgica y revisar callers, versiones, NULL, concurrencia e idempotencia sin ejecutarla. Validar local con datos ficticios y preservar CV originales; no regenerar IA para demostrar unicidad.

### P0 BUG-002 — ATS HTTP 502

Error real del browser. Logs Netlify incluyen una ejecución `Duration: 30000.00 ms Status: timeout` (Oct 11 ~20:30 Paraguay); la copia no identifica la función de esa ejecución, así que NO atribuir automáticamente timeout a ATS ni Bedrock. Ubicar request/función/etapa con logs sanitizados; separar provider, function, persistencia, respuesta y UI, sin gastar llamadas IA innecesarias.

### P0 BUG-001 — Matching: engine SUCCESS_ZERO, no solo Dashboard

5 snapshots `request_mode=default` `run_status=SUCCESS` en 7 días, 1 cuenta distinta; último 2026-10-12 00:45 UTC: retrieval reciente máximo 300, semántico 120, 388 únicos evaluados, 0 matches, 0 potencial visible, 376 abstenciones, 12 denegados, `DATA_COVERAGE_GAP`, `NO_SCAN`, embedding READY, 70 potencial-scoreable. `HARD_REQUIREMENTS_UNKNOWN=388` aparece como indicador pero no está probado como gate único de rechazo.

SQL read-only 2026-10-12 01:17 UTC: Universo state 16,541; matching row READY **6,224**; final Matching **203**, Catalog **204**, SEO **6,021**. Las 203 finales: **solo Himalayas**, las 203 remotas; 202 sin `eligible_countries`/`eligible_regions`, 21 con `remote_scope`, 1 con `eligible_countries`; ninguna confirmada global. **Remote ≠ eligibility**.

Desglose del primer gate consultado (6,224 = 5,830 + 191 + 203): 5,830 detenidas en switch de matching; 191 `final_gap` tras gates explícitos consultados, que son UNJobs 105 y Computrabajo 86; 203 READY. Himalayas 5,238 bloqueadas por switch, WWR 472; OpportunityDesk 33, Arbeitnow 27, Jobicy 21, otras. Muchas decisiones pueden ser legales/intencionales; NO abrir masivamente. Revisar estado efectivo, TTL, override, source identity y re-evaluación para histórico y futuro. Algunos `evaluated_at` permanecen Oct 2–7; comprobar freshness. Contar `source_matching_state='READY'` produjo cero porque son estados ALLOWED/DENIED/UNKNOWN; no confundir con falla.

`match-batch` consulta ventanas acotadas, y semantic retrieval puede elegir datos de `opportunities` antes del gate final; 388 candidatos por ventana y 203 filas de vista final NO son un delta demostrable sin reconciliar identidades/instantes. No alterar scoring ni fabricar potenciales. Aprender mostró plan con referencias a 5 y 2 oportunidades, pero puede consumir otro snapshot: no cierra BUG-001, y se observaron ejemplos call center de pertinencia discutible.

### P1 BUG-005/006/007/008 — Catálogo, LATAM, Admin, SEO

- En `/oportunidades`, el frontal presenta **100 cargadas** como si fuera total y mezcla `JOB` con promesa de becas/programas. El catálogo final actual observado fue 204, no 100; confirmar filtros/conteos y paginación antes de liberar fix. Empleos mantiene comunicación Paraguay, pero producto busca LATAM; estado por fuente/país/eligibilidad necesita prueba, no afirmación.
- SEO **6,021** filas final al momento de lectura; 6,038 era inventario preview anterior, NO indexación. Sitemap, robots y prerender ya automatizados; **no actualizar sitemap manualmente**. Verificar generación, keyset, permisos, ciclo de vida, canonical, HTML publicado para URL nueva, enlaces, GSC 28d vs 28d. No se sabe todavía causa de caída de impresiones.
- Admin debe exponer total por fuente, estado y primer gate, diferencias entre fuente activada y consumidor autorizado, UNKNOWN, razonamiento de exclusión y acciones seguras. C09/C09.1 y Source Intelligence V2 existentes se reutilizan; no construir un sistema paralelo.

### P2 BUG-009; P1 BUG-004

Simplificar Mejorar CV con flujo `elegir → mejorar → revisar → aceptar → encontrar nueva versión → descargar/usar`; diferenciar preparando/fallo/resultado persistido. Loaders compartidos con progreso real, no animación que inventa etapas; mejorar mobile después de P0.

## 3. Decisión del usuario para siguiente pasada local

**Reforzar todos los scrapers relevantes ya existentes y añadir Greenhouse y Lever.** Se implementarán como conectores por empresa/board/sitio dentro de la arquitectura existente (`source_registry`, `source_registry_v2`, identidad, adaptadores, observation writer, sink, telemetría, gates) sin alterar la autoridad del pipeline; nunca una fuente paralela que publique directamente.

- Priorizar límites conocidos: Jooble, Workday, OpportunityDesk, Computrabajo, Buscojobs, Arbeitnow, Becal, Jobicy, más otros auditados; cursor hasta EOF/continuación, rate-limit/retry, sharding controlado, dedup idempotente, actualización/cierre y normalización/evidence survival. Cubrir histórico y futuro. No 81 trabajos secuenciales dentro de una sola ejecución limitada a 60 minutos.
- **Greenhouse** official Job Board API GET por `{board_token}`, `content=true`. **Lever** public Postings API por `{SITE}`, paginación `skip/limit`. Construir allowlist configurada/auditada de boards empleadores, conservar atribución, stable IDs y enlace original; no POST candidaturas ni crawling indiscriminado. `COLLECT` solo después de revisar contrato de la fuente; `MATCHING/CATALOG/ALERTS/SEO/JOBPOSTING` flags separados y por defecto **OFF/PENDING_REVIEW**. Accesibilidad pública del API no autoriza republicación o SEO. Evitar inventar elegibilidad LATAM por dominio, país o remoto.
- Ver documentación oficial: Greenhouse https://docs.greenhouse.io/job-board.html ; Lever https://github.com/lever/postings-api . Contrastar permisos del proveedor y empleador antes de activar. Respetar matriz actual para Himalayas, We Work Remotely, Remotive, Jobicy, Impactpool, Fundación Carolina, etc.
- Objetivo de siguiente implementación LOCAL conjunta: bugs P0, universos y switches efectivos, scrapers nuevos/reforzados, Admin denominadores, catálogo, SEO y mejoras de UI compartidas cuando no distraigan. Reutilizar verificadores previos; pruebas focalizadas + canarios E2E con positivos y negativos, no volver a ejecutar 67 ítems. Ningún componente cerrado se reabre sin regresión.

## 4. Plan de cierre y control de permisos

- Cierre de un bug = archivo exacto / backend / SQL preparado / pruebas end-to-end + negativo + persistencia + historial + automatización futura + Admin + posterior validación en PROD. Un test PASS nunca equivale a PROD_VALIDATED.
- Los 67 puntos son libro histórico; sacar de la **cola activa** solamente tareas ya superadas con prueba y alcance preciso, conservar evidencia y no renumerar/eliminar ni declarar 67/67. Las fuentes legalmente negadas permanecen excluidas.
- No desplegar ni publicar hasta que el usuario revise el diff y autorice expresamente. Si una decisión requiere cambiar SQL/ACL en PROD, preparar migración y preflight READ ONLY, no ejecutar.

## 5. NEXT_EXACT_ACTION — para cualquier LLM

Abrir el ZIP maestro actualizado o el worktree sincronizado; leer `README_START_HERE.md` → `AGENTS.md` → `WORKING_PRINCIPLES.md` → `docs/GRAND_CHECKPOINT.md` → `docs/BUG_REGISTRY.md` → este handoff → `docs/BETA_NEXT_PASS.md` → skill `cvitae-scrapers` si se modifica captación. **No rediagnosticar** la incompatibilidad de CV versiones ni volver a pedir los mismos agregados Supabase. Determinar con análisis concreto los archivos que necesitan cambios; una única pasada coherente de Codex sobre la rama local, sin duplicar lógica y sin push/deploy/SQL WRITE; después registrar resultado, actualizar SHA/docs/ZIP y dejar un checkpoint ejecutable para nueva conversación.

`CURRENT_BLOCKER`: P0 ATS endpoint/timing attribution; migration CV version unapplied; matching en SUCCESS_ZERO con universo final estrecho y gates no conciliados; LATAM scrapers y SEO aún requieren canarios.
`LAST_PROVEN_GATE`: release `ce6dc7a` publicado; fallo de constraint y diagnósticos SQL de matching/source/SEO observados en PROD; ningún fix nuevo aplicado.
`DO_NOT_REOPEN`: C3; 67 ítems sin evidencia nueva; C4 SQL no aplicado; permisos denegados; deploy/sitemap ya automatizado; no tratar muestra como total.
