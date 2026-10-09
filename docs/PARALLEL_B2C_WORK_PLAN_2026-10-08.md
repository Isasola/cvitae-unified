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
