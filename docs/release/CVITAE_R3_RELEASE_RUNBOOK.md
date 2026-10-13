# CVitae R3 — runbook de publicación controlada

Estado de este documento: preparación local únicamente. No aplicar migraciones, desplegar, publicar, lanzar workers/scrapers ni modificar variables desde esta sesión.

## Artefacto y alcance

- Checkout preparado: branch `work/beta-hardening-postdeploy-20261011`, HEAD de entrada `94009ff517e93dc5e46328d355b1fe8f84906759`.
- Base local de referencia disponible: `ce6dc7aba3dec35c6785fb7100d6125cd0962dab` (ref local/cacheada). En el HEAD de entrada eran 15 commits desde esa referencia; este paquete de preparación añade un commit local. No se consultó el remoto; por tanto esto identifica el diferencial local frente a la referencia cacheada, no prueba por sí solo el estado actual de producción.
- Snapshot productivo comunicado por el operador, 2026-10-13 (no reconsultado en esta sesión): PostgreSQL 17.6, `public.vector(384)`, 16.541 oportunidades, 6.225 `match_eligible=true`, 4.612 elegibles con embedding, 204 matching final, 205 catálogo, 204 alertas, 6.022 SEO; 105/107 fuentes dirty; cinco migraciones no registradas y objetos R3 ausentes; cero duplicados que impidan 120001. Himalayas: 13.204 inventario / 5.441 match-eligible / 203 final; Jobicy 21/21/0; Remotive 8/7/0; WeWorkRemotely 631/472/0; Computrabajo 188/86/0. Son mediciones históricas, no objetivos. La autoridad efectiva comunicada para Himalayas, Jobicy y Remotive tiene matching habilitado aunque los switches almacenados pueden diferir.
- Dimensiones del Registry verificadas para este checkout: 107 perfiles; 98 productores ejecutables declarados (9 perfiles sin productor); 81 pasos directos de workflow y 87 perfiles asociados a esos entrypoints. No sumar estas dimensiones ni tratar perfil/productor/paso como sinónimos. La cobertura del Admin debe seguir incluyendo los 107.
- Componentes R3: cinco migraciones en §2; Edge Function modificada `supabase/functions/match-batch`; Netlify Functions modificadas `admin-data`, `admin-analytics`, `b2c-profile`, `cv-ats-workspace`, `cv-rewrite-workspace`, `public-opportunities`, `send-high-match-alerts` y librerías compartidas de Admin/SEO/métricas; workers `scripts/run_matching_retrieval_expansion.ts` y `scripts/refresh_opportunity_universe_maintenance.ts`. Los workflows modificados en el diferencial local son `opportunity-universe-maintenance.yml` y `scrapers.yml`; `matching-retrieval.yml` no cambió, pero su schedule/dispatch es una dependencia operativa. También cambiaron Registry V2, sink/calidad y adaptadores de fuentes. No se crea un scheduler nuevo.
- Dependencias de ejecución: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` en secretos de Supabase/GitHub según consumidor; Netlify build necesita el contexto Supabase que usa `scripts/generate-seo-inventory.ts`; la automatización programada usa el GitHub repository variable `CVITAE_PROD_RELEASE_VALIDATED`. El worker retrieval toma URL/service role del entorno. No poner valores de secretos en este documento ni en logs.
- Reglas de gate: el schedule del mantenimiento del Universo solo corre si `CVITAE_PROD_RELEASE_VALIDATED == 'true'`; su dispatch manual requiere confirmación `YES` y también la variable. El workflow de matching permite dispatch manual sin esa variable. El workflow de scrapers también permite dispatch manual sin esa variable. No lanzar esos dispatches antes de la aprobación específica; no seleccionar `all`.

## Secuencia de migraciones

Aplicar en orden y solo si el historial/preflight confirman que son las únicas pendientes:

1. `202610120001_remove_legacy_generated_cvs_uniqueness.sql`: `generated_cvs` debe tener la constraint llamada `generated_cvs_user_vacancy` con definición exacta `UNIQUE(user_id, vacancy_id)` o la migración aborta. Debe haber cero duplicados por `(user_id, vacancy_id, version_number)` antes de crear el índice reemplazo. El drop no tiene rollback SQL seguro; conservar respaldo y preferir recuperación hacia adelante.
2. `202610120002_consumer_scoped_semantic_retrieval.sql`: requiere `public.vector(384)`, `opportunities.embedding` compatible, `opportunity_final_matching_universe`, `opportunity_alert_universe`, operador `<=>` y rol/privilegios correctos. Firma efectiva `public.match_consumer_opportunities(public.vector,double precision,integer,text) RETURNS TABLE(id text, similarity double precision)`; EXECUTE solo para `service_role`.
3. `202610120003_public_catalog_exact_count.sql`: requiere `opportunity_catalog_universe`, `catalog_search_text(text,text,text,text,text,text)` y las columnas de búsqueda/categorización de `opportunities`. Firma `public.count_public_opportunities(text,text,text[],text) RETURNS bigint`; EXECUTE solo para `service_role`.
4. `202610130001_matching_routing_epoch.sql`: requiere singleton y tablas existentes de retrieval, `opportunity_universe_state`, `auth.role()` y el contrato service-role. Añade epoch y finalizer transaccional.
5. `202610130002_matching_routing_changes.sql`: depende de la 4 y de su trigger/function ya existente. Reemplaza esa función, no agrega otro trigger; añade ledger, baseline y columnas/cursor DELTA.

Las cinco migraciones son aditivas salvo el drop de la constraint legacy de la primera. No existe una secuencia de down migrations aprobada. Una reversión de aplicación no deshace SQL ni debe marcar migraciones `reverted` para ocultar objetos aplicados. Ante fallo: detener; conservar error, versión, estado de transacción y salida del CLI; determinar si la transacción revirtió; si algún DDL quedó aplicado, restaurar desde snapshot solo con autorización o preparar una migración correctiva hacia adelante. No borrar/recrear ledger ni candidatos.

## FASE 0 — Evidencia y preflight READ ONLY

**Prerrequisitos:** acceso de lectura al proyecto Supabase aprobado; identificar el project ref y el branch/deploy target sin inferirlo del checkout. Nadie debe ejecutar aún un worker.

PowerShell local:

```powershell
git rev-parse HEAD
git branch --show-current
git status --short
git log --oneline ce6dc7aba3dec35c6785fb7100d6125cd0962dab..HEAD
supabase migration list --linked
supabase db push --linked --dry-run
```

El snapshot productivo fechado 2026-10-13 ya está documentado arriba y no se debe volver a investigar desde cero. Para la ventana real de publicación, ejecutar `CVITAE_R3_PREFLIGHT_READONLY.sql` una vez como comprobación de no-deriva del proyecto/branch confirmado; conservar JSON y timestamp. El SQL mide el estado de esa ventana, no presupone que sigan vigentes 16.541, 6.225, 4.612 o 5.266 filas históricas.

**Esperado:** cinco versiones enumeradas; base vector exacta `public.vector(384)`; firmas/ACLs; totales actuales; universos separados; stored/effective/permissions separados; dirty cursors; ledger/revisions si existen. El preflight comunicado marcó las cinco como no registradas y sus objetos ausentes, pero no sustituye la comprobación de versión inmediatamente anterior al DDL. `NOT_RECORDED_NOT_PROOF_OF_UNAPPLIED` y `HISTORY_NOT_READABLE` son NO-GO, no permiso para aplicar.

**GO:** historial leíble y coherente con el dry-run; el dry-run lista exactamente las cinco versiones en orden. Si lista otra versión, falta una versión, o la history no es accesible: NO-GO y escalar a ChatGPT/DBA.

**Detener sin alterar estado:** no ejecutar `db push`, `migration repair`, RPCs, reconciliación ni workers. `db push --dry-run` es solo preview; `db push` aplica todas las migraciones locales pendientes, por lo que nunca usarlo si el preview no coincide exactamente. La CLI documenta este comportamiento y flags en [Supabase migration repair / db push](https://supabase.com/docs/reference/cli/supabase-migration-repair).

## FASE 1 — Respaldo, recuperación y compatibilidad

**Prerrequisitos:** Fase 0 GO; operador identifica proyecto y ventana; respaldo de base/PITR y responsable de recuperación confirmados.

**Acciones autorizadas al operador:** comprobar restaurabilidad/retención de backup en el panel Supabase; conservar los resultados de preflight y `supabase migration list --linked`; capturar `pg_get_constraintdef` y el conteo de duplicados de la migración 120001.

**Resultado esperado:** hay punto de recuperación previo, definición legacy exacta o ya ausente con explicación, duplicados de version `0`, vector/formato de embedding exactos, dependencias de RPC/views/roles disponibles.

**NO-GO:** discrepancia de definición; duplicados; `vector` fuera de `public`; dimensión distinta de 384; RPC overload inesperado; roles/grants insuficientes; ledger parcial; aliases/policies ambiguos. No modificar el esquema para hacer pasar el preflight.

**Recuperación:** antes de DDL, detenerse. Tras DDL, no ejecutar el código antiguo a ciegas ni intentar down migration; acordar reparación forward o restore autorizado según evidencia.

## FASE 2 — Aplicar las cinco migraciones

**Prerrequisitos:** Fase 1 GO y aprobación explícita del operador para escribir en el proyecto exacto.

PowerShell, solo después de confirmar que el project ref linkeado es el autorizado:

```powershell
supabase migration list --linked
supabase db push --linked --dry-run
# GO únicamente si el preview enumera SOLO 202610120001–202610130002, en ese orden:
supabase db push --linked
supabase migration list --linked
```

`db push` no recibe una lista de versiones; aplica todas las migraciones locales pendientes. No usar `--include-all`, `migration repair`, SQL Editor para aplicar manualmente, ni marcar versiones como aplicadas sin ejecutar sus DDL. Si el preview incluye algo más que las cinco versiones, parar.

**Esperado:** cada versión queda registrada como aplicada; verificación SQL `CVITAE_R3_POSTDEPLOY_VERIFY_READONLY.sql` muestra firmas, funciones y objetos; ledger usa el trigger existente una sola vez; servicio puede ejecutar las RPC; anon/authenticated no pueden leer el ledger.

**Evidencia:** salida completa del dry-run, push, lista posterior y JSON postdeploy. **NO-GO** ante primer error, timeout ambiguo, historial parcial, lock inesperado o cualquier objeto de tipo/firma distinto.

## FASE 3 — Publicar Edge Function y workers compatibles

**Prerrequisitos:** Fase 2 verificada; código completo de este release disponible en el source branch aprobado; secretos del servicio presentes sin imprimirlos; aprobación explícita de publicación.

Supabase CLI, con `ProjectRef` obtenido del panel autorizado:

```powershell
$ProjectRef = Read-Host 'Project ref Supabase aprobado'
supabase functions deploy match-batch --project-ref $ProjectRef
```

Los workers TypeScript son scripts del repositorio, no Edge Functions adicionales. Se publican con el commit release en el repositorio/workflow existente. Primero mantener schedules cerrados. No lanzar retrieval ni Universe maintenance todavía.

**Esperado:** Edge Function deployada en el proyecto correcto y versión de source commit registrada; build de workers instalado con lockfile, sin ejecución de scripts. **NO-GO:** project ref no coincide, secretos faltan, migraciones no están aplicadas o deploy reporta error.

**Detención:** no activar release variable, no disparar `workflow_dispatch`, no correr `pnpm exec tsx scripts/run_matching_retrieval_expansion.ts` ni `refresh_opportunity_universe_maintenance.ts`.

## FASE 4 — Netlify y Admin

**Prerrequisitos:** Supabase fase 2/3 completa; proveedor identifica site, branch de producción, build context y variables requeridas; SEO inventory real está disponible sin bypass.

Comprobaciones locales en PowerShell, desde checkout linkeado y con contexto aprobado:

```powershell
netlify status
netlify functions:build --src netlify/functions --functions .tmp-r3-admin-functions-build-final
# Build general del sitio, solo en el contexto autorizado y con la policy SEO real:
netlify build --context production
# SOLO tras GO y autorización expresa para el site/branch confirmados:
netlify deploy --prod
```

No usar `SEO_INVENTORY_ALLOW_EMPTY=true` ni sustituir el inventario por fixture para producción. **Bundle focalizado local verificado:** `admin-data.zip` se inspeccionó y el módulo extraído se ejecutó desde el ZIP; resolvió 81 invocaciones directas, 87 perfiles asociados y 107 perfiles del Registry, y `diagnose_source` resolvió Himalayas con runner exclusivo. El ZIP ya no depende de leer workflows dinámicos en runtime: `workflow_routes` se deriva de los tres workflows reales mediante `scripts/export_source_intelligence_snapshot.py`, lleva hash y queda embebido por import estático desde el Registry generado. El bundle no necesita incluir esos YAML para resolver las rutas; los cambios de workflow requieren regenerar y verificar el snapshot.

**Esperado:** `netlify build --context production` completa el generador SEO desde policy real; el ZIP de `admin-data` incluye lógica y snapshot embebido; la prueba de staging invoca `workflowRoutes` y devuelve diagnóstico; 107 perfiles siguen visibles; no hay datos de otro consumidor. La prueba local del ZIP pasó; el build de sitio/proveedor y su artefacto de publicación siguen sujetos a los contextos reales.

**Bloqueo actual:** el build general local queda bloqueado por `seo_inventory_policy_unavailable` cuando no están disponibles `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` para `generate-seo-inventory.ts`. Es gate de contexto/configuración, no un defecto reproducible de `admin-data`. No crear ni inventar variables. Si el proveedor no tiene el contexto válido, NO-GO. La prueba local de Function no equivale a publicar el sitio.

**Publicación:** el repo no fija en este runbook un target remoto/link Netlify verificado. El owner debe confirmar el site y branch correctos antes de integrar el commit; no se ejecutó aquí `netlify deploy`. Si Netlify Git integration dispara build automáticamente, eso cuenta como deploy y requiere autorización expresa antes de hacer push/merge.

## FASE 5 — Reconciliación durable del Universo

**Prerrequisitos:** fases 2–4 verificadas; variable de release permanece sin modificar; worker leído/validado; operador aprueba primer lote.

1. Ejecutar y guardar `CVITAE_R3_POSTDEPLOY_VERIFY_READONLY.sql` antes del worker.
2. Revisar dirty queue, cursor, oldest queued, estado de routing epoch/ledger y discrepancias por `canonical_source`/alias.
3. Ejecutar solo el worker existente en modo acotado. La pasada local/manual lee `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` del entorno, consume como máximo 10 lotes de una fuente por invocación y conserva el cursor SQL durable:

   ```powershell
   $env:SUPABASE_URL = Read-Host 'URL del proyecto Supabase aprobado'
   $secureKey = Read-Host 'Service-role key' -AsSecureString
   $keyPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
   try {
     $env:SUPABASE_SERVICE_ROLE_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($keyPtr)
     pnpm exec tsx scripts/refresh_opportunity_universe_maintenance.ts
   } finally {
     Remove-Item Env:SUPABASE_URL,Env:SUPABASE_SERVICE_ROLE_KEY -ErrorAction SilentlyContinue
     [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($keyPtr)
     $secureKey.Dispose()
   }
   ```

   Si se usa GitHub Actions, el schedule exige `CVITAE_PROD_RELEASE_VALIDATED == 'true'`; el dispatch manual conserva su confirmación expresa y variable. Solo tras autorización expresa: `gh workflow run opportunity-universe-maintenance.yml --ref <release-branch> -f confirm_prod_release_validated=YES`. Observar la salida JSON `COMPLETE`, `RESUMABLE` o `ERROR`.
4. Si `RESUMABLE`, guardar `sources_processed`, `opportunities_recalculated`, `batches_processed`, `pending_sources`, `continuation_required` y `dirty_cursor` del JSON. Repetir la misma pasada únicamente cuando el cursor o los contadores demuestren progreso; el límite de 10 es por ejecución, no por el histórico completo. `ERROR`, RPC malformada o dos invocaciones sin avance con cola pendiente pausa la fase.
5. Verificar `pending_sources=0` y ausencia de filas dirty mediante el postdeploy SQL antes de iniciar retrieval. Repetir por lotes hasta cola vacía verificada; no borrar dirty rows/cursores ni ejecutar cleanup/scrapers como side effect.

**Esperado:** por cada fuente registrada, identidad resuelta o marcada unknown; cursor avanza; el reducer y ledger conservan transiciones; no actualizar estados READY directamente. Cola vacía solo si RPC informa cero y consulta posterior lo confirma.

**Evidencia:** cursor/epoch antes y después, conteos recalculados, ledger gap `false`, fuentes procesadas, errores por fuente, sin comparar un total antiguo como objetivo.

## FASE 6 — Matching privado con candidato autorizado

**Prerrequisitos:** Fase 5 finalizó para las identidades objetivo; candidate test user autorizado; privacidad aprobada; nada de correos/alertas históricas.

1. Guardar snapshot del candidato/firmas y del estado de retrieval; no copiar CV ni datos sensibles a logs.
2. Ejecutar el worker bounded existente solo para un usuario de prueba autorizado (`--user <UUID>`), `--max-users 1 --page-size 250 --max-pages 4`; reutilizar el bloque de PowerShell seguro de la Fase 5 y sustituir su comando por:

   ```powershell
   pnpm exec tsx scripts/run_matching_retrieval_expansion.ts --user <UUID_AUTORIZADO> --max-users 1 --page-size 250 --max-pages 4
   ```

   Registrar FULL inicial o DELTA, cursores, revisión objetivo/completada y si queda trabajo pendiente. El workflow de matching permite dispatch manual incluso con el release gate apagado, así que no usarlo antes de autorización. Tras aprobación: `gh workflow run matching-retrieval.yml --ref <release-branch> -f max_users=1 -f page_size=250 -f max_pages=4`.
3. Comprobar IDs de oportunidades antes/después; nueva READY entra solo si ranking V2/eligibilidad la permite; READY→NOT_READY se retira; identidad y content fingerprint permanecen íntegros.
4. Leer resultado a través del flujo autenticado privado de `match-batch` con ese usuario; otro usuario obtiene únicamente sus propias recomendaciones. No inspeccionar/retornar resultados ajenos.
5. Interrumpir únicamente si el proceso sigue guardando estado durable; reanudar con cursor. No marcar COMPLETE si hay páginas/eventos pendientes.

**GO:** respuesta privada coincide con candidates persistidos, `completed_routing_epoch` cubre target, firma coincide, ranking/rationale conservados y aislamiento demostrado. **NO-GO:** candidate cache stale sin live fallback, exclusión ausente, IDs perdidos/duplicados o mezcla de user_id.

## FASE 7 — Cuatro universos independientes

**Prerrequisitos:** matching fase 6 aprobada; usuario autoriza consultas de conteo y canarios no mutantes.

- Matching: universo `opportunity_final_matching_universe`, per-user ranking, nueva entrada/retiro y ranking reason.
- Catálogo: `opportunity_catalog_universe`, conteo exacto filtrado mediante `count_public_opportunities`; navegación/paginación/categoría y canonical correcto.
- Alertas: `opportunity_alert_universe`, preferencias, deduplicación y ledger de envíos actuales. Reconciliación interna no es evento nuevo. No enviar backfill histórico; no ejecutar función de envío durante esta fase sin consentimiento explícito.
- SEO/indexación: `opportunity_seo_universe`, SEO row readiness, policy/permission, sitemap/prerender parity, canonical, metadata y schema de páginas concretas. No cambiar permisos; no alterar Himalayas. Google Jobs y sindicación no se infieren del SEO first-party.

Conservar cuatro resultados separados; ningún cambio en SEO/catálogo/alertas habilita matching ni viceversa. Guardar IDs y razones; los conteos globales por sí solos no cierran recorrido.

## FASE 8 — Admin, fuentes y observabilidad

**Prerrequisitos:** funciones publicadas; administrador autorizado; sin lanzar productor.

En la UI Admin comprobar 107 perfiles; comparar fuente conocida (por ejemplo Jobicy con discrepancia stored/effective/dirty) y fuente sin runner; comprobar exclusividad del run, error SQL sanitizado, cola/cursor/edad, y que permisos consultivos no se presentan como switches. Confirmar las rutas incluidas en el bundle final y que `diagnose_source` devuelve causas sin fallback global de `scraper_runs`.

Para un canario de productor, seleccionar exactamente una fuente previamente aprobada, usar el workflow y source ID explícitos, y conservar `scraper_runs`/receipt/`opportunity_sink` resultados. Solo tras autorización expresa: `gh workflow run scrapers.yml --ref <release-branch> -f scraper=<selector-explícito>`. Diferenciar cero hallazgos, extraction-zero, error DNS/timeout, persistence failure y `NO_RUN`. Nunca elegir `all`; cleanup no es parte de este release.

**GO:** ruta producer → persisted run → opportunity/source identity → reducer → consumer → Admin se prueba con IDs concretos y ninguna falsa atribución. **NO-GO:** `UNKNOWN` convertido en permitido, run shared atribuido sin evidencia, total de muestra llamado inventario total, secreto/PII en logs, o fuente que desaparece.

## FASE 9 — Automatizaciones programadas

**Prerrequisitos:** todas las fases 0–8 GO, evidencia revisada por ChatGPT y aprobación explícita del usuario/operador.

Solo entonces el operador puede cambiar la GitHub repository variable `CVITAE_PROD_RELEASE_VALIDATED` a `true`. Nunca hacerlo desde código ni en esta sesión. Confirmar primero configuración y secretos GitHub para `SUPABASE_URL`/service role. Después observar el primer schedule de Universe (15 min), output `COMPLETE/RESUMABLE/ERROR`, y solo luego permitir matching retrieval programado. Scrapers y automatizaciones son controles separados; la variable puede habilitar sus schedules. No activar masivamente todos los perfiles: canarios y autorización por fuente preceden a una recuperación completa.

**Detención:** revertir el flag solo mediante decisión expresa si causa trabajo no seguro; no abortar una transacción a mitad del commit; pausar schedules por configuración aprobada y preservar cursores. No correr cleanup.

## Validación local registrada para este release

- Las cinco migraciones se aplicaron en orden a una base clonada local PostgreSQL 17.6 con vector alineado a `public.vector(384)`. El clon partía de una migración base anterior a varias prerequisitas; por eso esta prueba confirma compatibilidad de la cadena local, no sustituye el historial/preflight del proyecto productivo.
- Verificación local: versión de las cinco migraciones registrada; firmas `match_consumer_opportunities(public.vector,double precision,integer,text)`, `count_public_opportunities(text,text,text[],text)` y `complete_matching_retrieval_scan(uuid,bigint,timestamptz,text,text,text)` presentes; un trigger de epoch; ledger con RLS, lectura no concedida a anon/authenticated y service role permitido; cuatro universos presentes.
- E2E local contra PostgreSQL/PostgREST aislados: una oportunidad sintética de Himalayas fue `NOT_READY`, el reducer efectivo la llevó a `READY`, se registró evento de admisión/epoch y el worker real completó FULL (`1` fila inspeccionada, `1` candidato). Con perfil sintético confirmado, V2 persistió `MATCH` con score 63. La consulta HTTP PostgREST del candidato A devolvió ese ID y la consulta scoped al UUID B devolvió cero. La transición inversa emitió `READY→NOT_READY`; prune quitó el candidato (`1` stale candidate pruned) y el worker dejó cero candidatos. Esto valida la persistencia y lectura HTTP por filtro de usuario bajo service role, no sustituye autenticación B2C/Edge. No se atribuye a producción.
- La primera pasada real del worker reveló que un alias presente en Registry (`oyaop`) pero ausente de la tabla SQL de identidad se colapsaba sobre `oya`, causando `SOURCE_POLICY_ALIAS_CONFLICT` global. El worker y `match-batch` ahora derivan la agrupación de aliases de `opportunity_source_identity_aliases`/dejan las filas RPC SQL sin remapeo Registry-only. No se añadió alias ni se cambió una política. Prueba de regresión incluida.
- ZIP local de `admin-data` verificado y ejecutado desde el artefacto: `workflowRoutes` devuelve las 81 invocaciones directas, el snapshot conserva 87 perfiles vinculados/107 totales y `diagnose_source` resuelve el runner de Himalayas. El build global del sitio no se completó por `seo_inventory_policy_unavailable`; queda un smoke de build del proveedor con contexto SEO autorizado.
- La lectura del endpoint Edge HTTP autenticado `match-batch` no se ejecutó: el servicio Edge runtime local no estaba levantado y el auth local disponible no apunta al clon aislado. Lo probado llega al worker/PostgreSQL/PostgREST y al resultado privado persistido; el canario HTTP autenticado permanece en Fase 6 antes de GO productivo.

## Evidencia productiva de cierre

`CLOSED_LOCAL` no es `PROD_VALIDATED`. Cierre requiere recorridos con IDs/revisions: Matching → respuesta privada; SEO → eligibility/metadata/canonical/schema; Alertas → authority propia y sin correos de backfill; Admin → productor/runs/ingestión/calidad/Universo/consumidor/causa. Registrar datos históricos reconciliados por identidad aparte de eventos futuros automáticos. No declarar recuperadas las cifras de octubre sin una reconciliación actual.
