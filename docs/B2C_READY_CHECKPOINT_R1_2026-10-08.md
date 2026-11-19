# B2C integration-ready checkpoint R1 — 2026-10-08

## Identidad y alcance

PRODUCT/FEATURE COMMIT: `4e5b59bae59b5e0ae4fd11dfc6683f91ca614f33`
PRODUCT TREE: `958ed23eff8b73aa9aa005e2c453740094874cbd`
STATUS: CLOSED_LOCAL / R1
INTEGRATION_READY_LOCAL=TRUE
GOLDEN_PRODUCT_BASE=8281c6a5a1aed348b9360f994322a4624fabd247
COMMON_INTEGRATION_BASE=9b8f6a899197e2795280fd1cb30484fb68f1bbc0
R1_PRODUCT_TAG=checkpoint/b2c-ready-20261008-r1

R1 queda recuperable mediante ese tag local inmutable. Este documento y las
actualizaciones de plan/gate pertenecen a un commit documental posterior:
no se reescribe 4e5b59 ni su evidencia. El SHA documental/tree exactos se
registran fuera del tree en MANIFEST.json/git-state.txt del paquete completo.

R1 congelado: `C:\Users\isaso\cvitae-b2c-parallel-20261008`, branch
`work/b2c-parallel-20261008`. El próximo desarrollo comienza desde el commit
DOCUMENTAL R1 en `C:\Users\isaso\cvitae-b2c-r2-20261008`, branch
`work/b2c-r2-20261008`, con HEAD y tree inicialmente idénticos. No copiar src
entre worktrees ni continuar producto sobre el R1 congelado.

## Qué agrega R1

- Carga, guardado, retry, retorno y reload seguros del perfil; no guardar vacío
  por fallo de carga ni adoptar respuestas tardías de otro usuario.
- Fallos visibles de persistencia del checklist, recuperación, copia y PDF
  de Application Workspace; versión/usuario/oportunidad conservados.
- Boundary de hechos completos y confirmados para CV; referencias conocidas
  no autorizan afirmaciones fabricadas, truncadas o de otro contexto.
- Grounding semántico de requisitos: KNOWN EVIDENCE != SUPPORTING EVIDENCE.
  La autoridad existente evalúa contenido confirmado y admite paráfrasis
  legítimas sin convertir coincidencias de IDs en soporte.
- Evidencia scoped al usuario/application; invalidación y guard de cache
  viejo, contexto ajeno, evidencia cambiada/rechazada y datos adulterados.
- Paridad de soporte/gaps/cobertura, UI, reload y aceptación del CV/application.

No declara Master 42–44 completos. No cambia matching scoring, Universe,
policies, routing público, metadata pública ni contratos frozen.

## Evidencia local ya ejecutada — no rerun de checkpoint

| Cable | Resultado |
|---|---|
| Profile journey | PASS — 9 grupos |
| Application journey | PASS — 26 casos |
| CV literal + requirement semantic grounding | PASS — 60 casos |
| Browser E2E, supported/gap y reload | PASS |
| Analytics / secondary consumers | PASS |
| Candidate Truth / eligibility | PASS |
| Build combinado Node 24.21.0 / pnpm 11.8.0 | PASS — SEO fixture 2501 |
| Diff check | PASS |
| Superficies públicas frozen | ZERO DIFF respecto de common base |

Autoridad de evidencia: `artifacts/release/parallel-b2c-local-evidence-20261008.json`.
Los resultados se preservan; esta pasada agrega documentación y empaquetado,
no vuelve a ejecutar tests/builds ni convierte ausencia de rerun en fallo.

KNOWN_BASELINE_FAILURE: aserción estática de
`verify_candidate_truth_backbone_item57.ts`, unchanged / not introduced by R1.
No se arregla ni oculta por este checkpoint.

LIMIT: provider semántico local simulado. La evidencia prueba el cable real
handler/UI/guard/persistencia con fronteras externas locales, no precisión del
modelo real ni SQL/RLS/locks/PROD. NO es un blocker local.
REQUIREMENT_SEMANTIC_REAL_PROVIDER_PROD_CANARY=PENDING.
Después de un deploy autorizado hará falta canary acotado real-provider,
read-only/user-safe. Esta nota NO autoriza PROD ni reabre grounding local.

## Continuación e integración

Leer AGENTS, WORKING_PRINCIPLES, GRAND_CHECKPOINT y FROZEN_CHECKPOINT; después
este R1, PARALLEL_B2C_WORK_PLAN, TOMORROW_INTEGRATION_GATE y NEXT_CHAT_BOOTSTRAP.
Las notas iniciales históricas con blocker semántico quedan superseded sólo en
su estado LOCAL por el cierre R1 documentado; no borrar historia/Master/C01–C21.

El plan actualizado enumera los pendientes locales restantes de Master42–44;
seleccionar un contrato concreto y excluir evidencia ya cerrada. Cada R2 sigue:
INPUT → PRODUCER → TRANSFORM → STATE → API/SERVER → UI → USER ACTION →
EFFECT/ANALYTICS → FAILURE MODE → TEST → ACCEPTANCE.

R1 sigue disponible si R2 falla. R2 sólo se elige como candidato cuando alcanza
INTEGRATION_READY_LOCAL=TRUE de forma independiente. Integrar por ancestry y
diff revisado, merge/cherry-pick explícito; nunca directory overwrite.

## Contratos cerrados y límites operativos

ROUTING_CABLE=CLOSED_PROD; PUBLIC_DETAIL_CONTRACT=CLOSED_PROD;
HEAD_METADATA=CLOSED_PROD en el site de validación.
DO_NOT_REOPEN_ROUTING_WITHOUT_NEW_REGRESSION=TRUE.
DO_NOT_REOPEN_HEAD_METADATA_WITHOUT_NEW_REGRESSION=TRUE.
No reabrir List/Detail/path, fallback Catalog, 404, prerender/hydration,
singletons, SEO read path/inventory exhaustivo, sitemap/redirects sin regresión nueva.

Site de validación: cvitae-lat / 45e57d76-bc1e-46f2-95dc-1981973276db,
deploy Golden 6ac7f9ed968fe10008a3a541. Dominio cvitae.lat permanece en current
site cvitae-lata / 7c1d2305-cf2c-4e7e-a41c-0c4ca30d976f. Sin cutover ni DNS.
No cambiar cuenta/site/dominio. CVITAE_PROD_RELEASE_VALIDATED=FALSE.

Tomorrow candidate selection tras revisión: Golden 8281, R1 4e5b59 o un
LATER READY descendiente de R1. Ninguna elección/deploy queda autorizada por
este checkpoint. Consultar gate actualizado antes de usar instrucciones
históricas de deploy Golden. C16/C17/C18/servicios reales siguen PROD_PENDING.

R2: commits locales permitidos; NO push, deploy, Netlify, PROD, migration apply,
reconciliation, backfill, scrapers ni activación de release validado.

El ZIP frozen común y CVITAE_PARALLEL_READY_2026-10-08_4e5b59ba.zip son
inmutables. El NUEVO CVITAE_CURRENT_R1 contiene TODO el tree tracked del
checkpoint documental, no sólo el delta. Git tree y hashes mandan; no incluye
node_modules/dist/cache/credenciales ni el token de historia antigua.
