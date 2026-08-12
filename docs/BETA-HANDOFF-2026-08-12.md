# CVitae beta — handoff completo

Fecha de corte: 12 de agosto de 2026  
Rama: `feature/aws-migration`  
Commit remoto: `43964e51`  
Repositorio: `Isasola/cvitae-unified`

La beta compila y tiene los controles principales implementados, pero todavía no debe considerarse aprobada al 100%. Faltan pruebas E2E con servicios reales, revisión visual móvil navegable y validación del inventario publicado.

## Commits de esta tanda

- `9e6f4be8` — endurecimiento general de plataforma y experiencia de carrera.
- `522c9c9d` — restauración y seguridad de analizadores.
- `ec20fc83` — restauración del matching del dashboard.
- `11c6027d` — oportunidades beta y workflows de reclutadores.
- `78455f01` — salvaguardas B2B, guías, popups, accesibilidad y matching.
- `b0e460d9` — corrección Netlify/pnpm: workspace válido con `packages: ['.']`.
- `43964e51` — demo, feedback de formularios, catálogo y fechas del blog.

La rama está subida a `origin` y `origin/main` es ancestro de esta línea. Las ramas históricas revisadas no tienen una edición paralela pendiente de incorporar. El único archivo local no versionado es `scrapers/vc4a_pes_latam_scraper.py`; es experimental y debe permanecer fuera de producción.

## Cambios realizados

### Plataforma y build

- Funciones Netlify de analizadores migradas/endurecidas con Bedrock.
- Lockfile y dependencias actualizados; `pdfjs-dist` y el empaquetado serverless corregidos.
- Netlify configurado con Node 20, pnpm 9, esbuild y timeouts de funciones.
- Corregido el error de deploy `packages field missing or empty` en `pnpm-workspace.yaml`.
- Prerender, sitemap y robots mantienen su cadena de build.

### B2C y matching

- Matching usa el `slug` real.
- Se filtran oportunidades vencidas, inactivas, no verificadas, archivadas, eliminadas o sin permiso.
- Se respeta elegibilidad para Paraguay, Latinoamérica y alcance mundial.
- Se excluyen licitaciones incluso con campos heredados o texto equivalente.
- `/oportunidades` usa `opportunities`, separa becas, financiación, programas y experiencias, y deja empleos en `/empleos`.
- El catálogo usa `opportunity_type` y tiene respaldo en `opportunity_kind`, evitando vacíos por normalización incompleta.
- El estado vacío explica que sólo aparecen fichas activas, vigentes y verificadas.

### B2B real

- Acceso exige token activo y empresa verificada.
- Análisis individual valida autenticación, formato, tamaño y saldo.
- Postulantes de vacante: sólo pendientes por defecto; reanálisis explícito.
- Créditos de postulantes reservados con CAS y reembolsados ante fallos.
- Batch: lotes inválidos o mayores a 30 rechazados.
- Cada CV batch reserva crédito antes de Bedrock, guarda en el flujo y reembolsa si falla IA o persistencia.
- Se eliminó el segundo guardado frontend que podía duplicar consumo.
- Guías de primer uso y popups explican créditos, límites, criterio humano y lectura del score.
- Se aclara que la IA no contrata, rechaza ni contacta sola y puede equivocarse.
- Filas de candidatos expandibles con teclado; estados, notas y contacto siguen bajo control humano.
- Vacantes se desactivan si falla el espejo hacia oportunidades.
- CVs de postulantes se guardan en storage privado y se notifica a la empresa cuando el email está configurado.

### Demo y conversión

- El CTA del index “Ver demo del panel” ahora apunta a `/demo`.
- Demo B2B muestra ranking, scores, fortalezas, brechas y CTA al panel real.
- Rutas reales: `/empresas` y `/empresas/masivo`.
- Navegación y footer enlazan demo, portal, batch y contacto.

### Solicitud de acceso

- El formulario guarda en `recruiter_leads`.
- Envía notificación interna a `contacto@cvitae.lat` si `RESEND_API_KEY` está activa.
- Intenta confirmación al email corporativo.
- Devuelve `adminNotified` y `confirmationSent`.
- La UI informa si se guardó la solicitud y si salió el email; si falla, muestra contacto alternativo.
- Aprobación y generación de token siguen siendo manuales desde Admin.

### Blog

- Listado y detalle muestran `content_hub.created_at` como fecha editorial.
- Ya no muestran `fecha_vencimiento` como fecha de publicación.
- Queda revisar datos históricos si `created_at` fue cargado mal.

### Admin

- Consola de métricas, usuarios, beta/leads, prospects B2B, tokens, contenido, skills y fuentes.
- Feedback visible de éxito/error en acciones.
- Moderación con edición, verificación, revisión, cuarentena, rechazo, archivo, restauración y eliminación.
- Verificación aplica permisos separados de catálogo, matching, alertas y SEO.
- Centro de control de scrapers con auditoría, pausas y telemetría.

### Scrapers

- `OpportunitySink`, contrato común, políticas de runtime, telemetría, auditoría y registro de fuentes.
- Registro validado: 40 fuentes, 28 Tier A, 12 Tier B, 0 Tier C.
- Tests prioritarios MEF/FIUNA.
- No se aprobaron ni cargaron scrapers nuevos.
- VC4A/PES Latam no está activado ni commiteado.

## Validaciones ejecutadas

- `npm.cmd run build` — aprobado.
- `npm.cmd run test:critical` — aprobado: PDF, input inválido, recruiter auth, batch auth, comparación y Gemini.
- Imports de funciones Netlify — aprobados; Admin importado con guard de password.
- `python -m unittest tests.test_priority_scrapers -v` — 2/2.
- `python scripts\\validate_scraper_registry.py` — 40 fuentes válidas.
- `python scripts\\audit_scraper_contracts.py` — sin errores de sintaxis.
- `git diff --check` — limpio.
- `pnpm install --frozen-lockfile --offline` — aprobado.
- Prerender, sitemap y robots — ejecutados.
- Deploy Netlify posterior al arreglo de pnpm — funcionó.

Advertencias conocidas no bloqueantes: PDF.js sin `DOMMatrix`/`Path2D` y fuentes estándar en el entorno local; chunks Vite mayores a 500 kB; permisos locales sobre `.config/git/ignore`.

## Falta probar antes de aprobación al 100%

### Entorno real y datos

- Confirmar que Netlify publicó `43964e51`.
- Verificar Supabase, AWS, Resend, `SITE_URL`, `ADMIN_PASSWORD` y storage.
- Confirmar migraciones aplicadas hasta `202608110017_private_candidate_cv_storage.sql`.
- Consultar oportunidades por `opportunity_kind`, `opportunity_type`, `verification_status`, `is_active` y `catalog_eligible`.
- Determinar si becas/programas están ausentes o sólo en revisión, archivadas o sin permisos.

### Smoke B2C

- Index, demo, empleos, oportunidades, blog y detalles en móvil/desktop.
- PDF válido, inválido, grande y no extraíble; comprobar carga, error, reintento y éxito.
- Perfil de prueba y matching con datos controlados.
- Confirmar ausencia de vencidas, licitaciones y no elegibles.
- Aprobar una oportunidad y comprobar catálogo/matching con permisos.

### Smoke B2B

- Solicitud con email real; confirmar registro, email interno y confirmación externa.
- Probar Resend fallando: solicitud conservada y mensaje honesto.
- Aprobar empresa, generar invitación y abrir token.
- Probar token válido, inválido, inactivo y empresa no verificada.
- Crear vacante, copiar enlace, abrirlo y postular con PDF válido/inválido/grande/no extraíble.
- Confirmar notificación a empresa y resultado con/sin consentimiento de perfil.
- Probar análisis individual, reanálisis, batch 2/30/>30 CVs, saldo insuficiente, concurrencia y reembolso.
- Confirmar historial, estrellas, notas, estados, CSV y contacto.

### Smoke Admin

- Login correcto, incorrecto y sesión expirada.
- Métricas, leads, prospects, tokens, invitación y aprobación.
- CRUD de contenido.
- Todos los estados de moderación y permisos.
- Scraper pausado no ejecuta ni publica.
- Ningún error aparece como éxito.

### Móvil y calidad visual

- Capturar `/`, `/demo`, `/empresas`, `/empresas/masivo`, `/oportunidades`, `/blog` y `/admin` en 375, 390, 768 y desktop.
- Revisar overflow, popups fuera de viewport, controles pequeños, foco y teclado.
- Probar menú móvil, guías, popups, acordeones, tablas y estados vacíos.
- Capturar estados inicial, cargando, resultado y error.
- La captura anterior no fue válida porque Vite no inició navegablemente y Chrome reutilizó pestañas del entorno; esta parte no está aprobada.

### Edge y seguridad

- Ejecutar `deno check` de `supabase/functions/match-batch/index.ts`.
- Probar Edge matching después de migraciones.
- Revisar RLS y storage con anon, authenticated y service role.
- Revisar logs sin tokens/CVs expuestos, rate limits, tamaños y timeouts.
- Ejecutar `pnpm audit --prod` en CI.

## Criterio de aprobación final

No marcar 100% hasta que Netlify publique el commit correcto, Supabase tenga migraciones y datos controlados, B2C/B2B/Admin/email/storage/matching pasen recorridos reales, exista al menos una oportunidad válida por categoría, los créditos cuadren, las rutas móviles estén capturadas y no haya errores runtime.

## Próximo inicio

```powershell
cd C:\Users\isaso\cvitae-unified-audit
git switch feature/aws-migration
git pull --ff-only origin feature/aws-migration
git status --short
git log -1 --oneline --decorate
```

Primera tarea: probar el deploy publicado de `/demo`, `/empresas` y `/oportunidades`, y consultar el inventario real por estado/categoría antes de modificar datos o aprobar fuentes.
