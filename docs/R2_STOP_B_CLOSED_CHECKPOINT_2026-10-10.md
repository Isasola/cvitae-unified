# CVITAE — CHECKPOINT R2 / STOP B LOCAL CERRADO

**Fecha:** 2026-10-10 (Paraguay)

**Naturaleza:** checkpoint documental basado en evidencia aportada por el operador. No significa commit efectuado ni validación de Supabase/producción. No sustituye `AGENTS.md`, `WORKING_PRINCIPLES.md`, los checkpoints R1 o el contrato existente del Admin.

## 1. Identidad de la rama y origen

- Worktree del operador: `C:\Users\isaso\cvitae-b2c-r2-20261008`.
- Rama confirmada: `work/b2c-r2-20261008`.
- HEAD antes de crear el commit R2: `c633f5d8` — `docs: freeze b2c integration-ready checkpoint r1`.
- Tag R1 protegido: `checkpoint/b2c-ready-20261008-r1`.
- R2 implementada como cambios locales pendientes de checkpoint Git; la salida `git status --short` confirmó modificaciones productivas, tests, propuesta de migraciones y artefactos de release.
- Revalidar el hash resultante DESPUÉS del commit local. No afirmar que existe un commit/tag nuevo hasta ejecutar Git y observar éxito.

## 2. STOP B: evidencia de cierre local

| Gate | Evidencia | Resultado |
|---|---|---|
| Contratos B2B simulados | `scripts/verify-r2-b2b-baseline.mjs` | **21/21 PASS** |
| Learning, Sitemap | Verificaciones específicas anteriores | **PASS** |
| Universo + permiso operativo / oráculo | `verify_opportunity_universe_permission_preflight.ts`, 23 fixtures, `FIXTURE_STATIC_ORACLE` | **PASS local**; NO paridad PostgreSQL |
| Diff | `git -c core.safecrlf=false diff --check` | **PASS** |
| Build fixture | `pnpm.cmd build`, 2.901 módulos; sitemap 17 URLs; prerender 2 blog, 4 jobs, 1 opportunity, 2 vacancies; redirects 5, colisiones 0 | **PASS** |
| Prerender | `verify_prerender_universe_item31.ts` | **PASS** |
| Snapshots generados | `GENERATED_SNAPSHOTS=RESTORED` | **Restaurados** |
| Navegador B2B | P15-R2 PASS en 5s; diez restantes `REMAINING_10_EXIT=0`; `STOP_B_BROWSER_MOCKED=PASS_11_CASES`; `.last-run.json` status `passed`, `failedTests: []`, 2026-10-10 13:17 (operador) | **11/11 PASS, mocked** |

**Estado:** `STOP_B_LOCAL=PASS`. El navegador fue mockeado con servidor local; los resultados no prueban base real, RLS real, Supabase PROD o una publicación Netlify.

## 3. Qué NO se reabre

- B2C R1 previamente cerrado, Admin/Cockpit, Source Intelligence, scrapers, normalización, opportunity truth y Universos, salvo regresión concreta demostrada.
- Contrato Admin existente: mostrar qué entra por productor, dónde se guarda y transforma, campos conservados, gates y motivos, consumidor al que llega, esperado vs persistido, histórico y futuras oportunidades. **No es trabajo nuevo.**
- Si la oportunidad cumple los gates efectivos del consumidor, debe seguir su ruta automáticamente, sin bloqueo global arbitrario por scraper.
- Catálogo, Matching, Alertas, SEO, Google Jobs y terceros son decisiones independientes. `JOB LOCATION ≠ CANDIDATE ELIGIBILITY ≠ WORK ARRANGEMENT`; `UNKNOWN ≠ DENIED ≠ ALLOWED`.
- El hallazgo consultivo de WWR del oráculo no autoriza una reforma de política, un veto global ni una nueva auditoría transversal. Preservar restricciones verificadas y específicas (p. ej. límites concretos de proveedores en SEO) sin extrapolaciones.

## 4. START POINT: STOP C, sin SQL aplicado

**Hecho histórico del preflight del 2026-10-09 (requiere reconfirmación antes de WRITE):** ocho `recruiter_vacancies` (seis activas/dos inactivas), cero espejos en `opportunities` entonces; productor canónico B2B todavía no ejecutable en PROD.

**Artefactos locales preparados, aún no ejecutados:**

- `supabase/migrations/202610090001_controlled_recruiter_producer.sql`
- `supabase/migrations/202610090002_recruiter_opportunity_bridge.sql`
- `artifacts/release/r2-b2b-preflight-20261009.sql`
- `artifacts/release/r2-b2b-historical-preview-20261009.sql`
- `artifacts/release/r2-b2b-reconcile-write-20261009.sql`
- `artifacts/release/r2-b2b-post-apply-verify-20261009.sql`
- `artifacts/release/r2-b2b-compensate-write-20261009.sql`
- `artifacts/release/r2-b2b-schema-rollback-write-20261009.sql`
- `artifacts/release/r2-b2b-stop-c-plan-20261009.md`

**Próximo orden operativo:**

1. Congelar R2 en **commit Git local** verificado; comprobar que están incluidos cambios de código, migraciones y evidencia, excluyendo secretos y material ajeno. No hacer `reset`, `clean`, `push` ni deploy automático. Registrar hash y tag nuevos sólo tras éxito.
2. STOP C READ_ONLY: revisar propuestas de migración contra el esquema real, RLS, permisos, funciones y vistas; ejecutar preflight del operador, recontar vacantes y proponer backfill sin ejecutar escrituras. Validar la correspondencia de IDs, idempotencia, creación/edición/cierre futuros, reconciliación y privacidad.
3. Para cada WRITE real, autorización humana separada. Aplicar migraciones y backfill sólo con plan de reversión, verificación posterior y STOP si no se cumplen los invariantes.
4. E2E de extremo a extremo conectado a DB real con vacante de prueba controlada; comprobar persistencia y rutas independientes por Universo, aplicación privada y trazabilidad Admin existente.
5. Preview Netlify controlado, sin depender de schema R2 no aplicado; producción R2 sólo cuando sean demostrados DB, privacidad y rutas operativas.

**No declarar:** `R2_PROD_VALIDATED`, `STOP_C_PASS`, `R2_RELEASE_READY` o `DEPLOYED` sólo por estos PASS locales.

## 5. Seguridad y observabilidad operativa

- Los intentos antiguos Playwright V1/V2 fallaron por aislamiento/ejecutor; el canary R2 y restantes **sí** pasaron. No reejecutar V1/V2/V3 por defecto.
- Procesos Node/CMD de pruebas quedaron visibles en una observación posterior; no detener procesos por nombre o PID histórico sin verificar identidad actual.
- No publicar credenciales, tokens de reclutadores, CVs privados ni payloads de postulantes en el checkpoint, logs, commit o artefactos.
- Las pruebas locales pueden llamarse `CLOSED_LOCAL`; sólo una validación del runtime productivo autoriza `PROD_VALIDATED`.

**Siguiente tarea exacta para Codex:** Preparar/revisar el cierre Git local y la compatibilidad STOP C existente. No rediseñar Admin ni Universe policy. No ejecutar migraciones, escrituras SQL, push o deploy implícitos. El operador puede hacer comandos grandes de PowerShell y Supabase; Codex hace corrección quirúrgica y evidencia E2E sin reauditorías cerradas.
