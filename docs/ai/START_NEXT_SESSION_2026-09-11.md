# CVitae — handoff para la próxima sesión

Fecha de corte: 2026-09-11 (America/Asuncion)

Este documento es la fuente local más reciente para retomar el trabajo. No asumir que un commit enviado a GitHub ya está en producción: Netlify está bloqueando los deploys antes del build.

## Estado confirmado

### Git

- Repositorio: `Isasola/cvitae-unified`.
- Rama de producción configurada en Netlify: `feature/aws-migration`.
- HEAD enviado a GitHub: `e36f1d4639643229672275519510236a0286208b`.
- Commit B2B: `fix(b2b): make recruiter vacancy creation atomic`.
- El commit contiene exclusivamente:
  - `netlify/functions/create-vacancy.ts`
  - `supabase/migrations/202609100003_atomic_recruiter_vacancy_creation.sql`
  - `supabase/tests/create_recruiter_vacancy_atomic.sql`
  - `scripts/verify-create-vacancy.ts`
- No volver a crear otro commit para este fix: el commit correcto ya está en GitHub.

### Supabase producción

- La migración `202609100003_atomic_recruiter_vacancy_creation.sql` fue aplicada correctamente.
- Existe `public.create_recruiter_vacancy_atomic(...)` con retorno `jsonb`.
- La RPC es `SECURITY DEFINER`, tiene `search_path` fijo y solo `service_role` puede ejecutarla.
- `anon`, `authenticated` y `PUBLIC` no tienen permiso de ejecución.
- La migración crea la vacante B2B y su espejo en `opportunities` dentro de una única transacción. Si falla cualquiera de los dos INSERT, no debe quedar un registro parcial.
- `salary_range: ""` se normaliza a `NULL`.
- El nombre de empresa proviene del token verificado, no del `company_name` enviado por el navegador.
- Las migraciones locales `202609100001` y `202609100002` ya figuraban aplicadas remotamente. Permanecen como archivos locales no trackeados dentro del WIP y no deben reaplicarse ni marcarse manualmente.

### Pruebas ya aprobadas para el fix B2B

- `pnpm.cmd exec tsx scripts/verify-create-vacancy.ts`: PASS.
- `npx.cmd supabase db lint --local --level error`: PASS.
- `pnpm.cmd build`: PASS.
- `git diff --check`: PASS.
- Pruebas SQL/regresión incluidas en el commit.
- Todavía no se ejecutó un POST real después del fix porque la Function nueva no llegó a producción.

## Bloqueo actual: Netlify

- Proyecto: `cvitae-lat`.
- Site ID: `45e57d76-bc1e-46f2-95dc-1981973276db`.
- Equipo del sitio: `cvitae` (`account_id: 69dd683833e1f962a59d3ddb`, plan Free).
- La CLI local estaba autenticada como `cpdparaguay@gmail.com`, no como `lvg.elshini@gmail.com`.
- El usuario indicó que la cuenta correcta, con saldo, debe ser `lvg.elshini@gmail.com`.
- No se cambió la autenticación todavía.
- Último intento observado: deploy `6aa3376938c51c00080749b7`, commit `e36f1d46`, creado el 2026-09-10 23:04 UTC.
- Resultado del intento: `state=error`, `skipped=true`, `published_at=null`.
- Error exacto: `Skipped due to account credit usage exceeded`.
- Que el panel muestre un deploy reciente no significa que se publicó: Netlify registra también los intentos omitidos.
- Producción seguía publicada desde el deploy `6a88bc0b4651af00081e019c`, commit `1df44e3711e244b603df15532c5cd9c208d0b9ad`, del 2026-08-21.
- La Function `create-vacancy` publicada seguía siendo la versión antigua.

### Consecuencia importante

El próximo deploy exitoso no contendrá solamente `e36f1d46`: como producción está en `1df44e37`, publicará todos los commits posteriores presentes en `feature/aws-migration`, incluidos:

1. `efe9d2a1` — fixes B2B de token, cerrar vacante, créditos y estadísticas.
2. `61810025` — persistencia de CV y matching semántico.
3. `1c17c779` — actualización de embeddings con límites de recursos.
4. `1ab1f1cf` — matching y notificaciones B2C.
5. `e36f1d46` — creación atómica de vacantes B2B.

Por eso, antes de reintentar, revisar el rango `1df44e37..e36f1d46` y preparar un smoke test conjunto. No hacer pushes vacíos ni commits artificiales para disparar deploys.

## Secuencia segura para retomar

1. Ejecutar `netlify logout` y `netlify login`; elegir `lvg.elshini@gmail.com` en el navegador.
2. Confirmar con `netlify status` que el correo activo sea exactamente `lvg.elshini@gmail.com` y que el proyecto siga siendo `cvitae-lat`.
3. En el equipo que realmente posee `cvitae-lat`, confirmar saldo/límite disponible. Si el saldo visible pertenece a otro equipo, no reintentar todavía.
4. Revisar el rango completo que entrará en producción: `git log --oneline 1df44e37..e36f1d46`.
5. Reintentar una sola vez el deploy del commit ya existente `e36f1d46`; no usar `netlify deploy --prod` desde el working tree sucio.
6. Verificar que el deploy quede `ready`, tenga `published_at` y publique exactamente `e36f1d46`.
7. Confirmar que la Function publicada `create-vacancy` tenga digest/fecha nuevos.
8. Recién entonces hacer una prueba manual controlada de creación de vacante con salario vacío.
9. Verificar en DB que se cree exactamente una fila activa en `recruiter_vacancies` y una fila activa/verified en `opportunities`, vinculadas por `recruiter_vacancy_id`.
10. Probar que la oportunidad B2B aparece para B2C y participa del matching. No afirmar fan-out automático ni alertas hasta comprobarlo.
11. Solo después del QA exitoso, y cuando el usuario lo autorice, avisar a Vianca para que pruebe. No se le envió correo en esta sesión.

## Working tree local: cuarentena

Hay muchos cambios locales preexistentes/no incluidos en `e36f1d46`. Deben conservarse y revisarse por bloques. No ejecutar `git add .`, no resetear y no incluirlos accidentalmente en un deploy manual.

Áreas WIP detectadas:

- fábrica automática de oportunidades/embeddings y workflow de refresh;
- matching compartido y perfil B2C;
- plan de carrera, recomendaciones Gemini y caché del usuario;
- admin, revisión automática, SEO y snapshots de lotes;
- scripts de verificación;
- migraciones 001/002 y pruebas de la fábrica, presentes localmente aunque ya registradas remotamente.

Archivos WIP visibles al cierre:

- `.github/workflows/refresh_embeddings.yml`
- `netlify/functions/admin-data.ts`
- `netlify/functions/admin-seo.ts`
- `netlify/functions/b2c-profile.ts`
- `netlify/functions/gemini-courses.ts`
- `netlify/functions/lib/batch-review-snapshot.ts`
- `package.json`
- `scrapers/opportunity_sink.py`
- `scripts/verify-admin-operations.ts`
- `scripts/verify-critical-flows.ts`
- `scripts/verify-learning-plan.ts`
- `scripts/verify-matching-calibration.ts`
- `scripts/verify-review-bot.ts`
- `src/components/admin/AdminSeoControlCenter.tsx`
- `src/hub/Dashboard.tsx`
- `src/hub/LearningPlan.tsx`
- `src/hub/ProfileBuilder.tsx`
- `src/pages/Admin.tsx`
- `supabase/functions/_shared/embedding.ts`
- `supabase/functions/_shared/matching.ts`
- nuevos scripts `opportunity_factory*` y pruebas/migraciones asociadas.

## Pendientes funcionales, por prioridad

### P0 — después de resolver Netlify

- Confirmar el deploy real del rango acumulado.
- Reprobar el escenario B2B `Asesor/a Comercial` y la atomicidad observable.
- Reprobar visualización/descarga del CV B2C.
- Reprobar `match-batch` y confirmar que desaparezca el 546.
- Reprobar `founding-beta-action` y confirmar que desaparezca el 502.
- Verificar notificaciones de nuevos usuarios y acciones B2C.
- Confirmar que una vacante B2B insertada en `opportunities` entra al matching. La creación atómica está resuelta; el fan-out/alerta inmediata para usuarios existentes todavía no fue validado.

### P1 — cerrar el WIP sin mezclar scopes

- Auditar y terminar la fábrica de oportunidades: cada scraper debe normalizar, deduplicar, clasificar, moderar y dejar listo el estado de embedding de manera incremental y económica.
- No regenerar embeddings diariamente para registros sin cambios. Procesar solo nuevos o modificados mediante huella/fingerprint.
- Preservar las reglas sensibles de Supabase, matching, SEO/GEO/AEO, JobPosting y el flujo manual del admin.
- Revisar el admin: cola `in_review`, botones aprobar/rechazar/bloquear, toggles claros y bot de ayuda con datos reales.
- Reparar/enriquecer Talent.com cuando la página tiene descripción visible pero el scraper no la obtiene o infiere país incorrecto.
- Confirmar scrapers de Perú y sus ejecuciones reales en GitHub Actions.
- Verificar si se enviaron correos de errores/signup y por qué no se notificó el alta de `viancaconv@gmail.com`.
- Terminar el plan orientado a intención del usuario: objetivo elegido por el usuario + CV + oportunidades guardadas/matches, con recomendaciones Gemini y caché.

### P2 — producto posterior

- Diseñar reutilización/renovación mensual de llamados B2B sin duplicados ni pérdida de historial.
- Diseñar el asistente “investigar esta convocatoria” con Gemini, señalando fuentes y avisando cuándo la publicación debe verificarse.
- Revisar Analytics, blogs, SEO/GEO/AEO, FAQs, accesibilidad y preparación gradual para AdSense.

## Reglas para la siguiente sesión

- Empezar con `git status --short` y no tocar los cambios WIP hasta declarar un scope.
- Consultar este documento y el grafo antes de abrir archivos al azar.
- Producción manda: distinguir siempre `commit en GitHub`, `migración aplicada` y `deploy publicado`.
- Probar antes de comunicar que un fix está disponible.
- Un solo deploy deliberado cuando el lote esté listo; no deployar a modo de prueba repetitiva.
- No crear vacantes, borrar parciales ni enviar correos sin autorización explícita.
