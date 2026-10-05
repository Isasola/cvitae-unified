# Plan final de aplicación del cableado

STATUS: PREPARED / NOT_EXECUTED / C20_LOCAL_BOUNDED_PASS

Autoridad operativa: `docs/GRAND_CHECKPOINT.md`, C01–C21. Este documento es el
artefacto ejecutable de C09/C20, no otra lista de trabajo. Los casos locales de
cableado y los dos snapshots C20 pasan con budget/cursor/coverage. Schema/runtime
siguen sin aplicar en PROD. **Aplicar solo despues del preflight/gates existentes,
rollback conocido, presupuesto confirmado y autorizacion explicita para el release coherente.**

En esta pasada: ninguna conexión PROD, migration apply, recovery, workflow,
commit, push ni deploy. No repetir pg_stat_statements ni el diagnóstico recibido.
Supabase reportó Disk IO Budget próximo a agotarse. Netlify dispone de unos 7
créditos: no usar un production deploy como prueba. `feature/aws-migration` es
PROD; un push dispara deployment.

## A. Migrations y configuración a aplicar

Aplicar únicamente los archivos pendientes, después del preflight de schema y
backup de funciones que exige el gate existente Item 49/50:

1. `supabase/migrations/202610030001_pipeline_trace_contract_v2.sql`:
   OUTCOME separado de TRACE, ledger consistente. No rewrite ciego de histórico.
   Correccion del unico blocker reportado en preflight PROD 2026-10-05: preservar
   las 72 columnas legacy (incluidos ingestion_reason ordinal17 y
   provenance_certainty ordinal18) y agregar los tres campos nuevos del trace al
   final. PostgreSQL local PASS sin DROP/dependencias recreadas. Migration y
   preflight regenerados. Segundo preflight real confirmado por el usuario:
   blockers=[]; opportunity_pipeline_status=PASS; las cinco migrations
   compatibles con la estructura real conocida. Sin apply ni cambio de orden.
2. `supabase/migrations/202610030002_opportunity_universe_seo_permission.sql`:
   definición completa del reducer SEO (se corrigió el salto de línea que pegaba
   CREATE FUNCTION a un comentario); misma ventana Computrabajo, sin extensión.
3. `supabase/migrations/202610040001_source_switch_wiring.sql`:
   `canonical_opportunity_source_policy` resuelve defaults de Catalog/Matching/
   Alerts sólo para permiso ALLOWED + fuente enabled. Conserva decisiones
   explícitas de `admin_policy_events`. El RPC Admin registra incluso una
   solicitud false→false y el RPC público entrega esa intención. Los switches
   almacenados no se bulk-updatean. Dirty queue gana cursor; deadline maintenance
   gana metadata/index de próxima revisión, sin otro reducer. Las vistas canónicas
   bloquean kills/denials actuales incluso antes de drenar la cola. La vista SEO
   impide extender la excepción Computrabajo por un estado persistido viejo; el
   owner común reconcilia su expiración mediante la misma dirty queue.
4. `supabase/migrations/202610040002_public_catalog_coverage.sql`:
   búsqueda/filtros sobre Catalog canónico antes de LIMIT, 101 lookahead/100
   resultados + cursor; índices de búsqueda factual y área. Requiere pg_trgm en
   `extensions` (la migration lo crea allí si no existe; si ya está instalado en
   otro schema, detener el preflight y resolver esa incompatibilidad localmente).

5. `supabase/migrations/202610050001_bounded_alert_progress.sql`:
   metadata operacional de continuacion del sender: alert_profile_cursor separado
   del cursor Matching, progress/lease privado por perfil, indices de keyset y
   RPC latest enrichment para solo los IDs de la pagina maintenance. Requiere
   tablas existentes de perfiles, delivery ledger, matching scheduler/candidates,
   scraper_runs y enrichment events. No modifica permiso/readiness/scoring ni
   encola filas o envia correos. Se aplica antes de publicar el runtime nuevo.

Las migrations historicas `202610020001_opportunity_pipeline_ledger.sql` y
`202609280001_opportunity_universe.sql` se versionan para instalaciones futuras;
**NO se aplican como nuevas migrations en PROD**. El apply PROD conserva solo
las cinco migrations anteriores; tampoco ejecutar los viejos monolitos SQL.

Prerequisitos: tablas/RPCs/views de Universe, Observation, permissions y Admin
policy events ya existentes en el diagnóstico. No reejecutar ciegamente la
migration base ni el viejo monolito de apply; podría restaurar el worker sin
cursor. No habilitar UNJobs ni WWR ni cambiar permissions por este plan.

Runtime del mismo release: proyección efectiva compartida, policy RPC en
Retrieval/match-batch/Alert sender, endpoint público paginado y browser lists,
common maintenance owner y flag compatible del recovery CLI. Scoring/thresholds
se mantienen. Los dos workflows nuevos siguen **workflow_dispatch únicamente**.
El inspector Admin copia estados/reasons actuales del mismo RPC canónico a su
presentación del ledger; conserva los estados persistidos como evidencia
explícita, no como una segunda decisión efectiva. No recalcula el inventario.

## B. Orden

1. C20 snapshot budget/cursor ya PASS local. Verificar Node 24 CI (C01), repetir gates
   afectados localmente y confirmar suficiente presupuesto antes de autorizar.
2. Registrar migration history compatible, backup de funciones/policy del gate
   Item 49/50 y **ID exacto del último deploy publicado funcional**. No inventar
   ese ID. Sin rollback conocido, no iniciar release.
3. Aplicar las migrations pendientes en el orden A, cada una dentro de la
   transacción/control de migration existente. Las queues son source-level;
   ninguna aplica aquí una reconciliación global del inventario.
4. Reconciliar primero una página de canary con C y comprobar E/G/H. Continuar
   páginas pequeñas, seriales, sólo dentro del presupuesto autorizado.
5. Publicar un único runtime coherente después de la autorización. No cadena de
   deploy/fix/deploy, no cron nuevo. Ejecutar smoke y bounded future canary.
6. Sólo después de canary PROD PASS y nueva autorización explícita se podrá
   habilitar schedule del owner común/Automation Core. La validación local no
   establece `CVITAE_PROD_RELEASE_VALIDATED=true`.

## C. Reconciliar existentes, bounded/resumable

Proceso existente: `scripts/apply_opportunity_universe_prod.ts`, misma RPC
`reconcile_opportunity_universe_page`, mismo reducer para todos los consumers.
Usar **un cursor nuevo para este release**, no el checkpoint completado de una
pasada anterior. Credenciales sólo mediante el mecanismo operativo existente;
no imprimirlas ni incluirlas en este archivo.

Primer canary autorizado (NO ejecutar ahora):

```powershell
pnpm.cmd exec tsx scripts/apply_opportunity_universe_prod.ts --apply --confirm YES --page-size 10 --max-pages 1 --state-file artifacts/release/final-cable-reconciliation-cursor.json
```

Continuación autorizada (misma state-file, máximo 100 filas por invocación):

```powershell
pnpm.cmd exec tsx scripts/apply_opportunity_universe_prod.ts --apply --confirm YES --page-size 100 --max-pages 1 --state-file artifacts/release/final-cable-reconciliation-cursor.json
```

Repetir invocaciones seriales hasta `complete=true`, atendiendo backpressure/IO.
No borrar el cursor ni declarar cobertura por una página. Error de RPC no
avanza checkpoint; repetir página es idempotente. La RPC no recorre inventario
separadamente por consumidor y no lo carga entero en memoria. `p_apply=true`
sólo repara lifecycle con evidencia factual ya existente; no genera Observation
ni transforma los 9.075 UNKNOWN en ready/dead por ausencia de evidencia.

Para dirty set operacional, el owner común usa páginas de 250 por source, cursor
durable, máximo 1 source × 10 batches; expone pendientes/resumable. Reconciliación
de policy no restaura lifecycle por sí sola.

Después de autorización, ejecutar el owner existente en serie hasta
`pending_dirty_sources=0`, antes de expandir Retrieval:

```powershell
pnpm.cmd exec tsx scripts/refresh_opportunity_universe_maintenance.ts
```

Cada invocación limita due rows a 500 y dirty rows a 10 páginas de 250; no hay
otro refresh de dirty sources oculto dentro de la RPC due. El cursor de fuentes
permanece en DB. Un retorno `resumable=true` exige continuar, no declarar cola
completa ni correr workers competidores.

## D. Responsable de futuras filas

Producer/adapter/cleaner → OpportunitySink upsert → ingestion receipt → factual
Observation cuando existe evidencia suficiente → Factory → Automation Core
permitida → Universe → consumidores → Admin, usando las autoridades existentes.

`opportunities_refresh_universe` procesa la opportunity exacta después de insert
o cambio factual. `opportunity_observation_refresh_universe` puede reparar esa
fila con nueva evidencia factual. Se aplica la misma policy efectiva que al
histórico. Una fila ya verificada y factual ready no necesita un operador que
encienda un default stale. Falta de evidencia/permiso conserva reason UNKNOWN.

Factory/bridge existentes siguen certificación explícita. El worker
`run_scheduled_source_automation.py` es el owner preparado, con receipts,
UNCHANGED skip y batches; su workflow nuevo no tiene cron habilitado. Lifecycle
y dirty policy pertenecen al **common Universe owner**, no a Matching. El
deadline index se llena al reconciliar existentes y en cada write futuro.

La recuperación factual histórica posterior sigue separada (C16). Cuando se
autorice, el runner existente toma 100 IDs/página y llama maintenance por exact
ID; mantiene cursor, no marca completa una página sin procesar evidencia
autorizada y no usa ausencia de página como prueba DEAD.

C20 no depende de habilitar cron nuevo: el sender conserva su schedule actual,
con claim de un perfil por cursor, max 5 paginas de 100, 20 intentos email y 20s.
`match_alert_scan_progress` persiste pagina + pending descriptors antes de efectos;
lease 60s, delivery claim y provider idempotency conservan deduplicacion. Cada
invocacion rota de perfil; ninguna poblacion queda limitada a los primeros 250.
Watermark DELTA evita revisitar ventanas completas ya procesadas; backlog conserva
su cutoff hasta terminar. Probar continuation y ledger sent con emails de canary
consentidos solo si esa ejecucion esta expresamente autorizada.

Maintenance normal toma solo una pagina de hasta 250 +1 lookahead, immutable id
cursor; completados y API cursor viven en `scraper_runs.extraction_metrics` por
source/lane (exact-ID separado). Serializar runs de la misma source/lane, conservar
el mismo --max-items al reanudar una pagina parcial. Repetir el CLI autorizado con
el mismo budget hasta complete=true. Dry-run puede reanudar con --continuation-file
(JSON maintenance_progress anterior). Un fallo de checkpoint devuelve payload
para retry_maintenance_telemetry; reintentar solo telemetry antes de seguir. No
repetir efectos para reparar telemetry ni saltar una pagina pendiente.

Himalayas maintenance pasa exclusivamente DB page actual al helper, max_pages=1
(API 100); guarda API cursor mientras busca identidad factual para esa pagina.
Feed completo sin identidad significa observation MISSING, nunca DEAD/READY.
AUTO/certificacion permanecen intactos: este plan no autoriza activar Himalayas
maintenance ni recovery historico C16.

## E. Smoke y bounded future canary

Local ya ejecutado: PostgreSQL reducers/triggers/views + handler real, permisos
UNKNOWN/DENIED/kill, cursor histórico y dirty set, deadline due index, recovery
251/3 páginas, Catalog posterior a 1.000, sitemap, SEO/JobPosting, Admin y B2C.
Registro C09: `artifacts/release/cable-local-sql-evidence.json` (sin reaudit).
C20 2026-10-05: verify_c20_alert_pages.ts, verify_c20_alert_sql.mjs,
verify_c20_maintenance_pages.py y verifiers afectados PASS: 7 filas/4+ paginas,
251 perfiles, actual handler/SQL/maintenance, retries/consent/dedup y memoria
por batch. Compilacion local de TypeScript modificados PASS; no build completo.
Preflight 2026-10-05: Node 24.21.0 local + pnpm 11.8.0 frozen/offline PASS;
build completo con fixture SEO local PASS, sin consultar inventario PROD.
Verifiers criticos y gates automaticos PASS; compilacion RC documentada en
`rc-node24-compile.json`. CI/Netlify reales siguen pendientes.

Para repetir PostgreSQL local (instalación aislada dentro del worktree, sin
modificar package/lock):

```powershell
npm.cmd install --prefix .cvitae-state/cable-sql-test --cache .cvitae-state/npm-cache --no-save --package-lock=false @electric-sql/pglite@0.5.8
pnpm.cmd exec tsx scripts/verify_cable_wiring_sql.mjs
python scripts/verify_observation_coverage_recovery.py
```

Después del release autorizado, smoke público debe recibir contenido real:
lista de empleos, búsqueda de título factual, siguiente página/cursor, detalle
con CTA, retorno de aplicación, estados mobile/loading/error; Dashboard y
consumers secundarios usando IDs de Catalog/Matching canónicos; Admin global
con totals exactos y payload <1MB (hard FAIL >=2MB); row inspector con estados y
reasons. HTTP 200 con array vacío no es PASS.

Canary futuro autorizado: usar el producer existente, máximo 1 item, run/ID
reales. No inventar una opportunity ni una observation:

```powershell
$env:CVITAE_MAX_ITEMS = '1'
python scripts/run_scraper_monitored.py himalayas_scraper himalayas_scraper scrapers/himalayas_scraper.py
```

Registrar run_id/outcome/trace/ID exactos y evidence del adapter, Observation,
Factory/seal y decisiones de Automation si esa fuente está certificada y
permitida. Si se necesita completar el bridge autorizado, usar:

```powershell
python scripts/run_source_scan_automation_bridge.py --run-id RUN_ID_REAL --scraper-id himalayas_scraper --max-opportunities 1
```

`UNCHANGED` correctamente trazado no demuestra NEW DATA. Si el item ya existía,
el canary futuro queda pendiente; no fabricar datos para lograr INSERTED.
Technical persistence/lineage failure debe fallar, nunca partial_success verde.

## F. Verificar Catalog >0, Matching >0, Alerts >0, SEO >0

Después de completar reconciliación, una única lectura de aceptación autorizada:

```sql
select jsonb_build_object(
  'catalog_ready',(select count(*) from public.opportunity_catalog_universe),
  'matching_ready',(select count(*) from public.opportunity_final_matching_universe),
  'alerts_ready',(select count(*) from public.opportunity_alert_universe),
  'seo_ready',(select count(*) from public.opportunity_seo_universe)
);
```

Los cuatro deben ser >0 y coincidir con explicación Admin. Además, Catalog
devuelve filas al usuario y Matching contiene candidatos reales. Para poblar
Retrieval del perfil real, sólo después de autorización y matching_ready>0:

```powershell
pnpm.cmd exec tsx scripts/run_matching_retrieval_expansion.ts --user USER_ID_REAL --max-users 1 --page-size 100 --max-pages 1
```

Reanudar el estado durable hasta completar candidates. Luego ejecutar el perfil
real end-to-end (C17); no cambiar scoring para esconder cero candidatos.

## G. Verificar una Himalayas real

Tomar el ID exacto del canary/histórico reconciliado, `get_opportunity_universe_row`
y las vistas canónicas. Esperado: fuente enabled, permisos ALLOWED, sin override
manual, Catalog READY, Matching/Alerts READY si professional gates pasan, SEO
READY si intrinsic gates pasan. Abrir su página pública y confirmar attribution
visible + link Himalayas original. JobPosting/Google Jobs/third-party DENIED;
la página se indexa normalmente como WebPage, sin syndication.

## H. UNKNOWN, DENIED y kill siguen fuera

Comparar un ID UNJobs y WWR ya existentes mediante row inspector y exact lookup
en las vistas; no deben pasar por switches true. Lifecycle UNKNOWN permanece
pendiente hasta evidencia factual suficiente. Un override explícito del audit
debe explicar denial aunque fila READY y permiso ALLOWED; no apagar una fuente
real sólo para crear la prueba. Usar el audit real existente y pruebas locales.

Computrabajo: sólo qualifying legacy SEO rows, exactamente hasta 2026-10-09 UTC
inclusive; 2026-10-10 EXPIRED, normal deny. Nunca Catalog/Matching/Alerts ni otra
fuente por esa excepción.

## I. Rollback exacto

Guardar antes del release el ID real del deploy publicado anterior y el backup
de funciones/policy exigido por Item 49/50. Sin esos datos no hay release
autorizable. No inventar un commit/deploy ni ejecutar rollback aquí.

Rollback de la sincronización de defaults, atómico, sin tocar oportunidades ni
permisos: reemplazar únicamente la función canónica por la lectura de switches
almacenados; mantener metadata/queues/índices aditivos y la paginación segura.

```sql
begin;
create or replace function public.canonical_opportunity_source_policy(p_raw_source text)
returns jsonb language sql stable security definer set search_path=public as $$
  with stored as (select public.stored_opportunity_source_policy(p_raw_source) p)
  select p || jsonb_build_object(
    'consumer_permission_states',(select jsonb_object_agg(consumer,permission_state)
      from public.opportunity_source_consumer_permissions where canonical_source=p->>'canonical_source'),
    'consumer_switch_overrides',jsonb_build_object(
      'catalog',p->'catalog_enabled','matching',p->'matching_enabled','alerts',p->'alerts_enabled'),
    'switch_authority','ROLLBACK_STORED_SWITCHES') from stored;
$$;
insert into public.opportunity_universe_dirty_sources(canonical_source,reason,cursor_id)
select distinct canonical_source,'ROLLBACK_STORED_SWITCHES',null
from public.opportunity_source_consumer_permissions
where consumer in ('catalog','matching','alerts') and permission_state='ALLOWED'
on conflict(canonical_source) do update set reason=excluded.reason,queued_at=clock_timestamp(),cursor_id=null;
commit;
```

Las vistas efectivas rechazan inmediatamente switches almacenados false; el RPC
proyecta esos valores como overrides y TS los respeta. No se revocan permisos ni
se borran rows, receipts o evidence. Source-policy original queda intacta salvo
cambios explícitos de operador auditados. Sólo con autorización: restaurar el
deploy publicado anterior por su ID registrado, sin push de debug; suspender
workers del release y conservar todos los checkpoints. Verificar exact-row,
denials y SEO/JobPosting. Para reconciliar estados explicativos tras rollback,
usar C con un state-file nuevo `final-cable-rollback-cursor.json`, bajo budget
autorizado. No restaurar el viejo RPC que refrescaba fuentes enteras sin cursor.

Rollback C20: suspender invocaciones del sender/maintenance y restaurar el runtime
publicado por su ID registrado en el mismo rollback del release. Conservar tablas,
indices, alert_profile_cursor, progress checkpoints y delivery ledger; no DROP ni
reset del cursor de Matching. No reactivar el sender viejo sin budget: dejarlo
suspendido hasta un runtime bounded autorizado. Cuando se retome el runtime nuevo,
leases vencen en 60s y el ledger impide duplicar sent. Maintenance reanuda su
source/lane/page desde telemetry; fallos telemetry se reparan con retry-only.

## FINAL PREFLIGHT REQUIREMENTS

Esta seccion actualiza los requisitos de A-I; no cambia su orden ni autoriza
ejecucion. C09 y C20 siguen localmente probados, pendientes de aplicacion y
validacion PROD respectivamente. No repetir sus fixtures para rediagnosticar.

- **Preflight previo completado:** el usuario confirma que la segunda ejecucion
  real de `final-release-preflight-readonly.sql` devolvio blockers=[] y
  opportunity_pipeline_status=PASS; las cinco migrations son compatibles con
  la estructura real conocida. Conservar el resultado; NO repetir durante
  este freeze. El agente no consulto PROD y esto no autoriza apply/deploy. Lee
  catalogos y exclusivamente las cinco entradas del historial de migrations
  cuando son legibles. No cuenta ni consulta opportunities/Universe/candidates,
  no ejecuta RPCs ni pg_stat_statements. NOT_AVAILABLE bloquea; history ausente
  o NOT_RECORDED no prueba que un SQL no se haya aplicado manualmente. Revisar
  firmas, fingerprints, prefijos/tipos de views, permisos, indices y pg_depend.
- **Migrations exactas, en el orden de A:**
  `202610030001_pipeline_trace_contract_v2.sql`;
  `202610030002_opportunity_universe_seo_permission.sql`;
  `202610040001_source_switch_wiring.sql`;
  `202610040002_public_catalog_coverage.sql`;
  `202610050001_bounded_alert_progress.sql`.
  Solo las pendientes confirmadas por historial + metadata. Una transaccion
  por archivo mediante el mecanismo existente, con rollback automatico del
  archivo si falla. Ningun archivo contiene BEGIN/COMMIT propio.
- **Incompatibilidades de target:** pg_trgm debe estar en `extensions`, con
  `gin_trgm_ops`. Instalada en otro schema es BLOCKER; IF NOT EXISTS no la mueve.
  CREATE OR REPLACE no puede cambiar el prefijo/los tipos de una view ni los
  argumentos/OUT/return de una funcion. El DROP exacto de
  `get_source_distribution_policy()` debe carecer de dependientes normales;
  no usar CASCADE para sortearlo. Privilegios/ownership deben ser compatibles.
- **Costo al aplicar:** 030001 usa CHECK NOT VALID, sin validar historico ni
  rewrite; 030002 encola fuentes (no filas del inventario). 040001 crea tres
  indices de inventory/Universe y uno de audit; 040002 crea GIN de busqueda y
  btree de area; 050001 crea indices sobre profiles, scraper_runs, candidates y
  opportunities. Si faltan, son builds sincronicos con scan/sort y locks, no
  trabajo paginado: confirmar IO budget y ventana antes de aplicar. No ejecutar
  ningun build ahora ni afirmar que el bajo tamano DB garantiza presupuesto.
- **Gates antes de canary:** confirmar/resetear, solo bajo autorizacion futura,
  `CVITAE_PROD_RELEASE_VALIDATED=false` en variables de GitHub y environment
  del site Netlify elegido antes de publicar. No se consultaron sus valores.
  Siete cron jobs, completion trigger de embeddings y Alert sender usan ese
  gate existente; gate ausente tambien bloquea. Cron GitHub pertenece a la
  default branch: no inferir activacion por un deploy Netlify. Dispatch manual
  de los workflows existentes queda disponible para canary expresamente
  autorizado; los dos owners nuevos exigen ademas confirmacion YES y gate true.
  No activar sus cron. Source/Observation triggers de DB siguen reaccionando
  a la fila/fuente escrita; no arrancan trabajo por un deployment.
  El gate del RC no suspende codigo viejo ya publicado que todavia no lo lee:
  confirmar suspension de workers previos/en vuelo durante apply/canary por el
  mecanismo operativo autorizado de la cuenta elegida. No presumir que cambiar
  una variable frena una version antigua ni cambiar el orden B para resolverlo.
- **Que NO ejecutar:** no diagnostico previo/performance/pg_stat_statements,
  full scans de acceptance antes del canary, viejo monolito de apply,
  recovery historico C16, Factory/Automation globales, scraper/workflow
  programado ni deploy de debug. No cambiar permisos UNKNOWN/DENIED,
  scoring, source switches manuales ni SEO contracts.
- **Canary y continuacion:** C conserva el comando de 10 filas/1 pagina con
  state-file nuevo y luego 100 filas/1 pagina por invocacion, en serie con el
  mismo cursor, sin reiniciar ni duplicar trabajo. No ejecutar ahora.
- **Acceptance posterior:** F exige Catalog > 0, Matching > 0, Alerts > 0,
  SEO > 0 y contenido real, no solo HTTP 200. G valida una Himalayas exacta;
  H preserva UNKNOWN/DENIED/manual-kill y Computrabajo temporal. E conserva
  el canary futuro del scraper real, 1 item con run/identity/lineage/Observation
  factuales; UNCHANGED no prueba NEW DATA. Alert delivery solo con consentimiento
  y autorizacion especifica; gate automatico true solo despues de smoke/canary
  PASS y autorizacion explicita. Los owners comunes siguen manual-only.
- **Rollback:** I conserva SQL de switches almacenados, runtime anterior por
  ID real y estado de reconciliacion con nuevo rollback cursor. Mantener schema,
  indices, ledger y checkpoints aditivos; no DROP/reset ni worker viejo sin
  budget. Antes de apply obtener backups de funciones/views/policy y el deploy
  ID real de la cuenta elegida; no inventarlo. Suspender automatismos manteniendo
  gate false. ROLLBACK_CODE_READY=YES; ROLLBACK_DEPLOY_ID_REQUIRED=YES.
- **Netlify repo:** production branch `feature/aws-migration` (push=deploy),
  build `pnpm build`, publish `dist`, functions `netlify/functions`, Node 24,
  pnpm 11.8.0, esbuild. Conservar redirects de sitemaps functions, detail 404,
  auth callback y SPA fallback. PD-005 permanece BACKLOG; cuentas/DNS/variables
  y quota no se consultaron ni cambiaron.

Inventario exacto, triggers/cadencias/budgets y revision estatica de las cinco
migrations: `rc-preflight-inventory.json`. Evidencia local no equivale a
compatibilidad real del target ni autorizacion para migrar/publicar.
