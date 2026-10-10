# Parallel B2C work plan — 2026-10-08

Plan de ejecución subordinado a GRAND_CHECKPOINT, C01–C21 y Master 1–67.
No crea otra Biblia, otra arquitectura ni Items nuevos. Documento creado
porque no existía en el repo congelado 11c18105; no presupone un plan adjunto.

## Baseline y workspace

GOLDEN_PRODUCT_BASE=8281c6a5a1aed348b9360f994322a4624fabd247
COMMON_INTEGRATION_BASE_REF=checkpoint/b2c-common-base-20261008
El SHA exacto del checkpoint documental se registra en MANIFEST.json/AUDIT.
Workspace de código nuevo: C:\Users\isaso\cvitae-b2c-parallel-20261008.
Branch: work/b2c-parallel-20261008, creado desde CHECKPOINT_COMMIT, no desde
una copia de archivos ni desde Golden sin los documentos de handoff.
Frozen worktree: C:\Users\isaso\cvitae-item53-public-contracts, reservado al
checkpoint/candidato. No cambiar su código ni desplegar desde trabajo paralelo.

## Matriz inicial — no equivale a un inventario de bugs nuevos

| Clase | Contratos |
|---|---|
| CLOSED_DO_NOT_TOUCH | Routing público, List/Detail, original path, fallback Catalog, 404, prerender/hydration, metadata singleton, SEO read path, inventario exhaustivo y sitemap/redirects. C11/C12 y subcontratos cerrados de shared CTA, analytics consentidos, Free top-3 presentation-only, Candidate Truth, Dashboard/estados y trabajo bounded siguen protegidos. |
| OPEN_LOCAL_NOW | Completar evidencia end-to-end de las partes no cerradas de Master 42–44: sesión/perfil/CV, aplicación/versiones/PDF, Free/Founding Beta/retorno. La existencia de un área no implica bug: identificar primero el contrato faltante concreto; si ya está probado, reutilizar su evidencia y excluirlo del diff. |
| BLOCKED_UNTIL_PROD | Current-site deploy/smoke tras crédito reset; canary futuro/Observations/Automation; C16 recovery histórico; C17 perfil real con matching_ready>0; C18 GSC; validación de servicios reales/entrega email. No simular estas condiciones como cierre PROD. |

## Orden de ejecución

1. Completar checkpoint/source ZIP/bundle, secret screening y paridad inicial.
2. Orquestador lee sólo los archivos del primer flujo elegido y explicita
   INPUT → PRODUCER → TRANSFORM → STATE/PERSISTENCE → API/SERVER → UI →
   USER ACTION → ANALYTICS/EFFECT → FAILURE MODE → TEST → ACCEPTANCE.
3. Delimitar los pendientes de Master 42; separar responsabilidades por archivo
   para trabajar en paralelo. No asignar el mismo archivo a dos agentes.
4. Cerrar en pasadas coherentes los flujos A y B siguientes; C puede avanzar
   tras acordar inputs/ownership de perfil/versiones, sin cambios a Matching core.
5. Revisar diff y ejecutar E2E integrado local; targeted regressions según
   archivos efectivamente modificados. Registrar evidencia local en la Biblia.
6. Presentar diff contra CHECKPOINT_COMMIT y gate local; nada se integra al
   frozen candidato ni al remote sin revisión/autorización posterior.

## Paquetes sustanciales candidatos — aprobar gaps con evidencia antes de editar

### A — Master 42: sesión, perfil, CV factual y retorno

- INPUT: sesión fixture válida/inválida, CV soportado/no soportado, extracción
  factual parcial, preferencias y edición explícita del usuario.
- PRODUCER/TRANSFORM: AuthCallback/auth existentes; ProfileBuilder; extracción
  analyze-cv-candidate/extract-pdf-text y candidate-truth actuales. No inventar
  experiencia, ubicación, idiomas ni elegibilidad; no cambiar readiness core.
- STATE/PERSISTENCE: user_master_profiles, evidence items y storage actuales;
  confirmar save/reload, ownership/user_id, error de persistencia y recuperación.
- API/SERVER: netlify/functions/b2c-profile.ts, analyze-cv-candidate.ts y helpers
  directamente llamados, con transporte/provider LOCAL inyectado o mock acotado.
- UI/USER ACTION: src/hub/ProfileBuilder.tsx; confirmar/editar/subir/guardar/
  volver al contexto existente. Preservar return intent ya cerrado.
- ANALYTICS/EFFECT: src/lib/analytics.ts existente; consentimiento, no PII,
  sin inventar eventos ni generar efectos repetidos al recargar.
- FAILURE: sesión inválida, extracción vacía, archivo inválido, storage/DB
  fallan, cancelación/retry. Estado visible recuperable; no falso success.
- TEST/ACCEPTANCE: handler real + persistencia local/mocked external boundary +
  Chromium save/reload/error-retry; otro usuario nunca lee/escribe el perfil.
  Verifiers existentes de CV universal, Candidate Truth y funnel sólo si el diff
  afecta sus contratos. No declararlos abiertos ni rediseñarlos por este plan.

### B — Master 42: workspace, evidencia, versión CV y PDF

- INPUT: usuario, una oportunidad canonical válida y snapshot privado factual;
  un caso excluded y otro incompleto sin fabricar hechos.
- PRODUCER/TRANSFORM: application-workspace/generate-cv-vivo/cv-workspace y
  generación existente con provider fixture, evidence confirmation/versioning.
- STATE/PERSISTENCE: workspaces/generated_cvs/cv_evidence_items y RPCs existentes
  en LOCAL; vínculo oportunidad/version/usuario, idempotencia y parent_version.
- API/SERVER: netlify/functions/application-workspace.ts, generate-cv-vivo.ts,
  cv-workspace.ts y helpers directamente afectados. C11/C12 son baseline:
  Catalog/Matching authorities y vacancy_snapshot privado no se vuelven a diseñar.
- UI/USER ACTION: src/hub/ApplicationWorkspace.tsx y CVVivo.tsx; analizar requisitos,
  confirmar evidencia, generar/seleccionar/editar/reload y descargar PDF real.
- ANALYTICS/EFFECT: preparation_completed/return intent ya existentes, dedupe;
  sin email ni IA remota ni writes/credentials PROD.
- FAILURE: 401/403, opportunity excluded, provider timeout, DB/version failure,
  reload/duplicate click y snapshot vacío; nunca entregar CV de otro usuario ni
  usar requirements como experiencia confirmada del candidato.
- TEST/ACCEPTANCE: producción de versión por handler real, reload de la misma
  identidad, evidencia factual conservada y PDF no vacío/legible del CV elegido;
  fixture privada no cambia denominator global. Test positivo y negativo real,
  no solamente regex de wiring ni PASS aislado de PDF.

### C — Master 43–44: Free/Founding Beta, valor y retorno

- INPUT: perfiles Free/Beta y estados nuevos/retorno; candidatos Retrieval fixture,
  cero resultados honesto, CV/versiones y plan de aprendizaje existente.
- PRODUCER/TRANSFORM/STATE: entitlement/presentation gates y cache/snapshots
  existentes; no cambiar scoring/thresholds, canonical universes ni permisos.
- API/SERVER: endpoints exactos usados por src/hub/Dashboard.tsx, LearningPlan.tsx,
  CVVivo.tsx y Founding Beta actuales. No enviar correos ni activar usuarios PROD.
- UI/USER ACTION: continuar acción existente y volver a versión/plan/perfil;
  comprobar estados útiles, errores recuperables y cobertura sin truncar datos.
- ANALYTICS/EFFECT: eventos existentes consentidos y efectos deduplicados; Free
  top-3 es presentación, nunca recorta universo/scoring; no añadir monetización.
- FAILURE: cero candidatos, servicio/cupo/cache stale, evidencia insuficiente,
  usuario bloqueado, retorno sin sesión. Honestidad y separación de UNKNOWN.
- TEST/ACCEPTANCE: casos handler/UI local coherentes desde persistencia hasta
  acción final; Free/Beta no pierden flujos válidos; Learning sólo usa gaps
  corroborados. Real Matching/GSC/retención medida siguen pendientes PROD.

## Delegación y aceptación

Un prompt ejecutivo por paquete: autoridad, files allowlist, ownership, inputs,
negative paths, restricciones, comandos target y evidencia esperada. Orquestador
entiende el sistema antes de delegar, revisa todos los diffs, integra los fixtures
y sólo marca CLOSED_LOCAL al pasar el flujo completo; no autoriza al agente a
abrir nuevos frentes ni hacer commits/pushes/deploys por su cuenta.

No pedir features nuevas ni optimizaciones PD-006/PD-007. Si no hay un gap local
concreto, informar ALREADY_BASELINE y pasar al siguiente alcance permitido.
Si un cambio afecta shared/protected surface, parent coordina y exige regresión
local del contrato afectado; no suite global por reflejo.

No Netlify, PROD reads/writes, migration apply, reconciliation/backfill, scrapers,
dominio, B2B ni CVITAE_PROD_RELEASE_VALIDATED=true. Providers externos se mockean;
se prueba implementación real hasta esa frontera y se explicita su límite.

INTEGRATION_READY_LOCAL=TRUE sólo bajo TOMORROW_INTEGRATION_GATE; de lo contrario
FALSE con evidencia/gap concreto. No equivale a deploy autorizado ni PROD PASS.

## Resultado de ejecución local — 2026-10-08 — SEMANTIC GATE CLOSED_LOCAL

Common base exacto: `9b8f6a899197e2795280fd1cb30484fb68f1bbc0`.
GOLDEN_PRODUCT_BASE=8281c6a5a1aed348b9360f994322a4624fabd247
INTEGRATION_READY_LOCAL=TRUE para el delta de esta noche, no todo Master42–44,
no integración ejecutada ni PROD_VALIDATED.

- Perfil/save/retry/reload/return/private CV: 9 grupos PASS.
- Workspace/version/checklist/copia/PDF/efectos/browser: 26 casos PASS.
- Guard CV factual y semántica de requisitos: 60 casos PASS.
- Analytics, secondary contracts, Candidate Truth y eligibility: PASS.
- Build FINAL combinado fixture: Node24.21.0/pnpm11.8 PASS, SEO2501, sitemap2511,
  aliases2501, collisions0, prerender/robots PASS, sin credenciales/red PROD.
- git diff --check PASS; superficies públicas CLOSED, migrations y configuración
  frozen: ZERO DIFF. Backbone57 conserva su red estático antiguo sin modificación.

### Cable de soporte semántico corregido

JOB REQUIREMENT (incluye campos estructurados) → requirementInputs (fragmentos
válidos, IDs de evidencia confirmada del usuario/contexto) → drafting model
propone documentos → assessRequirementSupport evalúa contenido/facts de cada
par con el MISMO provider/model de Application Workspace, sin recibir el status
propuesto → normalizer exige identidad de requisito, IDs scoped, citas completas
y decisión semántica → requirement_analysis/fit_summary → UI/coverage → reload
→ aceptación/CV literal. La igualdad de citas protege el hecho, NO compara el
requisito con la evidencia; redacción semánticamente equivalente sigue soportada.

KNOWN EVIDENCE != SUPPORTING EVIDENCE. Una referencia desconocida/ajena no elimina
el requisito: conserva gap y cobertura cero. Relación incierta/no relacionada
no es supported. Partial sólo aporta media cobertura y un esencial parcial sigue
incompleto; no se etiqueta Respaldo sólido ni se omite del checklist.

`confirmed-semantic-v1` versiona el fingerprint y sella usuario/oportunidad/
versión/valores/evidencia/requisitos/cobertura/CV con digest canónico compatible
con orden JSONB. Cache antiguo no pasa; overview/reload degrada sólo la proyección
insegura, sin reescribir historia. Evidencia rechazada/editada o pendiente obliga
reprepare y bloquea accept antes del RPC. Provider incompleto/fallido no persiste
un resultado y permite retry. Evidencia pendiente bloquea incluso el primer call.

La corrección agrega UN call semántico acotado (<=24 requisitos, <=8 hechos
citados por requisito) a una preparación nueva válida; reuso seguro no llama IA.
Los tests sustituyen el provider, Auth/DB/RPC/storage en sus fronteras. Demuestran
wiring/normalización/persistencia local/browser, NO precisión universal del modelo,
SQL/RLS/locking reales ni éxito PROD. No se hizo ninguna llamada externa real.

El bloque PARALLEL LOCAL EVIDENCE de GRAND_CHECKPOINT conserva la primera pasada
histórica y su blocker anterior. Este resultado y el integration gate actualizado
superseden únicamente aquel estado LOCAL; no reescriben Master/C01–C21 ni Golden.
Consultar `artifacts/release/parallel-b2c-local-evidence-20261008.json`.
No integrar/desplegar automáticamente: commit local del delta y paquete separado;
el ZIP frozen original sigue inmutable. La selección vigente de mañana es Golden / R1 / LATER READY según el bloque
R1 siguiente y el integration gate; requiere revisión/autorización explícita,
sin cambiar cuenta/site ni mezclar trabajo no ready.


## Estado vigente R1 — CLOSED_LOCAL / R1

R1_INTEGRATION_READY=4e5b59bae59b5e0ae4fd11dfc6683f91ca614f33
R1_INTEGRATION_READY_LOCAL=TRUE
Tag local inmutable: checkpoint/b2c-ready-20261008-r1.
Ver `B2C_READY_CHECKPOINT_R1_2026-10-08.md` para identidad, evidencia y límites.
R2 desciende del checkpoint DOCUMENTAL posterior a R1; no continuar producto
sobre el branch R1 congelado. R1 sustituye sólo el estado local del blocker
semántico histórico de GRAND_CHECKPOINT, no modifica Master/C01–C21.

CLOSED_LOCAL / R1: profile/load/save/retry/reload (9 grupos), application
workspace/version/checklist/copia/PDF/efectos (26 casos), CV literal y requirement
semantic grounding (60 casos), cache/context guard y supported/gap UI/reload.
No repetirlos como frentes nuevos. Evidencia y build combinado ya PASS.

### Remaining OPEN_LOCAL_NOW — gaps de evidencia, no bugs presumidos

Lista derivada únicamente de Master42–44 y paquetes A/B/C anteriores. No abre
nuevas features ni declara roto lo que existe. Cada contrato debe reutilizar la
evidencia baseline y confirmar el gap exacto antes de cambiar implementación.
Orden recomendado: Free/Beta + retorno Dashboard (43/44), luego versiones CVVivo
(42), luego el límite sesión/extracción aún no cubierto por R1. Learning/retorno
se valida junto al primer paquete si sus dependencias permiten un cable completo.

#### 1. Master43 — Free / Founding Beta: adquisición y valor sin veto accidental

- CONTRACT: entitlement → presentación Dashboard/acciones existentes → avance
  válido; Free top-3 sólo presentación, sin truncar universo ni scoring.
- CURRENT STATE: controles Free/top-3/CTA/consent baseline protegidos y regresiones
  dirigidas PASS; falta evidencia integrada de todas las variantes de este cable.
- INPUT: sesiones Free/Beta nuevas y de retorno; retrieval fixture no vacío/cero.
- OUTPUT: acciones/datos visibles según entitlement, cero honesto, errores/retry
  útiles y continuidad del flujo permitido; no false success ni efectos dobles.
- AFFECTED SURFACES: Dashboard.tsx, useFoundingBeta.ts, FoundingBetaModal.tsx,
  founding-beta-action.ts y endpoints realmente usados; analytics existente.
- DEPENDENCIES: R1 perfil/Workspace; contratos existentes de entitlement,
  snapshots/presentation, CTA/return intent/consent. No cambiar matching core.
- BLOCKERS: ninguno local identificado; servicios/pago/email reales pendientes
  PROD no se convierten en cierre local. No enviar correos en fixtures.
- ACCEPTANCE: handler/estado/UI/acción/reload y efectos locales, Free/Beta,
  sesión/servicio/cupo fallidos sin pérdida de adquisición; no PASS aislado de gate.
- TARGETED REGRESSION: verify_conversion_analytics_item56,
  verify_b2c_secondary_contracts y Candidate Truth/eligibility sólo si afectados;
  nuevo E2E del gap específico, no reejecutar routing/SEO por defecto.

#### 2. Master44 — retorno orgánico y Learning: continuar estado útil/factual

- CONTRACT: contexto guardado → regreso/sesión → Dashboard/versión/plan existente
  → próxima acción útil → efecto consentido, sin inventar gaps del candidato.
- CURRENT STATE: return intent/CTA/Dashboard bounded son baseline; R1 cubre
  retorno/reload de perfil y Workspace, no todo el loop Master44 ni retención real.
- INPUT: estado nuevo/retorno, versión/perfil/plan persistidos, gaps corroborados,
  cero resultados, sesión ausente y cache viejo.
- OUTPUT: retorno a identidad/estado correctos, plan basado en gaps corroborados,
  error recuperable/cero honesto; sin generar hechos ni duplicar efectos.
- AFFECTED SURFACES: Dashboard.tsx, LearningPlan.tsx, CVVivo.tsx y endpoints
  actualmente consumidos, auth/return-intent y analytics si el cable lo exige.
- DEPENDENCIES: R1 hechos/semántica, contratos C11/C12 y entitlement/estado del
  workstream1. NO confundir Learning factual con requisito unsupported convertido
  en experiencia. Revisar autoridad existente antes de delegar.
- BLOCKERS: ninguno local demostrado; medición de retención/entrega email y
  real-provider/GSC pendientes PROD, fuera de esta ejecución local.
- ACCEPTANCE: regreso real en browser con reload/estado/acción/efecto; plan
  soportado por gaps, cache/servicio/sesión fallidos recuperables. No cerrar
  retención comercial sólo por esta evidencia local.
- TARGETED REGRESSION: verify-learning-plan, secondary contracts y conversion
  analytics según diff; Candidate Truth si toca evidencia; E2E del retorno.

#### 3. Master42 — CVVivo / versión privada / adaptación / PDF fuera de Workspace R1

- CONTRACT: oportunidad/snapshot privado + hechos confirmados → versión del CV
  correcta → edición/selección/reload → PDF de esa versión; user isolation.
- CURRENT STATE: C11/C12 son baseline; R1 cierra ApplicationWorkspace/PDF y
  grounding, no el resto de generate-cv-vivo/cv-workspace/CVVivo como journey único.
- INPUT: usuario/contexto, versión base factual, oportunidad o snapshot privado
  actual; casos vacíos/excluded y fallo provider/persistencia.
- OUTPUT: versión vinculada a usuario/oportunidad/parent, reload estable y PDF
  legible elegido; snapshot privado no modifica universo/denominator global.
- AFFECTED SURFACES: CVVivo.tsx, generate-cv-vivo.ts, cv-workspace.ts y helpers
  existentes directamente llamados. ApplicationWorkspace R1 sólo si dependencia
  demostrada; no reconstruirlo ni crear generación paralela.
- DEPENDENCIES: hechos confirmados/Candidate Truth/R1; C11/C12/version ownership;
  provider/Auth/DB/storage reemplazados únicamente en frontera local.
- BLOCKERS: ninguno local demostrado; precisión provider y SQL/RLS/locks reales
  no validados, permanecen limitación externa declarada.
- ACCEPTANCE: producer/normalizer/persistencia/servidor/UI/edición/reload/PDF y
  efectos reales locales; negativos, user isolation y sin hechos fabricados.
- TARGETED REGRESSION: verify-b2c-cv-universal, verify-b2c-cv-polish,
  verify_b2c_secondary_contracts según superficie; grounding/journey R1 si toca
  sus autoridades, no tests de todos los contratos congelados.

#### 4. Master42 — límite auth/entrada/extracción CV anterior al perfil R1

- CONTRACT: auth/return → archivo CV → extracción factual → revisión/confirmación
  → perfil de usuario correcto → continuidad; error nunca autoriza overwrite.
- CURRENT STATE: R1 prueba safe profile load/save/retry y frontera CV privada;
  no declara signup/callback/extracción semántica real completos.
- INPUT: sesión/return intent, archivo soportado/no soportado, extracción parcial
  o vacía, cancelación y errores Auth/storage/provider.
- OUTPUT: hechos explícitos revisables y perfil propio conservado, retry/retorno
  seguro; UNKNOWN no se convierte en hecho ni extracción vacía en éxito.
- AFFECTED SURFACES: AuthCallback.tsx/auth existente, ProfileBuilder.tsx,
  b2c-profile.ts, analyze-cv-candidate.ts, extract-pdf-text.ts, helpers necesarios.
- DEPENDENCIES: R1 perfil y Candidate Truth/ownership, CTA/return intent baseline.
- BLOCKERS: ninguno local demostrado; OAuth/email/OCR/modelo reales requieren
  validación externa futura, no llamadas PROD ni reabrir profile journey ya PASS.
- ACCEPTANCE: cable local browser/handler/estado completo con fronteras simuladas
  explícitas, confirmación/reload, usuario distinto, fallo/cancelación/retry y
  proveedor bloqueado cuando factual boundary impide operación.
- TARGETED REGRESSION: profile journey, CV universal, conversion analytics,
  Candidate Truth/eligibility sólo según diff + E2E de la entrada/extracción faltante.

BLOCKED_UNTIL_PROD sigue: current-site deploy/smoke y créditos; provider semántico
real, SQL/RLS/locks, entrega/retención real, C16/C17/C18 y canary futuro. No
empezarlos por avanzar R2. PD-006/PD-007 no entran en scope local B2C.

## R2 V2 — 2026-10-09 — lectura dirigida / STOP A

Orden actual del operador supersede únicamente la prohibición histórica de
preparar B2B LOCAL. No abre 54–55, deploy ni escritura/consulta PROD por el agente.
Git observado por el agente: `work/b2c-r2-20261008`, HEAD
`c633f5d8ec238829c98e69d9dcba00d401ffee70`, limpio antes de esta pasada.
R1 y su tag no se modificaron. Ningún test/build/SQL fue ejecutado.

### Matriz única de contratos y evidencia

Los hallazgos STATIC siguientes son discrepancias inspeccionadas; aún NO tienen
la clasificación `REPRODUCED_LOCAL_BUG`. Los probes pendientes deben discriminar
el fallo antes de modificar producto. `EVIDENCE_GAP_ONLY` no significa que el
código sea correcto. `CLOSED_LOCAL` no se concede en esta pasada.

| Master / OUTCOME | Base reutilizada / clasificación | ACTUAL_GAP y último gate probado → primero no probado | Autoridad / paths dirigidos | Verificación pendiente / frontera externa |
|---|---|---|---|---|
| 42 perfil y Application Workspace | REUSED_CLOSED_R1 | Profile9, application26, grounding60 + browser/build PASS R1 → sin nuevo gap demostrado en esos subcontratos | ProfileBuilder, application-workspace; Candidate Truth | Excluir implementación cerrada; repetir sólo si el diff futuro afecta autoridad/consumer. Provider real BLOCKED_UNTIL_PROD |
| 43 Free/Beta/Dashboard | EVIDENCE_GAP_ONLY | Top-3 presentación y regresiones R1 → adquisición/entitlement/acción/fallo/reload integrado. STATIC: catch de get_status deja enrollment=null/programFull=false/loading=false; showModal puede resultar true en error. accept sin sesión retorna sin error | Dashboard → useFoundingBeta/FoundingBetaModal → founding-beta-action → enrollment/profile | Probe hook + browser integrado con Free/Beta, error, retry, otro usuario, consentimiento. Servicio/email BLOCKED_UNTIL_PROD |
| 44 retorno/Learning | EVIDENCE_GAP_ONLY | Retorno perfil/Workspace R1 y secondary contracts → loop Dashboard → intent → gemini-courses → learning_recommendations/status → reload | LearningPlan, gemini-courses, b2c-profile save_intent; Matching canónico existente | verify-learning-plan + browser de avance/recarga/gap no corroborado; retención comercial no probada |
| 42 CVVivo privado externo a Workspace | EVIDENCE_GAP_ONLY | C11/C12/private snapshot → generación/versionado/edición/PDF completo. STATIC: generate-cv-vivo persiste markdown proveedor sin validador factual de salida; cache retorna antes del gate de evidencias pendientes | CVVivo → generate-cv-vivo/cv-workspace → create_cv_version/generated_cvs/cv_evidence_items | Provider inventa hecho/no números, vacío, evidencia cambiada, parent ajeno, PDF elegido/reload. SQL/provider reales BLOCKED_UNTIL_PROD |
| 42 auth/entrada/extracción | EVIDENCE_GAP_ONLY | Guardado/carga perfil R1 → callback/extracción/revisión/confirmación anterior. STATIC: callback no comprueba res.ok; entrada conserva el archivo antes de extracción y deja revisión manual | AuthCallback → ProfileBuilder → extract-pdf-text/analyze-cv-candidate → b2c-profile draft/save | E2E retorno, PDF/DOCX/TXT/imagen, parcial/vacío/error/cancelación, confirmación explícita/otra sesión. OAuth/OCR real BLOCKED_UNTIL_PROD |
| 58 MVP vendible | NOT_TOUCHED (definición local abajo) | Rutas reales identificadas → aceptación empresarial completa | Mismo grafo B2B 59–64 | No declaración de vendibilidad validada hasta E2E y piloto |
| 59 identidad/onboarding empresa | EVIDENCE_GAP_ONLY | create-vacancy preflight + RPC exigen verified/active → alta/verificación/invite/retorno real no demostrado | Recruiters → submit-lead/recruiter_leads → revisión/tokens; send-b2b-invite/prospects | Empresa no verificada 403, ownership y errores. Verificación humana/email BLOCKED_UNTIL_PROD |
| 60 create → truth → Universe | BLOCKED_UNTIL_PROD (compatibilidad esquema STOP A); EVIDENCE_GAP_ONLY local | RPC transaccional existente STATIC → contrato de campos/idempotencia/consumidores. STATIC: suffix uppercase vs regex lowercase; espejo omite requirements/salary_range, fija PY/verified100; retry genera nuevo slug | Recruiters/create-vacancy → create_recruiter_vacancy_atomic → recruiter_vacancies + opportunities → triggers/reducer/policy → vistas/API/Admin | Probe handler; después SQL local real rollback/retry/campos. requirements canónico jsonb según 202609240001; salario textual canónico aún por determinar, nunca inventar números |
| 60 close/reload/publicación | BLOCKED_UNTIL_PROD (compatibilidad STOP A); EVIDENCE_GAP_ONLY local | Ownership previo STATIC → cierre atómico no demostrado. STATIC: Promise.all de updates ignora errores; UI ignora res.ok y marca cerrada | validate-recruiter-token/Recruiters → ambas filas → Universe; VacantePage activa por recruiter_vacancies | Negativo espejo falla, empresa ajena, retry/no-op, todas las vistas y Admin, página abierta/reload; no editor UPDATE encontrado en ruta inspeccionada, no construir uno |
| 60 permisos/distribución | BLOCKED_UNTIL_PROD | C09.1/SEO histórico cerrado → registro efectivo de recruiter_b2b no demostrado. STATIC: no está en array ejecutable de canonical_opportunity_source_policy, cuyo final fuerza is_enabled=false | opportunity_sources/identity aliases/permissions/admin events → 040001 policy → reducer/vistas; 080001 SEO | No replicar UPDATE histórico 202608110016. Preservar first-party advisory existente; UNKNOWN externo no autoriza JobPosting/Google Jobs/distribución. Revisión sin cambiar policy cerrada hasta prueba específica |
| 61 postulación privada | EVIDENCE_GAP_ONLY | PDF privado/manual_review y consentimiento opcional presentes STATIC → privacidad cross-account end-to-end. STATIC: get_applicants cruza email con user_master_profiles y devuelve badges sin contrato de autorización | VacantePage/submit-lead → vacancy_applications/storage → validate-recruiter-token → ApplicantsPanel | Probe handler dos empresas/perfil B2C privado; archivo inválido, fallo storage/DB, retry/reload. Bucket/RLS reales BLOCKED_UNTIL_PROD |
| 62 batch/créditos | EVIDENCE_GAP_ONLY | Endpoint legacy 410; operación por CV y claim/settle/refund RPC presentes → locks/doble cargo/retry/recarga real | BatchAnalysis/analyze-cv-candidate; analyze-vacancy-applicants; ledger + review batches | SQL local tras preflight + transporte provider simulado, fallo parcial/retry/reanudar; no reactivar legacy |
| 63 filtros/comparación | EVIDENCE_GAP_ONLY | ATS/fit separados en UI y decisión humana persistida → abstención/misma vacante/comparación. STATIC: head_to_head permite dos vacantes distintas propias y contexto vacancy_id distinto | Recruiters/compare-candidates → aplicaciones/vacantes/analyses; cv-ats-workspace es B2C autenticado, no autoridad B2B por defecto | Probe cross-vacancy/empresa/contexto/IDs duplicados; ranking sin evidencia y filtros sobre denominador completo |
| 64 landing/activación | EVIDENCE_GAP_ONLY | /empresas usa submit-lead; invite/prospects/tokens presentes → lead → verificación → primer uso/errores/retorno | Recruiters, LandingPage sólo enlace dependiente, submit-lead/send-b2b-invite | Browser/provider email fixture; no enviar invitaciones. submit-beta no se considera automáticamente autoridad de alta B2B |
| 65 piloto real | BLOCKED_UNTIL_REAL_COMPANY_VALIDATION | Sin evidencia de empresa real → time_to_first_vacancy/shortlist, CVs procesados, usefulness, repetición, willingness-to-pay | Reusar timestamps/ledger/acciones y analytics consentidos; feedback humano | Instrumentación aún NOT_TOUCHED; ninguna métrica/ingreso inventados |
| 66 adquisición/demanda/conversión | EVIDENCE_GAP_ONLY | Item56 R1 consent/eventos → correlación B2B sin PII/doble efecto no demostrada. STATIC: analytics.b2bLeadSent admite company; no demuestra que sea llamado | src/lib/analytics + productores reales/credit request | Verifier consent/dedupe sin PII + browser; cobro integrado no identificado, solicitud != ingreso |

### Grafo de ejecución y scope del STOP

R1 confirmado → residual B2C con pruebas discriminantes → empresa verificada →
create atómico/idempotente → campos/provenance → lifecycle/policy/quality →
decisiones independientes Catalog/Matching/Alerts/SEO/external → API/UI/Admin →
acción/efecto → cierre/retry/reload. Rama privada: postulación autorizada → CV
privado por empresa/vacante → cola → reserva/settlement/refund → explicación/
comparación → acción humana → persistencia. El tracking existente observa
efectos confirmados; ninguna rama publica perfiles privados automáticamente.

Denominador a reconciliar después de autorización: TODAS las recruiter_vacancies
y sus mirrors recruiter_vacancy_id/source recruiter_b2b, incluidos cerrados,
duplicados y huérfanos, por fuente y proyección. Cantidad real NOT_VERIFIED.
Histórico y futuro usarán el mismo reducer. Un fixture no reemplaza ese total.

MVP propuesto por rutas existentes: solicitud y verificación manual de empresa,
publicación con enlace de postulación, CV privado y revisión manual si parsing
falla, revisión progresiva y batch por CV, ATS/fit explicados, créditos y acciones
del reclutador persistidas. Está IMPLEMENTADO EN BASELINE de forma parcial, NO
validado como flujo vendible LOCAL en R2. Bloqueos: puente/cierre/privacidad,
evidencia de batch/ranking, servicios/esquema reales y piloto. No se identificó
editor de vacantes ni facturación integrada en estas rutas; no se prometen.

### Clasificación de paths antes de implementación

| Paths del bloque | Clase / productor y consumidor | Regresión mínima |
|---|---|---|
| WORKING_PRINCIPLES.md (append), este plan, GRAND_CHECKPOINT (append), artifacts/release/r2-* | SAFE_NEW_SCOPE; governance/evidencia → operador | Diff pequeño; historia/R1 intactos; ningún PASS inventado |
| scripts/operator/verify-r2-b2b-20261009.ps1; scripts/verify-r2-b2b-baseline.mjs | SAFE_NEW_SCOPE; handlers reales + frontera DB/provider fixture → operador | Runtime exacto, sin red/credenciales, resultados por caso y exit no cero ante fallo; NO sustituye E2E ni SQL real |
| Recruiters/BatchAnalysis y handlers B2B | SHARED_SURFACE; empresa → vacante/CV/ledger → B2B y puente B2C | Handler + browser/tenant/retry/reload; crear/cerrar SQL atómico en DB local |
| Dashboard/LearningPlan/CVVivo/ProfileBuilder/AuthCallback/useFoundingBeta/FoundingBetaModal y autoridades B2C nombradas arriba | PROTECTED_SURFACE; residual B2C → perfil/CV/plan/retorno | Regression targeted R1 según diff, secondary/analytics y E2E específico |
| Nuevo SQL futuro, source policy/Universe/field contract; VacantePage/metadata si resulta indispensable | PROTECTED_SURFACE; puente → todos los consumidores afectados | Preflight primero; SQL real, historical/future, policy/Universe + rutas/JobPosting/SEO afectadas |

Esta primera parada agrega sólo documentación/preflight/probes. No modifica
producto, migrations, R1 ni superficies compartidas. La separación B2C/B2B
queda conservada: diff productivo desde c633f5d8 = vacío; R2 no se promueve.

LAST_PROVEN_GATE=identidad Git + evidencia R1 reutilizada.
UNPROVEN_GATE=compatibilidad esquema real y reproducción LOCAL de hallazgos STATIC.
EXACT_OPERATOR_ACTION=SQL catalog-only artifacts/release/r2-b2b-preflight-20261009.sql;
probe offline scripts/operator/verify-r2-b2b-20261009.ps1.
EVIDENCE_REF=artifacts/release/r2-b2b-state-20261009.json (preparación, NOT_RUN).
NEXT_SAFE_ACTION=recibir preflight/probes, clasificar fallos demostrados y realizar
la pasada de implementación; SQL dependiente sólo tras compatibilidad probada.
Si el operador no habilita SQL, registrar BLOCKED_UNTIL_PROD y continuar los
contratos locales independientes. No se requiere permiso para cada edit local.
