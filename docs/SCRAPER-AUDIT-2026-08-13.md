# Auditoría de nuevas fuentes — 13 de agosto de 2026

## Addendum post-deploy — 14 de agosto de 2026

El estado productivo posterior al QA esta documentado en `docs/POST-DEPLOY-HANDOFF-2026-08-14.md`. Seis recolectores nuevos cuentan con codigo y tests PASS: MEF/INAPP, IPA, WWF Paraguay, AECID Paraguay, MITIC y SNJ Paraguay. Esto no implica activacion: las fuentes siguen desactivadas hasta muestra manual, revision de vigencia, fuente original y elegibilidad.

Produccion observa 133 oportunidades verificadas y 556 en `in_review` con `is_active=false`. Los scrapers legacy que escriben directamente en REST no son sink-compliant; deben migrarse o pasar por el adaptador antes de habilitar coleccion productiva.

No se realizó deploy, no se activaron cron y no se escribió en Supabase. Todas las ejecuciones usaron `CVITAE_AUDIT_MODE=1`, `CVITAE_REQUIRE_REVIEW=1` y un máximo de 40 registros por fuente.

## MITIC Oportunidades

- Tier A, publicador oficial.
- Endpoint público estable: categoría WordPress `Oportunidades`.
- Primera extracción: 5 encontradas, 5 válidas, 1 única y 4 duplicadas porque todas apuntaban al login genérico.
- Corrección: la ficha oficial individual pasó a ser la URL canónica y auditable de cada llamado.
- Segunda extracción: 5 encontradas, 5 válidas, 5 únicas, 0 rechazadas.
- Las cinco URLs oficiales respondieron HTTP 200 y conservaron el título del llamado.
- Estado del registro: `candidate`.
- Controles: `collection_enabled=false`, `catalog_enabled=false`, `matching_enabled=false`, `alerts_enabled=false`, `seo_enabled=false`.
- Riesgo pendiente: las fichas no exponen siempre una fecha de cierre estructurada. Deben revisarse manualmente antes de aprobarse y una muestra debe comprobar el TDR y el estado del portal de postulación.

## SNJ Paraguay

- Tier A, publicador oficial.
- Endpoint público estable bajo `/2023/wp-json/wp/v2/posts`.
- Primera extracción: 4 registros estructuralmente válidos, pero la revisión detectó noticias contextuales y eventos sin postulación verificable.
- Se endureció el filtro: la acción debe estar explícita en el título y se excluyen ferias, resultados, premios y voluntariados.
- Segunda extracción: 0 encontradas, 0 válidas, 0 rechazadas.
- Estado del registro: `research_verified`; el recolector existe, pero no asciende a `candidate` mientras no encuentre una convocatoria real.
- Controles: todos desactivados.

## Fuentes descartadas en este lote

- EmpleaPY: la web oficial responde, pero no se encontró un catálogo público de vacantes verificable. No se automatiza login, cédula ni identidad electrónica.
- InnovandoPY: la página pública hallada corresponde a la edición 2024; no se convierte material histórico en oportunidades activas.
- CONACYT: continúa `research_pending` por HTTP 403. No se intentó evadir el bloqueo.

## Próxima activación segura

1. Revisar manualmente las cinco fichas MITIC y sus TDR.
2. Mantener MITIC y SNJ sin recolección productiva hasta aplicar controles en staging.
3. Si MITIC supera la muestra, habilitar solo recolección con revisión obligatoria.
4. Mantener catálogo, matching, alertas y SEO apagados hasta medir una ejecución monitoreada y aprobar cada oportunidad.

## Auditoría masiva B2C

Se ejecutaron 14 recolectores en paralelo, en modo aislado y con tope de 40 por fuente:

- 219 oportunidades únicas potenciales antes de deduplicación cruzada.
- 219 muestras inspeccionadas automáticamente; 0 URLs duplicadas entre fuentes.
- 78 conservadoramente elegibles para Paraguay/LatAm.
- 5 fuentes clasificadas como candidatas, 3 con campos a reparar, 3 vacías y 3 con timeout/bloqueo.
- Distribución: 193 empleos, 18 becas, 2 pasantías, 2 intercambios, 2 concursos y 2 conferencias.

Esto demuestra volumen suficiente para dejar de incorporar lotes de cinco, pero no autoriza publicación masiva. Los 78 registros elegibles deben entrar como `in_review` y conservar fuente original, vigencia y elegibilidad antes de habilitar catálogo, matching, alertas o SEO.

## Tres fuentes del registro convertidas en scrapers

- IPA Convocatorias: 8 candidatas detectadas. Tier A oficial; desactivado y con revisión obligatoria.
- WWF Paraguay: 3 consultorías recientes detectadas. Tier A oficial; desactivado y con revisión obligatoria.
- AECID Paraguay: recolector y pruebas implementados, pero la respuesta HTTP no expone de forma estable el listado que sí aparece renderizado/indexado. Se mantiene `research_verified`, desactivado y sin resultados hasta resolver el canal estable; no se publican ceros como éxito.
