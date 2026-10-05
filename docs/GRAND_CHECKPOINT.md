# CVITAE GRAND CHECKPOINT

## ACTIVE CORRECTIVE LIST — SINGLE OPERATIONAL BIBLE

El master historico 1-67 permanece intacto debajo de esta Biblia. `DO NOT REOPEN` se limita al contrato local probado; PROD continua pendiente donde se indica.

### C01
- STATUS: LOCAL_NODE24_PASS / CI_PROD_PENDING
- MASTER_ITEMS: 18, 23
- CONTRACT: CI determinism; pnpm 11.8.0 and frozen lockfile
- TOOLS/FILES: package.json; pnpm-lock.yaml; matching-retrieval.yml; netlify.toml
- DEPENDS_ON: local pnpm/node; GitHub Actions and Netlify target Node 24
- CURRENT_EVIDENCE: Release preflight 2026-10-05: temporary worktree-local Node 24.21.0; pnpm 11.8.0 frozen/offline install PASS with unchanged lockfile; production build PASS with local SEO fixture (no PROD inventory access). Critical pipeline/B2C/Admin/SEO and release-gate verifiers PASS. RC TypeScript syntax and affected Alert typecheck evidence: artifacts/release/rc-node24-compile.json. This is local runtime evidence, not GitHub/Netlify or real product validation.
- CLOSURE_TEST: Local Node 24 frozen install/build/critical checks PASS; GitHub and chosen Netlify environment still require the same runtime and authorized release validation.
- NEXT: Run the metadata-only PROD preflight once; resolve target incompatibilities before any authorized migration/deployment. CI and PROD remain pending.

### C02
- STATUS: CLOSED_LOCAL / PROD_PENDING
- MASTER_ITEMS: 4, 18, 23
- CONTRACT: Outcome and trace completeness are orthogonal; persisted outcomes require exact opportunity_id
- TOOLS/FILES: scrapers/opportunity_sink.py; pipeline ledger migration; ingestion continuity verifiers
- DEPENDS_ON: Producer/run/source identity; deployed schema compatibility
- CURRENT_EVIDENCE: Local contract separates all outcomes from TRACED/INCOMPLETE; historical rows are not rewritten. Correccion de prefix 2026-10-05: migration 202610030001 y proyeccion inicial agregan ingestion_outcome/ingestion_trace_contract_version/ingestion_outcome_reason al final, conservando las 72 columnas legacy. verify_pipeline_view_prefix.ts ejecuta PostgreSQL local sobre fixture pre-v2 independiente del candidato: siete outcomes, trace factual/persisted-ID constraints e incertidumbre historica PASS. PROD schema/runtime siguen pendientes.
- CLOSURE_TEST: Test traced business outcomes, missing identity, persisted IDs and historical non-rewrite; then validate schema/runtime in PROD.
- NEXT: Test traced business outcomes, missing identity, persisted IDs and historical non-rewrite; then validate schema/runtime in PROD.

### C03
- STATUS: CLOSED_LOCAL / PROD_PENDING
- MASTER_ITEMS: 21, 23, 24
- CONTRACT: One trace authority drives ingestion_state, health, counts, next_actions and Admin
- TOOLS/FILES: pipeline ledger SQL; Admin pipeline ledger
- DEPENDS_ON: C02 trace contract; deployed schema/runtime
- CURRENT_EVIDENCE: Local projection uses trace_state and does not infer TRACED from ledger id. verify_pipeline_view_prefix.ts 2026-10-05: misma autoridad en ingestion_state/health/next_actions/counts; admin_opportunity_pipeline_ledger, accounting SQL y consumer Admin por nombre PASS. CREATE OR REPLACE conserva el OID y dependencia SELECT * sin DROP; instalacion inicial + corrective repetida conserva la misma proyeccion 72+3. Sin cambio C09/C20 ni revalidacion PROD.
- CLOSURE_TEST: Same row cannot report TRACED and INCOMPLETE; Admin counts and reasons agree; PROD runtime validation.
- NEXT: Same row cannot report TRACED and INCOMPLETE; Admin counts and reasons agree; PROD runtime validation.

### C04
- STATUS: CLOSED_LOCAL / PROD_PENDING
- MASTER_ITEMS: 4, 18, 19, 23
- CONTRACT: Technical persistence/lineage failure fails the final run; legitimate business outcomes do not
- TOOLS/FILES: run_scraper_monitored.py; summarize_scraper_run.py; scrapers.yml; refresh_embeddings.yml
- DEPENDS_ON: C02 receipt and workflow summary
- CURRENT_EVIDENCE: Local fixtures distinguish business outcomes and technical failures.
- CLOSURE_TEST: Technical failure makes final workflow fail after sources finish; business rejection remains non-technical; PROD workflow run.
- NEXT: Technical failure makes final workflow fail after sources finish; business rejection remains non-technical; PROD workflow run.

### C05
- STATUS: CLOSED_LOCAL / PROD_PENDING
- MASTER_ITEMS: 22, 23
- CONTRACT: Shared factual AdapterResult evidence writes Observation; sink never fabricates facts
- TOOLS/FILES: source_adapters.py; source_evidence.py; observation_writer.py; scan lineage
- DEPENDS_ON: Exact persisted identity, run identity and factual source evidence
- CURRENT_EVIDENCE: Local fixtures cover persisted, missing and write-failed observations; existing trigger remains refresh authority.
- CLOSURE_TEST: Factual adapter -> persisted row -> lineage -> Observation -> Universe refresh; validate future PROD event.
- NEXT: Factual adapter -> persisted row -> lineage -> Observation -> Universe refresh; validate future PROD event.

### C06
- STATUS: CLOSED_LOCAL / PROD_PENDING
- MASTER_ITEMS: 6, 22, 23
- CONTRACT: EXPECTED registry adapter/cleaner is distinct from actually EXECUTED provenance
- TOOLS/FILES: OpportunitySink; modern adapters; Admin Source Intelligence
- DEPENDS_ON: Adapter invocation metadata and Registry expectation
- CURRENT_EVIDENCE: Local provenance reports executed modern versions and LEGACY/NOT_REPORTED where unavailable.
- CLOSURE_TEST: Admin distinguishes EXPECTED and EXECUTED on future PROD runs.
- NEXT: Admin distinguishes EXPECTED and EXECUTED on future PROD runs.

### C07
- STATUS: LOCAL_READY / PROD_CANARY_PENDING
- MASTER_ITEMS: 23, 27
- CONTRACT: Normal scheduled ingestion uses existing bounded/resumable Automation Core only for certified, allowed sources
- TOOLS/FILES: run_source_scan_automation_bridge.py; run_scheduled_source_automation.py; manual workflow
- DEPENDS_ON: Sink lineage; factual Observation; Factory; explicit source certification/permission
- CURRENT_EVIDENCE: Worker locally bounded, resumable and fail-closed for UNKNOWN; workflow requires manual dispatch and release gate.
- CLOSURE_TEST: Authorized bounded PROD canary traverses producer -> sink -> Observation -> Factory -> Automation -> Universe; no bulk verification.
- NEXT: Authorized bounded PROD canary traverses producer -> sink -> Observation -> Factory -> Automation -> Universe; no bulk verification.

### C08
- STATUS: LOCAL_READY / PROD_PENDING
- MASTER_ITEMS: 8, 12, 16, 23
- CONTRACT: Universe due/dirty maintenance has a bounded common owner independent of Matching
- TOOLS/FILES: refresh_opportunity_universe_maintenance.ts; manual workflow; existing RPCs
- DEPENDS_ON: Existing due/dirty Universe RPCs
- CURRENT_EVIDENCE: Local owner calls same RPCs; cron removed pending authorized release/canary.
- CLOSURE_TEST: Prove policy deadlines/dirtiness reconcile while Matching is stopped; then PROD pending.
- NEXT: Prove policy deadlines/dirtiness reconcile while Matching is stopped; then PROD pending.

### C09 — Filas listas bloqueadas por switches históricos
- STATUS: LOCAL_WIRING_COMPLETE / PROD_APPLY_PENDING
- MASTER_ITEMS: 7, 8, 24
- CONTRACT: Filas READY + permisos ALLOWED estaban bloqueadas por switches operativos stale/false. El cierre exige sincronización real, historical repair y future automation. ROW_READY + permiso ALLOWED + fuente enabled + sin kill manual explícito = FINAL_READY. UNKNOWN y DENIED nunca se habilitan por un switch true.
- TOOLS/FILES: effective-source-policy.ts; opportunity-universe.ts; 202610040001_source_switch_wiring.sql; get_source_distribution_policy; admin_policy_events; common Universe owner; public catalog handler/RPC; Matching Retrieval/match-batch/Alert sender policy inputs; admin-data.ts exact-row inspector; verify_cable_wiring_sql.mjs; final-cable-apply-plan.md.
- DEPENDS_ON: Permisos canónicos existentes; audit del operador existente; migraciones/runtime desplegados; reconciliación con cursor; C21 autorización; C20 budget/cursor probado localmente; validacion PROD pendiente.
- CURRENT_EVIDENCE: PROD suministrado 2026-10-04, sin volver a consultarlo: inventory=16497; Catalog row_ready=6681/final=0; Matching y Alerts row_ready=6224/final=0; SEO=6284. Himalayas inventory=13204, Catalog row_ready=5477, Matching/Alerts=5441; permisos ALLOWED y tres switches DENIED. Jobicy/Remotive muestran el mismo patrón; UNJobs UNKNOWN y WWR DENIED se conservan. PostgreSQL local ejecutó las definiciones reales, triggers y vistas: existing eligible row pasa después de reconcile; future INSERT pasa automáticamente; UNKNOWN/DENIED bloqueadas; false->false manual explícito bloquea inmediatamente y queda auditado; factual Observation resuelve lifecycle UNKNOWN. El handler público real encontró una fila después de 1.200 filas nuevas. Admin exact-row y sus next_actions copian la misma autoridad del RPC actual; los estados anteriores quedan etiquetados como evidencia persistida. Evidencia: artifacts/release/cable-local-sql-evidence.json. Esto NO demuestra aplicación ni validación PROD.
- CLOSURE_TEST: Casos 1-8 en SQL ejecutado + endpoint real + Admin row inspector; permiso ALLOWED/default false sincroniza; override auditado mantiene denial; cursor histórico idempotente completa denominador. PROD: reconciliar bounded, verificar una Himalayas real y canary futuro después de autorización.
- NEXT: C20 budget/cursor ya PASS local; aplicar unicamente el plan despues del preflight y autorizacion. No repetir diagnóstico PROD ni habilitar cron por esta prueba local.

### C10
- STATUS: CLOSED_LOCAL / PROD_PENDING
- MASTER_ITEMS: 8, 30-34, 38-39
- CONTRACT: Himalayas first-party public page y ordinary organic SEO = ALLOWED; attribution/linkback = REQUIRED; JobPosting, Google Jobs y third-party distribution = DENIED. Computrabajo conserva exactamente su contrato temporal existente hasta 2026-10-09 inclusive, sin extensión ni permiso general.
- TOOLS/FILES: permission matrix; source Registry; source-permission-truth.ts; effective policy; Universe TS/SQL; SEO inventory; sitemap/prerender; Admin; fixtures
- DEPENDS_ON: C09 permission projection; exact factual row and UTC date
- CURRENT_EVIDENCE: Himalayas: Catalog/Matching/Alerts/SEO allowed when row gates pass, attribution/linkback required, JobPosting/Google Jobs/third-party denied. Computrabajo qualifying legacy SEO row only: READY 2026-10-03 and 2026-10-09 inclusive; expired 2026-10-10.
- CLOSURE_TEST: Runtime, Universe, SQL/artifact, build/sitemap/Admin parity; deny Himalayas job distribution; test Computrabajo on Oct 3/9/10 and new-row exclusion.
- NEXT: Validar el contrato desplegado después de un release autorizado; los gates locales y casos Computrabajo Oct 3/9/10 ya pasaron y no se reabren sin regresión concreta.

### C11
- STATUS: CLOSED_LOCAL / PROD_PENDING
- MASTER_ITEMS: 27, 42
- CONTRACT: Secondary B2C consumers read canonical Catalog/Matching state
- TOOLS/FILES: application-workspace.ts; gemini-courses.ts; generate-cv-vivo.ts
- DEPENDS_ON: Catalog universe; exact canonical Matching flow
- CURRENT_EVIDENCE: Local secondary contracts now use canonical consumer authorities; preserve UX and analytics.
- CLOSURE_TEST: Verify consumer result plus protected CTA/UI/mobile/state/analytics contracts; deployed consumer validation pending.
- NEXT: Verify consumer result plus protected CTA/UI/mobile/state/analytics contracts; deployed consumer validation pending.

### C12
- STATUS: CLOSED_LOCAL / PROD_PENDING
- MASTER_ITEMS: 42
- CONTRACT: User-pasted CV vacancy remains a private factual snapshot and never enters global opportunities/Universe
- TOOLS/FILES: generate-cv-vivo.ts; private vacancy_snapshot contract
- DEPENDS_ON: Existing generated-CV storage/user flow
- CURRENT_EVIDENCE: Local contract prevents global opportunity insert.
- CLOSURE_TEST: Custom CV path works while global Universe denominator stays unchanged; PROD validation pending.
- NEXT: Custom CV path works while global Universe denominator stays unchanged; PROD validation pending.

### C13
- STATUS: CLOSED_LOCAL / PROD_PENDING
- MASTER_ITEMS: 30, 38
- CONTRACT: URL_UPDATED queues only canonical SEO READY rows; URL_DELETED remains usable
- TOOLS/FILES: seo-pipeline-runner.ts; indexing queue
- DEPENDS_ON: Canonical effective SEO Universe
- CURRENT_EVIDENCE: Local queue checks canonical SEO membership.
- CLOSURE_TEST: Blocked/denied row cannot enqueue update; ready row can; prior indexed URL can be deleted.
- NEXT: Blocked/denied row cannot enqueue update; ready row can; prior indexed URL can be deleted.

### C14
- STATUS: CLOSED_LOCAL / PROD_PENDING
- MASTER_ITEMS: 21, 24
- CONTRACT: Global Source Intelligence is source-level and bounded; row evidence is on-demand
- TOOLS/FILES: admin-data.ts; Admin row inspector; payload verifier
- DEPENDS_ON: Existing Registry, pipeline and Universe projections
- CURRENT_EVIDENCE: Serialized local summary omits row descriptions, recent opportunity rows, evidence arrays and extraction histories; C20 additionally bounds Admin sample reads. Updated fixture payload gate PASS at 524632 bytes; deployed endpoint remains PROD_PENDING.
- CLOSURE_TEST: Global endpoint <1 MB target and hard fail >=2 MB; row inspector works; verify deployed endpoint.
- NEXT: Global endpoint <1 MB target and hard fail >=2 MB; row inspector works; verify deployed endpoint.

### C15 — Verificador local y producto realmente funcionando
- STATUS: CLOSED_LOCAL / PRODUCT_PROD_VALIDATION_PENDING
- MASTER_ITEMS: 20-24, 27-33, 38-39
- CONTRACT: El verificador local distingue correctamente estructura técnica de producto realmente funcionando. Falta comprobarlo con datos reales de PROD.
- TOOLS/FILES: verify-release-candidate.mjs; Admin endpoint and row inspector; release artifacts
- DEPENDS_ON: C01-C14 and future authorized PROD evidence
- CURRENT_EVIDENCE: El agregador local informó STRUCTURAL_LOCAL_PASS, MATCHING_PRODUCT_VALIDATION_PENDING (7 V2 + 1 downstream preexistentes) y PRODUCT_RELEASE_PENDING por Catalog/Matching/Alerts=0 y falta de evidencia desplegada de Admin/canary. Local PASS no afirma producto funcionando en PROD.
- CLOSURE_TEST: Structural suite passes; product gate demonstrates public rows, matching candidates, explicit routing, SEO exclusions, Admin payload/inspector, future canary and explained state.
- NEXT: Revisar el JSON real de diagnóstico; después del release autorizado demostrar contenido público, candidatos Matching, permisos, SEO, Admin y canary con datos PROD. No repetir la suite local sin cambios relevantes.

### C16
- STATUS: DEFERRED_HISTORICAL_RECOVERY
- MASTER_ITEMS: 12, 13, 16, 20
- CONTRACT: Historical backlog uses existing Observation recovery and Factory runners; no synthetic Observation or new backfill architecture
- TOOLS/FILES: existing recovery and Factory runners
- DEPENDS_ON: Correct future wiring and separate explicit PROD authorization
- CURRENT_EVIDENCE: No historical recovery executed in this pass; backlog remains.
- CLOSURE_TEST: After future PROD wiring, run bounded/resumable recovery through existing authorities only.
- NEXT: After future PROD wiring, run bounded/resumable recovery through existing authorities only.

### C17 — Primero candidatos reales, después el perfil real
- STATUS: BLOCKED_UNTIL_MATCHING_HAS_REAL_CANDIDATES
- MASTER_ITEMS: 25-27
- CONTRACT: NO tocar scoring. Primero deben existir oportunidades reales disponibles para Matching. Después se prueba el perfil real del usuario.
- TOOLS/FILES: matching.ts; matching-v2.ts; verify-matching-v2.ts; verify_downstream_match_behavior.ts
- DEPENDS_ON: C09 routing and matching_ready > 0
- CURRENT_EVIDENCE: Matching core and two failing verifiers/fixtures have no diff from HEAD in this worktree; seven V2 assertions and one downstream confidence assertion remain product validation failures.
- CLOSURE_TEST: After authorized release produces matching_ready > 0, test a real profile end-to-end; reopen scoring only for demonstrated relevance failure.
- NEXT: After authorized release produces matching_ready > 0, test a real profile end-to-end; reopen scoring only for demonstrated relevance failure.

### C18
- STATUS: BLOCKED_BY_PROD_GSC_MEASUREMENT
- MASTER_ITEMS: 34, 37-40
- CONTRACT: SEO/GSC measurement and any copy/keyword work wait for corrected route truth and PROD
- TOOLS/FILES: existing Search Console evidence loop
- DEPENDS_ON: C10 corrected SEO truth; future authorized release
- CURRENT_EVIDENCE: No SEO copy or keyword work performed; measurement remains pending while routes are blocked/unvalidated.
- CLOSURE_TEST: After release compare indexing, impressions, clicks, queries and pages; no optimization before evidence.
- NEXT: After release compare indexing, impressions, clicks, queries and pages; no optimization before evidence.

### C19
- STATUS: CLOSED_LOCAL
- MASTER_ITEMS: MASTER 1-67
- CONTRACT: Esta única Biblia operativa conserva C01-C21 y el Master histórico 1-67 intacto. CLOSED_LOCAL no equivale a PROD_VALIDATED.
- TOOLS/FILES: docs/GRAND_CHECKPOINT.md; this local verifier pass
- DEPENDS_ON: Estados/evidencia exactos C01-C21 y contrato C21 explícito del usuario.
- CURRENT_EVIDENCE: Única Biblia C01-C21; Master histórico conservado sin cambios. Diagnóstico PROD recibido del usuario, no repetido. PostgreSQL embebido ejecutó migrations/reducers/triggers/vistas de cableado y consumer/Admin locales; esto no implica PROD. C09 queda LOCAL_WIRING_COMPLETE / PROD_APPLY_PENDING; C20 tiene presupuesto/cursor/cobertura local probados; su validacion PROD sigue pendiente. C21 mantiene push = deploy y autorización explícita.
- CLOSURE_TEST: Check every Cxx required field/status, Active Left and retained Master 1-67.
- NEXT: Mantener esta Biblia con evidencia ejecutada y pendientes exactos; no afirmar validación PROD desde pruebas locales.

### C20 — FULL-SYSTEM CAPACITY / QUERY COST
- STATUS: LOCAL_BOUNDED_CONTRACT_PASS / PROD_VALIDATION_PENDING
- MASTER_ITEMS: 18, 20-24, 27-39, 42
- CONTRACT: BOUNDED WORK != TRUNCATED PRODUCT. Límites de batch/cursor controlan costo por ejecución sin eliminar cobertura; búsqueda/filtros consultan el conjunto canónico completo. No declarar FULL-SYSTEM bounded PASS si una ventana se pagina pero se acumula completa en memoria sin presupuesto total/cursor.
- TOOLS/FILES: Matriz C20 existente; 202610040001_source_switch_wiring.sql; 202610040002_public_catalog_coverage.sql; public-opportunity-pagination.ts; public catalog handler/browser lists; recovery/maintenance; common Universe owner; verify_cable_wiring_sql.mjs; verify_observation_coverage_recovery.py; final-cable-apply-plan.md; performance-prod-readonly.sql (antecedente, NO ejecutar nuevamente); 202610050001_bounded_alert_progress.sql; verify_c20_alert_pages.ts; verify_c20_alert_sql.mjs; verify_c20_maintenance_pages.py; verify_source_maintenance.py.
- DEPENDS_ON: C09 configuración efectiva; mismos reducers/RPCs; índices y schema desplegados; presupuesto/cursor del snapshot de Alertas y selección normal de maintenance; autorización C21.
- CURRENT_EVIDENCE: Correcciones comprobadas localmente: Catalog filtra en SQL antes de page=101, entrega 100 + cursor y conserva field allowlist; fila posterior a 1.200 encontrada por handler real; 1.301 filas recorren 14 páginas sin pérdida en verifier. Sitemap conserva todas las URLs en páginas de 1.000. Dirty source conserva cursor y refresca máximo 250/source/page, owner=1 source x 10 batches, sin full source refresh por consumer. Reconcile histórico recorre una sola secuencia de IDs para todos los consumers. Due lifecycle usa next_lifecycle_check_at indexado; no reevalúa todas las fechas por tick. Recovery real main/planner recorre 251 IDs en 3 ejecuciones, cursor durable, sin HTTP real; sólo marca completado cuando la evidencia autorizada fue procesada; CLI ahora acepta el flag exacto que invoca recovery. Admin fixture=524632 bytes. Métricas PROD YA suministradas: DB~182MB, connections=9/active=1, cache~99.999%, blocks_read=2088; temp_bytes=200071624327/temp_files=46955; opportunities seq_scan=41807/seq_tup_read=493174773. Son acumulados; no atribuyen por sí solos queries ni justifican comprar compute. No hubo nueva lectura PROD. Cierre local 2026-10-05: sender real 7 rows / batches de 2 / 4+ paginas, pendientes durables y fair profile rotation; PostgreSQL local recorre 251 perfiles elegibles, sin mover el cursor de Matching. Cache lane, delta watermark, preferencias, threshold, exclusion canonica, retry y fallo de checkpoint posterior al email pasan sin duplicar envios. Maintenance real recorre 7 filas / 4 paginas, reanuda automaticamente desde scraper_runs, prueba runtime partial page sin repetir IDs completados, TTL skip y backpressure de checkpoint. Himalayas usa solo la DB page actual + una API page y cursor, nunca inventa observations por ausencia. Lecturas limitadas en query, maximo batch+1 lookahead. Tests afectados y compilacion TS pasan; no suite general ni build/deploy/lectura PROD.
- CURRENT_BLOCKER: NONE_LOCAL. Los dos snapshots quedaron acotados antes de acumular. Schema/runtime y canary PROD siguen pendientes; PD-003 conserva el hallazgo y su evidencia local, sin afirmar PROD_VALIDATED.
- CLOSURE_TEST: verify_c20_alert_pages.ts + verify_c20_alert_sql.mjs + verify_c20_maintenance_pages.py + verify_source_maintenance.py + verify_matching_retrieval_expansion.ts + verify_matching_b2c_consumers.ts + verify_cable_wiring_sql.mjs + compilacion TS modificados + git diff --check PASS. Fixtures de 3+ paginas: <=budget por invocacion, cursor durable, segunda ejecucion continua, cobertura 100%, efectos no duplicados y memoria limitada al batch. Los contratos C09 no se reauditaron; su verifier se repitio solo por el helper compartido.
- NEXT: Release preflight existente: Node 24 CI, schema/rollback/budget y autorizacion C21; luego aplicar migration aditiva/runtime coherente y bounded canary PROD. El antiguo blocker local C20 ya no impide el plan. No repetir diagnostico ni pg_stat_statements; no afirmar PROD_VALIDATED.


#### C20 path contract matrix

Every entry records the local trigger, scope, limit, lookup, concurrency, scan/replay behavior, failure handling and closure evidence. “Index/lookup” identifies only what repository SQL/code proves; the read-only PROD artifact supplies live index inventory and query statistics later.

| PATH | REQUIRED FIELDS |
|---|---|
| Scrapers | TRIGGER=scheduled/manual source workflow; QUERY/INPUT SCOPE=source feed/API; BATCH/PAGE LIMIT=source-specific discovery and max detail budget (profiles commonly 100-250); INDEX/LOOKUP USED=source-native identity then Sink application_url conflict key; CONCURRENCY=workflow steps sequential, adapter-specific workers (profile max_workers); CAN_CAUSE_FULL_INVENTORY_SCAN=NO (external feed enumeration only); CAN_REPROCESS_UNCHANGED_ROWS=NO persisted mutation (Sink fingerprint returns UNCHANGED); FAILURE/BACKPRESSURE=source failure continues other sources but technical persistence/lineage failure fails final contract; CLOSURE_EVIDENCE=monitored-run, Sink continuity and source adapter verifiers. |
| OpportunitySink | TRIGGER=AdapterResult; QUERY/INPUT SCOPE=one source run; BATCH/PAGE LIMIT=upsert batch_size 100 default; INDEX/LOOKUP USED=unique application_url upsert and event_key conflict, persisted URL lookup; CONCURRENCY=one sink batch per producer run; CAN_CAUSE_FULL_INVENTORY_SCAN=NO; CAN_REPROCESS_UNCHANGED_ROWS=NO (content fingerprint); FAILURE/BACKPRESSURE=technical persist or lineage write fails the run; CLOSURE_EVIDENCE=ingestion continuity and producer failure propagation fixtures. |
| Ingestion lineage | TRIGGER=each sink outcome; QUERY/INPUT SCOPE=accepted/rejected events in current sink batch; BATCH/PAGE LIMIT=at most sink batch size; INDEX/LOOKUP USED=opportunity_id+received_at and canonical_source+received_at indexes; CONCURRENCY=batched append; CAN_CAUSE_FULL_INVENTORY_SCAN=NO; CAN_REPROCESS_UNCHANGED_ROWS=NO (receipt event key idempotence); FAILURE/BACKPRESSURE=lineage write failure is technical and visible; CLOSURE_EVIDENCE=C02/C03 trace contract verifiers. |
| Observation | TRIGGER=factual AdapterResult or explicit recovery; QUERY/INPUT SCOPE=one persisted opportunity or cursor page; BATCH/PAGE LIMIT=10 source pages x 100 rows per recovery invocation, external items max 250/source and runtime max 3,600s; INDEX/LOOKUP USED=opportunity_id exact link, `latest_opportunity_universe_observations` batch RPC, and `opportunity_source_observations_opportunity_observed_idx`; CONCURRENCY=serial source pages and exact-ID recovery; CAN_CAUSE_FULL_INVENTORY_SCAN=NO per invocation (cursor may cover historical rows across resumable runs); CAN_REPROCESS_UNCHANGED_ROWS=NO after durable observation/source completion; FAILURE/BACKPRESSURE=missing evidence remains MISSING; source failure stops before cursor advancement; CLOSURE_EVIDENCE=Observation writer/recovery bounded keyset verifier; maintenance exact-ID devuelve resumable/no exit verde si falta completar el feed factual; cursor directed aislado del source walk. |
| Factory | TRIGGER=scheduled/manual Factory workflow or exact maintenance IDs; QUERY/INPUT SCOPE=pending/failed rows and matching-final embedding-pending lane; BATCH/PAGE LIMIT=100 structural default, max 250; embedding 20 default, max 50; exact IDs max 50; INDEX/LOOKUP USED=opportunities_factory_pending_idx, final Matching view, exact opportunity primary key; CONCURRENCY=single concurrency group; CAN_CAUSE_FULL_INVENTORY_SCAN=NO for candidate fetch (queue count is aggregate); CAN_REPROCESS_UNCHANGED_ROWS=NO (pending/failed status + fingerprints); FAILURE/BACKPRESSURE=failed rows remain retryable and run fails; CLOSURE_EVIDENCE=Factory queue/fairness and fixture verifiers. |
| Automation Core | TRIGGER=bounded manual scheduled-source worker or authorized exact IDs; QUERY/INPUT SCOPE=certified, allowed opportunity IDs persisted by an exact scraper run and not yet terminally classified; BATCH/PAGE LIMIT=1 run x 4 batches x 50; exact run receipts/refetch max 50 IDs; INDEX/LOOKUP USED=scan_lineage persisted IDs, promotion_status resume marker, source policy exact lookup; CONCURRENCY=one shared pipeline-maintenance workflow group, source worker limited by profile; CAN_CAUSE_FULL_INVENTORY_SCAN=NO; CAN_REPROCESS_UNCHANGED_ROWS=NO (terminal promotion_status excluded); FAILURE/BACKPRESSURE=stop on RPC/technical failure, preserve per-item resume markers; CLOSURE_EVIDENCE=Automation runtime/transition tests and authorized bounded canary pending. |
| Lifecycle | TRIGGER=Universe due refresh or explicit paged reconciliation; QUERY/INPUT SCOPE=due rows or ID cursor; BATCH/PAGE LIMIT=due RPC max 500; explicit reconcile page max 500; INDEX/LOOKUP USED=Universe opportunity_id key and opportunity_universe_next_lifecycle_check_idx (migration pending PROD); CONCURRENCY=single maintenance job group; CAN_CAUSE_FULL_INVENTORY_SCAN=NO per invocation; CAN_REPROCESS_UNCHANGED_ROWS=NO except explicit reconciliation page; FAILURE/BACKPRESSURE=RPC failure fails worker and durable due state retries; CLOSURE_EVIDENCE=actual PostgreSQL due transition, second tick zero work and indexed plan. |
| Universe maintenance | TRIGGER=manual/common owner, producer/Observation exact row; QUERY/INPUT SCOPE=due index + durable dirty-source queue; BATCH/PAGE LIMIT=500 due, source page 250, owner 1 source x 10 batches; INDEX/LOOKUP USED=next_lifecycle_check_at partial index, lower(source)+id cursor, existing PK/observation index; CONCURRENCY=shared maintenance group; CAN_CAUSE_FULL_INVENTORY_SCAN=NO per execution; CAN_REPROCESS_UNCHANGED_ROWS=NO normal tick (explicit source-policy invalidation intentionally reconciles that source once); FAILURE/BACKPRESSURE=queue/cursor persist atomically, budget exit reports pending/resumable; CLOSURE_EVIDENCE=SQL multi-page queue, due transition and idempotent historical RPC execution. |
| Source maintenance | TRIGGER=worker/CLI existente autorizado; QUERY/INPUT SCOPE=source aliases + immutable id keyset current page, latest evidence solo para IDs de esa pagina; BATCH/PAGE LIMIT=min(profile.max_detail_fetches_per_run, max-items, 250) +1 lookahead, detail chunks <=50, runtime ceiling 3000s (no nuevos fetches al vencer; solo requests ya en vuelo con timeout propio); Himalayas API max 1 page/call (100, hasta 2 si cursor expirado requiere restart); INDEX/LOOKUP USED=opportunities_maintenance_cursor_idx, scraper_runs_maintenance_progress_idx (source/lane/exact ID/time), existing enrichment/Observation exact-ID indexes; CONCURRENCY=source profile min/max workers dentro del workflow serial existente; no ejecutar workers paralelos para la misma fuente/lane; CAN_CAUSE_FULL_INVENTORY_SCAN=NO por ejecucion, cobertura global entre invocaciones; CAN_REPROCESS_UNCHANGED_ROWS=NO detail fetch por TTL/fresh skip, IDs completados en pagina parcial no se repiten; FAILURE/BACKPRESSURE=checkpoint append en scraper_runs despues de cada chunk completo, runtime/circuit breaker retiene pagina y IDs; outage retorna payload telemetry-only y falla antes de otro chunk; CLOSURE_EVIDENCE=actual fetch/process/telemetry fixture 7 rows/4 paginas, dry continuation, runtime partial, TTL y bounded Himalayas PASS. |
| Catalog | TRIGGER=public list/detail/search/filter; QUERY/INPUT SCOPE=canonical Catalog, query predicates BEFORE limit; BATCH/PAGE LIMIT=101 lookahead / 100 output + keyset cursor; slug exact 1; INDEX/LOOKUP USED=trigram factual search expression, rubro/order, PK, canonical view; CONCURRENCY=one request, browser debounce/request sequence; CAN_CAUSE_FULL_INVENTORY_SCAN=NO application collector; CAN_REPROCESS_UNCHANGED_ROWS=NO (read-only); FAILURE/BACKPRESSURE=invalid request 400, DB/policy failure 503; CLOSURE_EVIDENCE=real handler finds beyond 1,200, 14 pages/1,301 fixture rows and SQL all-page exact coverage. No first-1,000 product cap. |
| Matching Retrieval | TRIGGER=hourly Retrieval workflow/manual bounded run; QUERY/INPUT SCOPE=selected profiles and Retrieval candidate set from final Matching Universe; BATCH/PAGE LIMIT=2 users x 4 x 250 rows by default; hard CLI max 25 users, 100 pages x 500; score IDs max 500/call; INDEX/LOOKUP USED=Retrieval state/candidate composite indexes and final Matching Universe; CONCURRENCY=serialized by matching-retrieval workflow group; CAN_CAUSE_FULL_INVENTORY_SCAN=NO per run (FULL coverage advances durable cursor over future runs); CAN_REPROCESS_UNCHANGED_ROWS=NO when content fingerprint/watermark match; FAILURE/BACKPRESSURE=cursor advances only after page effects succeed; failure leaves page retryable; CLOSURE_EVIDENCE=Retrieval scheduler/expansion verifiers. |
| Embeddings | TRIGGER=Factory structural/embedding queue or exact changed IDs; QUERY/INPUT SCOPE=eligible final Matching rows missing/stale embedding; BATCH/PAGE LIMIT=20 default/50 max per Factory invocation; workflow structural 250; exact maintenance IDs max 50; INDEX/LOOKUP USED=Factory pending index and exact opportunity IDs; CONCURRENCY=serialized inside Factory concurrency group; CAN_CAUSE_FULL_INVENTORY_SCAN=NO for work selection; CAN_REPROCESS_UNCHANGED_ROWS=NO (fingerprints/model/status); FAILURE/BACKPRESSURE=failed row stays retryable without blocking structural lane; CLOSURE_EVIDENCE=Factory fingerprints, embedding freshness and queue verifiers. |
| Alerts | TRIGGER=scheduled sender existente; QUERY/INPUT SCOPE=un perfil consentido seleccionado por cursor durable, canonical Alert page y cache exact-user page; BATCH/PAGE LIMIT=100 rows/page x 5 paginas max, 20 intentos email, 20s runtime, pending descriptors <=100; INDEX/LOOKUP USED=Alert canonical view + updated_at/id, matching_retrieval_candidates_alert_cursor_idx, profile eligibility index, existing delivery unique(user_id,opportunity_id); CONCURRENCY=lease por perfil 60s + selector lock corto + delivery claim/provider idempotency; CAN_CAUSE_FULL_INVENTORY_SCAN=NO por ejecucion; CAN_REPROCESS_UNCHANGED_ROWS=NO entre snapshots completos (watermark delta), replay solo por invalidacion de perfil/policy o efectos pendientes; FAILURE/BACKPRESSURE=cursor y pending effects se persisten antes de enviar, ledger sent evita duplicados tras outage; pending retry/lease retained, error 500 resumable; CLOSURE_EVIDENCE=actual handler multi-page + 251-profile PostgreSQL selector + bounded helper, threshold/consent/cache/dedup PASS. |
| SEO/sitemap/indexing | TRIGGER=SEO build, sitemap page request, or exact-row classifier; QUERY/INPUT SCOPE=build pages all canonical SEO rows; runtime sitemap reads requested page only; indexing lookup exact opportunity ID in SEO Universe; BATCH/PAGE LIMIT=1,000 rows/page; build paginates the authorized output; one sitemap request one page; INDEX/LOOKUP USED=opportunity_seo_universe READY membership and ID lookup; CONCURRENCY=build job or one request; CAN_CAUSE_FULL_INVENTORY_SCAN=YES for full sitemap/build artifact generation, NO for child sitemap page; CAN_REPROCESS_UNCHANGED_ROWS=NO indexing update only canonical READY and fingerprinted queue; FAILURE/BACKPRESSURE=canonical SEO lookup failure does not enqueue; sitemap/SEO build fails closed; CLOSURE_EVIDENCE=SEO parity, JobPosting separation, indexing queue tests and sitemap page verifier. |
| Application Workspace | TRIGGER=authenticated selected-opportunity workspace; QUERY/INPUT SCOPE=exact Catalog row + current user records; BATCH/PAGE LIMIT=1 opportunity, 30 workspaces, 40 CV versions; INDEX/LOOKUP USED=Catalog slug/ID and user_id exact scoped lookups; CONCURRENCY=4 independent user-scoped reads; CAN_CAUSE_FULL_INVENTORY_SCAN=NO; CAN_REPROCESS_UNCHANGED_ROWS=NO (content/evidence fingerprints idempotency); FAILURE/BACKPRESSURE=canonical excluded row is unavailable; DB failure returns endpoint error; CLOSURE_EVIDENCE=secondary B2C contract verifier. |
| CV Vivo | TRIGGER=authenticated CV generate/update; QUERY/INPUT SCOPE=exact canonical Matching or private vacancy snapshot + user evidence; BATCH/PAGE LIMIT=one opportunity, one latest version, bounded user evidence; INDEX/LOOKUP USED=Matching Universe exact ID and user/vacancy/version keys; CONCURRENCY=one generation per request; CAN_CAUSE_FULL_INVENTORY_SCAN=NO; CAN_REPROCESS_UNCHANGED_ROWS=NO (latest content/evidence fingerprint cache); FAILURE/BACKPRESSURE=invalid/excluded vacancy or AI/service failure returns explicit error; CLOSURE_EVIDENCE=CV Vivo custom vacancy/secondary contract. |
| Gemini Courses/Learning | TRIGGER=authenticated recommendation request; QUERY/INPUT SCOPE=profile plus at most 20 exact canonical Matching opportunity IDs; BATCH/PAGE LIMIT=20 opportunity IDs, 6 requested skills, 30 existing recommendations; INDEX/LOOKUP USED=Matching Universe exact IDs, user_id/profile_signature; CONCURRENCY=bounded per request and rate limit 8 plans/day; CAN_CAUSE_FULL_INVENTORY_SCAN=NO; CAN_REPROCESS_UNCHANGED_ROWS=NO (profile signature idempotence); FAILURE/BACKPRESSURE=uncorroborated gaps omitted, rate limit returns 429; CLOSURE_EVIDENCE=secondary B2C contract verifier. |
| Dashboard | TRIGGER=authenticated candidate dashboard request; QUERY/INPUT SCOPE=Matching Retrieval candidates for one profile; BATCH/PAGE LIMIT=canonical match response top 300, Free presentation top 3; INDEX/LOOKUP USED=Retrieval candidate user/profile signature indexes; CONCURRENCY=one request; CAN_CAUSE_FULL_INVENTORY_SCAN=NO; CAN_REPROCESS_UNCHANGED_ROWS=NO (persisted signature/state); FAILURE/BACKPRESSURE=honest zero/loading/empty/error states; CLOSURE_EVIDENCE=matching B2C consumers and protected Dashboard suite. |
| Admin Source Intelligence | TRIGGER=global Admin refresh; QUERY/INPUT SCOPE=registry, run/event samples and existing aggregate RPCs; BATCH/PAGE LIMIT=1,000 global rows per sample category, 1,000 total per-source fallback rows, 8 fallback readers; INDEX/LOOKUP USED=RPC aggregates, ID-ordered opportunity sample, recent-run order; event-order index plan pending read-only metrics; CONCURRENCY=8 fallback workers plus bounded parallel aggregate reads; CAN_CAUSE_FULL_INVENTORY_SCAN=NO in application memory (aggregate RPCs may touch full DB server-side); CAN_REPROCESS_UNCHANGED_ROWS=NO (read-only projection); FAILURE/BACKPRESSURE=failed aggregate marked unavailable; payload target <1MB/hard fail >=2MB; CLOSURE_EVIDENCE=Admin payload/wiring verifier and row-snapshot fixture. |
| Admin row inspector | TRIGGER=operator requests exact opportunity ID; QUERY/INPUT SCOPE=single row and related stage evidence; BATCH/PAGE LIMIT=one row plus bounded related histories; INDEX/LOOKUP USED=opportunity primary key, pipeline and Universe opportunity_id keys; CONCURRENCY=one exact-row request; CAN_CAUSE_FULL_INVENTORY_SCAN=NO; CAN_REPROCESS_UNCHANGED_ROWS=NO (read only); FAILURE/BACKPRESSURE=missing authority/stage reports explicit unavailable/reason; CLOSURE_EVIDENCE=Admin row inspector verifier. |

### C21 — Gobernanza del release y créditos de Netlify
- STATUS: ACTIVE_RELEASE_GOVERNANCE
- MASTER_ITEMS: 49-53
- FUNCTION: Evitar gastar créditos de Netlify y evitar usar producción como entorno de debug.
- PRODUCTION_BRANCH: feature/aws-migration
- HARD RULE: push a feature/aws-migration = production deployment
- CONTRACT: El release requiere diagnóstico read-only, gates finales y autorización explícita del usuario. Desarrollo y tests primero localmente; un release coherente, no una cadena de deploy/fix/deploy.
- CURRENT OPERATING RULE: no debug deploys; no push sin autorización explícita del usuario; desarrollo y tests primero localmente; PROD sólo después del diagnóstico read-only, gates finales y autorización; preferir Deploy Preview/branch environment si más adelante se necesita validación remota sin production deploy; un release coherente, no una cadena de deploy/fix/deploy.
- TOOLS/FILES: docs/GRAND_CHECKPOINT.md; artifacts/release/final-release-preflight-readonly.sql; artifacts/release/rc-preflight-inventory.json; final-cable-apply-plan.md; verify_release_automatic_gates.ts; verify_release_preflight_readonly.mjs; gates de release y smoke/canary existentes; branch feature/aws-migration.
- DEPENDS_ON: C09 aplicación/canary; C20 presupuesto/cobertura; C15 gates; autorización explícita; rollback conocido.
- CURRENT_EVIDENCE: Preflight local 2026-10-05: se detectaron siete jobs con cron sin gate, workflow_run de embeddings y sender Netlify programado sin gate. Excepcion minima autorizada: sus entradas automaticas ahora requieren CVITAE_PROD_RELEASE_VALIDATED exactamente true; dispatch manual existente se conserva. Los dos owners nuevos siguen manual-only con confirmacion y gate. Test offline demuestra gate ausente/false bloquea antes de DB/email. Flags reales remotos NO consultados: deben confirmarse false antes del canary. SQL metadata-only validado en PostgreSQL local. Segundo preflight real de PROD comunicado por el usuario: blockers=[]; opportunity_pipeline_status=PASS; las cinco migrations compatibles con la estructura real conocida. El agente no ejecuto SQL remoto ni aplico migrations. Migrations con indices sincronicos requieren presupuesto IO, backups y autorizacion. C09 y C20 conservan evidencia y estados, sin reapertura. Sin PROD write, migration apply, commit, push ni deploy; PD-005 sigue BACKLOG.
- CLOSURE_TEST: Release final autorizado + smoke PASS + canary PASS + rollback conocido.
- CLOSURE: release final autorizado + smoke PASS + canary PASS + rollback conocido.
- PROD_PREFLIGHT_REPORTED_2026_10_05: El usuario suministra exactamente un blocker real: public.opportunity_pipeline_status = BLOCKER_VIEW_PREFIX_OR_TYPE. PROD ordinal 17 ingestion_reason text y 18 provenance_certainty text fueron desplazados por campos nuevos en 202610030001. pg_trgm = NOT_INSTALLED_PLANNED_IN_EXTENSIONS / compatible=true: no es blocker; 202610040002 lo crea en extensions. Indices nuevos siguen requiriendo IO durante apply; estrategia intacta, ninguno ejecutado por esta pasada.
- PROD_PREFLIGHT_SECOND_REPORTED_2026_10_05: Confirmado por el usuario: blockers=[]; public.opportunity_pipeline_status=PASS; las cinco migrations compatibles con la estructura real conocida de PROD. Evidencia reportada, no una nueva consulta del agente ni autorizacion para apply/deploy.
- PREFLIGHT_BLOCKER_STATUS: PROD_READONLY_PREFLIGHT_PASS / APPLY_PENDING
- PREFLIGHT_BLOCKER_EVIDENCE: PostgreSQL local reproduce el error de la proyeccion anterior y acepta la corrective con 72 columnas legacy intactas y tres nuevas al final. Fixture congelado del contrato pre-v2 de HEAD de este mismo worktree, coincidente con los ordinals reportados; no se inventa un export completo de metadata PROD. Preflight regenerado con nuevo SHA/orden esperado: vista legacy pasa BLOCKER_VIEW_PREFIX_OR_TYPE -> PASS local y fixture metadata positivo no tiene blockers. El agente no ejecuto SQL contra PROD. El segundo preflight real reportado por el usuario ya confirma PASS; no repetir el diagnostico durante el freeze. Aplicacion, smoke/canary y autorizacion siguen pendientes.
- NEXT: El diagnóstico real ya fue suministrado. C20 local PASS; gates finales y autorización antes de cualquier release. No repetir consultas ni gastar créditos en debug.

### ACTIVE LEFT

Referencias a los contratos anteriores: C09 (aplicación PROD pendiente), C16, C17, C18, C20 (validacion PROD pendiente), C21. Los contratos CLOSED_LOCAL conservan sus pendientes PROD en su propio STATUS; no hay una lista operativa paralela.

### Mapa de cierre end-to-end (mismas autoridades; sin arquitectura paralela)
| Superficie | INPUT | AUTHORITY/GATE | OUTPUT | CONSUMER | FAILURE STATE | CLOSURE TEST |
|---|---|---|---|---|---|---|
| Scrapers | HTTP/API y run | fuente autorizada, run identity | AdapterResult factual | Sink | error tecnico/outcome/UNKNOWN | create-update-noop y fallo tecnico propagado |
| Adapters/cleaners | payload crudo | adapter/cleaner ejecutado + normalizacion | Opportunity normalizada y provenance | Sink/Factory | INVALID/NOT_REPORTED | factual mapping y provenance tests |
| OpportunitySink | AdapterResult | identidad canonica y persistencia | row + receipt exacta | lineage/Observation | persistence failed | sink continuity y exact IDs |
| Ingestion lineage | receipt del sink | OUTCOME x TRACE | producer/run/source/identity | ledger/Admin | INCOMPLETE explicado | contrato C02/C03 |
| Observation | evidencia factual | source identity/status/URL/persisted ID | observacion factual o MISSING | trigger/Universe | MISSING/WRITE_FAILED | writer fixture y refresh boundary |
| Factory | oportunidades sellables | Factory snapshot/seal | clasificacion y queue | Automation/Universe | REVIEW/BLOCKED/PENDING/FAILED | Factory fixture y future canary |
| Automation | IDs elegibles | Automation Core + permiso/certificacion | promocion/verificacion permitida | Universe | UNKNOWN/skipped/failure | bounded resumable canary; no bulk verify |
| Lifecycle | row + fechas/evidencia | lifecycle authority | active/stale/dead/expired | Universe/consumers | UNKNOWN/STALE/terminal | historical + future lifecycle tests |
| Universe | row, lifecycle, policy, switches | canonical reducer | estados por consumer y razones | Catalog/Matching/Alerts/SEO/Admin | NOT_READY/UNKNOWN/conflict | reducer + SQL/artifact parity |
| Catalog | búsqueda/filtros/cursor o slug exacto | canonical Catalog y policy efectiva; predicados antes de LIMIT | 100 resultados + cursor, detalle exacto | listas/detalles públicos, Workspace | 400 invalid page; 503 policy/DB unavailable; excluded | handler SQL encuentra resultado posterior a 1.200; todas las páginas sin pérdida |
| Matching | Universe rows + perfil | matching-ready route + Matching core | candidates/rank | Dashboard/Gemini/CV Vivo | zero candidates/pending validation | real profile after matching_ready>0 |
| Alerts | canonical Alert rows, exact-user Retrieval page y perfil consentido por cursor | policy RPC actual, fingerprints/signatures, high-match decision, delivery claim + profile lease | alertas deduplicadas, pending effects y continuation durable | email/candidato | canonical exclusion; retry/lease/backpressure explicitos | handler real 4+ paginas + SQL selector 251 perfiles + preferencias/threshold/dedup PASS local; PROD pendiente |
| SEO | Universe rows | first-party SEO effective state | public WebPage URL | inventory/sitemap/index queue | NOT_READY/denied/expired | same row parity through build and queue |
| JobPosting | public job row | separate structured-data gate | JSON-LD JobPosting or none | search engines | NOT_READY | Himalayas and deny/eligibility tests |
| Application Workspace | selected opportunity | canonical Catalog universe | workspace/application context | candidate | missing/excluded | secondary consumer contract |
| CV Vivo | profile + selected/private vacancy | canonical Matching; private snapshot | generated CV | candidate | validation/generation error | custom vacancy without global insert |
| Gemini Courses/Learning Plan | profile gaps + opportunities | exact canonical Matching opportunities | corroborated learning gaps | candidate | uncorroborated gaps omitted | secondary consumer fixture |
| Dashboard | profile + matches | shared Dashboard matching state | match list/top-3 presentation | candidate | honest zero-match/loading/error | protected Dashboard suite |
| Opportunity Detail | canonical row | shared detail/presentation contract | attributed page + source link | candidate/search | 404/recovery/unavailable | field and route parity tests |
| shared CTA | opportunity + return intent | shared OpportunityApplicationCta | source application navigation | candidate/analytics | unavailable URL with honest state | CTA + return intent tests |
| mobile states | page and viewport | shared responsive components | usable mobile states | candidate | overflow/loading/empty/error | protected mobile suite |
| analytics | CTA/action events | existing event contract | conversion telemetry | product analytics | missing/duplicate event | protected analytics suite |
| Admin Source Intelligence | source aggregates | Registry + pipeline + Universe projections | source summary/reason/next action | operator | bounded payload/error | payload budget and endpoint test |
| Admin row inspector | exact row | existing row authorities | on-demand evidence and route detail | operator | missing stage/reason visible | row inspector verifier |
| GitHub Actions | manual dispatch inputs | release-validation variable + explicit confirmation | bounded job execution | maintenance/automation | default denied/no schedule | YAML contract; do not run this pass |
| release verifier | local gates + supplied/deployed evidence | structural vs product release criteria | independent statuses | release operator | STRUCTURAL_FAIL or PRODUCT_PENDING | aggregator tests and honest zero-count handling |
| build/sitemap/prerender | canonical SEO inventory | effective SEO + separate JobPosting gate | assets and prerendered pages | public site/search | blocked row omitted; build fails | build/parity/sitemap/JobPosting tests |

MASTER PLAN: 67 ITEMS

## CURRENT

- 45 — CLOSED_LOCAL / PROD_VALIDATION_PENDING
- 46 — CLOSED_LOCAL / PROD_VALIDATION_PENDING
- 47 — CLOSED_LOCAL
- 48 — CLOSED_LOCAL
- 53 = CLOSED_LOCAL / PROD_VALIDATION_PENDING
- 56 = CLOSED_LOCAL / PROD_VALIDATION_PENDING
- 57 = REOPENED_BY_REAL_DATA
- NEXT: ZERO_MATCH_FORENSICS / ADMIN_MATCH_OBSERVABILITY / ELIGIBILITY_DATA_COVERAGE

Operational rule: Items already worked are baseline. Do not reopen them
without concrete regression evidence. Production-pending validations remain
queued for the coordinated deployment phase.

## Item 49 release-safety gate

Before Item 51 applies any migration, Item 50 must capture and verify the
existing production function definitions that migrations replace; the current
definition of `opportunity_source_trust_before_insert`; the existence and
schema of dependent tables/functions; a source-policy snapshot immediately
before mutation; the exact migration order; and the rollback/forward-fix
procedure. This is a gate for Items 50/51, not permission to touch
production.

## Working method

POWER SHELL / OPERATOR
→ collect evidence/data and run focused verification

REASONING
→ identify exact broken/missing cable and define solution

CODEX
→ apply only the bounded change in the worktree

POWER SHELL
→ inspect diff + focused verifier + RC when applicable

CHECKPOINT
→ record honest evidence level and continue

## MASTER CHECKLIST

1. Map real architecture: scraper → extraction → adapter → Sink → DB → Truth → consumers.
2. Separate discovery coverage from processing caps.
3. Prevent partial scans from killing unseen historical rows.
4. Separate rejected / failed / budget_skipped / unchanged / processed semantics.
5. Repair known field-loss cables in critical scraper paths.
6. Canonicalize source aliases through Registry V2 and fail closed for unknown source identity.
7. Separate source permission from row readiness.
8. Create shared Opportunity Truth/readiness for catalog, matching, SEO and JobPosting.
9. Break historical `match_eligible` circularity in intrinsic readiness.
10. Separate matching readiness from alert readiness and preserve independent SEO review state.
11. Separate embedding READY / PENDING / FAILED / NOT_REQUIRED.
12. Build paginated reconciliation with no functional row hard-cap.
13. Add checkpoint/resume/idempotence mechanics.
14. Validate scale mechanics using synthetic 7,000-row fixture.
15. Separate Preview metrics from Apply execution metrics.
16. Implement durable reconciliation job state and Preview → Apply → Resume contract.
17. Separate RUN ACTUAL from ÚLTIMO RUN COMPLETADO in Admin.
18. Make known `scraper_runs.duration_seconds` writers integer-safe.
19. Make telemetry retry independent from maintenance re-execution.
20. Validate the COMPLETE REAL scraper-derived production inventory READ-ONLY until END OF DATA. No arbitrary cap.
21. Reconcile real accounting: global total = canonical per-source total; explained + unexplained = examined; investigate any unknown source/value.
22. Validate real field survival: extracted/adapted/normalized/Sink/persisted evidence for actual source data, preserving UNKNOWN honestly.
23. Validate future ingestion circuit beyond static existence: Sink → factory → readiness → fingerprint/dedupe → embedding requirement → effective consumers.
24. Validate real routing for every applicable row: catalog / matching / SEO / AEO / GEO / alerts / JobPosting / Admin, with explicit reason for denial.
25. Finish Matching V2.1 decision model: Candidate Truth + Opportunity Truth + applicability + eligibility + professional compatibility + hard requirements + evidence + semantic calibration + preferences + confidence + abstention + explanations.
26. Validate Matching adversarially across multiple professional families; prevent semantic similarity from rescuing wrong-profession conflicts.
27. Connect the accepted Matching path to productive B2C consumers; prove it is not merely shadow/test code.
28. Close effective public distribution boundary for catalog and detail pages.
29. Close canonical URL, lifecycle/deadline and public 404/soft-404 behavior.
30. Close sitemap pagination/universe using the same effective truth.
31. Close prerender using the same effective truth.
32. Close generated redirects/canonical route-family consistency.
33. Close factual JobPosting structured data; keep Google Jobs independent and fail-closed.
34. Close SEO on-page quality at scale: title/meta/headings/content/location/org/deadline/internal links.
35. Close AEO factual structure using Opportunity Truth.
36. Close GEO/entity comprehensibility without inventing data.
37. Close Search Demand loop: GSC demand → intent cluster → inventory → proposed content/landing action.
38. Validate crawl/indexation after deploy using real GSC evidence.
39. Measure impressions/clicks/query/page movement after release.
40. Optimize organic entry-page CTA: search visitor → useful opportunity → signup/profile/CV.
41. Review Home / Jobs / Opportunity Detail / career CTAs for cold organic visitors.
42. Close B2C journey: auth → profile/CV → Candidate Truth → matching → opportunity → save/apply → CV adaptation/PDF.
43. Validate Founding Beta / Free experience and ensure monetization gates do not destroy acquisition.
44. Validate retention/return loop for organic users.
45. Close Approval/Admin minimum edit/save/approve/reject/publish workflow with safe field ownership and audit.
46. Close operational Admin global funnel / source funnel / diagnostics / actions / retry / recovery based on real data.
47. Add `WORKING_PRINCIPLES.md` to repo and make AGENTS.md require it.
48. Persist/update this `docs/GRAND_CHECKPOINT.md` in the same Grand Checkpoint commit.
49. Perform final Grand Checkpoint diff review: code + migrations + RLS/grants + env + workflow + redirects + rollback.
50. Verify migration compatibility/order before any production application.
51. Apply explicitly authorized migrations in coordinated order.
52. Make ONE grouped Grand Checkpoint deploy.
53. Verify production: public distribution, Admin, scrapers, reconciliation preview, Matching, sitemap/canonical, telemetry and B2C smoke.
54. Execute real historical backfill/reconciliation only after full read-only preview is reviewed and explicitly authorized.
55. Verify the backfill result and repeat real accounting to ensure no unexplained rows.
56. Observe initial organic-growth signals and fix evidence-based crawl/index/distribution problems.
57. Optimize CTA/onboarding/matching using actual traffic behavior.
58. Define the minimum sellable B2B product.
59. Close company onboarding and organization identity.
60. Close vacancy publication/management.
61. Close candidate/application centralization.
62. Close bulk CV processing.
63. Close filters / ATS / matching / ranking / comparison.
64. Build B2B CTA/funnel: company visitor → value explanation → trial/demo → action.
65. Validate B2B with real companies and measure time saved / ranking usefulness / willingness to use/pay.
66. Connect B2C acquisition + B2B demand + monetization into one measurable growth system.
67. CVitae Growth-Ready stable:
    organic acquisition
    → trustworthy inventory
    → useful intelligence
    → conversion
    → operational control
    → monetization.

Do NOT claim individual items have production validation unless there is
production evidence.

Items 45 and 46: CLOSED_LOCAL / PROD_VALIDATION_PENDING.

Items 47 and 48: CLOSED_LOCAL once these files are created and wired
correctly.

## PRODUCTION VALIDATION QUEUE

The detailed production queue will be finalized during Item 49 using the
actual worktree and evidence before deployment. Production validation remains
required for previously local-only contracts including public distribution,
matching, sitemap/canonical, Admin operations, telemetry/reconciliation and
B2C smoke.

## Item 53 — Verify production

53.1 — PRERENDER / BUILD SINGLE AUTHORITY

STATUS: CLOSED_LOCAL / PROD_VALIDATION_PENDING

EVIDENCE: `pnpm build` is the sole local/Netlify build orchestration; the
Netlify command no longer reruns prerender, sitemap or robots. Prerender fails
closed with `prerender_template_not_pristine` when run against an already
prerendered template.

53.2 — CHILD SITEMAP ROUTING

STATUS: CLOSED_LOCAL / PROD_VALIDATION_PENDING

EVIDENCE: runtime and build sitemap indexes use scalable
`/sitemap-opportunities/<page>.xml` children, legacy page 1 remains supported,
  singleton routes are exact, and the 2,501-row verifier proves 1,000/1,000/501
  pagination plus hard 404s for invalid pages. Build parity follows the same
  effective opportunity universe and pagination semantics.

53.3 — PUBLIC HTML / SITEMAP OBSERVABILITY

STATUS: CLOSED_LOCAL / PROD_VALIDATION_PENDING

EVIDENCE: the public HTML checker follows sitemap index → child sitemap →
  detail URLs, covers empleo/oportunidad/blog/vacante, uses stratified family
  sampling, checks market-page noindex contracts, body contamination, canonical
  identity, thin content and structured-data presence, and can emit a compact JSON
  summary. Family-specific invalid detail routes are checked for hard 404s. The
  head-correct/body-Home regression verifier fails the contaminated fixture and
  passes the factual fixture.

PROD PENDING: deploy-time HTTP verification remains required for sitemap child
routing, public detail HTML, hard 404 behavior and the live observability
summary. No production validation is claimed here.

53.4 — ADMIN / SOURCE INTELLIGENCE BULK SNAPSHOT

STATUS: CLOSED_LOCAL / PROD_VALIDATION_PENDING

EVIDENCE: bulk snapshot assembly pre-indexes source arrays, removes duplicated
registry profiles from the response, exposes query/assembly/serialization
observability and explicit FULL_DB/SAMPLED/UNAVAILABLE scopes. Fresh
diagnose_source data overrides snapshot gates only for the selected source;
source changes invalidate the previous diagnosis. Focused 119-source tests and
the local build pass.

PROD PENDING: the production 502 must be rechecked after deployment with the
new query/assembly/payload metrics. No production validation is claimed here.

53.4.1 — SOURCE INTELLIGENCE >10K / SAMPLE FAIRNESS

STATUS: CLOSED_LOCAL

EVIDENCE: a >10,000-row fixture proves a source absent from the global first
page receives a bounded per-source diagnostic sample when available. If that
fallback is unavailable, the source is explicitly UNKNOWN/UNAVAILABLE and its
Eight Gates are not evaluated as healthy or unhealthy. FULL_DB totals remain
separate from SAMPLED rows; field survival into Eight Gates is verified.

56.0 — B2C OPPORTUNITY CHASSIS

STATUS: CLOSED_LOCAL / PROD_VALIDATION_PENDING

EVIDENCE: public detail pages and the application workspace preserve the exact
opportunity slug; requirement analysis and candidate evidence remain separate.

56.1 — PUBLIC OPPORTUNITY DETAIL UX

STATUS: CLOSED_LOCAL / PROD_VALIDATION_PENDING

EVIDENCE: shared factual facts, structured description disclosure and responsive
title hierarchy reduce wall-of-text presentation while preserving original data.
Browser captures at 1440x900, 390x844, 360x800 and 430x932 show no obvious
overflow, readable wrapping, visible CTA and preserved footer/source areas.

56.2 — CVITAE VALUE PROPOSITION

STATUS: CLOSED_LOCAL / PROD_VALIDATION_PENDING

EVIDENCE: detail pages explain the evidence-first workflow and explicitly state
that CVitae does not invent experience; unsupported facts remain omitted.

56.3 — APPLICATION WORKSPACE CTA

STATUS: CLOSED_LOCAL / PROD_VALIDATION_PENDING

EVIDENCE: CTA identity is exact and auth callback/profile completion preserve a
safe return route to the same opportunity workspace.

56.4 — VISUAL ACCEPTANCE / GOLDEN PAGE

STATUS: CLOSED_LOCAL / PROD_VALIDATION_PENDING

EVIDENCE: local browser captures were inspected at desktop and three mobile
breakpoints using a clearly marked representative fixture because the exact
Bogotá slug is not present in the local SEO fixture. No blocking visual defect
was found; the exact-data production smoke remains pending.

NEXT: Items 56.4–57 B2C/UI/mobile/patrones compartidos.

56.5 — OPPORTUNITY CONTENT ENRICHMENT (SCOPE NOTE)

Esta oportunidad en 30 segundos, facts estructurados, requisitos,
responsabilidades, skills, condiciones, beneficios, vigencia y original
completo; nunca inventar semántica desde texto ambiguo.

56.6 — CONVERSION ANALYTICS (PLANNED)

Search/landing → opportunity_viewed → prepare_clicked → auth → profile/CV
→ workspace → preparation_completed → external_apply, preservando la
identidad de oportunidad y fuente.

56.7 — BRAND / SERP POSITIONING REFRESH

STATUS: DESIGN_READY / USER_COPY_APPROVAL_REQUIRED

Revisar homepage title/meta/hero, posicionamiento, favicon, site name,
Organization/WebSite structured data, marca y recrawl GSC sin fijar todavía
copy definitivo.

56.8 — LIGHT ADSENSE READINESS (PLANNED)

Preparar espacios semánticos discretos, sin activar monetización agresiva ni
ubicar anuncios junto a CTA.

Luego: cierre B2C/UI/mobile/patrones compartidos correspondiente a Items 56–57.

56.5 — OPPORTUNITY CONTENT ENRICHMENT

STATUS: CLOSED_LOCAL / PROD_VALIDATION_PENDING

EVIDENCE: source-agnostic factual presentation, enum/deadline formatting,
30-second summary, accessible original-description accordion and mobile CTA
proximity were verified with focused tests and a local Vite build.

NEXT: Items 56.6–57 B2C/UI/mobile/patrones compartidos.

Item 54 — historical backfill permanece BLOQUEADO hasta cerrar Item 53/B2C y
llegar al punto de preview read-only acordado.

56.5B - OPPORTUNITY DATA CONTRACT / FIELD SURVIVAL

STATUS: CLOSED_LOCAL / PROD_VALIDATION_PENDING

EVIDENCE: representative source families (UNJobs, Himalayas, Computrabajo and
WeWorkRemotely) were traced through adapters, canonical persistence, public
API and shared detail presentation. Existing canonical tags, salary/value,
currency, published_at, deadline, eligibility, education, experience and geo
fields survive where represented. Unsupported requirements/responsibilities,
benefits, duration, start_date, employment_type and applicant-location text
remain explicitly unmapped rather than invented. The public API now exposes
existing canonical fields and tags without schema changes or source-specific
presentation logic. Focused field-survival verification passes.

MIGRATION_REQUIRED: requirements/responsibilities/benefits/duration/start_date
and a first-class employment/work-arrangement field are not canonical columns
for aggregated opportunities. No migration was created or applied.

NEXT: Items 56.6-57 B2C/UI/mobile/patrones compartidos.

56.5C - CANONICAL OPPORTUNITY FIELD CONTRACT

STATUS: MIGRATION_PREPARED_LOCAL / NOT_APPLIED

MIGRATION: supabase/migrations/202609240001_canonical_opportunity_field_contract.sql

SCHEMA SAFETY: the expanded public projection uses existing opportunities
columns from the established discovery/geo schema (onsite_country, remote,
remote_scope, tags, value, currency, published_at, funding_amount,
experience_required, education_level, citizenship_requirement,
residency_requirement and sector). No new column or migration was created.

IMPLEMENTATION: requirements, responsibilities and benefits use ordered structured
evidence; duration needs factual duration text/value without deriving an end
date; start_date needs a real date plus optional source text for non-date
phrases. employment_type, work_arrangement and remote_scope remain separate.
Shared adapter, public API, workspace and source-agnostic renderer plumbing is
prepared. UNJobs employment_type is connected; structured requirements,
responsibilities, benefits, duration and start-date extraction remain deferred
because current parser evidence is not structurally reliable. Historical
reconstruction is source/raw dependent and remains preview-only.

NOT APPLIED: production schema live check remains a pre-deploy gate. Item 54
remains blocked; no migration apply was performed.

56.6 - CONVERSION ANALYTICS

STATUS: CLOSED_LOCAL / PROD_VALIDATION_PENDING

EVIDENCE: reused the consent-gated analytics wrapper for opportunity views and
external apply, and added prepare click, profile readiness, workspace opened
and factual preparation completion events. Opportunity id/slug/source context
is non-sensitive; workspace events are deduplicated and preparation completion
uses prepared_version_id. Auth returnTo remains the existing exact-slug
application intent. Focused verifier and local build pass. Production event
collection remains pending deployment and consented traffic.

NEXT: Items 56.7-57 B2C/UI/mobile/patrones compartidos.

56.6 FINAL FUNNEL INTEGRITY FIX: CTA/profile events now preserve the exact
opportunity context, preparation completion is restricted to the workspace
that initiated the action, canonical date-only values preserve their civil
calendar day, and application-intent authentication emits consent-gated
auth_started/auth_completed events only for a safe returnTo route. Public and
workspace external-apply events remain distinguishable. Focused verifier,
consent checks and Vite build pass; production collection remains pending.

56.7 - BRAND / SERP POSITIONING REFRESH

STATUS: CLOSED_LOCAL / PROD_VALIDATION_PENDING

EVIDENCE: approved Home title, description, H1 and supporting copy are aligned
across index.html, LandingPage runtime metadata and prerender Home fallback.
Organization and SoftwareApplication descriptions now describe opportunities,
matching and preparation without removing contextual ATS/IA capabilities. The
missing public/favicon.svg was restored from the existing CVitae gold/dark
identity. Focused brand verifier, public HTML/prerender checks, Vite build and
diff validation pass. Production crawl, favicon fetch and SERP propagation
remain pending deployment.

56.8 - LIGHT ADS / MONETIZATION READINESS

STATUS: CLOSED_LOCAL / ACTIVATION_DEFERRED

EVIDENCE: existing consent.ts keeps advertising separate from analytics and
starts denied; AdSlot is the shared source/network-agnostic slot and renders
nothing unless explicit preview, advertising consent, certified CMP readiness,
operational readiness and a valid slot are all present. No ad slot exists in
auth, profile, application workspace or opportunity detail CTA surfaces. A
central route policy classifies public discovery/detail/blog routes as future
allowed, private workflows as not appropriate, and recruiter/B2B as undecided.
No network was integrated, no ads.txt or publisher configuration was added,
and focused readiness/consent checks pass.

NEXT: Item 57 shared B2C patterns.

57 - SHARED B2C PATTERNS

STATUS: AUDIT_READY / IMPLEMENTATION_APPROVAL_REQUIRED

PHASE 1 AUDIT TOP 5:

1. Shared public loading/error/empty states are duplicated in Jobs,
   Opportunities and dashboard surfaces; recovery and tone can diverge.
   Smallest fix: extract a factual, retry-capable state primitive without
   changing data contracts.
2. SiteShell navigation mixes B2C discovery, private career and B2B/demo
   destinations in one flat menu, with no route-aware primary action.
   Smallest fix: preserve links but add a shared mobile/desktop grouping and
   active-context treatment.
3. NotFound is outside SiteShell, so 404 loses shared navigation/footer
   continuity and the next useful discovery action.
   Smallest fix: wrap existing 404 content in the public shell while
   preserving hard-404 semantics.
4. Authenticated dashboard empty-state copy still leads with the older
   “Score de Empleabilidad” framing while Home/detail now lead with
   opportunities and preparation.
   Smallest fix: align one shared product-value copy contract, retaining ATS/
   matching capabilities as contextual features.
5. Public listing/detail pages repeat source-loading and date/presentation
   conventions independently, increasing mobile and factual-format drift.
   Smallest fix: reuse existing opportunity presentation/date helpers for
   listing cards and detail metadata without changing Opportunity Truth.

IMPLEMENTATION ORDER: 1) shared state/recovery primitive; 2) SiteShell route
grouping and mobile continuity; 3) shell-preserving 404; 4) value-copy
contract; 5) shared factual presentation helpers.

57.1 — SHARED LOADING / ERROR / EMPTY STATES

STATUS: CLOSED_LOCAL

EVIDENCE: Jobs and Opportunities now reuse PublicState primitives that keep
loading, empty and error states distinct. Errors expose retry, filtered-empty
states preserve clear-filter recovery, and Dashboard reuses the loading/error
primitives without changing its data or matching contracts.

57.2 — SITE SHELL / NAVIGATION CONTINUITY

STATUS: CLOSED_LOCAL

EVIDENCE: public discovery links remain first, Mi Carrera is grouped after
them, and B2B/demo remain secondary. Mobile links retain bounded tap targets
and no auth/navigation logic changed.

57.3 — PUBLIC 404 CONTINUITY

STATUS: CLOSED_LOCAL

EVIDENCE: NotFound now uses SiteShell and provides Home, Empleos and
Oportunidades recovery links. Hard-404/public HTML verification remains green.

57.4 — DASHBOARD VALUE COPY ALIGNMENT

STATUS: CLOSED_LOCAL

EVIDENCE: Dashboard orientation now leads with opportunities, evidence and
preparation while retaining employability score/matching functionality as a
contextual capability.

57.5 — FACTUAL HELPERS

STATUS: DEFERRED_POST_09_OCT

EVIDENCE: no tiny extraction was necessary for this slice; broader listing/
detail factual helper consolidation remains deferred to avoid reopening the
approved presentation contracts.

ITEM 57 OVERALL: REOPENED_BY_REAL_DATA

57 REAL-DATA SUBGATES

- REAL_MATCHING_TRUTH = OPEN
- ADMIN_MATCH_OBSERVABILITY = CONFIRMED_BUG
- ELIGIBILITY_DATA_COVERAGE = CONFIRMED_CRITICAL_GAP
- CANDIDATE_DEMAND_SUPPLY_COVERAGE = OPEN
- RELEASE_DECISION = BLOCKED

FINAL B2C VALUE / CLARITY PASS

STATUS: LOCAL_VALUE_PASS_PENDING_GRAND_RC

EVIDENCE: Matching retrieval windows remain internal and the zero-match state
is now cause-neutral. Dashboard, Learning Plan, CV Rewrite and ATS use the
shared accessible long-operation loader with truthful stages, reduced-motion
fallbacks and mobile-safe controls. Guide/Report affordances are compact at
mobile widths. The focused value verifier and local build pass; the existing
matching-safety verifier remains a pre-existing baseline failure.

NEXT: ZERO_MATCH_FORENSICS / ADMIN_MATCH_OBSERVABILITY / ELIGIBILITY_DATA_COVERAGE.

## ESTADO ACTUAL — 24 SEP 2026

### ÚLTIMO CIERRE

- 53 = CLOSED_LOCAL / PROD_VALIDATION_PENDING.
- 56 = CLOSED_LOCAL / PROD_VALIDATION_PENDING.
- FINAL_VALUE_PASS = PASS.
- GRAND_RC_FINAL = PASS.
- RELEASE_BLOCKERS = 0 antes de la lectura de datos reales del usuario.
- Esta evidencia es READ_ONLY_REAL_DATA; no implica producción validada ni
  autoriza deploy, migración o escritura.

### OBJETIVO AHORA

ZERO_MATCH_FORENSICS: explicar con datos reales por qué REAL_TEST_USER no
obtiene matches visibles, siguiendo:

PROFILE → CANDIDATE TRUTH → EMBEDDING → RETRIEVAL → SOURCE/POLICY →
INTRINSIC ELIGIBILITY → PROFESSIONAL MATCHING → MATCH/ABSTAIN/DENY → B2C
VISIBILITY.

57 permanece REOPENED_BY_REAL_DATA únicamente para cerrar esta verdad de
matching y su observabilidad; no reabre el RC completo ni Items 53–56.

### EVIDENCIA READ_ONLY_REAL_DATA

REAL_TEST_USER:

- professional title present;
- location = Paraguay;
- 8 skills;
- embedding present / dimension 384;
- candidate_truth absent;
- career intent absent.

Current effective matching pool:

- total = 6,480;
- country_code PY = 134;
- country_code WW = 6,275;
- explicit eligibility = 43;
- no explicit eligibility = 6,437;
- Paraguay explicit country eligibility = 4;
- Paraguay location + professional evidence = 110;
- worldwide explicit eligibility = 3;
- worldwide without explicit eligibility = 6,272.

Deadline production accounting:

- `opportunities.deadline` type = TEXT;
- total = 16,289;
- NULL = 16,059;
- ISO date = 218;
- ISO timestamp = 12;
- other format = 0.

The current worktree already contains TEXT-safe deadline handling. Deadline
typing is not the main blocker evidenced by this snapshot.

### PENDIENTES QUE NO SE PUEDEN SALTAR

- `REAL_MATCHING_TRUTH = OPEN`: complete per-boundary counts for the real
  profile without exposing private evidence.
- `ADMIN_MATCH_OBSERVABILITY = CONFIRMED_BUG`: `admin-data` queries
  `candidate_opportunity_matches`, but the production relation does not exist;
  the current read path can convert that error into `match_count = 0`.
  ERROR != ZERO.
- `ELIGIBILITY_DATA_COVERAGE = CONFIRMED_CRITICAL_GAP`: V2.1 eligibility
  UNKNOWN appears to ABSTAIN before scoring while 99.34% of the effective
  matching pool lacks explicit eligibility. This remains a hypothesis until
  final outcome accounting is captured.
- `CANDIDATE_DEMAND_SUPPLY_COVERAGE = OPEN`: compare candidate demand with
  eligible supply; do not infer a scraper defect before this comparison.
- `RELEASE_DECISION = BLOCKED`: preserve the single remaining Netlify deploy
  before 09 OCT until ZERO_MATCH_FORENSICS is complete and Admin errors are
  not confused with zero results.

54–55 remain pending in the existing release order. Items 58–66 remain the
next major B2B block after release and Items 54–55. Item 67 remains the final
Growth-Ready validation.

### EVIDENCE LEVELS

LOCAL / STATIC / READ_ONLY_REAL_DATA / PROD_VALIDATION_PENDING remain distinct.
No local or read-only evidence is promoted to PROD_VALIDATED.

## ITEM 57 — REAL-DATA RELEASE-BLOCKER IMPLEMENTATION (24 SEP 2026)

STATUS: REOPENED_BY_REAL_DATA / IMPLEMENTATION_IN_PROGRESS

ESTADO ACTUAL

- 53 = CLOSED_LOCAL / PROD_VALIDATION_PENDING.
- 56 = CLOSED_LOCAL / PROD_VALIDATION_PENDING.
- 57 = REOPENED_BY_REAL_DATA / IMPLEMENTATION_IN_PROGRESS.
- RELEASE_DECISION = BLOCKED; the single remaining Netlify deploy before 09
  OCT is preserved.

CONFIRMED REAL-DATA EVIDENCE (READ_ONLY_REAL_DATA)

- V2.1 currently treats missing `eligible_countries` and
  `eligible_regions` as `UNKNOWN`, then `ABSTAIN` before scoring.
- Effective pool: 6,480; explicit eligibility: 43; missing eligibility:
  6,437 (99.34%).
- PY location pool: 134. Computrabajo: 129 live_verified, 129 stored
  match-ready, 129 effective match-pool rows, 0 structured eligibility.
- Stored gate drift: 488 live-false rows; 451 intrinsic-ready; 30 deadline
  blocks; 7 insufficient-professional-evidence blocks; 0 missing-title; 0
  missing-slug. Accounting is exactly 488 / 488.
- The 451 rows are source-wide rows from PY-connected sources, not 451
  Paraguay opportunities. Explicit PY-source stale-gate candidates include:
  EU Delegation Paraguay 14, MITIC 3, MIC Portal Emprendedor 1, SNJ 1.
- Deadline is TEXT in production: 16,289 total; 16,059 NULL; 218 ISO dates;
  12 ISO timestamps; 0 other formats. Existing TEXT-safe handling remains;
  this is not the main blocker.

CONFIRMED BUGS / SUBGATES

- REAL_MATCHING_TRUTH = OPEN.
- ADMIN_MATCH_OBSERVABILITY = CONFIRMED_BUG: `admin-data` previously queried
  nonexistent `candidate_opportunity_matches`, allowing DB ERROR to become
  `match_count = 0`. ERROR != ZERO. The implementation now reads the bounded
  matcher diagnostic snapshot contract.
- ELIGIBILITY_DATA_COVERAGE = CONFIRMED_CRITICAL_GAP: UNKNOWN eligibility is
  an authoritative ABSTAIN boundary, not an implicit allow.
- CANDIDATE_DEMAND_SUPPLY_COVERAGE = OPEN.
- RELEASE_DECISION = BLOCKED.

ARCHITECTURE IN PROGRESS (LOCAL / NOT APPLIED)

- MATCH remains confirmed-only; POTENTIAL is a separate discovery channel
  with authoritative ABSTAIN, `downstreamTrusted = false`, and no trusted
  alerts or skill-gap aggregation.
- Diagnostics are derived from the same matcher execution and store bounded
  counts/reasons only. A local additive migration prepares
  `matching_diagnostic_snapshots`; it has not been applied.
- Coverage states distinguish ERROR, NO_RUN, SUCCESS_ZERO and coverage gaps.
- GLOBAL is interpreted as an explicit worldwide eligibility alias without
  inferring eligibility from location or remote work.
- Founder coverage notification reuses the existing Resend/founding-mailer
  and server-validates the persisted snapshot; it is idempotent via
  `email_log` and contains no CV/evidence text.

ITEMS 54–55

STATUS: PRE-RELEASE REQUIRED / PREVIEW FIRST / APPLY REQUIRES EXPLICIT ISA APPROVAL

The complete-universe reconciliation preview must account for all examined
rows, stored-to-proposed transitions by gate and source, unchanged rows,
deadline blocks, professional-evidence blocks, source policy state and
unknown/unexplained outcomes. No historical APPLY is authorized in this
checkpoint.

PENDIENTES QUE NO SE PUEDEN SALTAR

- Complete and review full-universe ZERO_MATCH_FORENSICS and persisted
  diagnostic behavior without exposing private evidence.
- Verify Admin never converts diagnostic ERROR or NO_RUN into zero.
- Produce the complete Items 54–55 preview; preserve the 30 deadline and 7
  professional-evidence blocks and qualify the 451 source-wide rows.
- Obtain explicit Isa approval before any migration apply or historical gate
  reconciliation APPLY.

## ITEM 57 — CORRECTIVE PASS (24 SEP 2026)

STATUS: REOPENED_BY_REAL_DATA / IMPLEMENTATION_IN_PROGRESS

FIXED LOCAL

- Potential employment cards now use the shared canonical opportunity route
  resolver; job potentials resolve to `/empleos/:slug` and other opportunity
  kinds retain their canonical family.
- Matching diagnostic snapshots carry the profile mutation timestamp used for
  the run. Admin and profile coverage state can therefore become STALE when
  age or profile version changes, without treating stale data as zero.
- Coverage-gap notification requests are correlated to a persisted successful
  snapshot and the current profile version. Refreshes do not append a
  `matching_coverage_gap` user event, and the existing founder mailer remains
  the only notification path.
- Dashboard and Mi Perfil reuse a small diagnostic-only coverage card. It
  distinguishes NO_RUN, ERROR, stale data, eligibility uncertainty and low
  supply without calculating matching in the UI.
- Reconciliation preview accounting now reports directional transitions per
  gate (`false_to_true`, `true_to_false`, `null_to_true`, `null_to_false`,
  unchanged states) and separates known UNKNOWN reasons from unexplained
  states.

SCHEMA PREPARED LOCAL / NOT APPLIED

- `supabase/migrations/202609240002_matching_diagnostic_snapshots.sql` is a
  local additive migration only. It adds the bounded operational snapshot
  table and nullable `profile_updated_at`; it has not been applied.
- No historical reconciliation APPLY is authorized.

REAL-DATA VALIDATION PENDING

- Validate snapshot persistence, profile-version staleness, coverage alert
  idempotency and Admin/profile reads after the migration in a controlled
  production sequence.
- Confirm complete real-data matching outcome accounting before deciding any
  source or eligibility remediation.

ITEM 54 PREVIEW NOT YET RUN

- The complete paginated production preview remains mandatory and must report
  directional gate transitions by source, known UNKNOWN reasons and truly
  unexplained outcomes before any historical change is proposed.

ITEM 55 APPLY NOT AUTHORIZED

- Historical gate changes remain preview-only until the full accounting is
  reviewed and Isa explicitly approves APPLY.

RELEASE: BLOCKED

## ITEM 57 — FINAL PRECISION PASS (24 SEP 2026)

STATUS: REOPENED_BY_REAL_DATA / IMPLEMENTATION_IN_PROGRESS

- The canonical matching snapshot version is now a deterministic signature
  over fields consumed by Matching V2 (title, summary/CV evidence, skills,
  education, experience, languages, location, seniority, career route,
  modality and candidate-truth evidence). Subscription, lifecycle and UI
  state do not stale it. `profile_updated_at` remains informational metadata.
- Bounded retrieval counts remain explicitly bounded (`primary <= 300`,
  `semantic <= 120`); they are not total supply. Potential diagnostics now
  separate `potential_total` from `visible_potential` (top-N).
- The bounded coverage state is `LOW_RETRIEVAL_COVERAGE`; `LOW_SUPPLY` is
  reserved for future complete Candidate Demand/Supply Intelligence.
- Item 54 preview accounting now aggregates global and per-source directional
  gate transitions from the same paginated pass. Sums must reconcile exactly.
- `known_unknown` uses recognized reconciliation reason codes; a new or
  unrecognized reason is `unexplained`.
- Netlify function source integrity was checked: touched functions contain
  zero NUL bytes. Local function bundling was attempted without deployment;
  the CLI was blocked by local sandbox access to the parent directory, not by
  a source syntax error after the NUL correction.

ITEM 54 production PREVIEW: NOT RUN.
ITEM 55 historical APPLY: NOT AUTHORIZED.
RELEASE: BLOCKED.

## ITEM 57 — STALE-TRUTH FINAL FIX (24 SEP 2026)

STATUS: CLOSED_LOCAL / PROD_VALIDATION_PENDING

- A snapshot whose matching profile signature differs from the current
  signature now returns neutral `STALE` state with null current match and
  potential counts. The prior run timestamp is retained only as context.
- MatchingCoverageCard gives terminal status priority over historical
  coverage state: ERROR, STALE and NO_RUN cannot inherit old eligibility or
  potential copy.
- Admin retains historical diagnostics for forensics but labels stale runs
  as prior-profile data and does not present their counts as current truth.
- Regression coverage proves old signature + visible potentials produces
  `STALE`, null current counts and no potential-opportunity claim.

ITEM 54 production PREVIEW: NOT RUN.
ITEM 55 APPLY: NOT AUTHORIZED.

## ITEM 57 — CLOSURE PRECISION PASS (24 SEP 2026)

STATUS: CLOSED_LOCAL / PROD_VALIDATION_PENDING

- `potential_scoreable_count` is internal funnel telemetry. It is not a
  user-visible opportunity count.
- `visible_potential_count` is the post-score, post-confidence top-N result
  count. `potentialMatches`, coverage copy and founder `potential_matches`
  use visible potentials only. Admin may display both counts distinctly.
- Coverage state `ELIGIBILITY_UNKNOWN` is emitted from visible potential
  count; scoreable-only candidates do not produce the user-facing claim that
  potential opportunities were found.
- The actual paginated Item 54 preview response now exposes `per_source`
  accounting accumulated from the same pages as the global summary. Missing
  canonical source identity is assigned to `UNKNOWN`; no row is dropped.
  Global/per-source totals and directional gate counters reconcile in local
  deterministic verification.
- Both global and per-source preview summaries expose `known_unknown` and
  `unexplained`. Recognized UNKNOWN reason codes are explained; new reason
  codes are unexplained.
- Matching profile signatures remain deterministic operational fingerprints,
  not authentication/security primitives.
- All touched TypeScript sources have zero NUL bytes.
- `FUNCTION_BUNDLE_LOCAL = PASS`: normal operator Windows PowerShell executed
  `netlify functions:build --src netlify/functions --functions .netlify/functions`
  and completed with `Functions built to .netlify/functions`. This was local
  only, no deploy was performed, and post-bundle status showed no new tracked
  release mutation caused by the bundle.

ITEM 54: LOCAL_READY preview tooling; production preview NOT RUN.
ITEM 55: APPLY NOT AUTHORIZED.
RELEASE: BLOCKED.

ONE NETLIFY DEPLOY REMAINS RESERVED.

NEXT PHASE

1. Schema/migration dependency pre-check.
2. Decide/apply required migrations in controlled order.
3. Validate a real matching run and diagnostics.
4. Complete the Item 54 production preview.
5. Operator review.
6. Item 55 APPLY only after explicit Isa approval.
7. Delta RC.
8. Single deploy.
9. Production smoke.

## CANDIDATE TRUTH + ELIGIBILITY BACKBONE (25 SEP 2026)

STATUS: IMPLEMENTATION_IN_PROGRESS / PROD_VALIDATION_PENDING

- A shared `canonicalCandidateProfile` projection now feeds the matching
  request, profile embedding text, high-match alert decision path and the
  matching signature. It preserves `candidate_truth.evidence` provenance and
  keeps career intent separate from professional facts.
- Missing seniority remains empty/UNKNOWN. The previous divergent `Junior` /
  `semi-senior` defaults were removed from profile save/import, ProfileBuilder
  and match-batch. No scoring, threshold or professional-fit rule changed.
- Matching signature remains a deterministic operational fingerprint and now
  covers the canonical matching/embedding intent fields without account or UI
  state.
- CV Evidence remains a separate confirmed-claims system. Pending/rejected
  evidence is not promoted into Candidate Truth or matching.
- Eligibility coverage remains the active blocker: the exhaustive canary had
  5,941 UNKNOWN rows out of 6,414 source-allowed rows. No eligibility
  inference, scraper repair, historical backfill or production write was
  performed in this pass.
- Retrieval recall remains separate and unresolved: 391/6,476 bounded
  coverage, with 1 visible potential and 747 scoreable potentials outside the
  current windows.

EVIDENCE: STATIC / LOCAL / FIXTURE-CONTRACT.
PRODUCTION: no deploy, no backfill, no production mutation.
NEXT: map remaining consumers and produce a read-only, source-accounted
eligibility preview before any eligibility implementation or approval.

## ELIGIBILITY TRUTH E2E + REPAIR PREVIEW (25 SEP 2026)

STATUS: PREVIEW_BLOCKED_READ_ONLY_ACCESS / NO_PROD_CHANGE

- The current matcher still treats missing `eligible_countries` and
  `eligible_regions` as `UNKNOWN`; job location, `remote`, `remote_scope` and
  `onsite_country` are not eligibility proxies.
- Static source traces confirm UNJobs, Himalayas, Talent and WWR have
  source-specific eligibility extraction paths and shared adapter/sink fields;
  Computrabajo/local rows commonly provide location without candidate
  eligibility evidence. No source repair was applied.
- A reproducible read-only accounting artifact was prepared at
  `artifacts/eligibility-unknown-accounting.mts`, but the current environment
  could not obtain the Supabase read-only access token (`Access token not
  provided`). Therefore no exact 5,941-row cause distribution is claimed.
- No deterministic description recovery or historical repair was applied;
  ambiguous text remains UNKNOWN. No production write, backfill, deploy,
  migration or scoring change occurred.
- Retrieval remains a separate blocker: `391/6,476 ≈ 6.04%`.

NEXT: rerun the artifact with an explicitly authorized read-only Supabase
credential, then review the complete source/cause accounting before any
shared eligibility implementation or repair preview approval.

## ELIGIBILITY BACKBONE UNIFICATION (25 SEP 2026)

STATUS: LOCAL_SHARED_FIX / PROD_ACCOUNTING_PENDING

- Explicit applicant-worldwide evidence from WWR, Talent and Himalayas is
  now normalized locally to `eligible_regions=["GLOBAL"]` while retaining
  `remote_scope=WORLDWIDE` as workplace/source context. UNJobs already emits
  explicit GLOBAL/LATAM applicant regions.
- No global promotion from `remote_scope` alone was added. Generic REGIONAL,
  job location, remote flags and onsite country remain insufficient evidence.
- Matching V2, scoring, thresholds, retrieval and MATCH/POTENTIAL semantics
  were not changed. Existing `GLOBAL` matching alias and source tests pass.
- Exact production UNKNOWN accounting could not run because the prior
  Supabase CLI read-only session is unavailable (`Access token not provided`).
  No production data was read or written in this pass.
- Repair preview and historical APPLY remain pending. The retrieval blocker
  remains independent (`391/6,476 ≈ 6.04%`).

## HIMALAYAS ELIGIBILITY FORENSICS (25 SEP 2026)

STATUS: LOCAL_CONTRACT_FIXED / PROD_REPAIR_PREVIEW_PENDING

- PROD read-only accounting reconciled exactly: 6,476 match-eligible before
  source policy, 6,414 source-allowed, 8 ELIGIBLE, 5,941 UNKNOWN and 465
  INELIGIBLE. Himalayas contributes 5,477 source-allowed rows, 5,086
  UNKNOWN and 391 INELIGIBLE (about 85.6% of UNKNOWN).
- The previous Himalayas fallback incorrectly treated empty
  `locationRestrictions` or full timezone coverage as `WORLDWIDE` applicant
  eligibility. The local adapter now emits `GLOBAL` only for explicit
  applicant-wide restriction text (`Worldwide`, `Anywhere`, `Global`).
- Empty restrictions are now `remote_scope=UNKNOWN` with provenance
  `NO_RESTRICTIONS_DECLARED`; timezone-only and full-timezone payloads remain
  UNKNOWN with `TIMEZONE_ONLY` or `FULL_TIMEZONE_COVERAGE`. Country restrictions
  retain structured country eligibility; unmapped labels remain HUMAN_REVIEW.
- Local evidence path now carries `eligibility_provenance` in the adapter
  evidence passed to the existing enrichment event. The observation planner's
  current 100 PROD observations contain no applicant eligibility evidence;
  1,956 Himalayas enrichment events exist, of which 929 contain compact
  eligibility evidence/provenance. No production mutation was performed.
- Historical persisted Himalayas rows have zero `GLOBAL` regions, zero UNKNOWN
  rows with structured countries/regions, 460 UNKNOWN rows with
  `remote_scope=WORLDWIDE`, and 4,622 UNKNOWN rows with no remote scope. The
  latter fields are insufficient provenance for repair; all historical repair
  candidates remain SKIP pending raw/source evidence.
- WWR explicit-worldwide and Talent applicant-location fixes remain unchanged.
  OpportunityDesk remains a separate detail-enrichment problem.

NO PROD WRITE / NO DEPLOY / NO BACKFILL APPLY.

NEXT: review Himalayas raw/source provenance for deterministic historical
repair; do not promote `remote_scope` or timezone coverage to applicant
eligibility without explicit evidence.

## SEMANTIC TRUTH SURVIVAL PASS (27 SEP 2026)

STATUS: LOCAL_SHARED_FIX / PROD_VALIDATION_PENDING

- The work constitution and scraper contract now explicitly separate field,
  semantic and provenance survival; CREATE/UPDATE/NO-OP/HISTORICAL and
  entrypoint/consumer parity are mandatory for factual claims.
- `eligibility_resolved` in Automation now shares the matching invariant:
  only explicit `eligible_countries` or `eligible_regions` resolve applicant
  eligibility. `remote_scope`, including WORLDWIDE, cannot resolve it alone.
- Talent CREATE now copies eligibility arrays from its detail AdapterResult;
  update and CREATE paths have a parity fixture.
- Existing observation/event stores preserve the shared eligibility provenance
  envelope for UPDATE, NO-OP and newly inserted rows. No schema migration was
  required.
- Source-wide eligibility claims from Impactpool, Santander Open Academy, One
  Young World and UCOM were removed from future ingestion because listing or
  platform context did not prove row applicant eligibility. UCOM operational
  expiry no longer writes a factual deadline; the same operational-deadline
  correction was applied to FCQ and EmpleaPY fallback paths.
- Generic tags no longer independently satisfy professional-evidence readiness.
  The field-survival artifact now labels structural persistence separately from
  semantic verification and reports source status axes without equating them.

OPEN / NOT CLOSED:

- CANDIDATE_ELIGIBILITY_TRUTH = OPEN; historical rows without deterministic
  evidence remain `LEGACY_PROVENANCE_UNAVAILABLE`.
- MATCHING_RETRIEVAL_RECALL = FIX_REQUIRED (`391 / 6,476 ≈ 6.04%`).
- ATS/CV/Application Candidate Truth reconciliation = OPEN.
- Remotive candidate-required-location, Jobicy jobGeo and several legacy
  direct-writer entrypoints remain `SEMANTIC_CONTRACT_UNPROVEN`; no inference
  or production mutation was performed.
- OpportunityDesk remains `DETAIL_ENRICHMENT_REQUIRED`; Computrabajo remains
  source-contract-derived PY job geography with applicant eligibility unknown.

EVIDENCE: STATIC / FIXTURE / LOCAL. No production validation is claimed.
NEXT: controlled production validation after authorized release, then a
read-only inventory accounting by provenance state before any historical plan.

## SEMANTIC TRUTH HARDENING — SHARED PRIMITIVES + REMOTIVE (27 SEP 2026)

STATUS: CLOSED_LOCAL / PROD_VALIDATION_PENDING

- The constitution and `cvitae-debug` v1.1 now require discriminating
  verification: expected, negative and adversarial branches. A verifier that
  cannot fail does not advance state.
- The field-survival verifier no longer accepts `LOST_BEFORE_PERSISTENCE >= 0`.
  Its exact baseline is one static false positive:
  `weworkremotely.requirements -> requirements`, an AST helper/evidence key
  that is not emitted to the new-row payload (`NONE_NO_ROW_WRITE`). The
  verifier fails on any new, removed or altered baseline loss.
- `parse_job_geography` and `parse_applicant_eligibility` now isolate the two
  dimensions. `geo_from_detail` rejects non-empty restrictions rather than
  combining them with workplace location. `remote=True`, applicant scope and
  `Remote`/`Global`/`Worldwide` placeholders no longer establish positive job
  geography or `AUTO_PUBLISH` recommendation evidence.
- This changes local adapter recommendations for remote-only Talent, WWR and
  Himalayas fixtures from `AUTO_PUBLISH` to `HUMAN_REVIEW`; no score, threshold,
  matching eligibility or production row was changed. UNJobs still qualifies
  where it has an explicit duty-station country. The same shared job-geo
  predicate now makes factory sealing/automation mark remote-or-eligibility-only
  rows `review`, preventing AUTO promotion until concrete workplace evidence
  exists.
- Remotive now adapts `candidate_required_location` as applicant eligibility,
  preserves compact evidence through lineage, leaves physical job geography
  unknown, and calls `OpportunitySink` directly for monitored and direct CLI
  execution. CREATE/UPDATE/NO-OP/provenance fixture coverage is local only.
- WWR currently preserves `LATAM` but semantically compresses `EMEA`,
  Europe/EU, APAC and Americas to generic `REGIONAL`; no broad region change
  was made. Jobicy `jobGeo -> location` remains
  `SEMANTIC_CONTRACT_UNPROVEN` pending upstream API-contract evidence.

OPEN / NOT CLOSED:

- CANDIDATE_ELIGIBILITY_TRUTH = OPEN. Historical eligibility repair remains
  fail-closed: `LEGACY_PROVENANCE_UNAVAILABLE` where deterministic evidence is
  absent. The current 8 positive historical eligibility claims remain
  `HISTORICAL_POSITIVE_CLAIM_REVIEW_PENDING`; future source-hardcode repairs do
  not alter them.
- PROFESSIONAL_TAG_TAXONOMY = FUTURE_IMPROVEMENT. Generic tags remain unable
  to establish professional evidence until typed/provenanced skill taxonomy
  exists.
- MATCHING_RETRIEVAL_RECALL = FIX_REQUIRED (`391 / 6,476 â‰ˆ 6.04%`).
- ATS/CV/Application Candidate Truth reconciliation = OPEN.

EVIDENCE: STATIC / FIXTURE / LOCAL. No production write, deploy, migration,
backfill, commit or push occurred.
NEXT: validate the Remotive source contract against a controlled read-only API
sample, then address WWR regional identity preservation before any Jobicy
source-specific implementation.

## EXTERNAL SOURCE CONTRACTS — JOBICY / WWR / REMOTE ROUTING (27 SEP 2026)

STATUS: CLOSED_LOCAL / PROD_VALIDATION_PENDING

- Upstream contracts supplied and cross-checked locally confirm Remotive
  `candidate_required_location` and Jobicy `jobGeo` are applicant remote
  location eligibility, not physical job location. Both future paths now use
  explicit eligibility normalization, preserve evidence/lineage, leave job
  geography unknown, and call `OpportunitySink` directly for monitored and
  direct CLI operation. No historical mutation was performed.
- WWR explicit regions now preserve `GLOBAL`, `LATAM`, `NORTH_AMERICA`,
  `AMERICAS`, `EUROPE`, `EMEA`, `ASIA`, `AFRICA` and `OCEANIA`; known source
  scope is no longer compressed to generic `REGIONAL`.
- Factory now exposes separate `job_geo`, `work_arrangement`,
  `applicant_eligibility` and `geo_decision` stamps. A remote row with explicit
  eligibility is routing-ready without inventing a workplace; remote without
  eligibility remains review. Matching scoring was not changed.
- Source permission truth is now documented as independent from source fact
  truth. Himalayas remains the confirmed fixture: catalog/matching may differ
  from search-indexing, Google Jobs and third-party distribution. Remotive has
  externally confirmed attribution/linkback and third-party/Google Jobs
  restriction; local profile/policy remains unvalidated/deny-by-default, so no
  permissive policy change was made. WWR RSS discovery is distinct from its
  HTML detail fetch; detail-fetch permission remains
  `SOURCE_PERMISSION_REVIEW_REQUIRED`.

OPEN: full active-source permission matrix is `STATIC_PARTIAL`; unknown is not
permission. CANDIDATE_ELIGIBILITY_TRUTH, historical positive-claim review,
LEGACY_PROVENANCE_UNAVAILABLE, MATCHING_RETRIEVAL_RECALL (`391 / 6,476`) and
ATS/CV/Application candidate-truth reconciliation remain open.

NEXT: obtain/version controlled permission evidence for WWR detail HTML and
the remaining active sources, then conduct read-only production validation of
the new Jobicy/Remotive source contracts before any historical plan.

## FINAL SOURCE-SEMANTICS HARDENING (27 SEP 2026)

STATUS: CLOSED_LOCAL / PROD_VALIDATION_PENDING

- `CANONICAL_OPPORTUNITY_REGION_TRUTH = CLOSED_LOCAL`: one shared normalizer
  preserves `GLOBAL`, `LATAM`, `NORTH_AMERICA`, `AMERICAS`, `EUROPE`, `EMEA`,
  `ASIA`, `AFRICA` and `OCEANIA`. Europe and EMEA are explicitly distinct;
  Jobicy now agrees with WWR (`Europe Only -> EUROPE`, `EMEA Only -> EMEA`).
- `GEO_DECISION_READINESS = CLOSED_LOCAL`: arrangement is explicit only for
  `remote=True` or proven `ONSITE`/`HYBRID` scope. Job geo with UNKNOWN
  arrangement is review; remote requires declared applicant eligibility;
  onsite/hybrid requires concrete workplace geo. Factory/recommend preserve
  separate stamps and do not fabricate a dimension.
- `SOURCE_SEMANTIC_TRUTH_LAYER = CLOSED_LOCAL / PROD_VALIDATION_PENDING`.
  No candidate region-membership logic, score change, production action or
  historical repair occurred.

OPEN: CANDIDATE_ELIGIBILITY_TRUTH; MATCHING_RETRIEVAL_RECALL = FIX_REQUIRED;
HISTORICAL_POSITIVE_CLAIM_REVIEW_PENDING; LEGACY_PROVENANCE_UNAVAILABLE;
ATS/CV/Application Candidate Truth; WWR DETAIL FETCH PERMISSION =
SOURCE_PERMISSION_REVIEW_REQUIRED; ACTIVE SOURCE PERMISSION MATRIX =
STATIC_PARTIAL.

NEXT: return to CANDIDATE_ELIGIBILITY_TRUTH, beginning with explicit,
provenanced candidate residence/citizenship/work-authorization truth rather
than inferred region membership.

## CANDIDATE ELIGIBILITY TRUTH V1 (27 SEP 2026)

STATUS: CLOSED_LOCAL / PROD_VALIDATION_PENDING

- `CANDIDATE_ELIGIBILITY_TRUTH = CLOSED_LOCAL` and
  `LOCATION_AS_ELIGIBILITY_PROXY = REMOVED_LOCAL`. `profile_data` now carries
  a versioned, ISO-3166 candidate-eligibility object only when explicitly
  saved by the user; an omitted field preserves a prior confirmation and an
  explicit empty submission remains UNKNOWN. No location, CV, email, IP or
  inferred data was backfilled or promoted.
- `MATCHING_ELIGIBILITY_EVALUATOR = CLOSED_LOCAL`. Matching V2 and its batch
  input use the shared fail-closed evaluator: GLOBAL is deterministic;
  remote declared scope evaluates confirmed residence; explicit citizenship
  and residence requirements retain their separate facts; LATAM uses the
  established country contract; unsupported canonical-region membership stays
  UNKNOWN. Location scoring remains a separate fit signal.
- Candidate eligibility changes the matching signature but is excluded from
  profile embedding text. B2C profile UI adds a separate optional confirmation
  section with shared ISO country options. High-match alerts retain the shared
  V2 decision and do not duplicate eligibility logic.
- A compact read-only impact script is available at
  `scripts/preview_candidate_eligibility_impact.ts`; it was not executed
  because this local environment has no configured Supabase credentials.

OPEN: MATCHING_RETRIEVAL_RECALL = FIX_REQUIRED;
HISTORICAL_POSITIVE_CLAIM_REVIEW_PENDING;
LEGACY_PROVENANCE_UNAVAILABLE; ATS/CV/Application Candidate Truth
reconciliation; WWR DETAIL FETCH PERMISSION = SOURCE_PERMISSION_REVIEW_REQUIRED;
ACTIVE SOURCE PERMISSION MATRIX = STATIC_PARTIAL. Historical profiles without
explicit candidate eligibility remain UNKNOWN. `SOURCE_SEMANTIC_TRUTH_LAYER`
remains CLOSED_LOCAL / PROD_VALIDATION_PENDING.

NEXT: run the read-only candidate-eligibility impact preview in an already
authenticated environment, then return to the separately scoped candidate
truth reconciliation / retrieval-recall workstream; do not infer historical
eligibility from profile location.

## CANDIDATE ELIGIBILITY FINAL HARDENING (27 SEP 2026)

STATUS: CLOSED_LOCAL / PROD_VALIDATION_PENDING

- `CANDIDATE_ELIGIBILITY_TRUTH = CLOSED_LOCAL`;
  `LOCATION_AS_ELIGIBILITY_PROXY = REMOVED_LOCAL`;
  `MATCHING_ELIGIBILITY_EVALUATOR = CLOSED_LOCAL`;
  `APPLICATION_ELIGIBILITY_SURFACE = CLOSED_LOCAL`.
- One strict shared ISO-3166 alpha-2 list contains the 249 officially
  assigned codes; evaluator and UI use that same list. User-assigned `ZZ` and
  non-ISO `XK` are rejected.
- Explicit citizenship/residency requirements cannot be satisfied by generic
  GLOBAL. Without structured country/region scope the shared evaluator returns
  UNKNOWN with a requirement-specific reason. Matching retains generic and
  specific reason codes.
- Application Workspace returns the shared geographic assessment and shows
  an informational status; its document prompt and grounding evidence do not
  receive residence, citizenship or work-authorization fields.
- Focused local verifiers pass. The read-only preview was skipped because no
  public Supabase URL/anon credentials were configured. No production action
  or historical mutation occurred.

NEXT: `MATCHING_RETRIEVAL_RECALL`.

## MATCHING RETRIEVAL RECALL — LOCAL COVERAGE IMPLEMENTATION (27 SEP 2026)

PREFLIGHT: `PREFLIGHT_OK`. Candidate Eligibility and the previously closed
source-semantic contracts remain untouched and closed locally.

- Added an additive local-only retrieval migration (not applied), bounded
  FULL/DELTA coverage state, current candidate shortlist, service-role page
  embedding scorer, and a durable cyclic user selector. Live retrieval keeps
  the existing 300 recent + 120 semantic lanes and adds at most 300 hydrated
  background candidates. Every live candidate is re-filtered and reranked by
  `rankOpportunitiesV2`.
- FULL coverage scans the complete opportunities inventory snapshot, records
  cumulative lifecycle/policy funnel counts and first-exclusion reason/class,
  while its evaluation denominator is only the current source-allowed,
  match-eligible universe. DELTA reads all changed rows (including newly
  ineligible rows), deletes stale shortlist entries, and advances the
  watermark only after page effects succeed. Page failures leave the cursor
  unchanged; snapshot drift fails closed and restarts safely.
- A row with `match_eligible=false` is not assumed to be a valid exclusion or
  stale derived state without explicit evidence; it is counted as `UNRESOLVED`.
  Explicit lifecycle/source-policy exclusions are separately classed, and
  missing title/fingerprint is counted as a data-quality gap.
- MATCH cache rows enter alert discovery only when incremental, or when the
  opportunity itself is inside the existing alert freshness window; both paths
  require current profile/source/fingerprint checks, hydration, and current V2
  reranking. FULL_BACKFILL never creates a retroactive alert flood.
- Dashboard diagnostics distinguish live bounded retrieval from background
  coverage and show total inventory, snapshot date, and leading reasons outside
  the matching universe. `scripts/account_matching_retrieval_funnel.ts` is a
  read-only accounting tool prepared for later controlled validation; it was
  not run against PROD.
- Focused retrieval, V2 decision-contract, and B2C consumer verifiers pass.
  Migration was not applied; no production state was read or changed.

Historical baseline only (pre-CandidateEligibility, not current): total
inventory 16,289; match-eligible 6,476; source-allowed 6,414; bounded live
retrieval 391 unique (300 recent + 120 semantic), about 6.04% of the old
match-eligible count. These values must be remeasured read-only before any
recall-improvement claim. Total inventory is not interchangeable with the
matching denominator.

STATE: `MATCHING_RETRIEVAL_RECALL_ARCHITECTURE = CLOSED_LOCAL`;
`BACKGROUND_FULL_COVERAGE = CLOSED_LOCAL`;
`BACKGROUND_INCREMENTAL_COVERAGE = CLOSED_LOCAL`;
`LIVE_CACHE_INTEGRATION = CLOSED_LOCAL`;
`ALERT_RETRIEVAL_INTEGRATION = CLOSED_LOCAL`;
`PROD_RUNTIME_VALIDATION = PENDING`.

NEXT: controlled PROD validation / read-only recall and full-inventory funnel
accounting. Do not apply the migration, backfill, deploy, or mutate PROD until
explicitly authorized.

2026-09-27 local hardening follow-up:
- Canonical source policy now collapses emitter aliases for signatures and
  resolves opportunity rows through `EDGE_SOURCE_IDENTITIES`; alias conflicts
  fail closed. Worker raw-source queries expand enabled canonical identities
  to registered emitted spellings. Retrieval prune no longer duplicates
  source-policy matching and is limited to deterministic row-local invalidation.
- Worker and read-only inventory accounting share `inventoryFunnelPage()`;
  accounting starts from all `opportunities` rows, classifies afterward, and
  contains no write/RPC path. Historical counts above remain historical only.
- Alert cache lookup is keyed/paged over a captured 36-hour snapshot in user
  chunks (pages <=500), hydrates current rows, and reranks with current V2;
  FULL_BACKFILL cannot create historical alerts. Canary output includes
  duration, pages, inventory scanned, source-allowed rows evaluated, and
  candidates retained.
- Focused retrieval, V2 decision-contract, B2C-consumer, alert-import, and
  diff-whitespace checks pass. PROD read-only accounting was skipped because
  both required process environment variables were not already available.
  Migration remains NOT APPLIED; no PROD action occurred.

STATE: `CANONICAL_SOURCE_POLICY_PARITY = CLOSED_LOCAL`;
`INVENTORY_FUNNEL_PARITY = CLOSED_LOCAL`;
`ALERT_CACHE_PAGINATION = CLOSED_LOCAL`;
retrieval architecture remains `CLOSED_LOCAL`; `PROD_RUNTIME_VALIDATION = PENDING`.

NEXT: PROD migration + single-user canary, only after explicit authorization;
first run current read-only full-inventory funnel accounting when credentials
are already configured.

2026-09-28 scheduler fairness follow-up:
- User scheduling priority is PENDING/SCANNING, ERROR, STALE by
  `matchingProfileSignature` or canonical source-policy signature, NO_STATE,
  then DELTA_PENDING only after a bounded `updated_at > watermark` existence
  probe. COMPLETE users without changed opportunities are skipped.
- Never-covered/stale discovery uses cyclic `user_id` keyset pages and the
  existing retrieval scheduler cursor, not a fixed first-500 sample. Cursor
  advancement stops before an unselected stale/NO_STATE candidate and is
  committed only after the selected batch succeeds; no profile flags/data are
  written. PENDING/SCANNING continue through their persisted retrieval cursor.
- Canary results include `scheduler_reason`. The read-only funnel label now
  derives `CURRENT_READONLY_PROD_<YYYYMMDD>` from its UTC observation time.
- Focused retrieval/scheduler/V2/B2C tests, alert import, and diff check pass.
  Read-only accounting was skipped because both Supabase process variables
  were absent. Migration remains NOT APPLIED; no PROD action occurred.

STATE: `RETRIEVAL_USER_SCHEDULING = CLOSED_LOCAL`;
`RETRIEVAL_STARVATION_PROTECTION = CLOSED_LOCAL`; prior retrieval local states
remain closed; `PROD_RUNTIME_VALIDATION = PENDING`.

NEXT: current PROD read-only inventory funnel; then obtain explicit user
authorization before applying the single retrieval migration and running a
single-user FULL canary. No further local conceptual retrieval work planned.

2026-09-28 Matching capability accounting contract:
- Shared canonical source policy now includes explicit `is_enabled` and
  `matching_enabled` states. Alias collapse/signatures include both fields and
  fail closed on conflict; changing only `matching_enabled` invalidates the
  signature. Only `sourceMatchingAllowed()` (both explicitly true) grants the
  Matching capability used by live matching, alerts, worker targets, and the
  all-inventory funnel.
- Funnel distinguishes `SOURCE_DISABLED`, `SOURCE_MATCHING_DISABLED`, and
  `MATCH_ELIGIBILITY_UNEXPLAINED`. `match_eligible=false` with a
  matching-capable source remains `UNRESOLVED` unless independent explicit
  stale evidence exists; no opportunity rows were changed.
- Focused retrieval, scheduler, V2, B2C, alert-import, and diff checks pass.
  Current read-only accounting was skipped because both Supabase environment
  variables were absent. Migration remains NOT APPLIED; no PROD action occurred.

STATE: `SOURCE_MATCHING_POLICY_CONTRACT = CLOSED_LOCAL`;
`SOURCE_POLICY_SIGNATURE = CLOSED_LOCAL`; `INVENTORY_FUNNEL_PARITY = CLOSED_LOCAL`;
all prior retrieval components remain `CLOSED_LOCAL`; `PROD_RUNTIME_VALIDATION = PENDING`.

NEXT: current PROD read-only funnel; then explicit authorization, the single
retrieval migration, and a one-user FULL canary. No further local Retrieval
architecture work planned.

PRE-PROD RETRIEVAL FREEZE — 28 SEP 2026
- Local green gate: PASS. PROD env: unavailable after checking only the four
  permitted repo-root env files and process environment. No accounting query,
  source-policy query, migration-presence probe, or canary selection ran.
- Funnel counts: NOT OBSERVED. Migration state: NOT_CHECKED_BLOCKED_PROD_ENV
  (CLI/link metadata unavailable). Static migration check: PASS. Canary:
  NOT_RESOLVED. Readiness: BLOCKED_PROD_ENV. Netlify deploy used: false.
- Manifest: `artifacts/preprod-retrieval/manifest-20260928.txt`. SHA256 values
  recorded there for all frozen files, including the final checkpoint hash.

OPPORTUNITY UNIVERSE END-TO-END — 28 SEP 2026
- Local contract implemented: lifecycle + evidence-backed repair, professional
  row readiness, canonical source permission and operational matching switch,
  independent Catalog/Matching/SEO/Alerts universes, and Admin first-broken-cable
  diagnostics. Future opportunity/observation/policy writes refresh the same
  persisted decision. Retrieval FULL/live consume `opportunity_final_matching_universe`;
  DELTA removes rows that leave it. No change to V2 scoring, thresholds, or live
  lane limits.
- Historical reconciliation is bounded/keyset/idempotent and dry-run by default;
  explicit `--apply --confirm YES` is required. Derived `is_active` repairs
  retain accepted observation provenance across the timestamp touched by the
  repair. Unknown remains unknown. The 28-Sep baseline fixture reconciles
  16,405 = 9,272 + 91 + 6,460 + 429 + 153; it is historical, not current.
- Tests PASS: opportunity-universe, inventory-reconciliation, retrieval
  expansion/scheduler, Matching V2, B2C consumers, opportunity factory, Admin
  and alert imports; `git diff --check` PASS. Local Supabase credentials were
  absent, so PROD dry-run and current row counts were not run.
- Artifacts generated: `artifacts/opportunity-universe/prod-apply-plan.md`,
  `prod-apply.sql`, `verify-prod.sql`. Migration `202609280001` and Retrieval
  migration remain NOT APPLIED; no PROD write/deploy/backfill occurred.
- State: Opportunity Universe, lifecycle reconciliation, row readiness,
  permission reconciliation, future automation, consumer parity, Admin
  observability, and Retrieval canonical denominator are `CLOSED_LOCAL` /
  `LOCAL_READY_NOT_APPLIED` as applicable. PROD validation remains `PENDING`.
- Next: obtain explicit authorization, run pre-apply read-only validation and
  full-universe dry-run, then one approved PROD apply + full validation.

SOURCE PERMISSION UNIVERSE + PRE-APPLY IMPACT — 29 SEP 2026
- Universe-first / anti-debug-loop rule persisted in WORKING_PRINCIPLES.md.
- Canonical permission registry: 105 sources × 10 independent dimensions;
  aliases resolve to canonical evidence. Coverage: 0 fully resolved, 7 partial,
  98 all-UNKNOWN. All 14 sources in the supplied historical material inventory
  retain at least one UNKNOWN dimension; exact missing dimensions are listed in
  artifacts/opportunity-universe/source-permission-coverage.md. This material
  set is historical, not claimed as the current complete PROD source set.
- UNKNOWN remains distinct from DENIED. Legacy flags are operational
  projections; Admin/effective-distribution diagnostics now show canonical
  permission state separately. SEO, Google Jobs and third-party distribution
  use separate permission dimensions.
- Pure read-only all-inventory preflight and separate read-only post-apply
  verification SQL generated: artifacts/opportunity-universe/preflight-prod.sql
  and verify-prod.sql. Preflight selects every opportunity, uses its latest
  source observation, includes per-source current/predicted
  Catalog/Matching/Alerts/SEO counts and explicit reconciliation differences.
  Mutation verifier and TS/preflight-equivalent fixture parity PASS. No PROD
  credentials/query/write were used.
- prod-apply.sql / prod-apply-plan.md regenerated from the canonical permission
  registry. Migration NOT APPLIED. Status:
  READY_FOR_PREFLIGHT_WITH_UNKNOWNS; PROD apply is not authorized or validated.
- Focused tests PASS: opportunity-universe permission/preflight, existing
  universe reducer, onward distribution and source attribution. `git diff
  --check` PASS. No deploy/commit/push.
- NEXT: run exactly one Supabase SQL Editor execution of
  artifacts/opportunity-universe/preflight-prod.sql; inspect full inventory,
  per-source impact, UNKNOWN permissions and zero reconciliation differences
  before separately authorizing any apply.

OPPORTUNITY UNIVERSE RELEASE HARDENING — 29 SEP 2026
- Lifecycle repair is explicit-apply owned; normal decision refresh and
  permission/policy changes cannot repair historical `is_active`. New
  authoritative observations use the explicit observation lifecycle path.
- Permission seeding no longer scans each source inventory per consumer row;
  changed source policy is coalesced through the dirty-source queue. Derived
  projection-only opportunity updates are guarded from refresh recursion.
- Historical reconciliation has one lifecycle mutation owner and is resumable
  in committed pages (max 250) via scripts/apply_opportunity_universe_prod.ts.
  Schema and Retrieval apply SQL are staged separately; no PROD apply occurred.
- Routing unresolved and all-dimension permission coverage UNKNOWN are
  separate metrics. TS/preflight fixtures, alias conflict handling and
  UNKNOWN-vs-operational-disabled parity pass locally.
- Official material-source evidence refreshed for Jobicy, WWR, Remotive,
  Arbeitnow, Impactpool and Fundación Carolina. Current PROD inventory source
  set remains unobserved until the all-row read-only preflight; no fixed
  historical source list is treated as current.
- Release artifacts regenerated. PREFLIGHT=READY_NOT_RUN;
  PROD_APPLY=NOT_AUTHORIZED; PROD_VALIDATION=PENDING. Focused local gates and
  git diff --check pass. Review ZIP prepared locally; no PROD write, deploy,
  commit or push.
- NEXT: external review, then one Supabase SQL Editor run of the pure
  read-only preflight. Do not apply migrations until separately authorized.

OPPORTUNITY UNIVERSE RELEASE-CANDIDATE HARDENING — 29 SEP 2026
- PROD schema compatibility is locally closed: preflight reads optional
  `professional_family` and JSONB/legacy `requirements` through schema-tolerant
  JSON access; no speculative production columns are required.
- Shared TypeScript and SQL reducers deterministically extract only string
  requirement evidence, array strings, or `{text: string}` entries. Unsupported
  JSON contributes nothing; existing evidence threshold/meaning is unchanged.
- `verify-universe-prod.sql` is the post-reconciliation/pre-Retrieval gate and
  contains no Retrieval relation references. `verify-prod.sql` is the final
  post-Retrieval verifier and includes denominator, cache validity, stale-row,
  historical-alert and canary-readiness invariants.
- Release order now includes Supabase Edge, one combined protected Netlify
  production deploy, worker/workflow activation after authorized push, final
  DB verification, bounded single-user canary and no-send runtime smoke checks.
- Focused tests PASS: opportunity-universe reducer and permission/preflight
  verifier, including real JSONB shape, optional-key absence, stage separation
  and complete runtime manifest order. `git diff --check` PASS.
- PREFLIGHT=READY_NOT_RUN; PROD_APPLY=NOT_AUTHORIZED;
  PROD_DEPLOY=NOT_APPLIED; PROD_RUNTIME_VALIDATION=PENDING.
- NEXT: external delta review, then one read-only Supabase preflight.

B2C RELEASE PREPARATION / SOURCE-TO-CONSUMER HARDENING — 30 SEP 2026
- Preserved Master Items 1–67; Items 58–66 remain frozen. Eight Gates now
  distinguish missing evidence from PASS/FAIL, propagate required-stage
  NOT_EVALUATED downstream, and expose the first non-confirmed required stage
  in Admin/source diagnostics.
- Canonical source permissions remain independent from source-global and
  per-consumer operator switches. Universe effective states, dirty-source
  refresh, Matching signature invalidation, Alerts routing and SEO distribution
  consume their own dimensions; permission changes do not rewrite switches or
  intrinsic `match_eligible` row readiness. No historical APPLY occurred.
- Country normalization is strict ISO-3166 alpha-2 with missing/malformed
  values left absent. First-party JobPosting is independent from Google Jobs
  permission. CV Vivo Free daily blocking is disabled for this beta while
  usage telemetry remains; Dashboard computes all valid matches and applies
  only the presentation top-three gate for Free.
- Local gates PASS for Eight Gates, Opportunity Universe/permission separation,
  Retrieval + scheduler, Matching V2/B2C consumers, source/distribution truth,
  JobPosting/country, sitemap routing and B2C value clarity. Full Vite and
  fixture-based SEO build PASS; the local Computrabajo SEO fixture correctly
  yields zero opportunity URLs because SEO permission is UNKNOWN. Generated
  SEO snapshot is fixture-only and is not a PROD/current inventory observation.
- A real PostgreSQL 17 parse/plan/EXPLAIN was NOT run: this environment has no
  PostgreSQL client/server, Docker daemon, or preconfigured DB connection.
  The full preflight therefore remains BLOCKED_BY_POSTGRES_ACCESS and is not
  READY to hand to PROD. Required missing capability: an authorized
  read-only PostgreSQL 17 execution context with the compatible production
  schema for EXPLAIN of the complete statement.
- PROD migrations/backfill NOT APPLIED; PROD writes NOT performed; deployment
  NOT performed; no commit/push. `git diff --check` passes. No B2B scope opened.
- NEXT: enable that single read-only PostgreSQL 17 validation capability;
  compile/plan the generated preflight, then use approved PROD preflight and
  release gates. Do not apply or deploy before explicit authorization.

OPPORTUNITY UNIVERSE SQL COMPILE FIX — 29 SEP 2026
- Declared `v_count_key text` inside `reconcile_opportunity_universe_page`;
  no lifecycle, permission, or reconciliation semantics changed.
- Scope-aware PL/pgSQL verifier checks every function in both the migration and
  generated schema. Its cross-function fixture proves another function's
  declaration cannot satisfy a missing local variable. Scope gate PASS.
- Regenerated schema, read-only preflight, pre-Retrieval verifier, final
  verifier, and release plan. Stage 2 is explicitly marked behavior-changing;
  preflight deltas must be accepted and schema→reconciliation→verification→
  Retrieval→runtime cutover proceeds as a controlled session with stop-on-FAIL.
- Focused reducer, preflight/schema-compatibility, scope, manifest and diff
  checks PASS. PROD_WRITE=NOT_APPLIED; PROD_DEPLOY=NOT_APPLIED.
- NEXT: external delta check → Supabase read-only preflight.

## SEO + OBSERVATION PROD PREFLIGHT CHECKPOINT — 01–02 OCT 2026

- PROD read-only preflight validated first-party SEO: `SEO_ROW_READY =
  SEO_EFFECTIVE_READY = 6,285`, reconciliation difference `0`. Observation
  coverage is a post-release workstream and does not block these 6,285 rows.
- Lifecycle/observation accounting and source recovery detail:
  [SEO_OBSERVATION_RELEASE_2026-10-01.md](checkpoints/SEO_OBSERVATION_RELEASE_2026-10-01.md).
- No migration, historical reconciliation, production write, or deploy was
  performed in this checkpoint. Release artifacts were regenerated and the
  focused local release gates were rerun; see the detailed checkpoint for the
  current artifact fingerprints and exact gate results.
- STATE: `SEO_RELEASE_STATE = PROD_PREFLIGHT_VALIDATED`;
  `OBSERVATION_COVERAGE = POST_RELEASE_WORKSTREAM`.
- NEXT: proceed only with the separately authorized, staged release sequence;
  observation recovery remains post-release and must preserve lifecycle
  evidence/freshness safety.

## STAGE 2 SCHEMA APPLY HALT — 2026-10-02

- `STAGE2_SCHEMA_APPLY=FAILED_POSTGRES_COMPILE_42803`.
- `FAILURE=lifecycle_recovery_per_source grouped/correlated provenance reference`.
- `PROD_STATE_AFTER_FAILED_APPLY=PENDING_READ_ONLY_PARTIAL_APPLY_CHECK`.
- The prior attempt is not assumed rolled back or partially persisted; the
  generated catalog-only checker must determine current schema state before
  any reapplication. No release advancement is authorized by this checkpoint.

## STAGE 2 COMPILE ATTEMPT 2 - 2026-10-02

- `STAGE2_COMPILE_ATTEMPT_2=FAILED_POSTGRES_42601`.
- `CAUSE=duplicate comma introduced in per_source JSON argument list`.
- `PROD_PERSISTENT_APPLY=NOT_AUTHORIZED`.
- This records the failed compile-only transaction; it does not assert a
  PostgreSQL compile pass or authorize persistent schema application.

## STAGE 2 PROD VERIFICATION + PRE-RECONCILIATION CHECKPOINT - 2026-10-02

- Reported real PROD verification: `POSTGRES_SCHEMA_COMPILE=PASS`,
  `STAGE2_SCHEMA_APPLY=PROD_SUCCESS`, `STAGE2_SCHEMA_VERIFY=PASS`. Expected
  tables, views and summary function are present; permission inventory is
  105 sources × 10 dimensions (1,050 rows), with 148 aliases.
- PROD inventory is 16,459; Universe rows are 0 and unreconciled rows are
  16,459. This is the expected pre-reconciliation state. Schema will not be
  reapplied.
- `HISTORICAL_RECONCILIATION=NOT_RUN`; `RETRIEVAL_STAGE=NOT_RUN`.
- The pre-Retrieval verifier generator is now explicit structured SQL rather
  than textual `.replace()` transformation of the final verifier. Focused
  gates and `git diff --check` pass.
- `SEO_RELEASE_STATE=PROD_PREFLIGHT_VALIDATED`;
  `OBSERVATION_COVERAGE=POST_RELEASE_WORKSTREAM`.
- `NEXT_STAGE=BOUNDED_HISTORICAL_RECONCILIATION`. Do not execute this stage
  tonight; it requires its separately coordinated authorized run.

## PIPELINE CANÓNICO / RETRIEVAL PREFLIGHT FALSE-NEGATIVE FIX — 2026-10-02

- `PIPELINE_CANONICAL_CONTRACT=IMPLEMENTED_LOCAL_NOT_PROD_VALIDATED`.
  `WORKING_PRINCIPLES.md` now leads with `RAW INFORMATION → INGESTION TRACE →
  NORMALIZED → SEALED → OBSERVED → CLASSIFIED → ROUTED → CONSUMED`; Admin is a
  projection of existing authorities, and Factory/Observation/readiness remain
  independently observable.
- Read-only PROD facts supplied for this checkpoint: inventory `16,459`;
  observations `680` / missing `15,779`; Factory `READY=4,987`, `REVIEW=611`,
  `BLOCKED=6`, `PENDING=10,855`; lifecycle `ACTIVE_VALID=6,684`,
  `LIFECYCLE_UNKNOWN=9,042`, `HARD_DEAD=490`, `EXPIRED=118`,
  `STALE_DERIVED_STATE=99`, `INACTIVE_VALID=26`; routing
  `SEO_READY=6,285`, `MATCHING_ROW_READY=6,225`, `CATALOG_READY=0`,
  `FINAL_MATCHING_READY=0`, `ALERT_READY=0`; all observed embeddings have
  dimension `384`. These are operator-reported read-only PROD observations,
  not results generated by this local pass.
- `FUTURE_INGESTION_LINEAGE=IMPLEMENTED_LOCAL_PENDING_SCHEMA_RELEASE`: the
  shared OpportunitySink now writes append-only producer receipts, resolves
  canonical source through Registry V2, preserves run linkage when provided,
  labels missing metadata, and explicitly does not claim HTTP/identity/live
  observation. The additive `opportunity_ingestion_events` schema is not
  applied. Existing `scraper_runs` lineage is propagated into the sink.
- `PIPELINE_PROJECTION=IMPLEMENTED_LOCAL_PENDING_SCHEMA_RELEASE`: additive
  `opportunity_pipeline_status` and Admin ledger project Opportunity,
  Factory snapshots, factual observations, source policy, and persisted
  Opportunity Universe decisions. Historical rows without events remain
  `HISTORICAL_DB_PRESENCE / RECONSTRUCTED`, never fabricated scraper runs.
  The existing observation-insert → Universe refresh trigger remains the
  observation cable; no new lifecycle authority was added.
- `OBSERVATION_COVERAGE=POST_RELEASE_WORKSTREAM`. A bounded, source-profile-
  driven `run_observation_coverage_recovery.py` is prepared, dry-run by
  default, resumable via durable observations/source checkpoint, and only
  writes factual adapter observations through existing maintenance adapters
  in its explicit APPLY mode. It was not run. Incomplete enumeration absence
  is never treated as DEAD. No historical HTTP/identity evidence was created.
- `FACTORY_DRAIN=IMPLEMENTED_LOCAL_PENDING_WORKFLOW_RELEASE`: existing Factory
  remains authority; scheduled structural budget is bounded at 250 and the
  workflow is hourly. No seal semantics changed and no Factory job was run.
- `ADMIN_PIPELINE_LEDGER=IMPLEMENTED_LOCAL_PENDING_SCHEMA_RELEASE`: source
  aggregates and row-stage matrix expose producer/run, normalization fields,
  Factory stamps/evidence/SLA, observation reason/capability, verification,
  lifecycle, all four routed consumers, and next action. Unavailable adapter /
  cleaner lineage remains explicitly unreported rather than inferred.
- `RETRIEVAL_PREFLIGHT_FALSE_NEGATIVES=FIXED_LOCAL`: vector dimension is
  checked using PostgreSQL `format_type(...)` (no typmod arithmetic), expected
  type is `public.vector(384)`, and `<=>` return type is `double precision`.
  Dependency coverage guard and local verifier pass; no PostgreSQL compile,
  Retrieval apply, or PROD query was executed in this pass.
- Generated read-only pipeline accounting is at
  `artifacts/opportunity-pipeline/verify-prod.sql`. Its counts are not PROD
  values until run after the additive migration. Local schema/view SQL has not
  been compiled against PostgreSQL in this pass.
- `PROD_WRITE=NONE`; `COMMIT=NONE`; `PUSH=NONE`; `DEPLOY=NONE`.
- `NEXT=review and PostgreSQL-compile the additive pipeline migration and
  runtime integration before any authorized release; observation recovery
  remains separate from lifecycle semantics.`

## 2026-10-02 — PROD pipeline and Retrieval evidence / release closeout

- The prior local-pending note above is superseded by the following operator-
  supplied PROD evidence. `PIPELINE_CANONICAL_CONTRACT=PROD_VALIDATED` and
  `PIPELINE_SCHEMA=PROD_VALIDATED`: `TOTAL_INVENTORY=16459`,
  `PIPELINE_ROWS=16459`, duplicates `0`, missing status `0`, unexplained `0`,
  and every reported `NO_REASON_COUNTS=0`.
- PROD `NEXT_ACTION_COUNTS`: `SOURCE_REFRESH=15779`, `FACTORY_DRAIN=443`,
  `INSPECT_CONSUMER_REASON=131`,
  `EXISTING_VERIFICATION_AUTOMATION_OR_REVIEW=100`,
  `REVIEW_LIFECYCLE_EVIDENCE=6`. These are explained backlog, not release
  failures. Observation coverage is visible/actionable; recovery runner is
  ready but not run. Current reported Factory pending is `10833`; earlier
  `10855` belongs to an earlier snapshot and is not treated as current.
- `FUTURE_INGESTION_LINEAGE=IMPLEMENTED_PENDING_FIRST_FUTURE_PROD_EVENT`.
  Historical rows correctly appear as `HISTORICAL_DB_PRESENCE`; the first
  future production event is still required to prove the running sink-to-ledger
  path.
- `OBSERVATION_COVERAGE=VISIBLE_AND_ACTIONABLE`, missing `15779`,
  `NEXT_ACTION=SOURCE_REFRESH`. No observation recovery/backfill was run.
- `FACTORY_DRAIN=VISIBLE_AND_ACTIONABLE`, current reported pending `10833`;
  the existing bounded runner/workflow exists. A subsequent drain execution
  is not claimed here.
- `ADMIN_PIPELINE_LEDGER=PROD_VALIDATED` for the supplied whole-inventory
  verification: all rows have a status and explanation. A future ingestion
  event is still needed to validate new-event display end to end.
- `RETRIEVAL_SCHEMA=APPLIED_PROD`; `RETRIEVAL_COMPILE=PASS` from the supplied
  PROD result. No Retrieval migration or data rewrite was performed for the
  preflight false negative. The comparator is fixed in the generator to
  validate catalog schema `public`, base type `vector`, and dimension `384`,
  while accepting `vector(384)` and `public.vector(384)` as `format_type`
  representations. This correction is repository-local after PROD evidence.
- `FINAL_VERIFY=GENERATED_READ_ONLY`; artifact:
  `artifacts/release/final-prod-verify.sql`. It has a local static read-only,
  single-statement guard; its all-in-one PROD result has not been run.
- Release is NOT closed: fixture build passed, but an un-fixtured production
  build could not obtain a valid Supabase URL from this checkout's available
  environment. Netlify account/site lookup succeeded, but this worktree is not
  linked to the site; no production deploy, smoke, or canary occurred. Do not
  commit/push until the actual production build/deploy path is resolved and
  gates pass.
- `CURRENT_DENOMINATOR=16459`; `LAST_PROVEN_GATE=PROD pipeline structural
  verification + Retrieval compile/apply`; `CURRENT_BLOCKER_CLASS=production
  build/deploy access`; `NEXT_ACTION=obtain a valid authorized build context,
  run the real production build, then one site-correct deploy and smoke/canary`;
  `EXACT_ARTIFACT=pnpm.cmd build; artifacts/release/final-prod-verify.sql`;
  `DO_NOT_REOPEN=Opportunity Universe, pipeline structure, Retrieval schema,
  lifecycle/permission/Matching/SEO contracts without new regression evidence`.
- `PROD_WRITE_AFTER_REPORTED_APPLIES=NONE`; this pass performed no PROD write,
  deploy, commit, or push.

## 2026-10-02 â€” Final release pre-deploy verification

- `WORKING_PRINCIPLES.md` now contains the mandatory
  `UNIVERSE-FIRST EXECUTION PROTOCOL` procedure without duplicating the
  existing system/universe principles.
- The single read-only `artifacts/release/final-prod-verify.sql` was executed
  against Supabase PROD after fixing its Factory projection. It returned
  `prod_release_pass=true`: inventory/universe/pipeline rows `16459/16459/16459`,
  unreconciled `0`, duplicates `0`, unexplained/missing status `0`, SEO ready
  `6285`, all Retrieval objects/signature present, and zero consumer rows
  lacking reasons. Factory was READY `5009`, REVIEW `611`, PENDING `10833`,
  BLOCKED `6`, FAILED `0`; observation present/missing `680/15779`.
- `PRODUCTION_BUILD=PASS` using production-scoped Netlify environment access;
  generated SEO inventory `6285`, sitemap URLs `6295`, prerendered jobs `6222`
  and opportunities `63`, redirect collisions `0`. The fixture build/parity
  gate also passed independently. Function bundling passed with the repo's
  `netlify/functions` source.
- `NETLIFY_PRODUCTION_BRANCH=feature/aws-migration`; no deploy has yet been
  triggered. The only intended production deployment is the Git-connected
  build after the coherent release commit is pushed to that branch.
- `CURRENT_DENOMINATOR=16459`; `LAST_PROVEN_GATE=final read-only PROD verifier
  plus production build`; `CURRENT_BLOCKER_CLASS=single authorized production
  branch push/deploy pending`; `NEXT_ACTION=commit and fast-forward the release
  to feature/aws-migration, then wait for that one deploy and perform smoke /
  bounded canary`; `DO_NOT_REOPEN=PROD pipeline structure, Retrieval schema,
  lifecycle/permission/Matching/SEO contracts without new evidence`.
- No canary write, deployment, new schema apply, historical reconciliation,
  or alert delivery has occurred in this pre-deploy checkpoint.

## 2026-10-02 â€” Post-deploy smoke outcome

- The single Git-connected Netlify production deploy completed READY:
  deploy `6abfc0a7020dec0008057d32`, commit `8b124f90ba1b7230467531228939c34fedf7b63`,
  branch `feature/aws-migration`, primary URL `https://cvitae.lat`.
- Read-only smoke: home, `/empleos`, public opportunities endpoint, one real
  SEO detail, and `/sitemap.xml` all returned HTTP 200. The first sitemap call
  exceeded the 30-second client budget; the retry returned 200. Admin row
  inspection returned 200 with a real pipeline projection and actionable next
  action.
- `source_intelligence_snapshot` did not pass smoke: two requests failed with
  Netlify response-payload limit `6,291,556` bytes (HTTP 502). Logs identify
  `RequestEntityTooLarge`; this is a concrete Admin source-ledger response
  size blocker, not missing PROD pipeline rows. The row-level Admin projection
  remains available.
- `CANARY=NOT_RUN`: release smoke was not wholly PASS, so no opportunity rows
  were inserted and no alerts were sent. No additional deploy will be started
  under the one-deploy constraint.
- Final release state is NOT CLOSED. `CURRENT_DENOMINATOR=16459`;
  `LAST_PROVEN_GATE=final read-only PROD verifier, production build, deploy,
  public routes and row-level Admin inspection`; `CURRENT_BLOCKER_CLASS=Admin
  source snapshot response exceeds Netlify 6,291,556-byte limit`;
  `NEXT_ACTION=reduce/fix the source snapshot response payload, verify source
  and row Admin endpoints, then authorize one combined follow-up deploy and
  smoke/canary`; `DO_NOT_REOPEN=all PROD-validated pipeline/Universe/Retrieval
  semantics without a new invariant failure`.
- This update is documentation-only. The Netlify ignore-build contract skips
  docs-only changes; it does not initiate a second site deploy.
