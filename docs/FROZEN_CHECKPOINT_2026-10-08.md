# CVitae — Frozen checkpoint 2026-10-08/09

Referencia autocontenida para abrir otro chat. La única Biblia operativa sigue
siendo [GRAND_CHECKPOINT.md](GRAND_CHECKPOINT.md), C01–C21 y Master 1–67.
Este handoff congela su release actual; no crea otra lista de trabajo.

## Estado y autoridad

```text
CURRENT_ITEM = CURRENT-SITE DEPLOY AFTER NETLIFY CREDIT RESET
STATUS = FROZEN / CODE VALIDATED / CURRENT DOMAIN DEPLOY PENDING
OPERATING_STATE = FROZEN_PENDING_CURRENT_SITE_DEPLOY
CODE_BASELINE = 8281c6a5a1aed348b9360f994322a4624fabd247
CODE_BASELINE_STATUS = VALIDATED
CURRENT_DOMAIN_DEPLOY = PENDING CREDIT RESET
CVITAE_PROD_RELEASE_VALIDATED = FALSE
```

El código está validado con build y smoke reales en `cvitae-lat.netlify.app`.
Todavía NO fue desplegado en el current site que posee `cvitae.lat`.
El cierre de routing/metadata en el ambiente de validación se conserva; la
validación de publicación del dominio actual sigue pendiente.

- Worktree autorizado: `C:\Users\isaso\cvitae-item53-public-contracts`.
- Branch local: `fix/item53-public-contracts-20260923`.
- Branch remota de producción: `feature/aws-migration`.
- HEAD de código validado y remote confirmado:
  `8281c6a5a1aed348b9360f994322a4624fabd247`.
- Commit: `fix: reconcile public detail metadata on hydration`.
- El commit documental de este handoff queda sólo LOCAL; no sustituye el SHA
  que debe desplegarse. Tag local: `checkpoint/pre-current-site-deploy-20261008`.
- `CURRENT_WORKTREE_CONTEXT.txt` fue actualizado con autorización explícita y
  sigue UNTRACKED. `artifacts/release/final-cable-reconciliation-cursor.json`
  también sigue UNTRACKED e intacto. No stagear ni incluir en commits.

## Sites, dominio y deploy exactos

| Rol | Site | Site ID | Host / estado |
|---|---|---|---|
| Current production / único destino mañana | cvitae-lata | 7c1d2305-cf2c-4e7e-a41c-0c4ca30d976f | Ya posee cvitae.lat; misma cuenta actual |
| Ambiente/evidencia de validación | cvitae-lat | 45e57d76-bc1e-46f2-95dc-1981973276db | https://cvitae-lat.netlify.app; no producción final |

Deploy validado final: `6ac7f9ed968fe10008a3a541`, READY/PUBLISHED,
commit `8281c6a5a1aed348b9360f994322a4624fabd247`,
branch `feature/aws-migration`. Publicado según metadata leída:
`2026-10-08T20:17:18.755Z`.

Último deploy publicado del current site observado en la inspección de cutover:
`6abfc0a7020dec0008057d32`, commit
`8b124f90ba1b7230467531228939c34fedf7b63f`, READY,
publicado `2026-10-02T14:34:38.912Z`. Es evidencia de ese momento, no un objetivo
para mañana; volver a leer sólo su metadata cuando se active el deployment.

```text
CURRENT_CVITAE_LAT_OWNER = cvitae-lata
DOMAIN_POINTS_TO_CURRENT_SITE = YES
DOMAIN_MOVE_EXECUTED = NO
DETACH_OLD_SITE = NOT_RUN
ATTACH_TARGET_SITE = NOT_RUN
DNS_CHANGE = NONE
NAMESERVER_CHANGE = NONE
WWW = 301 -> https://cvitae.lat/
TLS = VALID
DNS = externo / Namecheap
```

Los nameservers leídos fueron `dns1.registrar-servers.com` y
`dns2.registrar-servers.com`. `www.cvitae.lat` tenía CNAME
`cvitae-lata.netlify.app`; el certificado actual cubría apex y www.
No se movió ni borró una Netlify DNS zone. No se tocó email/MX, registrar,
dominio, deploy ni configuración del current site.

### Qué pasó con el cutover

El intento autorizado se detuvo en el preflight: la credencial Netlify CLI
administraba `cvitae-lata` (account slug observado `lvg-elshini`) y sólo devolvía
la ficha pública de `cvitae-lat` (account slug público `cvitae`), que no aparecía
entre sus sitios autenticados. Se pidió acceso antes de retirar la asociación;
no hubo detach/attach. Esto no es un fallo de routing, metadata ni aplicación.

**Nueva decisión explícita del usuario:** NO cambiar de cuenta y NO mover el
custom domain a otro site. El plan de cutover queda superseded. No continuar la
petición de autenticación de la cuenta de validación. PD-005 conserva su historia
y no se activa automáticamente.

## Cierres que se conservan

```text
ROUTING_CABLE = CLOSED_PROD
PUBLIC_DETAIL_CONTRACT = CLOSED_PROD
HEAD_METADATA = CLOSED_PROD
CRITICAL_5XX = NONE en el smoke final del site de validación
DO_NOT_REOPEN_ROUTING_WITHOUT_NEW_REGRESSION = TRUE
DO_NOT_REOPEN_HEAD_METADATA_WITHOUT_NEW_REGRESSION = TRUE
```

La evidencia es PROD real del ambiente `cvitae-lat.netlify.app`; no se debe
confundir con la publicación pendiente en el sitio actual del dominio.

- Routing público y List → canonical URL → live Detail → hydration funcionan.
- La autoridad efectiva del fallback es el artifact `dist/_redirects`; aliases
  SEO específicos 301! primero, fallback detail no forzado después. Original
  request path identifica family/slug; query spoof no reemplaza identidad.
- SEO prerender conserva prioridad estática. Catalog-only entrega HTML Detail
  real, no Home/SPA. Missing responde 404/noindex.
- Prerender/hydration parity y HEAD singleton están probados. Installed
  `react-helmet-async 3.0.0` con React 19 usa HEAD nativo: metadata inicial
  marcada `data-rh=true` se traspasa explícitamente al HEAD React al terminar
  de cargar el detalle. Assets/template y metadata sin JS se conservan.
- SEO read path canónico, keyset exhaustivo sin cap total, inventario SEO,
  sitemap/redirect generation cerrados. Fuente futura elegible no requiere
  hardcoding del lector. PAGE SIZE != TOTAL LIMIT.

### Evidencia de build/read path ya lograda

`202610040001_source_switch_wiring.sql` ya fue aplicado y validado en PROD.
SHA256 LF cerrado:
`3055782d986c1043697adb5b7ca70376efef94ab41d3bf9b3fd0644a82e59b0c`.
`202610080001_seo_universe_read_path.sql` también aplicado y validado en PROD.
No editarlos ni reaplicarlos por continuar desde este documento.

Build PROD exhaustivo ya informado: Node 24.21.0/pnpm 11.8.0;
SOURCE_POLICY_SNAPSHOT=119; SEO_INVENTORY=6026; sitemap=6048;
redirects=6026; collisions=0; Vite/prerender/robots PASS. Es evidencia del build
anterior; no prometer que el conteo futuro será exactamente el mismo.

Índice parcial `opportunity_universe_seo_ready_id_idx` activo. Páginas posteriores
trabajan aproximadamente 251 IDs para devolver 250; desapareció el patrón de
~16.357 lookups por página. Primera página ~781 ms y verificación ~900 ms,
dentro del criterio PROD aprobado. La optimización restante está en PD-006,
no bloquea este deploy y no se reabre ahora.

### Smoke final real de 8281c6a5

SEO canary:
`/empleos/legal-counsel-locally-recruited-texcoco-mexico-fe96fc8b/`.
HTTP y live API 200, título de oportunidad, canonical count=1,
description count=1, OG url/title/description/type singleton antes/después,
valores iguales, hydration PASS y sin error JS fatal.

Primer Catalog observado:
`049d5e42-ca2b-44ba-947d-6eae7bd2498e`, slug
`executive-assistant-recruitment-specialist-permanent-dayshift-remote-au--66b4d43d`.
HTTP y live API 200; Detail real; canonical count=1, robots count=1
`noindex,follow` antes/después; contenido visible e identidad conservada.
El primer registro de mañana puede cambiar: consultar el listado actual.

Missing `/empleos/__final_head_missing_20261008__/`: HTTP y API 404;
robots count=1 `noindex,follow`; canonical count=0; og:url count=0;
JobPosting count=0 antes/después; título Página no encontrada, sin Home.
Home, `/empleos/` y `/sitemap.xml` 200, sitemap XML. Sin critical 5xx.

## Cadena de commits — no regresar a routing histórico

| SHA | Mensaje | Papel |
|---|---|---|
| 8281c6a5a1aed348b9360f994322a4624fabd247 | fix: reconcile public detail metadata on hydration | Último código validado; exacto objetivo mañana |
| bd6cccd77d58440dae7c299e2eec0a51b6f03871 | fix: resolve public details from original request path | Identidad desde incoming path y 404 sin canonical Home |
| 6cc570c75f93b53c7e158ed7ee599f2372c75a66 | fix: route public details from generated redirects | Autoridad del artifact desplegado |
| c24fbfe54589ab869efe598f12f4ba30366e7705 | fix: use native routing for public details | Histórico / superseded para routing; no restaurar config.path |
| cbffa2b9c721959f5aff301d85689e8dd99bb698 | fix: unify public list and detail resolution | Resolver público Catalog OR SEO, sin raw fallback |

## Tomorrow deploy contract — 2026-10-09

Según el usuario, la cuenta/current site llegó al límite de créditos el
2026-10-08 y espera su renovación el 2026-10-09. La disponibilidad real debe
confirmarse antes de gastar un build; esta pasada documental no la consultó.

1. Entrar en la MISMA cuenta actual; comprobar nombre `cvitae-lata` y Site ID
   `7c1d2305-cf2c-4e7e-a41c-0c4ca30d976f`. Mantener `cvitae.lat` asociado allí.
2. Leer créditos/builds disponibles. Si el reset no ocurrió o no alcanza,
   STOP como CREDIT_RESET_PENDING; no usar otra cuenta ni un debug deploy.
3. Leer repo linkage y production branch; deben ser el repo CVitae y
   `feature/aws-migration`. Confirmar que el deploy/retry apunta al SHA exacto
   `8281c6a5a1aed348b9360f994322a4624fabd247`.
4. No modificar código, no build local, no nuevo commit, no commit vacío, no
   push documental/tag. Este commit de código ya está en remote.
5. Si existe deploy/build fallido o bloqueado de ESE commit por créditos,
   preferir RETRY ESE deploy. Su ID no fue consultado: no inventarlo.
   Si no existe, elegir únicamente el mecanismo de deploy del mismo SHA en el
   current site dentro de la ejecución autorizada; no reusar el site de validación.
6. Si una limitación real exige trigger Git: STOP, explicar y pedir autorización
   primero. No crear un commit para disparar Netlify por cuenta propia.
7. Observar hasta READY/PUBLISHED; verificar site, branch y commit del nuevo
   deploy. Si falla, reportar ese error y STOP; no abrir otro ciclo deploy/fix.
8. Ejecutar sólo el smoke siguiente sobre `https://cvitae.lat`.

Durante esta ejecución no cambiar cuenta, dominio, DNS, nameservers, registrar,
MX/email, config de build/runtime, migrations, Supabase, recovery ni workers.
No activar `CVITAE_PROD_RELEASE_VALIDATED` antes del smoke final PASS.
No convertir este handoff en autorización para ejecutar pasos hoy.

## Smoke del current-domain deploy

HTTP/Chromium read-only, sin consultas DB ni procesos mutantes.

| Target | Acceptance |
|---|---|
| `https://cvitae.lat/` | 200, TLS válido, Home correcto |
| `https://cvitae.lat/empleos/` | 200, listado |
| `/empleos/legal-counsel-locally-recruited-texcoco-mexico-fe96fc8b/` | 200 Detail; canonical host cvitae.lat count=1; title/description/OG singleton inicial e hidratado; live API 200; contenido permanece |
| Primer Catalog ACTUAL del Public API | 200 Detail; canonical exacto count=1; Catalog-only robots noindex,follow count=1 antes/después; live API 200; hydration PASS |
| `/empleos/__current_site_missing_20261009__/` | HTTP inicial 404; noindex,follow único; canonical=0, og:url=0, JobPosting=0 antes/después; no Home |
| `https://cvitae.lat/sitemap.xml` | 200 XML |

No exigir los 6026 registros en UI ni volver a medir todo el inventario.
Critical 5xx y errores JS fatales deben ser NONE. Verificar que el deploy servido
corresponde al SHA exacto y al current site, sin movimiento de dominio.

Si PASS: registrar `CVITAE_PROD_RELEASE_VALIDATED=TRUE` y la evidencia de ese
deploy/smoke. C16/C17/etc sólo continúan bajo sus contratos y autorizaciones;
no hacer reconciliation/backfill/scrapers ni habilitar jobs automáticamente
por el resultado público. Hoy el valor operativo se conserva FALSE.

Si FAIL: distinguir límite de créditos, deploy pendiente o regresión nueva
concreta. Reportar evidencia; no push/retry adicional/cambio de código por
continuación automática. No redescubrir la arquitectura cerrada.

## Computrabajo — fecha histórica sin extensión

Recordatorio explícito del usuario: 2026-10-09 inclusive sigue dentro de la
ventana temporal histórica; 2026-10-10 = EXPIRED. No extender por el retraso
del deploy ni modificar código para acomodarlo.

La Biblia conserva también la decisión posterior C09.1:
`RETIRED_REDUNDANT_FIRST_PARTY_POLICY`; la excepción first-party se retiró del
runtime row-driven del baseline. Esta nota guarda las fechas históricas y
no reinstala el veto/excepción, no reabre C10 ni cambia permisos externos.
El código exacto 8281c6a5 sigue siendo la autoridad de implementación.

## Continuar otras áreas desde el baseline

Otro chat/worktree autorizado parte del código exacto 8281c6a5 más este
checkpoint documental. Referencia local del conjunto: tag
`checkpoint/pre-current-site-deploy-20261008`, que apunta al commit documental.
No consultar otros clones para buscar una versión mejor ni resetear el baseline.

Se puede avanzar en otras áreas LOCALES del producto que el usuario autorice,
sin esperar al deploy de mañana. Mantener aislado el candidato que se publicará;
no incorporar nuevos cambios en el SHA objetivo ni disparar otro deploy.
La Biblia C01–C21 define dependencias, scope y evidencia pendiente.

- C16: recovery histórico sigue DEFERRED; usar autoridades existentes,
  bounded/resumable y evidencia factual, sólo después del future wiring/gates
  PROD y autorización separada. No recovery ahora.
- C17: probar perfil real después de matching_ready > 0; no retocar scoring
  para silenciar fallos ni asumir candidatos reales por smoke público.
- C18: GSC/indexing/impressions/clicks/queries exige medición autorizada; no
  iniciar SEO copy/keywords antes de evidencia.
- PD-006: optimización primera página keyset, nonblocking, pospuesta.
- PD-007: alias 301 → 301 por slash normalization, nonblocking, pospuesto.
- PD-001 y demás backlog sólo pasan a ejecución con autorización explícita.
- Los demás Cxx conservan sus evidencias y estados; no declarar todo el sistema
  PROD_VALIDATED desde este smoke del consumidor público.

### DO_NOT_REOPEN list

Routing público, public List → Detail, original request path, Catalog detail
fallback, 404 contract, prerender/hydration parity, metadata singleton,
SEO read path, exhaustive SEO inventory y sitemap/redirect generation.
Sólo reabrir con una regresión NUEVA, concreta y demostrada.

El [final-cable-apply-plan.md](../artifacts/release/final-cable-apply-plan.md)
queda histórico con addendum. No ejecutar sus migrations/reconciliation/pushes
como next step. Master 1–67 y la historia C01–C21 permanecen intactos.
