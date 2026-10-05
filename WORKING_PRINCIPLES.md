# CVitae Working Principles

This is the system-reasoning constitution for work on CVitae. It is not a
style guide.

## Canonical Opportunity Pipeline — Everything Has a Trace and a Route

CVitae is one information-processing system, not separate scrapers, tables,
filters, and consumers. The canonical contract is:

`RAW INFORMATION → INGESTION TRACE → NORMALIZED → SEALED → OBSERVED → CLASSIFIED → ROUTED → CONSUMED`.

Every discovered result must enter this pipeline and leave durable evidence of
its path. A row merely being present in `opportunities` does not mean it was
processed. `SCRAPER RESULT != PROCESSED RESULT`. Processing means its
provenance, sealing, classification, and routing are determined; no record may
disappear between stages without an observable reason.

```text
SCRAPER
   ↓
CANONICAL INGESTION
   ↓
GATES / EVIDENCE LAYERS
   ↓
COMPLETE SEAL
   ↓
CLASSIFICATION
   ↓
ROUTING ── Catalog / Matching / Alerts / SEO / JobPosting
         └─ Review / Blocked / Unknown

Admin observes the complete path, not only its final result.
```

Each phase records what it received, what it did and produced, the evidence
and timestamp used, its state and reason, missing evidence, and the next
possible destination/action. For any opportunity, operators should be able to
identify its producer and run, ingestion time, adapter/cleaner, normalized
fields, fingerprints, Factory stamps, factual source observation,
verification, lifecycle, permissions, and each consumer's independent
decision and first blocking reason.

Every gate must emit an explicit state (`READY`, `BLOCKED`, `REVIEW`,
`UNKNOWN`, `NOT_APPLICABLE`, `STALE`, or the contract's equivalent) with an
observable reason. `UNKNOWN` means the trace is intact and the missing evidence
is identified; it never becomes a positive decision by default. Ingestion
lineage is not HTTP/live/identity evidence. Historical reconstruction from DB
presence must remain labeled reconstructed and must not masquerade as a
scraper run or source observation.

Existing authorities remain authoritative: `opportunities`,
`opportunity_factory_snapshots`, `opportunity_source_observations`,
`opportunity_universe_state`, source/permission policy, `scraper_runs`, and the
source registry/intelligence. Admin projects these truths; it does not create
a parallel truth system. Factory, Observation, and readiness can be
independent; expose their full matrix rather than inventing one linear
first-failure state. Each consumer uses its canonical routed state and must
not reinterpret raw opportunity data independently.

Historical and future rows use the same reducer and routing contract. New
sources should connect to the canonical input and reuse existing gates;
source-specific differences belong in the adapter, cleaner, or documented
policy, not in parallel pipelines or special cases in common reducers.

When debugging, follow the real flow in order:
`PRODUCER → INGESTION → NORMALIZATION → EVIDENCE → QUALITY → LIFECYCLE →
POLICY → SEALING → ROUTING → CONSUMER`. Locate the exact last completed and
first incomplete gate, explain why it stopped, and identify the safe next
action before changing a downstream consumer.

**Master rule:** no datum without provenance, no state without a reason, no
gate without an observable output, no exclusion without explanation, and no
opportunity outside the canonical pipeline.

## 1. Think in systems, not components

For substantial work reason through:

UPSTREAM
→ INPUT
→ TRANSFORMATION
→ PERSISTENCE
→ POLICY
→ DOWNSTREAM CONSUMERS
→ USER/OPERATOR RESULT
→ OBSERVABILITY
→ FAILURE
→ RECOVERY

A component passing tests does not imply the system works.

PART WORKING != SYSTEM WORKING.

## 2. Intent is larger than the literal example

Examples, fixtures and current counts do not define the universe. Always
separate:

- EXAMPLE
- TEST FIXTURE
- CURRENT OBSERVATION
- SYSTEM UNIVERSE
- ACCEPTANCE CRITERION

## 3. Test fixture != product universe

A fixture proves a property. It never defines production scope.

## 4. Define the invariant before implementation

Before substantial work define what must be true when finished.

## 5. Determine the complete universe

For bulk, pipeline and data work determine the entire applicable universe.
Never silently equate first page, first 500, first 1,000, current inventory
count or top N with the complete universe.

Separate DISCOVERY COVERAGE from PROCESSING BUDGET.

## 6. Always think historical + future

Every pipeline repair must consider:

A. historical persisted state;
B. future automatic ingestion.

A backfill does not prove future correctness. A future-path fix does not
repair historical data.

## 7. Validation order

CONNECTIVITY
→ COVERAGE
→ CORRECTNESS
→ QUALITY

## 8. Data must survive end to end

When a field exists upstream, trace whether it survives:

extraction → adapter → normalization → persistence → policy → consumer.

Do not silently replace missing data with guesses.

## 9. Preserve critical separations

- Source permission ≠ row readiness ≠ effective consumer permission.
- Source enabled ≠ consumer enabled ≠ row routable.
- Catalog ≠ matching ≠ alerts ≠ SEO ≠ AEO ≠ GEO ≠ JobPosting ≠ Google Jobs.
- SEO readiness ≠ SEO operational state ≠ search-engine permission.
- Job location ≠ candidate eligibility ≠ work arrangement.
- Remote ≠ worldwide.
- UNKNOWN ≠ TRUE ≠ FALSE ≠ SUCCESS.
- Queued ≠ running ≠ success.
- Discovered ≠ attempted ≠ submitted ≠ inserted.
- Tested locally ≠ deployed ≠ verified in production.

## 10. Fail closed when truth is unknown

Never invent Paraguay, eligibility, remote scope, organization, location,
salary or other factual values merely to make a downstream consumer pass.

## 11. Observability is part of the system

Admin and diagnostics should help identify where a cable broke instead of
forcing manual archaeology.

## 12. Operator actions need safe lifecycle

For meaningful operations consider:

preview → apply → progress → result → failure → retry/resume → audit.

## 13. Reuse existing systems

Do not create parallel tools, duplicate truth systems or separate SEO/AEO/GEO
data pipelines when the existing Opportunity Truth, Registry or routing
architecture can own the concern.

## 14. Do not re-audit closed work without evidence

Reuse previous PASS evidence unless the current change affects that contract
or there is concrete regression evidence.

## 15. Evidence levels must remain honest

Keep distinctions such as:

- LOCAL
- FIXTURE
- RC
- READ_ONLY_PROD
- PROD_VALIDATED
- PROD_VALIDATION_PENDING

Never promote local or fixture evidence into production evidence.

## 16. Completion format

For substantial checkpoints report:

CHECKPOINT
STATUS
EVIDENCE
PROD PENDING when applicable
NEXT

Do not renumber the master checklist.

## 17. Semantic Truth Debugging

`FIELD SURVIVAL != SEMANTIC SURVIVAL != PROVENANCE SURVIVAL != CONSUMER INTERPRETATION`.
A downstream field does not prove that upstream meaning survived. Trace claims,
not names, and enumerate producer branches: `ROW_EXPLICIT`,
`SOURCE_CONTRACT_DERIVED`, `DETERMINISTIC_NORMALIZATION`,
`HEURISTIC_INFERRED`, `FALLBACK_PLACEHOLDER`, `ABSENCE_DERIVED`,
`LEGACY_DERIVED`, or `UNKNOWN`.

Certainty may never increase silently: UNKNOWN, absence, fallback, heuristic,
source context, operational state, search geography, publisher metadata and
TTL are not row facts. Audit positive claims as rigorously as missing values.
For every change prove CREATE, UPDATE, NO-OP and HISTORICAL parity, plus
scheduled, monitored, admin/manual, direct CLI and maintenance entrypoints.
Consumers must not reinterpret the same row incompatibly; preserve job
location, applicant eligibility, work arrangement, source geography and
company location as independent dimensions. Audit tools establish only the
truth they actually measure; AST field mappings are structural evidence only.
Verification assertions must have discriminating power: prove expected,
negative and adversarial branches. A tautology, field presence or non-null
value is not evidence and cannot advance state.
Semantic truth and permission truth are orthogonal: a source fact may be
accurate while collection, catalog, matching, alerts or distribution remain
unpermitted or UNKNOWN.

## 18. Universe First / Anti-Debug-Loop

`LOCAL BUG != LOCAL SCOPE`. Before a fix, define the complete entity universe
and reconcile its denominator; trace all producers, transformations,
persistence/provenance, CREATE/UPDATE/NO-OP/RESTORE/BACKFILL paths, consumers,
historical state, future automation, Admin observability, failure/recovery,
and exclusions. Close only after:

`DIAGNOSE ONCE → DEFINE WHOLE UNIVERSE → DESIGN ONCE → APPLY SYSTEMICALLY →
RECONCILE 100% → TEST END-TO-END → PROD VALIDATE → CLOSE`.

Do not reopen a closed workstream without a concrete regression, failed
discriminating test, mathematical inconsistency, or real PROD evidence.

## 19. Verdad externa antes de compilar o aplicar

La coherencia interna del repositorio no demuestra compatibilidad con producción. Antes de ejecutar una migration, deploy, RPC, integración o cambio que dependa de infraestructura existente, definir primero el universo completo de dependencias externas del artefacto —schemas, extensiones, tipos, tablas, columnas y sus tipos, funciones y firmas, operadores, constraints, roles, permisos, variables y servicios— y contrastarlo en una sola pasada read-only contra la realidad actual del entorno destino. Un test local puede dar PASS porque código, generator, verifier y fixture comparten la misma suposición equivocada; por eso `REPO CONSISTENT != PROD COMPATIBLE`. No avanzar mediante ciclos de “corregir el primer error y volver a probar”: `EXTRACT ALL DEPENDENCIES → VERIFY ALL AGAINST TARGET → FIX ALL MISMATCHES SYSTEMICALLY → REGENERATE → TEST → FULL COMPILE/DRY-RUN → APPLY → VERIFY`. El preflight debe detectar también incompatibilidades silenciosas —por ejemplo objetos que existen con schema, firma o tipo distinto— y debe evolucionar junto al artefacto mediante un coverage guard que falle si aparece una nueva dependencia externa no verificada. Sólo cuando el contrato completo contra el entorno real esté demostrado se autoriza el siguiente paso.

## UNIVERSE-FIRST EXECUTION PROTOCOL — MANDATORY

This procedure operationalizes the system principles above; it does not create
another architecture or truth source.

A. **Define the denominator.** Before implementation, state the complete row,
object, or source universe and its count; identify producer, transformers,
authorities, consumers, Admin surface, historical and future paths, and target
environment.

B. **Map the whole flow once.** Trace `PRODUCER → INGESTION → NORMALIZATION →
EVIDENCE → SEALING → CLASSIFICATION → ROUTING → CONSUMER → ADMIN` before the
first fix. Read enough repository/review-bundle context once to understand the
shared flow; do not rediscover it on every iteration.

C. **Measure the whole universe.** Obtain state, reason, and next action for
the full denominator. Samples are useful for diagnosis, never a substitute for
whole-universe accounting.

D. **Group by systemic cause.** Prioritize by affected rows × consumer
criticality × systemic repairability. Fix a shared cause before an individual
row/source when the evidence supports it.

E. **Fix the shared cable.** Prefer a shared producer, adapter contract, sink,
reducer, orchestrator, or consumer contract over source-specific patches.

F. **Handle historical and future paths together.** Every change states what
happens to already-persisted rows and what will happen automatically to the
next input.

G. **Treat Admin as acceptance criteria.** Do not close a flow unless Admin
can show what entered, each gate's work and evidence, current state, stop
reason, missing evidence, and safe next action.

H. **Run one external preflight.** Extract all dependencies and verify them
against the target in one read-only pass before migration or deployment. Do
not wait for PostgreSQL or runtime to reveal one missing assumption per run.

I. **Implement systemically once.** Diagnose the full cause set, then apply
the coherent implementation. Avoid `fix → test → discover architecture → fix`
loops; repair deterministic syntax, wiring, generator, or verifier defects
within the same implementation pass.

J. **Reconcile the denominator.** Recompute against the same whole universe.
Require `DENOMINATOR = PROJECTED_ROWS`, zero duplicates, zero unexplained rows,
and zero missing status. READY is not required; explained is.

K. **Test end to end.** `PART WORKING != SYSTEM WORKING`. Prove producer →
persistence → reducer → routing → consumer → Admin, including representative
negative states.

L. **Validate production explicitly.** Evidence order is `LOCAL → COMPILE →
APPLY → PROD VERIFY → SMOKE/CANARY → CLOSED`. Local or fixture PASS is never
production validation.

M. **Do not reopen without evidence.** After `PROD_VALIDATED`, reopen only for
a regression, new data, broken invariant, or explicit product decision.

N. **Leave an executable checkpoint.** Every session records
`CURRENT_DENOMINATOR`, `LAST_PROVEN_GATE`, `CURRENT_BLOCKER_CLASS`,
`NEXT_ACTION`, `EXACT_COMMAND/ARTIFACT`, and `DO_NOT_REOPEN`, so another session
can continue without reconstructing prior weeks of reasoning.

## CABLE CONNECTION CLOSURE CONTRACT

Un cable NO está conectado porque compile, tenga un consumer, exista una
función, pase un fixture o un test local, o su lógica teórica sea correcta.
Para declarar un cable CLOSED deben demostrarse las cuatro condiciones:

- **A. EXISTING DATA:** las filas históricas que ya cumplen el contrato llegan
  al consumidor real.
- **B. FUTURE DATA:** una fila nueva que cumpla el contrato atraviesa
  automáticamente el mismo circuito sin intervención manual.
- **C. NEGATIVE PATH:** una fila que no cumple queda afuera con reason code
  explícito; UNKNOWN nunca se convierte silenciosamente en ALLOWED.
- **D. EFFECTIVE STATE:** el estado consumido coincide con la política y
  configuración vigentes. `permission=ALLOWED + row=READY + stale switch=DENIED`
  exige una razón explícita de kill-switch/manual override; un default histórico
  no constituye una decisión del operador.

`LOCAL_TESTED != WIRED`. `WIRED != RUNNING`. `RUNNING != PROD_VALIDATED`.
Para pedidos de conectar cables, el cierre exige evidencia end-to-end de las
cuatro condiciones, no sólo implementación. Los resultados locales se registran
como locales; no prueban aplicación, ejecución ni validación en PROD.

## BOUNDED WORK != TRUNCATED PRODUCT

Los límites controlan COSTO POR EJECUCIÓN. Nunca deben reducir silenciosamente
la COBERTURA DEL PRODUCTO. Correcto: 100 filas, cursor, siguientes 100, hasta
cobertura total. Incorrecto: mirar las primeras 1.000 y tratar el resto como
inexistente. Los filtros y búsquedas deben consultar el conjunto canónico
completo mediante predicados y paginación, sin cargarlo completo por request.

Esta regla aplica a public opportunities, búsquedas/filtros, Matching candidate
retrieval, sitemap, Factory, Automation, Observation recovery, Universe
reconciliation, embeddings y Admin. Las muestras pueden limitarse; los totales
deben ser aggregates exactos. Los workers deben conservar cursor y cobertura
eventual; los sitemaps paginados deben cubrir todas las URLs elegibles.
