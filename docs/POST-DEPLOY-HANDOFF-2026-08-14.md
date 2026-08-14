# CVitae Unified - handoff post-deploy

Fecha de corte: 2026-08-14, zona America/Asuncion.

Este documento es la fuente de verdad para continuar despues del cierre QA P13-P19. El commit principal ya fue desplegado por Netlify desde `feature/aws-migration`. No crear otro sitio Netlify.

## Estado de commits y despliegue

- Rama activa: `feature/aws-migration`.
- Commit principal QA P13-P19: `413c6348`.
- Commit de correcciones SQL: `0fdae690`.
- Netlify publica automaticamente cada push a esta rama.
- Supabase productivo: `rbrirxbjbmdxflzaxxzp`.
- Backup previo: `C:\Users\isaso\cvitae-backups\cvitae_prod_20260814_0350_*` (schema y data).
- No crear un sitio nuevo ni cambiar la rama de despliegue.

## Migraciones productivas aplicadas

Se corrigio primero la causa raiz de las migraciones: `user_master_profiles.user_id` paso de `text` a `uuid`, se retiro una fila de prueba con valor no UUID y se recrearon las politicas RLS compatibles.

Tambien se aplicaron:

- `202608140002`: columnas `updated_at` en `generated_cvs` y `vacancy_applications`.
- `202608140003`: restauracion de `accept_application_workspace` y `claim_vacancy_review_batch` con sus firmas y casts correctos.

Verificacion registrada: `supabase db lint --linked` con cero errores.

No volver a aplicar migraciones productivas sin backup y sin revisar el estado remoto.

## IA y funciones

AWS Bedrock esta implementado localmente en ocho Netlify Functions. Usa Haiku para extraccion/clasificacion y Sonnet para generacion compleja. La operacion productiva requiere en Netlify:

- `CVITAE_AWS_ACCESS_KEY_ID`
- `CVITAE_AWS_SECRET_ACCESS_KEY`
- `CVITAE_AWS_REGION`
- `RESEND_API_KEY` cuando corresponda
- `SUPABASE_SERVICE_ROLE_KEY` y `ADMIN_PASSWORD` para funciones protegidas

`match-batch` esta desplegada en Supabase Edge Functions. En la verificacion productiva observada:

- CORS devuelve el origen exacto `https://cvitae.lat`.
- OPTIONS devuelve 200.
- POST sin token devuelve 401.

## Catalogo y scrapers

Estado observado despues del deploy:

- 133 oportunidades verificadas de Computrabajo.
- 556 oportunidades en `in_review` con `is_active=false`.
- Los scrapers legacy todavia hacen POST directo y no pasan por `OpportunitySink`; no deben considerarse sink-compliant hasta migrarlos.
- Se incorporaron seis scrapers nuevos con tests PASS: `mef_inapp_becas`, `ipa_convocatorias`, `wwf_paraguay_calls`, `aecid_paraguay_calls`, `mitic_opportunities` y `snj_paraguay`.
- Toda fuente nueva permanece desactivada hasta muestra manual, vigencia, URL final, elegibilidad y decision editorial.

El siguiente cuello de botella es moderar el backlog, no publicar automaticamente. Mantener la distincion:

- `verified`: puede habilitarse por flags.
- `in_review`: almacenada, no distribuible.
- `quarantined`: conservar para resolver origen o calidad.
- `rejected`: conservar para auditoria, sin publicacion.

No activar matching, alertas o SEO para una fuente solo porque el scraper compile o devuelva resultados.

## Cola manual post-deploy

Ejecutar solo con autorizacion explicita y en este orden:

1. Confirmar variables privadas en Netlify.
2. Ejecutar smoke test productivo de B2C, B2B y Admin.
3. Revisar muestras de `computrabajo` y decidir `verify` o `quarantine`.
4. Activar gradualmente fuentes Tier A candidatas, primero recoleccion con revision obligatoria.
5. Procesar el backlog mediante `batch_review_by_source`; nunca aprobar Tier B sin `source_authority=original` o `original_source_verified=true`.
6. Si el catalogo valido continua debajo de 1000, implementar primero scrapers PY-first de `empleapy_mtess` y `snj_convocatorias` despues de validar sus canales publicos.
7. Subir `og-image.jpg`, registrar sitemap, revisar GA4/Search Console y activar AdSense solo despues de aprobacion de dominio.

## Reglas para la siguiente sesion

- No entregar claves por chat ni copiar secretos a `.env`.
- No ejecutar migraciones, activar fuentes, procesar backlog ni cambiar variables sin autorizacion.
- No afirmar que el catalogo esta completo: 556 registros siguen inactivos.
- No repetir suites que ya pasaron si el cambio no las afecta.
- Antes de nuevas activaciones, leer `skills/cvitae-scrapers/references/contract.md`, `scrapers/opportunity_sink.py`, `scripts/run_scraper_monitored.py` y `scrapers/runtime_policy/sitecustomize.py`.
- El artefacto visual de Playwright es local; staging/produccion debe validarse por separado.

## Estado final

QA P13-P19: PASS LOCAL y desplegado con correcciones productivas verificadas.

Pendientes reales: variables externas, smoke test, activacion editorial del catalogo, migracion de legacy scrapers al sink, GA4/Search Console/AdSense y expansion PY-first si el catalogo valido sigue debajo de 1000.
