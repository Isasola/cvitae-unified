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
el ZIP frozen original sigue inmutable. El deploy current-site de mañana sigue
siendo EXACT Golden, en la misma cuenta/site, sin mezclar este trabajo.
