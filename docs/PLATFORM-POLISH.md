# CVitae platform polish

## Punto de retorno

La rama parte del commit estable `e3ea19470b04b8d18a16492ae504e41e4d58cc1b`.
Las migraciones deben aplicarse únicamente después de desplegar el frontend y
las Netlify Functions compatibles.

## Monitoreo de scrapers

`scripts/run_scraper_monitored.py` ejecuta cada scraper como un proceso aislado.
El workflow conserva sus condiciones y continúa aunque una fuente falle, pero
registra el resultado real en `scraper_runs`.

Estados:

- `healthy`: terminó sin errores detectados.
- `warning`: terminó, pero el log contiene errores parciales.
- `failed`: finalizó con código distinto de cero.
- `timeout`: superó el tiempo máximo.
- `running`: comenzó y todavía no finalizó.

El panel privado consulta estos datos mediante `admin-data`; el navegador no
tiene permisos directos sobre la tabla. Los errores y timeouts se ordenan
primero. Cada fila incluye duración, contadores detectables, resumen y enlace a
GitHub Actions.

La telemetría resume el texto producido por scripts heterogéneos. Los campos
`found_count` e `inserted_count` pueden quedar vacíos si un scraper no imprime
un contador reconocible; el estado, duración y log siguen siendo válidos.

## Hardening de Supabase

La migración `202607230002_security_hardening.sql` elimina políticas históricas
abiertas sobre datos administrativos y de reclutamiento. Mantiene:

- lectura pública de contenido publicado;
- lectura pública de vacantes activas;
- acceso propio a datos del candidato mediante las políticas existentes;
- acceso completo de `service_role` para Functions, scrapers y automatizaciones.

El administrador dejó de escribir directamente desde el navegador. Contenido,
skills y tokens se administran mediante `admin-data`, protegido por
`ADMIN_PASSWORD` y ejecutado con `service_role`.

## Orden de despliegue

1. Ejecutar build y pruebas locales.
2. Subir la rama y comprobar el deploy preview una sola vez.
3. Aplicar `202607230001_scraper_monitoring.sql`.
4. Confirmar que el admin carga aunque todavía no existan ejecuciones.
5. Aplicar `202607230002_security_hardening.sql`.
6. Probar contenido público, vacante pública, admin y panel empresarial.
7. Ejecutar manualmente un scraper pequeño desde GitHub Actions.
8. Confirmar que aparece en el admin con su estado real.

No copiar `service_role` al frontend, variables `VITE_*` ni repositorio.

## Riesgos de dependencias detectados

`npm audit --omit=dev` informa una vulnerabilidad crítica en la versión actual
de `jspdf` y vulnerabilidades moderadas en el SDK de Anthropic. Las soluciones
propuestas son actualizaciones mayores. No se incluyen en este cambio porque
afectan contratos de generación de PDF e IA y requieren una batería de pruebas
específica antes de sustituir esas librerías.
