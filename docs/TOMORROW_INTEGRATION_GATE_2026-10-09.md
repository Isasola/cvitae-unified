# Tomorrow integration gate — 2026-10-09

Subordinado a GRAND_CHECKPOINT y FROZEN_CHECKPOINT. No cambia el candidato que
se publicará en cvitae-lata: primero se despliega EXACTAMENTE Golden, sin mezclar
trabajo nocturno. Integrar B2C nuevo es un paso posterior revisado y autorizado.

## Base común determinista

```text
GOLDEN_PRODUCT_BASE=8281c6a5a1aed348b9360f994322a4624fabd247
COMMON_INTEGRATION_BASE=CHECKPOINT_COMMIT
COMMON_INTEGRATION_BASE_REF=refs/tags/checkpoint/b2c-common-base-20261008
CHECKPOINT_COMMIT=resolver el tag y cotejar el SHA exacto de MANIFEST.json
PARALLEL_BRANCH=work/b2c-parallel-20261008
```

Una nota tracked no puede contener el hash de su propio commit: escribirlo
cambiaría ese hash. Por eso la identidad estable se declara por tag local,
`git rev-parse refs/tags/checkpoint/b2c-common-base-20261008`, y el resultado SHA
exacto queda en MANIFEST.json/git-state.txt/AUDIT de fuera del tree. No inventar
un SHA anticipado, no hacer amend para intentar autorreferencia y no cambiar el tag.

CHECKPOINT_COMMIT = Golden product tree + documentos de governance/handoff.
work/b2c-parallel-20261008 comienza en ese commit, no en 8281 sin documentos.
Antes de código nuevo, ambos HEAD/tree IDs deben coincidir físicamente y los
siete governing files existir en el parallel worktree. Guardar la evidencia.

## Pre-integration diff y operación Git

No copiar carpetas de un worktree a otro. No sobreescribir src/ ni reconstruir
baseline de memoria. Desde cada workspace autorizado:

```powershell
$commonBase = git rev-parse refs/tags/checkpoint/b2c-common-base-20261008
$parallelHead = git rev-parse work/b2c-parallel-20261008
git diff --stat "$commonBase..$parallelHead"
git diff --name-status "$commonBase..$parallelHead"
git diff "$commonBase..$parallelHead"
```

Revisar cada archivo y dependencias; sólo después elegir explícitamente merge
(o cherry-pick si se requiere un subconjunto coherente). La operación final se
elige con el usuario tras revisar evidencia; este documento no la ejecuta.
No force/rebase/amend, directory overwrite ni push automático.

## Protected contract regression map

Cada changed path recibe una clase única; si participa en CLOSED,
PROTECTED_SURFACE=TRUE aunque también intervenga en un paquete nuevo.

| Clase/superficie | Regresión target requerida |
|---|---|
| SAFE_NEW_SCOPE | Verifier E2E del nuevo gap en UI/server/persistencia/acción/efecto; positivo, negativo, retry y reload |
| SHARED_SURFACE | E2E de consumidores realmente afectados, ownership acordado entre agentes; no duplicar helpers/verdades |
| PROTECTED_SURFACE: routing / detail Function / redirects / netlify.toml | verify_public_list_detail.ts --build --browser y redirect consistency sólo si esos paths cambiaron |
| PROTECTED_SURFACE: public detail HEAD / prerender metadata | initial/hydrated canonical/description/robots/OG singleton y 404 no canonical/JobPosting; verify_public_list_detail + public_html_item53 |
| PROTECTED_SURFACE: SEO inventory / read path | verify_seo_universe_read_path.mjs, verify_seo_inventory.ts, verify-seo-build-parity.ts según diff |
| PROTECTED_SURFACE: sitemap/prerender | verify_sitemap_universe_item30.ts y parity/HTML según productor afectado |
| PROTECTED_SURFACE: Universe/policy | verify_effective_source_policy.ts, verify_opportunity_universe.ts, intrinsic routing parity y SQL afectado |
| PROTECTED_SURFACE: CTA/auth return intent/analytics | verifiers existentes de Item56/funnel/consent y browser de acción/retorno; no PII ni eventos duplicados |
| PROTECTED_SURFACE: Candidate Truth/Matching | candidate truth/eligibility y B2C consumers afectados; scoring no se modifica y C17 permanece bloqueado por evidencia real |
| PROTECTED_SURFACE: custom CV / Workspace / Learning | verify_b2c_secondary_contracts.ts y E2E específico: user isolation, private snapshot, evidence separation y canonical consumer gates |

No rerun de todo C01–C21 por defecto. Seleccionar regresiones por diff real.
Ningún agente reabre CLOSED sin evidencia de regresión concreta o decisión
explícita nueva del usuario; un refactor cosmético no la constituye.

## Acceptance local

INTEGRATION_READY_LOCAL=TRUE sólo cuando TODOS los requisitos aplicables pasen:

1. Common base y ancestry verificadas; Golden→checkpoint sin cambios productivos.
2. Inventario changed paths y clasificación completa SAFE/SHARED/PROTECTED.
3. Revisión parent de todos los diffs; sin escrituras PROD, leaks, cambios
   no autorizados, migrations applied ni code overwrites fuera del parallel.
4. INPUT → PRODUCER → TRANSFORM → STATE/PERSISTENCE → API/SERVER → UI →
   USER ACTION → ANALYTICS/EFFECT → FAILURE MODE → TEST → ACCEPTANCE probado
   para cada área que se pretende cerrar; no fixture/string PASS aislado.
5. Targeted verifiers y regresiones del protected map PASS; los fallos baseline
   conocidos se conservan visibles y separados, no se ocultan ni retunean.
6. Build local del producto combinado, git diff --check PASS y evidencia
   persistida. Node 24/pnpm 11.8.0; fixtures sin credentials/read PROD.
7. Debts/deferred/PROD_PENDING explícitos; ningún CLOSED_LOCAL pasa a
   PROD_VALIDATED por un mock de proveedor, HTTP200 aislado o compilación.

Mientras sólo se preparó el checkpoint y no existe un delta B2C evaluado,
INTEGRATION_READY_LOCAL=FALSE / PRODUCT_DELTA_NOT_VALIDATED. La paridad inicial
es un gate de arranque, no evidencia de producto nuevo terminado.

## Deploy de mañana sigue separado

En la misma cuenta/current site cvitae-lata, Site ID
7c1d2305-cf2c-4e7e-a41c-0c4ca30d976f, comprobar crédito reset y linkage; preferir
retry del mismo Golden SHA bloqueado por créditos si existe. No mover dominio,
no usar cvitae-lat como final y no disparar build con commit vacío/documental.
Si hace falta Git trigger, STOP/pedir autorización. Smoke corto en cvitae.lat
según FROZEN_CHECKPOINT. C16/C17/C18 siguen sus dependencias/autorizaciones.

## Resultado del primer delta paralelo — 2026-10-08

COMMON_INTEGRATION_BASE=9b8f6a899197e2795280fd1cb30484fb68f1bbc0
GOLDEN_PRODUCT_BASE=8281c6a5a1aed348b9360f994322a4624fabd247
INTEGRATION_READY_LOCAL=TRUE (gate semántico y delta local completos; no integración/deploy).

| Changed path | Clase | Regresión / evidencia |
|---|---|---|
| src/hub/ProfileBuilder.tsx | PROTECTED_SURFACE | Profile journey (9 grupos), Candidate Truth/eligibility, conversion analytics/retorno, privado CV y aislamiento usuario |
| src/hub/ApplicationWorkspace.tsx | PROTECTED_SURFACE | Application journey (26 casos), secondary contracts, version/attestation/ownership, PDF/CSS real, analytics consent/dedupe |
| netlify/functions/application-workspace.ts | PROTECTED_SURFACE | Grounding (60 casos), application journey, secondary contracts; controles cached/legacy/user-scoped accept y invariantes Candidate Truth |
| scripts/b2c-application-boundary.ts | SAFE_NEW_SCOPE | Transporte externo sintético sólo local compartido por journeys/grounding; no prueba SQL/RLS/locking real |
| scripts/verify_application_claim_grounding.ts | SAFE_NEW_SCOPE | Admisión literal completa, campos faltantes/retry/cache/legacy/ownership; soporte semántico, cache/JSONB/contexto y requisitos estructurados |
| scripts/verify_b2c_application_journey.ts | SAFE_NEW_SCOPE | Handler/browser/persistencia local/version/PDF/efectos y fallos |
| scripts/verify_b2c_profile_journey.ts | SAFE_NEW_SCOPE | Handler/browser/storage local/perfil/retorno, fallos/retry/auth switch |
| docs/GRAND_CHECKPOINT.md | SAFE_NEW_SCOPE | Agregado de evidencia acotada, sin reescribir Master/C01–C21/frozen contract |
| docs/PARALLEL_B2C_WORK_PLAN_2026-10-08.md | SAFE_NEW_SCOPE | Resultado local y límites del provider; no nueva Biblia/lista operacional |
| docs/TOMORROW_INTEGRATION_GATE_2026-10-09.md | SAFE_NEW_SCOPE | Esta clasificación y acceptance local PASS |
| artifacts/release/parallel-b2c-local-evidence-20261008.json | SAFE_NEW_SCOPE | Resumen sin credenciales; logs/PDF/screenshots locales ignorados |

Todas las superficies CLOSED de routing/HEAD/SEO/read path/universes/policies y
migrations permanecen sin cambios. No se rerunó C01–C21 ni preflight PROD.
La vieja aserción backbone57 de alerts queda roja y visible como baseline,
no afectada por este diff. No confundir mocks de transporte con PROD PASS.
Antes de integración revisar el delta completo commonBase..PARALLEL_READY_COMMIT
por Git: name-status/stat/diff y pruebas de superficies afectadas. El commit local
se captura en el segundo MANIFEST/paquete y en el reporte final, evitando un SHA
self-referential dentro de su propio tree. No integrar por directory overwrite.
El deploy Golden del current-site sigue siendo un paso independiente.

### Acceptance consolidada — 2026-10-08

INTEGRATION_READY_LOCAL=TRUE / CLOSED_LOCAL del delta, NO PROD PASS.
Perfil9, application26 (incluye browser supported vs gap y reload), grounding60
(incluye paraphrase, unrelated/missing/foreign IDs, legacy/digest/rejection, CV
separation, JSONB, provider failure/retry), analytics/secondary/candidate truth/
eligibility PASS. UN build final posterior al último cambio productivo PASS;
git diff --check PASS; no nuevo rojo sin resolver; protected public surfaces ZERO DIFF.

El viejo fallo estático backbone57 sigue visible/unchanged y no se rerunó.
Incidentes intermedios resueltos: duplicate identifier en verifier nuevo (renombrado),
esbuild sandbox Access Denied (mismo comando fuera del sandbox), aserción UI sensible
a mayúsculas mientras CSS muestra RESPALDADO (aserción case-insensitive; journey
completo repetido PASS). Los errores 401/422/500/503 de fixtures negativos son
pruebas de failure/retry esperadas, no errores PROD ni rojos finales.

Semántica se verifica con el modelo existente en una fase específica independiente
de labels de drafting; el mock prueba el contrato, no exactitud de Bedrock real.
No promete cerrar todo Master42–44 ni real SQL/RLS/locks/proveedor. Los límites PROD
ya declarados se conservan y no constituyen una autorización para consultarlos.
Paquete SECOND separado CVITAE_PARALLEL_READY: source Git tree/diff/evidencia/
manifest/bundle delta si se incluye. El ZIP frozen previo NO se sobrescribe.
