# CVitae — ledger de volumen LATAM — 2026-10-14

**Objetivo:** 2.000 oportunidades nuevas, únicas, actuales y utilizables por candidatos PY.

**Resultado:** `PROVEN_NEW=0`; `BUSINESS_GATE=FAIL`.
**Evidencia base:** `docs/release/LATAM_SOURCE_CENSUS.json`, capturada el 14/10/2026 16:20:32 UTC. No se repitieron HTTP ni consultas productivas en esta pasada.

## Reglas de conteo

- Una publicación nativa cuenta una vez aunque liste varios países.
- La ubicación del trabajo, la elegibilidad del candidato y la modalidad remota son dimensiones diferentes.
- `Remote`, `LATAM`, `allLocations` y una respuesta HTTP 200 no bastan sin evidencia de elegibilidad y publicación individual vigente.
- Un anuncio sólo suma al resultado una vez que su ID/enlace canónico se compara contra Supabase y queda persistido con lineage. En esta pasada no hubo inserciones productivas.
- Las cifras `upper_bound` son recuentos de listados previos, no candidatas ya probadas ni una estimación de altas.

## Inventario conocido

| Fuente | Endpoint / HTTP previo | Listadas | Con ubicación PY/PE/AR explícita en listado | Detalle / vigencia | Permiso por consumidor | Nuevas probadas |
|---|---|---:|---|---|---|---:|
| Get on Board | `/api/v0/categories`, `/api/v0/categories/{category}/jobs?page=n`; 200, 18 categorías | 960 nativas; 0 IDs repetidos entre categorías | PY 0; PE 30; AR 9; 39 unión. Remotas 414, elegibilidad target en `countries`: 0 | 960 con título/descripción/ID; EOF de 20 páginas comprobado. No se observó expiración/cierre; menciones regionales no se contaron como elegibilidad. | API pública observada. Uso de cada consumidor y derechos de republicación no certificados. | 0 |
| Greenhouse Cabify | `/v1/boards/cabify/jobs?content=true`; 200 | 69 anuncios; 15 ubicaciones target | PY 0; PE 11; AR 4 | Contenido en listado; muestra individual con 5.172 chars, update 09/10. Dedupe de clones no terminada. | Board público no es autorización de uso; `REVIEW_REQUIRED` para consumidores/distribución. | 0 |
| Greenhouse UTT | `/v1/boards/utt/jobs?content=true`; 200 | 44 anuncios; 14 IDs candidatos | PY 0; PE 8 y AR 7 ocurrencias, una publicación en ambos; 14 publicaciones únicas | Contenido en listado; clones restantes no comparados completamente. | `REVIEW_REQUIRED`. | 0 |
| Greenhouse NEORIS | `/v1/boards/neoris/jobs?content=true`; 404 | 0 | 0 | Board probado no existe en esa ruta. | No aporta. | 0 |
| Lever Coderio | `/v0/postings/coderio?mode=json&skip=n&limit=100`; 200, páginas 15+0 | 15; 11 con ubicaciones target | Un ejemplo PY tenía descripción vacía; el total por país no está desglosado. | Vacío de descripción y vigencia/ficha completa pendientes. | API pública, permisos por empleador/consumidor no certificados. | 0 |
| Lever Aleph | endpoint Lever; 200, páginas 100+3+0 | 103; 7 candidatos target | Se observó muestra `Paraguay - Remote`; no extrapolar ese ejemplo. | EOF real comprobado. | `REVIEW_REQUIRED`. | 0 |
| Lever TalentusGlobal | endpoint Lever; 200, 16+0 | 16; 13 candidatos target (se excluyó 1 captura genérica) | Muestra `LATAM CANDIDATES ONLY` enumera Paraguay, Perú y Argentina; no hay reconciliación íntegra de eligibility/dedupe. | Cuatro fichas sin descripción en el tablero; títulos repetidos requieren revisión. | `REVIEW_REQUIRED`. | 0 |
| Lever Chipping Concrete | endpoint Lever; 200, 40+0 | 40; 28 candidatos target | Muestra `allLocations` enumera Paraguay y Argentina; ubicación no equivale por sí sola a elegibilidad individual. | Títulos repetidos y descripciones vacías; dedupe pendiente. | `REVIEW_REQUIRED`. | 0 |
| Lever — unión de 4 sitios | `skip=0,100,200`, EOF corto/vacío comprobado | 174 anuncios; 59 location candidates | PY/PE/AR no plenamente desglosados; el mismo post puede nombrar más de un país | El inventario completo no se exportó/deduplicó por contenido. | `REVIEW_REQUIRED`; no añadir boards automáticamente. | 0 |
| SmartRecruiters — 14 empresas | `/v1/companies/{company}/postings?country={py,pe,ar}&limit=100&offset=n&destination=PUBLIC`; 200 regional | 441 registros de listado | PY 1, PE 401, AR 39 (ocurrencias del API; cruce de IDs entre consultas pendiente) | Sólo 4 GET de detalle; 437 no examinados. Muestras incluyen release dates de 2024 y 2021, por lo que edad y estado actual necesitan revisión individual, aunque el API devolvió `active=true`. | Endpoint público no concede licencia de distribución. Revisión de cada empresa/consumidor requerida. | 0 |
| Jooble PE/AR | `/api/about` no consultado en la pasada de censo | 0 demostrado | 0 | No se consumieron claves. Evidencia anterior: 500 llamadas vitalicias por clave; claves regionales no comprobadas y fuente de seguridad pendiente. | Requiere confirmar claves regionales por nombre/política antes de cualquier solicitud. | 0 |
| MTPE datos abiertos | Dataset/CSV de portal de datos abiertos: API y CSV 200 en el censo | 53.233 registros | Perú histórico | CSV de 11.761.704 bytes, modificación 11/08/2025; `FECHAFIN` máximo 16/12/2024, 0 fechas vigentes al 14/10/2026; sin URL individual de postulación. | Licencia abierta no repara vigencia ni falta de postulación. | 0 utilizable |
| UNJobs | Run histórico suministrado | 519 hallazgos; 142 inserciones, 99 fallidos, 269 omitidos por presupuesto | Distribución PY/PE/AR de ese run no establecida | No se reejecutó ni deduplicó. Los 142 se excluyen de cualquier volumen nuevo. | Mantener contratos y control existentes; investigar fallo/salto sin repetir IDs. | 0 adicional probado |
| Paraguay Concursa MEF | Portal oficial; HTTP y ficha de pasada previa, no repetidos ahora | El portal anunció 251 concursos en etapas diversas; muestra histórica del adaptador: 16 tarjetas/2 páginas y 1 detalle | PY, pero el detalle examinado no confirmó ciudad ni cantidad de vacantes | No son 251 empleos abiertos. El adapter actual conserva ubicación/plazas/fecha desconocidas y mantiene inactiva/revisión. | Portal oficial no es una autorización para redistribuir; certificación de fuente pendiente. | 0 |
| Poder Judicial PY | Portal de concursos y bases PDF | 0 fichas verificadas en esta pasada | PY esperado por fuente, sin registros actuales probados | Selector/estado/ficha individual/PDF aún no implementados y validados. | `REVIEW_REQUIRED`. | 0 |
| Bumeran/Computrabajo PE/AR | No se hizo extracción | 0 demostrado | No aplica | Acuerdo/feed sigue pendiente; no sortear rate-limit/bloqueos. | `PENDING_WRITTEN_AGREEMENT_OR_VALID_FEED`. | 0 |

## Reconciliación geográfica y brecha

| Dimensión | Registros de listado previos | Validados completos, vigentes, nuevos y persistidos | Estado |
|---|---:|---:|---|
| (A) Vacante con puesto ubicado en PY | Al menos 1 SmartRecruiters en conteos regionales; Lever aporta candidatos target sin desglose por país; Get on Board/Greenhouse: 0 PY | 0 demostrados | `UNKNOWN`; el máximo previo Lever son 59 para los tres mercados juntos, antes de dedupe/calidad. |
| (B) Remota con elegibilidad PY explícita | Muestras Lever mencionan Paraguay/LATAM; no hay exportación total con elegibilidad comparada por posting | 0 demostrados | `UNKNOWN`; no usar `remote=true` ni 414 GOnB como elegibilidad PY. |
| (C) Vacante ubicada en PE | GOnB 30; Greenhouse 19 ocurrencias; SmartRecruiters 401; Lever sin desglose | 0 demostrados | Upper-bound de ocurrencias, no IDs únicos ni elegibilidad final. |
| (D) Vacante ubicada en AR | GOnB 9; Greenhouse 11 ocurrencias; SmartRecruiters 39; Lever sin desglose | 0 demostrados | Upper-bound de ocurrencias, no IDs únicos ni elegibilidad final. |
| Unión PY/PE/AR del censo | 568 (39 GOnB + 29 Greenhouse + 59 Lever + 441 SmartRecruiters) | 0 demostradas nuevas | Upper-bound por listados; se reduce con detalle, fecha, clones y producción. |
| Meta comercial de PY | 2.000 | 0 | Brecha demostrada: 2.000 inserciones. El censo anterior ni siquiera reúne 2.000 candidatos list-level para los tres mercados. |

La identidad exacta de candidatos frente a las 6.789 filas activas del censo anterior quedó `PENDING`; el cruce por enlaces sin ID no se consideró alta. Las cifras productivas de 16.683 oportunidades/6.789 activas y consumidores se suministraron por el operador, no se consultaron otra vez. Las 119 recuperadas se mantienen cerradas y no se contaron.

## Dependencias y siguiente evidencia necesaria

### PY acquisition delta - bounded local observation 2026-10-14

The structured delta is in `CVITAE_SOURCE_VOLUME_LEDGER_2026-10-14.json` under `py_acquisition_delta_2026_10_14`. This pass made bounded public GETs to PSF HiringRoom and the current Grupo Vierci portal. It did not query Supabase or change production rows.

| Source | HTTP/list result | Current PY detail evidence | New vs PROD | Permission / automation | First blocker |
|---|---|---|---:|---|---|
| PSF HiringRoom (`psf` tenant) | HTTP 200; 12 distinct IDs; 0 duplicates; listing EOF reported | One detail confirmed a job in Asuncion, Paraguay, an application link and relative age of 6 days; no exact publish/deadline date; one generic intake excluded | 0 proven; PROD `UNKNOWN` | Feed and every consumer use `REVIEW_REQUIRED`; flags OFF. Adapter is connected to canonical sink and cursor; daily 10:41 UTC cron is gated on authorization/certification and collection control | Written permission for storage/normalization/display is absent; exact posting/deadline dates are not available |
| Jobs.com.py | Approximately 96 public listing cards observed | No individual current detail verified in this pass; dynamic/cached count | 0 proven; PROD `UNKNOWN` | `REVIEW_REQUIRED`; no new adapter | IDs, freshness, dedupe and terms unverified; linked terms PDF returned 404 |
| PIVOT | Homepage advertises 1,000+ | No IDs/details/feed verified | 0 | `REVIEW_REQUIRED` | Promotional claim does not prove accessible inventory or permission; request source-owned feed/API |
| MTESS EmpleaPY | Application portal behind login | 0; no login or identity used | 0 | Public feed/agreement required | No authorized public export demonstrated; historic fair plazas are not postings |
| Trabajito | Two featured cards observed | No complete/current detail verified | 0 | `REVIEW_REQUIRED` | Individual contract, state, pagination and reuse rights unverified |
| Grupo Vierci | Current portal HTTP 200, explicit no-current-vacancies state | 0 | 0 | Local scout is fail-closed; source and consumer flags OFF | No current inventory; future non-empty markup requires authorized ID/detail/use contract |
| Paraguay Concursa MEF | No repeated HTTP; prior census retained | Its advertised 251 contests span stages; they are not 251 open jobs | 0 | `REVIEW_REQUIRED` per prior evidence | Permission and per-contest status remain unresolved |

The observed PSF posting is not counted as usable or new. HiringRoom integration documentation does not establish rights to ingest or redistribute public HTML. The prior 568 remains a PY/PE/AR list-level union and is not counted again. No production identity/URL comparison was run.

`NEW_PY_JOB_LOCATION=0` proven; `NEW_REMOTE_PY_ELIGIBLE=0`; `NEW_INSERTED_PROD=0`; `PROVEN_NEW_PY=0`; `BUSINESS_GATE=FAIL`; remaining gap to proven result: 2,000. Fixtures and listing/plaza counts do not contribute.

Highest-ROI next action: obtain a source-authorized PIVOT feed with individual native IDs/URLs, status/dates, update cursor, and written rights specifying storage, linkback, and separate private matching, catalog, alert, SEO and third-party use. No request was sent in this pass.

1. Exportar IDs/enlaces canónicos de todos los anuncios listados, recopilar detalle actual y fecha/estado para cada posting.
2. Obtener evidencia de país elegible, especialmente remoto PY; nunca inferirlo del modo de trabajo.
3. Consultar Supabase en modo read-only para reconciliar IDs nativos, URL y clones entre fuentes antes del canario.
4. Resolver derechos/condiciones por tablero y consumidor; claves Jooble regionales por nombre antes de gastar llamadas.
5. El máximo previo de 568 combina PY/PE/AR y no es comparable con la meta exclusiva PY. Se necesitan al menos 2.000 candidatos PY adicionales list-level antes de descartes; el inventario autorizado actual no prueba ese volumen. La cantidad real necesaria será mayor por vencidos, clones, candidatos ya presentes y fichas insuficientes.

El JSON compañero es la fuente estructurada para reportes; sus campos separan datos medidos, máximos list-level, evidencia de detalle y estados no demostrados.
