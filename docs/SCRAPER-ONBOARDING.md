# Incorporación segura de fuentes de CVitae

Toda fuente nueva nace desactivada. Encontrar una URL no equivale a publicar una oportunidad.

## Niveles de autoridad

- **Tier A:** gobierno, universidad, organismo, fundación o empresa que publica su propia convocatoria. Puede optar a publicación automática después de validar contrato, muestras y cierres.
- **Tier B:** agregadores especializados. Sirven para descubrir, pero CVitae debe seguir `application_url`, localizar la fuente original y extraer desde ella antes de publicar.
- **Tier C:** blogs, noticias, redes sociales y resultados de buscadores. Son únicamente señales de descubrimiento y nunca se publican directamente.

## Flujo obligatorio

1. Registrar y crear el recolector en cuarentena:
   `python scripts/scaffold_scraper.py fuente https://sitio.example/oportunidades --market PY --kind job --tier B`
2. Implementar selectores o API sin escribir directamente en Supabase; toda salida pasa por `OpportunitySink`.
3. Ejecutar auditoría en seco y guardar evidencia: volumen, duplicados, tipos, país, URL original, fecha de cierre y una muestra manual.
4. Aprobar la fuente en el admin por etapas: recolección, catálogo, matching, alertas y SEO son interruptores independientes.
5. Vigilar tres ejecuciones consecutivas. Cero resultados, caída brusca, exceso de duplicados o enlaces cerrados vuelve la fuente a revisión.

## Contrato mínimo de una oportunidad

Los campos esenciales son `title`, `organization`, `opportunity_type`, geografía o elegibilidad, `source`, `source_url`, `application_url`, `source_authority` y `verified_at`. Cuando corresponda también se exige financiación, plazo, educación, experiencia, ciudadanía, residencia, sector y etiquetas.

Los tipos normalizados son: `job`, `internship`, `consultancy`, `scholarship`, `fellowship`, `grant`, `seed_capital`, `accelerator`, `incubator`, `startup_competition`, `research_funding`, `training`, `exchange_program`, `volunteering` y `tender`.

## Política de moderación

- Ningún fallo elimina filas: pasan a revisión o cuarentena con motivo y evidencia.
- Tier B/C nunca hereda autoridad de su agregador.
- La visibilidad pública, matching, alertas y SEO requieren flags explícitos.
- Un cambio de selector se prueba primero en seco y con una muestra manual antes de reactivar la fuente.
