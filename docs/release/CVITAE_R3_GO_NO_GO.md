# CVitae R3 — decisión de release

**Estado preparado: NO-GO para publicación.** El checkout de entrada fue
`94009ff517e93dc5e46328d355b1fe8f84906759`, rama
`work/beta-hardening-postdeploy-20261011`. En esa entrada había 15 commits desde la
referencia cacheada `ce6dc7aba3dec35c6785fb7100d6125cd0962dab`; el remoto no fue
consultado, por lo que no se afirma que esos commits estén publicados o ausentes
en el destino.

## Evidencia ya disponible

- Snapshot productivo comunicado y fechado 2026-10-13: PostgreSQL 17.6,
  `public.vector(384)`, inventario/universos medidos, 105/107 fuentes dirty, las
  cinco migraciones no registradas y objetos R3 ausentes; sin duplicados que
  impidan 120001. Son mediciones de esa ejecución, no objetivo ni sustituto de
  una lectura de no-deriva si cambia la ventana/proyecto.
- La cadena de cinco migraciones se ejecutó localmente, en orden, sobre un clon
  aislado PostgreSQL 17.6 con `public.vector(384)`. Se verificaron firmas, ACL
  del ledger, trigger único y universos. El clon tenía varias migraciones
  prerequisitas pendientes antes de la secuencia R3; esto no prueba el historial
  remoto ni sustituye dry-run/backup/GO del operador.
- **Bundle focalizado local de `admin-data`: PASS.** Se inspeccionó y ejecutó el
  ZIP real; las rutas de workflow y el Registry se incluyen como snapshot
  estático derivado de los workflows fuente (81 invocaciones directas, 87
  perfiles vinculados, 107 perfiles). El empaquetado ya no necesita incluir ni
  leer los YAML durante runtime.
- El build general queda condicionado por
  `seo_inventory_policy_unavailable` cuando no están disponibles en el entorno
  autorizado las variables requeridas por `scripts/generate-seo-inventory.ts`.
  No se omitió ni debilitó ese gate.
- Clasificación del gate: **A, error reproducible de código:** el defecto de
  resolución dinámica en el ZIP se corrigió y el artefacto focalizado pasó.
  **B, entorno/credenciales:** el build general no completa la generación SEO
  local sin el contexto Supabase requerido (`seo_inventory_policy_unavailable`).
  **C, proveedor/artefacto:** falta el build de sitio del proveedor con policy
  SEO real y validación del artefacto del deploy. No atribuir este bloqueo a un
  defecto restante de `admin-data` ni a un éxito de publicación.
- E2E local parcial: PostgreSQL/PostgREST aislados, reducer real, epoch/ledger,
  worker real, FULL, ranking V2 y retirada (un candidato sintético `MATCH`
  persistido y luego eliminado). El endpoint Edge HTTP autenticado y la sesión
  Supabase del candidato no se probaron porque Edge runtime local no estaba
  disponible sobre ese clon; el smoke queda obligatorio antes de GO.
- Los totales históricos —incluidos 5.266— no son un baseline actual ni un
  objetivo de recuperación. Se deben medir y reconciliar por identidad y puerta.

## Desbloqueos obligatorios

1. El operador identifica explícitamente el proyecto Supabase y ejecuta el SQL
   preflight read-only. Historial, cinco versiones, `public.vector(384)`, RPC,
   permisos, dependencias, fuente/política, cola y ledger deben resultar
   legibles y compatibles. La salida debe guardarse con fecha y project ref.
2. `supabase db push --linked --dry-run` debe mostrar exactamente las cinco
   versiones aprobadas, en orden, y ninguna otra migración pendiente. Si el
   historial no es legible, el preview difiere o aparece una migración extra:
   NO-GO; no usar `migration repair` ni `--include-all` para forzar concordancia.
3. Debe existir respaldo/PITR comprobado y un responsable de recuperación. La
   primera migración elimina una constraint legacy específica; no hay down
   migration aprobada. Un DDL parcialmente aplicado requiere decisión de
   recuperación forward/restore, no código anterior a ciegas.
4. En el contexto real de Netlify, el build debe completar la generación SEO
   con policy real e inspeccionarse el ZIP final de `admin-data`. Localmente el
   ZIP focalizado ya pasó usando workflow map embebido desde el Registry
   generado; falta el build de proveedor/staging para cerrar compatibilidad de
   entorno y publicación. Si el artefacto del proveedor no puede obtenerse o
   inspeccionarse, mantener NO-GO.
5. Un candidato de prueba autorizado debe demostrar entrada y retirada privadas
   por IDs, ranking V2, revisión/cursor completos y aislamiento por usuario. Los
   resultados deben coincidir con `opportunity_final_matching_universe`; no se
   envían alertas históricas durante backfill.
6. Matching, catálogo, alertas y SEO deben validarse en sus universos separados;
   Admin debe conservar los 107 perfiles y explicar rutas, ejecuciones,
   ingestión, calidad, estado de Universo y causa. Ningún permiso SEO de
   Himalayas se modifica como parte de este release.
7. Solo tras revisión de esa evidencia y autorización explícita se puede
   publicar el commit, aplicar SQL/desplegar componentes y, al final, habilitar
   `CVITAE_PROD_RELEASE_VALIDATED`. Ningún código de este paquete modifica esa
   variable.

## Decisión por etapa

| Etapa | Estado | Criterio para GO |
|---|---|---|
| Preflight Supabase | PENDIENTE | SQL read-only guardado y sin incompatibilidades/UNKNOWN |
| Migraciones | PENDIENTE | respaldo comprobado + dry-run exacto + autorización |
| Netlify | PARCIAL / NO-GO | bundle focalizado local PASS; build de sitio/proveedor condicionado por SEO real |
| Edge/worker | PENDIENTE | migraciones verificadas + publicación autorizada |
| Reconciliación | PENDIENTE | cola medida, cursor durable, lotes aprobados y evidencia por identidad |
| Consumidores/Admin | PENDIENTE | recorridos independientes y canarios privados verificados |
| Schedules | NO-GO | todas las etapas anteriores aprobadas y autorización final |

**Operaciones productivas realizadas durante la preparación: ninguna.** Para el
orden, comandos, resultados esperados, parada y recuperación consultar
[`CVITAE_R3_RELEASE_RUNBOOK.md`](CVITAE_R3_RELEASE_RUNBOOK.md). El primer paso
operativo debe ser ejecutar manualmente, en el SQL Editor del proyecto
identificado, [`CVITAE_R3_PREFLIGHT_READONLY.sql`](CVITAE_R3_PREFLIGHT_READONLY.sql).
