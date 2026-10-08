# Next chat bootstrap — 2026-10-08

DO NOT START BY AUDITING THE REPOSITORY.

## Read order obligatorio

1. AGENTS.md
2. WORKING_PRINCIPLES.md
3. docs/GRAND_CHECKPOINT.md
4. docs/FROZEN_CHECKPOINT_2026-10-08.md
5. docs/PARALLEL_B2C_WORK_PLAN_2026-10-08.md
6. docs/TOMORROW_INTEGRATION_GATE_2026-10-09.md
7. docs/NEXT_CHAT_BOOTSTRAP_2026-10-08.md

Luego inspeccionar código únicamente del OPEN_LOCAL_NOW actualmente elegido.
Los documentos HANDOFF son accesos rápidos; repo-at-checkpoint.zip contiene
TODOS los archivos tracked de CHECKPOINT_COMMIT. No reconstruir arquitectura
ni limitar alcance del producto a ejemplos/fixtures.

## Identidad

GOLDEN_PRODUCT_BASE=8281c6a5a1aed348b9360f994322a4624fabd247
COMMON_INTEGRATION_BASE_REF=checkpoint/b2c-common-base-20261008
SHA exacto CHECKPOINT_COMMIT y tree: MANIFEST.json/git-state.txt/AUDIT.
Frozen: C:\Users\isaso\cvitae-item53-public-contracts.
Parallel: C:\Users\isaso\cvitae-b2c-parallel-20261008.
Parallel branch: work/b2c-parallel-20261008.

Otro entorno obtiene source/tree y Git history del archive + bundle, verifica
sus hashes/inventario y crea su branch desde CHECKPOINT_COMMIT. No copiar
carpetas sobre otra versión ni usar otro clone como autoridad de código.

## Cierres/prohibiciones

ROUTING_CABLE=CLOSED_PROD; PUBLIC_DETAIL_CONTRACT=CLOSED_PROD;
HEAD_METADATA=CLOSED_PROD en cvitae-lat validado. No redescubrir routing,
request path, fallback Catalog, 404, metadata, SEO read path/exhaustiveness ni
sitemap/prerender/redirects sin una regresión NUEVA concreta.

Deploy validado 6ac7f9ed968fe10008a3a541, commit Golden, site de validación
cvitae-lat / 45e57d76-bc1e-46f2-95dc-1981973276db.
Dominio cvitae.lat permanece en cvitae-lata /
7c1d2305-cf2c-4e7e-a41c-0c4ca30d976f. No moverlo, no cambiar cuenta.
Current-domain deploy pendiente de crédito reset; CVITAE_PROD_RELEASE_VALIDATED
sigue FALSE. No Netlify, PROD writes, migration apply, reconciliation ni push
por continuar trabajo local. No scraper/source/B2B ni scoring retuning.

## Primera acción del orquestador

Mostrar matriz CLOSED_DO_NOT_TOUCH / OPEN_LOCAL_NOW / BLOCKED_UNTIL_PROD.
Elegir un flujo concreto de Master 42–44 y mapear sus autoridades/archivos/efectos.
No declarar todas esas áreas rotas: excluir subcontratos ya cerrados. Un único
prompt ejecutivo por paquete/agente tras entender dependencias y shared surfaces.
Asignar ownership por archivo; parent revisa diff y E2E antes de CLOSED_LOCAL.

Supabase/IA/storage/auth/email remotos se sustituyen sólo en la frontera local
por fixtures; ejecución real de handler + UI/acción/estado. No convertir ese
mock en evidencia de servicio real ni PROD readiness.

## Al terminar

Aplicar TOMORROW_INTEGRATION_GATE al diff CHECKPOINT_COMMIT→PARALLEL_HEAD.
INTEGRATION_READY_LOCAL=TRUE/FALSE con evidencia; no integración por copia de
folders, no push/deploy implícito. Preservar untracked aprobados sólo como estado
operativo, sin tokens/secrets; presencia del cursor no autoriza reconciliation.
PD-006/PD-007 nonblocking siguen pospuestos. Master 1–67 intacto.
