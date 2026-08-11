---
name: cvitae-scrapers
description: Auditar, reparar, probar, incorporar y operar scrapers de empleos, becas, concursos, pasantías y otras oportunidades de CVitae. Usar al cambiar recolectores, fuentes, filtros geográficos, normalización, deduplicación, moderación, telemetría o controles del admin de cvitae.lat.
---

# CVitae Scrapers

Trabajar localmente y mantener toda fuente nueva en revisión obligatoria hasta demostrar calidad. No desplegar, activar cron ni publicar registros sin autorización explícita.

## Flujo obligatorio

1. Leer `references/contract.md` y los archivos actuales `scrapers/opportunity_sink.py`, `scripts/run_scraper_monitored.py` y `scrapers/runtime_policy/sitecustomize.py`.
2. Clasificar el origen como Tier A (publicador oficial), Tier B (agregador) o Tier C (señal editorial/red social), y auditar autorización de acceso, mercado objetivo, vigencia, URL final, campos disponibles y estabilidad técnica.
3. Crear fuentes nuevas con `python scripts/scaffold_scraper.py ... --tier A|B|C` y validar `scrapers/source_registry.json` con `python scripts/validate_scraper_registry.py`. Toda fuente nace desactivada.
4. Ejecutar `python scripts/audit_scraper_contracts.py`. Corregir sintaxis y contrato antes de acceder a la fuente.
5. Separar extracción de persistencia. Enviar resultados por `OpportunitySink`; si es legado, comprobar que el adaptador universal capture sus POST.
6. En Tier B/C seguir `application_url`, encontrar el publicador original y volver a extraer desde ese origen. Tier C nunca se publica directamente.
7. Probar con límite bajo, `require_review=true`, sin catálogo, matching, alertas ni SEO.
8. Validar una muestra manual contra el origen. Medir encontrados, válidos, duplicados, descartados, insertados y causas.
9. Mantener pausado si falla país/elegibilidad, vigencia, URL, título, organización, fuente original, duplicación o tasa mínima de resultados útiles.
10. Habilitar gradualmente: recolección; luego catálogo; después matching/alertas; SEO al final. Registrar evidencia y criterio.
11. Ejecutar compilación, pruebas críticas y `git diff --check`. Informar qué se verificó realmente y qué continúa pendiente.

## Reglas de seguridad

- Nunca eliminar físicamente oportunidades. Solicitar eliminación, revisar, corregir o confirmar borrado lógico.
- Nunca usar cantidad encontrada como señal única de calidad.
- No autoaprobar una fuente nueva o reparada.
- No evadir autenticación, CAPTCHA, límites ni términos de LinkedIn; preferir APIs, feeds y páginas públicas autorizadas.
- Preservar cambios ajenos y minimizar deploys.
- No afirmar que un scraper funciona solo porque compila o devuelve HTTP 200.

## Resultado esperado

Entregar estado por fuente, evidencia, métricas, descartes, riesgos, controles del admin y siguiente activación segura. Si faltan pruebas reales, decirlo explícitamente.
