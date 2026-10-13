# CVitae R3 — decisión de release

**Estado preparado: NO-GO para publicación.** El checkout local está congelado en
`79a0f7c5249b7c8bd0bc1ee50cba8549574aef5b`, rama
`work/beta-hardening-postdeploy-20261011`. Hay 12 commits locales desde la
referencia cacheada `ce6dc7aba3dec35c6785fb7100d6125cd0962dab`; el remoto no fue
consultado, por lo que no se afirma que esos commits estén publicados o ausentes
en el destino.

## Evidencia ya disponible

- Las cinco migraciones locales y sus firmas están enumeradas en el runbook y
  medidas por `CVITAE_R3_PREFLIGHT_READONLY.sql`. El esquema productivo actual,
  el historial de migraciones y el inventario de hoy **no se consultaron**.
- El tipo `public.vector(384)` tuvo confirmación productiva previa, pero debe
  volver a contrastarse en el preflight del proyecto/branch autorizado. No se
  presume que el esquema actual siga igual.
- El empaquetado focalizado local de `admin-data` generó ZIP, pero el ZIP local
  de `functions:build` no incluyó los assets dinámicos configurados. Esto no
  demuestra por sí mismo un defecto del código ni el contenido del artefacto
  final creado por el build del proveedor.
- El build general queda condicionado por
  `seo_inventory_policy_unavailable` cuando no están disponibles en el entorno
  autorizado las variables requeridas por `scripts/generate-seo-inventory.ts`.
  No se omitió ni debilitó ese gate.
- Clasificación del gate: **A, error reproducible de código:** ninguno
  demostrado en esta pasada. **B, entorno/credenciales:** el build general no
  puede completar la generación SEO local sin el contexto Supabase requerido.
  **C, proveedor/artefacto:** la prueba local de `functions:build` no mostró los
  assets dinámicos en su ZIP; la configuración declara `included_files`, pero
  el bundle final del contexto de sitio/proveedor sigue sin evidencia. No
  atribuir el resultado a un defecto de código ni a un éxito de Netlify hasta
  inspeccionar el artefacto final.
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
4. En el contexto real de Netlify, el build debe completar la generación SEO con
   policy real y el artefacto final debe incluir
   `scrapers/source_registry.json`, los tres workflows configurados y
   `src/generated/source-intelligence-registry.json`. Si no se puede obtener o
   inspeccionar ese artefacto, registrar
   `NETLIFY_BUNDLE_SMOKE_PENDING_RELEASE` y permanecer NO-GO.
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
| Netlify | NO-GO | build real y bundle final inspeccionable |
| Edge/worker | PENDIENTE | migraciones verificadas + publicación autorizada |
| Reconciliación | PENDIENTE | cola medida, cursor durable, lotes aprobados y evidencia por identidad |
| Consumidores/Admin | PENDIENTE | recorridos independientes y canarios privados verificados |
| Schedules | NO-GO | todas las etapas anteriores aprobadas y autorización final |

**Operaciones productivas realizadas durante la preparación: ninguna.** Para el
orden, comandos, resultados esperados, parada y recuperación consultar
[`CVITAE_R3_RELEASE_RUNBOOK.md`](CVITAE_R3_RELEASE_RUNBOOK.md). El primer paso
operativo debe ser ejecutar manualmente, en el SQL Editor del proyecto
identificado, [`CVITAE_R3_PREFLIGHT_READONLY.sql`](CVITAE_R3_PREFLIGHT_READONLY.sql).
