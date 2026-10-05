# Backlog posterior al release

Este archivo guarda la memoria persistente de bugs, mejoras, deuda técnica, nuevas fuentes, optimizaciones, problemas de infraestructura, oportunidades de producto y observaciones que deliberadamente se posponen para releases futuros. No reemplaza `docs/GRAND_CHECKPOINT.md`, C01–C21 ni el MASTER 1–67.

## Gobernanza

1. GRAND_CHECKPOINT = verdad del release ACTUAL.
2. POST_RELEASE_BACKLOG = cosas deliberadamente pospuestas para deploys FUTUROS.
3. Un item del backlog sólo pasa a trabajo activo cuando el usuario lo autoriza.
4. Cuando un item entra a ejecución, registrar qué Cxx/release lo absorbe.
5. Nunca borrar items terminados: marcar DONE y agregar evidencia.
6. No usar este archivo para justificar cambios adicionales durante el release actual.
7. Si aparece un bug mientras trabajamos, registrarlo inmediatamente aquí antes de seguir, salvo que bloquee el release actual.
8. Si bloquea el release actual, debe entrar primero en la Biblia C01–C21 y el backlog sólo puede referenciarlo.

Los IDs son persistentes y consecutivos: `PD-001`, `PD-002`, `PD-003`, etc. No renumerar ni reutilizar IDs. Cada item conserva los campos TYPE, STATUS, DISCOVERED_AT, FOUND_WHILE, PROBLEM, EXPECTED, CURRENT, AFFECTED_FILES_OR_SYSTEMS, EVIDENCE, SCOPE_NEXT_DEPLOY, DO_NOT_DO_NOW y CLOSURE_TEST.

TYPE admite: BUG | SOURCE | PERFORMANCE | INFRASTRUCTURE | UX | SEO | MATCHING | ADMIN | OTHER.

STATUS admite: BACKLOG | READY_FOR_NEXT_DEPLOY | BLOCKED | DONE.

PD-002 conserva la excepción de gobernanza `TYPE=OTHER / PROCESS` y `STATUS=DONE_AS_GOVERNANCE_RULE`, definida explícitamente por el usuario. Los bloqueos del release actual se registran primero en C01–C21; aquí sólo se referencian.

### PD-001 — Añadir UNICEF Jobs como fuente de oportunidades

TYPE: SOURCE

STATUS: BACKLOG

DISCOVERED_AT: 2026-10-04

FOUND_WHILE: Cierre B2C C01–C21

SOURCE: UNICEF Jobs

URL: https://jobs.unicef.org/en-us/listing/

PROBLEM: CVitae todavía no incorpora esta fuente en su sistema de oportunidades.

EXPECTED: UNICEF Jobs debe poder ingresar por la misma arquitectura canónica de fuentes que los demás scrapers, sin crear un pipeline especial.

CURRENT: No implementado.

AFFECTED_FILES_OR_SYSTEMS: UNKNOWN — no investigar ahora.

EVIDENCE: Fuente, URL y estado actual proporcionados por el usuario el 2026-10-04. No se investigó la web, el mecanismo de extracción ni los permisos en esta tarea.

SCOPE_NEXT_DEPLOY:

Antes de implementar:

- comprobar términos/robots/permisos;
- identificar mecanismo de listado y detalle;
- determinar si existe API/feed o requiere HTML;
- mapear canonical source;
- Adapter/Cleaner;
- factual observations;
- lineage;
- Factory;
- Universe;
- Catalog;
- Matching;
- Alerts;
- SEO según permiso real;
- Admin Source Intelligence;
- source-specific tests;
- incremental/bounded scraping;
- deduplicación.

DO_NOT_DO_NOW:

- no investigar la web;
- no escribir scraper;
- no registrar permisos inventados;
- no modificar Registry;
- no añadir schedules;
- no tocar release actual.

CLOSURE_TEST:

Una oportunidad UNICEF real debe demostrar end-to-end:

```text
discovery
→ adapter
→ cleaner
→ sink
→ lineage
→ factual observation
→ Factory
→ verification/lifecycle
→ Universe
→ consumers permitidos
→ Admin
```

Sin bypasses y sin introducir full scans.

### PD-002 — Declaración falsa de cable conectado por evidencia sólo local

TYPE: OTHER / PROCESS

STATUS: DONE_AS_GOVERNANCE_RULE

DISCOVERED_AT: 2026-10-04

FOUND_WHILE: C09 / C20 — cierre B2C C01–C21

PROBLEM: Durante varias pasadas se consideró avanzado/cerrado el cableado porque la lógica local y los tests pasaban, aunque los switches/configuración efectivos de PROD seguían impidiendo que oportunidades listas llegaran a Catálogo, Matching y Alertas.

EXPECTED: Cierre con evidencia de existing data, future data, negative path y effective state, distinguiendo prueba local de validación PROD.

CURRENT: Regla permanente registrada; aplicación y validación PROD todavía pendientes.

AFFECTED_FILES_OR_SYSTEMS: WORKING_PRINCIPLES.md; GRAND_CHECKPOINT C09/C20; source policy; Universe; Catálogo, Matching y Alertas.

EVIDENCE: PROD 2026-10-04 informado por el usuario: inventory=16497; catalog_final_ready=0; matching_final_ready=0; alerts_final_ready=0; seo_final_ready=6284. Himalayas: catalog_permission=ALLOWED, matching_permission=ALLOWED, alerts_permission=ALLOWED; catalog_row_ready=5477, matching_row_ready=5441, alerts_row_ready=5441; los tres switches estaban DENIED.

PREVENTION: Aplicar CABLE CONNECTION CLOSURE CONTRACT de WORKING_PRINCIPLES.md. No borrar este item nunca.

SCOPE_NEXT_DEPLOY: C09 absorbe la corrección del bloqueo demostrado y exige reconciliación histórica, automatización futura y validación PROD autorizada.

DO_NOT_DO_NOW: No declarar PROD_VALIDATED por evidencia local; no ejecutar writes, reconciliación ni deploy PROD durante esta pasada.

CLOSURE_TEST: La regla permanece registrada y cada cierre de cable evidencia las cuatro condiciones, con estados locales y PROD separados.

### PD-003 — Snapshots paginados sin presupuesto total de ejecución

TYPE: PERFORMANCE

STATUS: DONE

DISCOVERED_AT: 2026-10-04

FOUND_WHILE: C20, al conectar inputs de política efectiva de Alertas y comprobar el CLI de recovery.

PROBLEM: Paginar una lectura no limita el trabajo total si se acumulan todas las páginas antes de procesar. Este pendiente está registrado primero en C20 de la Biblia actual; el backlog sólo lo referencia.

EXPECTED: Presupuesto explícito por ejecución, memoria acotada, cursor durable y cobertura eventual; no perder oportunidades ni perfiles por un límite fijo.

CURRENT: C20 cerrado localmente 2026-10-05: sender y maintenance limitan antes de acumular, con cursor/pending effects y cobertura eventual. Schema/runtime/canary PROD pendientes.

AFFECTED_FILES_OR_SYSTEMS: netlify/functions/send-high-match-alerts.ts; shared/matching-retrieval.ts collectAlertCandidateSnapshot; scripts/run_source_maintenance.py fetch_inventory; C20.

EVIDENCE: Hallazgo original conservado: alertOpportunities/cacheRows completos, profiles limit(250), fetch_inventory anterior al work_budget. Correccion probada con handler real, PostgreSQL local de selector/lease/delivery y maintenance: 7 filas en 4+ paginas, 251 perfiles elegibles, retries/checkpoint outage, consentimiento/threshold/dedup, TTL y memoria por batch PASS. No lectura ni validacion PROD.

SCOPE_NEXT_DEPLOY: C20 absorbe el pendiente dentro del cierre actual. Reusar estado/ledger existente para budget/cursor y probar múltiples páginas/perfiles; preservar scoring, thresholds, consentimiento y deduplicación. Este item no abre una fase ni una lista operativa alternativa.

DO_NOT_DO_NOW: No ocultar el pendiente con un límite que trunque producto; no inventar cierre; no cambiar scoring ni reconstruir consumers principales; no medir desplegando ni ejecutar jobs PROD.

CLOSURE_TEST: Más de una ventana/batch y más de 250 perfiles reciben cobertura eventual mediante cursor; costo/memoria por ejecución permanece acotado y una segunda ejecución no repite filas UNCHANGED innecesariamente. C20 debe contener la evidencia antes de marcar este item DONE.



### PD-004 — Clave duplicada en el resumen de lifecycle

TYPE: BUG

STATUS: BACKLOG

DISCOVERED_AT: 2026-10-04

FOUND_WHILE: C09, compilación local del código que usa el inspector Admin.

PROBLEM: summarizeOpportunityUniverse declara dos veces TOP_LIFECYCLE_UNRESOLVED_REASONS en el mismo objeto. JavaScript conserva la última expresión y el compilador advierte la duplicación.

EXPECTED: Una sola definición explícita del campo, con su alcance documentado y probado.

CURRENT: El resumen usa la última definición. No se demostró una regresión de producto que bloquee este release; las pruebas de Universe pasan. No se modificó este campo durante el cableado.

AFFECTED_FILES_OR_SYSTEMS: src/lib/opportunity-universe.ts, summarizeOpportunityUniverse.

EVIDENCE: Compilación local con esbuild: Duplicate key TOP_LIFECYCLE_UNRESOLVED_REASONS. El código contiene una expresión sobre decisions y otra posterior sobre lifecycleUnresolved. No se consultó PROD.

SCOPE_NEXT_DEPLOY: Con autorización del usuario, comprobar el alcance que espera Admin, conservar la única definición correcta y agregar una prueba del resumen para lifecycle resuelto y pendiente.

DO_NOT_DO_NOW: No cambiar clasificación, readiness, Matching ni el contrato de salida durante el release actual sólo para silenciar un warning.

CLOSURE_TEST: Compilación sin esa duplicación y una prueba que confirma el alcance acordado del campo sin alterar los demás totales.

### PD-005 — Evaluar retorno a cuenta Netlify anterior

TYPE: INFRASTRUCTURE

STATUS: BACKLOG

DISCOVERED_AT: 2026-10-05

FOUND_WHILE: C20 / preflight del release actual.

PROBLEM: La cuenta Netlify actual agotó prácticamente sus créditos durante debugging. Existe una cuenta Netlify anterior que previamente alojaba CVitae y probablemente conserva configuración/environment variables. El dominio fue movido en Namecheap.

EXPECTED: Elegir una cuenta con configuración válida y créditos disponibles para el único release final, sin usar producción para debug.

CURRENT: Pendiente de comparar; no se accedió a cuentas ni se verificó su configuración en esta pasada.

AFFECTED_FILES_OR_SYSTEMS: Cuentas/proyectos Netlify, environment variables, production branch, build/functions/redirects y dominio/DNS en Namecheap. Identificadores y configuración exactos todavía no investigados.

EVIDENCE: Información proporcionada por el usuario: créditos actuales prácticamente agotados, cuenta anterior que alojaba CVitae y dominio movido en Namecheap. La conservación de variables/configuración es probable, no verificada. No se consultaron secrets.

SCOPE_NEXT_DEPLOY:

Antes del deployment final comparar ambas cuentas:

- site/project existente;
- environment variables;
- production branch;
- build command;
- publish directory;
- functions directory;
- redirects;
- domain/DNS;
- deploy history;
- available credits/quota.

Si la cuenta anterior permite publicar sin costo inmediato y tiene configuración válida, preparar migración controlada y usarla para el único release final. Activar este item sólo con autorización explícita del usuario; registrar el release/C21 que lo absorba.

DO_NOT_DO_NOW:

- No cambiar Namecheap.
- No cambiar dominio.
- No mover deploy.
- No revelar secrets.
- No ejecutar deploy.

CLOSURE_TEST: cvitae.lat sirve el mismo release, functions y variables requeridas desde la cuenta elegida y smoke tests pasan.
